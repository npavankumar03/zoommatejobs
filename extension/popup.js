const DEFAULT_BACKEND_URL = "https://jobs.zoommate.in";
const DEFAULT_DASHBOARD_URL = "https://jobs.zoommate.in/dashboard";
const REFRESH_INTERVAL_MS = 60_000;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(url) {
  return normalizeText(url).replace(/\/$/, "") || DEFAULT_BACKEND_URL;
}

function getApiBase(url) {
  const base = normalizeBaseUrl(url);
  return base.endsWith("/api") ? base : `${base}/api`;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "No response" });
      });
    } catch (error) {
      resolve({ ok: false, error: String(error) });
    }
  });
}

function initialsFromName(name, email) {
  const source = normalizeText(name) || normalizeText(email);
  if (!source) return "ZM";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function usagePercent(count, limit) {
  const safeLimit = Math.max(Number(limit || 0), 1);
  const safeCount = Math.max(Number(count || 0), 0);
  return Math.min(Math.round((safeCount / safeLimit) * 100), 100);
}

function getEl(id) {
  return document.getElementById(id);
}

async function openTab(url) {
  const finalUrl = normalizeText(url) || DEFAULT_DASHBOARD_URL;
  await chrome.tabs.create({ url: finalUrl });
}

function setLoggedInVisible(isLoggedIn) {
  getEl("loggedInView").classList.toggle("hidden", !isLoggedIn);
  getEl("loggedOutView").classList.toggle("hidden", isLoggedIn);
}

async function fetchPublicSettingsFromBackend(backendUrl) {
  const apiBase = getApiBase(backendUrl);
  try {
    const response = await fetch(`${apiBase}/admin/settings/public`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });
    if (!response.ok) throw new Error(`Failed (${response.status})`);
    return await response.json();
  } catch {
    return null;
  }
}

function renderProvider(providerName) {
  getEl("providerBadge").textContent = providerName || "GPT-4o";
}

function renderUsage(usage) {
  const count = Number(usage?.count || 0);
  const limit = Number(usage?.limit || 10);
  getEl("usageText").textContent = `${count} / ${limit} fills used today`;
  getEl("usageFill").style.width = `${usagePercent(count, limit)}%`;
}

function renderToggles(settings) {
  getEl("autoDetectToggle").checked = settings?.autoDetectForms !== false;
  getEl("showPanelToggle").checked = settings?.showResultsPanel !== false;
}

function renderUser(userData) {
  const name = normalizeText(userData.userName) || "zoommate User";
  const email = normalizeText(userData.userEmail) || "unknown";
  const avatar = normalizeText(userData.userAvatar);

  getEl("userName").textContent = name;
  getEl("userEmail").textContent = email;

  const avatarEl = getEl("userAvatar");
  if (avatar) {
    avatarEl.src = avatar;
    avatarEl.alt = `${name} avatar`;
    return;
  }

  const initials = initialsFromName(name, email);
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="#c7d2fe"/><text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI,Tahoma,sans-serif" font-size="28" font-weight="700" fill="#1e293b">${initials}</text></svg>`
  );
  avatarEl.src = `data:image/svg+xml;utf8,${svg}`;
  avatarEl.alt = `${name} initials avatar`;
}

async function refreshProviderAndUsage() {
  const [tokenResponse, settingsResponse] = await Promise.all([
    sendRuntimeMessage({ type: "GET_TOKEN" }),
    sendRuntimeMessage({ type: "GET_SETTINGS" })
  ]);

  const backendUrl = settingsResponse?.backendUrl || tokenResponse?.backendUrl || DEFAULT_BACKEND_URL;
  const publicSettings = await fetchPublicSettingsFromBackend(backendUrl);
  const usageResponse = await sendRuntimeMessage({ type: "GET_USAGE" });

  const providerName =
    publicSettings?.activeAiProviderName ||
    publicSettings?.activeAiProvider ||
    settingsResponse?.aiProviderCache?.name ||
    "GPT-4o";

  renderProvider(providerName);
  if (usageResponse?.ok) {
    renderUsage(usageResponse.usage);
  }
}

async function loadState() {
  const [tokenResponse, settingsResponse] = await Promise.all([
    sendRuntimeMessage({ type: "GET_TOKEN" }),
    sendRuntimeMessage({ type: "GET_SETTINGS" })
  ]);

  const hasToken = Boolean(tokenResponse?.ok && normalizeText(tokenResponse.token));
  setLoggedInVisible(hasToken);
  renderToggles(settingsResponse || {});

  const backendUrl = settingsResponse?.backendUrl || tokenResponse?.backendUrl || DEFAULT_BACKEND_URL;
  const publicSettings = await fetchPublicSettingsFromBackend(backendUrl);
  renderProvider(
    publicSettings?.activeAiProviderName ||
      publicSettings?.activeAiProvider ||
      settingsResponse?.aiProviderCache?.name ||
      "GPT-4o"
  );

  if (!hasToken) return;

  renderUser(tokenResponse);
  const usageResponse = await sendRuntimeMessage({ type: "GET_USAGE" });
  if (usageResponse?.ok) {
    renderUsage(usageResponse.usage);
  } else {
    renderUsage(settingsResponse?.aiUsage || { count: 0, limit: 10 });
  }
}

function bindEvents() {
  getEl("openDashboardBtn").addEventListener("click", async () => {
    const settings = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    const dashboardUrl = settings?.dashboardUrl || DEFAULT_DASHBOARD_URL;
    await openTab(dashboardUrl);
  });

  getEl("signOutBtn").addEventListener("click", async () => {
    await sendRuntimeMessage({ type: "SIGN_OUT" });
    await loadState();
  });

  getEl("loginBtn").addEventListener("click", async () => {
    const settings = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    const backendUrl = settings?.backendUrl || DEFAULT_BACKEND_URL;
    await openTab(backendUrl);
  });

  getEl("autoDetectToggle").addEventListener("change", async (event) => {
    await sendRuntimeMessage({
      type: "SET_SETTINGS",
      autoDetectForms: Boolean(event.target.checked)
    });
  });

  getEl("showPanelToggle").addEventListener("change", async (event) => {
    await sendRuntimeMessage({
      type: "SET_SETTINGS",
      showResultsPanel: Boolean(event.target.checked)
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  bindEvents();
  await loadState();
  setInterval(() => {
    void refreshProviderAndUsage();
  }, REFRESH_INTERVAL_MS);
});
