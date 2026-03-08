const DEFAULT_BACKEND_URL = "https://jobs.zoommate.in";
const DEFAULT_DASHBOARD_URL = "https://jobs.zoommate.in/dashboard";
const ALARM_NAME = "jobfill_refresh_state";

function normalizeBaseUrl(url) {
  const value = (url || DEFAULT_BACKEND_URL).trim().replace(/\/$/, "");
  return value || DEFAULT_BACKEND_URL;
}

function getApiBase(url) {
  const normalized = normalizeBaseUrl(url);
  return normalized.endsWith("/api") ? normalized : `${normalized}/api`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

async function getStored(keys) {
  return chrome.storage.local.get(keys);
}

async function setStored(payload) {
  return chrome.storage.local.set(payload);
}

async function removeStored(keys) {
  return chrome.storage.local.remove(keys);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return response.json();
}

async function ensureDefaults() {
  const data = await getStored([
    "backendUrl",
    "dashboardUrl",
    "autoDetectForms",
    "showResultsPanel",
    "aiUsage",
    "aiProviderCache"
  ]);

  const next = {};

  if (!data.backendUrl) next.backendUrl = DEFAULT_BACKEND_URL;
  if (!data.dashboardUrl) next.dashboardUrl = DEFAULT_DASHBOARD_URL;
  if (typeof data.autoDetectForms !== "boolean") next.autoDetectForms = true;
  if (typeof data.showResultsPanel !== "boolean") next.showResultsPanel = true;

  const usage = data.aiUsage || {};
  if (!usage.date || usage.date !== todayKey()) {
    next.aiUsage = { date: todayKey(), count: 0, limit: Number(usage.limit || 10) };
  }

  if (!data.aiProviderCache) {
    next.aiProviderCache = { name: "GPT-4o", raw: "openai", updatedAt: 0 };
  }

  if (Object.keys(next).length > 0) {
    await setStored(next);
  }
}

async function refreshAiProvider(force = false) {
  const { backendUrl, aiProviderCache } = await getStored(["backendUrl", "aiProviderCache"]);
  const stale =
    force || !aiProviderCache || Date.now() - Number(aiProviderCache.updatedAt || 0) > 60_000;
  if (!stale && aiProviderCache?.name) {
    return aiProviderCache.name;
  }

  const apiBase = getApiBase(backendUrl);

  try {
    const payload = await fetchJson(`${apiBase}/admin/settings/public`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    const activeProvider = String(payload.activeAiProvider || "OPENAI").toUpperCase();
    const providerName = String(
      payload.activeAiProviderName ||
        (activeProvider === "GEMINI" ? "Gemini 1.5 Pro" : "GPT-4o")
    );

    await setStored({
      aiProviderCache: {
        name: providerName,
        raw: activeProvider.toLowerCase(),
        updatedAt: Date.now()
      }
    });

    return providerName;
  } catch (error) {
    console.warn("[zoommate] Failed to refresh AI provider", error);
    return aiProviderCache?.name || "GPT-4o";
  }
}

async function incrementUsageFallback() {
  const { aiUsage } = await getStored(["aiUsage"]);
  const date = todayKey();
  const base =
    aiUsage && aiUsage.date === date
      ? aiUsage
      : { date, count: 0, limit: Number(aiUsage?.limit || 10) };
  const next = {
    date,
    count: Number(base.count || 0) + 1,
    limit: Number(base.limit || 10)
  };
  await setStored({ aiUsage: next });
  return next;
}

async function syncUsageFromBackend() {
  const { token, backendUrl } = await getStored(["token", "backendUrl"]);
  if (!token) {
    const usage = { date: todayKey(), count: 0, limit: 10 };
    await setStored({ aiUsage: usage });
    return usage;
  }

  const apiBase = getApiBase(backendUrl);
  try {
    const payload = await fetchJson(`${apiBase}/ai/usage`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      }
    });

    const usage = {
      date: String(payload.date || todayKey()),
      count: Number(payload.count || 0),
      limit: Number(payload.limit || 10)
    };
    await setStored({ aiUsage: usage });
    return usage;
  } catch (error) {
    console.warn("[zoommate] Failed to sync usage from backend", error);
    return incrementUsageFallback();
  }
}

async function createRefreshAlarm() {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
}

async function refreshState() {
  await refreshAiProvider(true);
  await syncUsageFromBackend();
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await createRefreshAlarm();
  await refreshState();
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await createRefreshAlarm();
  await refreshState();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  await refreshState();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (!message || typeof message !== "object") {
      sendResponse({ ok: false, error: "Invalid message" });
      return;
    }

    const { type } = message;

    if (type === "GET_TOKEN") {
      const data = await getStored([
        "token",
        "userId",
        "userEmail",
        "userName",
        "userAvatar",
        "backendUrl"
      ]);
      sendResponse({ ok: true, ...data });
      return;
    }

    if (type === "GET_AI_PROVIDER") {
      const provider = await refreshAiProvider(Boolean(message.force));
      sendResponse({ ok: true, provider });
      return;
    }

    if (type === "INCREMENT_USAGE" || type === "GET_USAGE") {
      const usage = await syncUsageFromBackend();
      sendResponse({ ok: true, usage });
      return;
    }

    if (type === "GET_SETTINGS") {
      await ensureDefaults();
      const settings = await getStored([
        "autoDetectForms",
        "showResultsPanel",
        "dashboardUrl",
        "backendUrl",
        "aiUsage",
        "aiProviderCache"
      ]);
      sendResponse({ ok: true, ...settings });
      return;
    }

    if (type === "SET_SETTINGS") {
      const patch = {};
      if (typeof message.autoDetectForms === "boolean") patch.autoDetectForms = message.autoDetectForms;
      if (typeof message.showResultsPanel === "boolean") patch.showResultsPanel = message.showResultsPanel;
      if (typeof message.backendUrl === "string") patch.backendUrl = normalizeBaseUrl(message.backendUrl);
      if (typeof message.dashboardUrl === "string") patch.dashboardUrl = normalizeBaseUrl(message.dashboardUrl);
      if (Object.keys(patch).length > 0) {
        await setStored(patch);
      }
      sendResponse({ ok: true });
      return;
    }

    if (type === "SET_AUTH") {
      await setStored({
        token: message.token || "",
        userId: message.userId || "",
        userEmail: message.userEmail || "",
        userName: message.userName || "",
        userAvatar: message.userAvatar || ""
      });
      await syncUsageFromBackend();
      sendResponse({ ok: true });
      return;
    }

    if (type === "SIGN_OUT") {
      await removeStored(["token", "userId", "userEmail", "userName", "userAvatar"]);
      await setStored({ aiUsage: { date: todayKey(), count: 0, limit: 10 } });
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false, error: "Unknown message type" });
  })().catch((error) => {
    console.error("[zoommate] Background handler error", error);
    sendResponse({ ok: false, error: String(error) });
  });

  return true;
});
