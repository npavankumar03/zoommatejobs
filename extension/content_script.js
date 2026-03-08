(() => {
  const FLOATING_BUTTON_ID = "jobfill-ai-floating-button";
  const OVERLAY_ID = "jobfill-ai-results-overlay";
  const DEFAULT_BACKEND_URL = "https://jobs.zoommate.in";

  const state = {
    atsType: "generic",
    provider: "GPT-4o",
    autoDetectForms: true,
    showResultsPanel: true,
    backendUrl: DEFAULT_BACKEND_URL,
    isProcessing: false,
    observer: null,
    lastFieldCount: 0,
    cachedFields: []
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
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

  function normalizeBaseUrl(url) {
    const value = normalizeText(url).replace(/\/$/, "");
    return value || DEFAULT_BACKEND_URL;
  }

  function getApiBase(url) {
    const base = normalizeBaseUrl(url);
    return base.endsWith("/api") ? base : `${base}/api`;
  }

  function injectStyles() {
    if (document.getElementById("jobfill-ai-floating-button-styles")) return;

    const link = document.createElement("link");
    link.id = "jobfill-ai-floating-button-styles";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("styles/floating_button.css");
    document.documentElement.appendChild(link);
  }

  function installAuthBridgeListener() {
    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data;
      if (!data || data.type !== "JOBFILL_AUTH_TOKEN") return;

      const payload = data.payload || {};
      if (!payload.token) return;

      void sendRuntimeMessage({
        type: "SET_AUTH",
        token: payload.token,
        userId: payload.userId || "",
        userEmail: payload.userEmail || "",
        userName: payload.userName || "",
        userAvatar: payload.userAvatar || ""
      });
    });
  }

  function getXPath(el) {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) {
      return "";
    }

    if (el.id) {
      return `//*[@id="${el.id.replace(/"/g, "\\\"")}"]`;
    }

    const segments = [];
    let current = el;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
      const tagName = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) break;

      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      const index = siblings.indexOf(current) + 1;
      segments.unshift(`${tagName}[${index}]`);
      current = parent;
    }

    return `/html/body/${segments.join("/")}`;
  }

  function getElementByXPath(xpath) {
    try {
      return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null)
        .singleNodeValue;
    } catch (_error) {
      return null;
    }
  }

  function nearbyLabelText(el) {
    const candidates = [];

    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) candidates.push(ariaLabel);

    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      ariaLabelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .forEach((node) => candidates.push(normalizeText(node.textContent)));
    }

    const placeholder = el.getAttribute("placeholder");
    if (placeholder) candidates.push(placeholder);

    if (el.labels && el.labels.length > 0) {
      candidates.push(normalizeText(el.labels[0].textContent));
    }

    const parent = el.closest("label, div, section, article, li, td, th, p, form");
    if (parent) {
      const text = normalizeText(parent.textContent || "");
      if (text && text.length <= 180) candidates.push(text);

      const nearby = Array.from(parent.querySelectorAll("label, span, strong, b, p, div"))
        .map((node) => normalizeText(node.textContent || ""))
        .filter((textItem) => textItem && textItem.length < 120);
      candidates.push(...nearby.slice(0, 3));
    }

    return candidates
      .map((text) => normalizeText(text))
      .filter(Boolean)
      .sort((a, b) => a.length - b.length)[0] || "";
  }

  function getLabel(el) {
    return nearbyLabelText(el);
  }

  function elementIsVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
      return false;
    }

    if (el instanceof HTMLInputElement && el.type === "hidden") {
      return false;
    }

    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function detectJobPage(url, doc) {
    const lowerUrl = String(url || "").toLowerCase();
    const patterns = [
      { key: "GREENHOUSE", tokens: ["greenhouse.io/application", "boards.greenhouse.io", "job-boards.greenhouse.io"] },
      { key: "LEVER", tokens: ["jobs.lever.co"] },
      { key: "WORKDAY", tokens: ["myworkdayjobs.com"] },
      { key: "ICIMS", tokens: ["icims.com/careers"] },
      { key: "ASHBY", tokens: ["ashbyhq.com"] },
      { key: "SMARTRECRUITERS", tokens: ["smartrecruiters.com"] },
      { key: "BAMBOOHR", tokens: ["bamboohr.com/careers"] }
    ];

    for (const pattern of patterns) {
      if (pattern.tokens.some((token) => lowerUrl.includes(token))) {
        return { isJobPage: true, atsType: pattern.key, confidence: "high" };
      }
    }

    const indicators = ["resume", "cover letter", "work authorization", "years of experience", "application"];
    const formElements = Array.from(doc.querySelectorAll("input, textarea, select"));
    let matches = 0;

    formElements.forEach((el) => {
      const label = normalizeLower(getLabel(el));
      if (indicators.some((token) => label.includes(token))) {
        matches += 1;
      }
    });

    if (matches >= 3) {
      return { isJobPage: true, atsType: "GENERIC", confidence: "medium" };
    }

    if (matches >= 1) {
      return { isJobPage: true, atsType: "GENERIC", confidence: "low" };
    }

    return { isJobPage: false, atsType: "UNKNOWN", confidence: "low" };
  }

  function extractJobMetadata() {
    const heading =
      document.querySelector("h1")?.textContent ||
      document.querySelector("main h2")?.textContent ||
      document.title ||
      "Job Application";

    const urlParts = location.hostname.split(".");
    const companyHint =
      document.querySelector("[data-company], .company, .employer, [class*=company]")?.textContent ||
      document.querySelector("h2")?.textContent ||
      urlParts.length > 1
        ? urlParts[urlParts.length - 2]
        : urlParts[0];

    const blocks = Array.from(document.querySelectorAll("main, article, section, div, p"))
      .map((node) => normalizeText(node.textContent || ""))
      .filter((text) => text.length > 200)
      .sort((a, b) => b.length - a.length);

    const jobDescription = blocks[0] || normalizeText(document.body.textContent || "").slice(0, 8000);

    return {
      jobTitle: normalizeText(heading),
      companyName: normalizeText(companyHint),
      jobDescription: normalizeText(jobDescription)
    };
  }

  function extractFieldOptions(el) {
    if (el instanceof HTMLSelectElement) {
      return Array.from(el.options)
        .map((option) => normalizeText(option.textContent || option.label || option.value))
        .filter(Boolean);
    }

    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      const radios = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(el.name)}"]`));
      return radios
        .map((radio) => {
          const label = getLabel(radio);
          return normalizeText(label || radio.value);
        })
        .filter(Boolean);
    }

    return [];
  }

  function collectFormFields() {
    const candidates = Array.from(document.querySelectorAll("input, textarea, select"));
    const fields = [];

    for (const el of candidates) {
      if (!(el instanceof HTMLElement)) continue;
      if (!elementIsVisible(el)) continue;

      const label = getLabel(el);
      const xpath = getXPath(el);
      const isRequired =
        Boolean(el.required) ||
        /\*/.test(label) ||
        /required/i.test(label) ||
        el.getAttribute("aria-required") === "true";

      let fieldType = el.tagName.toLowerCase();
      if (el instanceof HTMLInputElement) {
        fieldType = el.type || "text";
      }

      fields.push({
        xpath,
        fieldType,
        label,
        isRequired,
        availableOptions: extractFieldOptions(el)
      });
    }

    state.cachedFields = fields;
    state.lastFieldCount = fields.length;
    return fields;
  }

  function findBestElementByLabel(targetLabel) {
    const normalizedTarget = normalizeLower(targetLabel);
    if (!normalizedTarget) return null;

    const elements = Array.from(document.querySelectorAll("input, textarea, select"));
    let best = null;
    let bestScore = 0;

    for (const element of elements) {
      if (!elementIsVisible(element)) continue;
      const label = normalizeLower(getLabel(element));
      if (!label) continue;

      let score = 0;
      if (label === normalizedTarget) score = 100;
      else if (label.includes(normalizedTarget) || normalizedTarget.includes(label)) score = 75;
      else {
        const overlap = normalizedTarget
          .split(" ")
          .filter((token) => token.length > 2 && label.includes(token)).length;
        score = overlap * 10;
      }

      if (score > bestScore) {
        best = element;
        bestScore = score;
      }
    }

    return bestScore >= 30 ? best : null;
  }

  function setInputValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (!setter) {
      el.value = value;
    } else {
      setter.call(el, value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setTextareaValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (!setter) {
      el.value = value;
    } else {
      setter.call(el, value);
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function parseBoolean(value) {
    const normalized = normalizeLower(value);
    return ["true", "yes", "y", "1", "checked", "accept"].includes(normalized);
  }

  function pickBestOption(options, value) {
    const normalizedValue = normalizeLower(value);
    let best = null;
    let bestScore = -1;

    for (const option of options) {
      const text = normalizeLower(option.textContent || option.label || option.value);
      if (!text) continue;

      let score = 0;
      if (text === normalizedValue) score = 100;
      else if (text.includes(normalizedValue) || normalizedValue.includes(text)) score = 80;
      else {
        const overlap = normalizedValue.split(" ").filter((token) => token.length > 2 && text.includes(token)).length;
        score = overlap * 10;
      }

      if (score > bestScore) {
        best = option;
        bestScore = score;
      }
    }

    return best;
  }

  async function fillCustomDropdown(el, value) {
    el.click();
    await sleep(400);

    const options = Array.from(
      document.querySelectorAll(
        "[role='option'], [role='listbox'] [data-value], li, div[aria-selected], div[role='menuitem']"
      )
    ).filter((node) => node instanceof HTMLElement && elementIsVisible(node));

    const match = pickBestOption(options, value);
    if (!match) return false;

    match.click();
    return true;
  }

  async function fillElement(el, value) {
    if (!el) {
      return { filled: false, message: "Field not found" };
    }

    if (el instanceof HTMLInputElement && el.type === "file") {
      return { filled: false, message: "File input requires manual upload" };
    }

    if (el instanceof HTMLInputElement) {
      const inputType = (el.type || "text").toLowerCase();

      if (inputType === "radio") {
        const radios = el.name
          ? Array.from(document.querySelectorAll(`input[type='radio'][name='${CSS.escape(el.name)}']`))
          : [el];

        const bestRadio = pickBestOption(
          radios.map((radio) => ({
            node: radio,
            textContent: `${radio.value} ${getLabel(radio)}`
          })),
          value
        );

        const targetRadio = bestRadio?.node || el;
        targetRadio.click();
        return { filled: true, message: "Radio selected" };
      }

      if (inputType === "checkbox") {
        const desired = parseBoolean(value);
        if (el.checked !== desired) {
          el.checked = desired;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return { filled: true, message: "Checkbox updated" };
      }

      setInputValue(el, value);
      return { filled: true, message: "Input filled" };
    }

    if (el instanceof HTMLTextAreaElement) {
      setTextareaValue(el, value);
      return { filled: true, message: "Textarea filled" };
    }

    if (el instanceof HTMLSelectElement) {
      const match = pickBestOption(Array.from(el.options), value);
      if (!match) {
        return { filled: false, message: "Select option not matched" };
      }
      el.selectedIndex = match.index;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { filled: true, message: "Select option chosen" };
    }

    if (el instanceof HTMLElement && (el.getAttribute("role") === "combobox" || el.tagName.toLowerCase() === "div")) {
      const ok = await fillCustomDropdown(el, value);
      return {
        filled: ok,
        message: ok ? "Custom dropdown selected" : "Custom dropdown option not found"
      };
    }

    return { filled: false, message: "Unsupported field type" };
  }

  function setButtonState(kind, details = {}) {
    const button = document.getElementById(FLOATING_BUTTON_ID);
    if (!button) return;

    button.classList.remove("jobfill-ai-button--loading", "jobfill-ai-button--success", "jobfill-ai-button--error");

    const status = button.querySelector(".jobfill-ai-status");
    if (!status) return;

    if (kind === "idle") {
      status.textContent = "zoommate";
      return;
    }

    if (kind === "loading") {
      button.classList.add("jobfill-ai-button--loading");
      status.textContent = "Filling...";
      return;
    }

    if (kind === "success") {
      button.classList.add("jobfill-ai-button--success");
      status.textContent = `✓ ${details.filledCount || 0} fields filled`;
      return;
    }

    if (kind === "error") {
      button.classList.add("jobfill-ai-button--error");
      status.textContent = details.message || "Fill failed";
    }
  }

  function closeOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function createResultRow(result) {
    const row = document.createElement("div");
    row.className = "jobfill-ai-overlay-row";

    const top = document.createElement("div");
    top.className = "jobfill-ai-overlay-top";

    const label = document.createElement("p");
    label.className = "jobfill-ai-overlay-label";
    label.textContent = result.label || result.xpath || "Unknown field";

    const confidenceValue = Number(result.confidence || 0);
    const confidenceBadge = document.createElement("span");
    confidenceBadge.className = "jobfill-ai-confidence";

    if (!result.filled) {
      confidenceBadge.classList.add("jobfill-ai-confidence--low");
      confidenceBadge.textContent = "manual";
    } else if (confidenceValue >= 0.75) {
      confidenceBadge.classList.add("jobfill-ai-confidence--high");
      confidenceBadge.textContent = "high";
    } else if (confidenceValue >= 0.45) {
      confidenceBadge.classList.add("jobfill-ai-confidence--medium");
      confidenceBadge.textContent = "medium";
    } else {
      confidenceBadge.classList.add("jobfill-ai-confidence--low");
      confidenceBadge.textContent = "low";
    }

    top.appendChild(label);
    top.appendChild(confidenceBadge);

    const editable = document.createElement("input");
    editable.className = "jobfill-ai-overlay-value";
    editable.type = "text";
    editable.value = result.value || "";
    editable.placeholder = result.filled ? "" : "Manual input required";

    editable.addEventListener("change", async () => {
      const target = getElementByXPath(result.xpath) || findBestElementByLabel(result.label);
      if (!target) return;
      await fillElement(target, editable.value);
    });

    row.appendChild(top);
    row.appendChild(editable);
    return row;
  }

  function showResultsOverlay(results) {
    closeOverlay();

    const overlay = document.createElement("aside");
    overlay.id = OVERLAY_ID;
    overlay.className = "jobfill-ai-overlay";

    const header = document.createElement("div");
    header.className = "jobfill-ai-overlay-header";
    header.innerHTML = `
      <div>
        <h3>zoommate Results</h3>
        <p>${results.filter((item) => item.filled).length} fields filled</p>
      </div>
    `;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "jobfill-ai-close";
    close.textContent = "✕";
    close.addEventListener("click", closeOverlay);
    header.appendChild(close);

    const list = document.createElement("div");
    list.className = "jobfill-ai-overlay-list";
    results.forEach((result) => list.appendChild(createResultRow(result)));

    const footer = document.createElement("p");
    footer.className = "jobfill-ai-overlay-footer";
    footer.textContent = "All done — review and submit.";

    overlay.appendChild(header);
    overlay.appendChild(list);
    overlay.appendChild(footer);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("jobfill-ai-overlay--visible"));
  }

  function injectFloatingButton() {
    if (document.getElementById(FLOATING_BUTTON_ID)) {
      return;
    }

    injectStyles();

    const button = document.createElement("button");
    button.id = FLOATING_BUTTON_ID;
    button.className = "jobfill-ai-button jobfill-ai-button--pulse";
    button.type = "button";
    button.innerHTML = `
      <span class="jobfill-ai-logo">ZM</span>
      <span class="jobfill-ai-status">zoommate</span>
      <span class="jobfill-ai-provider">${state.provider}</span>
      <span class="jobfill-ai-spinner" aria-hidden="true"></span>
    `;

    button.addEventListener("click", async () => {
      if (state.isProcessing) return;
      await runFillProcess();
    });

    document.body.appendChild(button);

    setTimeout(() => {
      button.classList.remove("jobfill-ai-button--pulse");
    }, 3500);
  }

  async function resolveFieldTarget(fillItem) {
    const xpathTarget = fillItem.xpath ? getElementByXPath(fillItem.xpath) : null;
    if (xpathTarget) return xpathTarget;

    const labelTarget = findBestElementByLabel(fillItem.field_label || fillItem.label || "");
    if (labelTarget) return labelTarget;

    return null;
  }

  async function applyAiResults(aiItems) {
    const results = [];

    for (const item of aiItems) {
      const target = await resolveFieldTarget(item);
      const value = normalizeText(item.value || "");

      if (!target) {
        results.push({
          xpath: item.xpath || "",
          label: item.field_label || item.label || "Unknown field",
          value,
          confidence: Number(item.confidence || 0),
          filled: false,
          message: "Target field not found"
        });
        continue;
      }

      const fillOutcome = await fillElement(target, value);
      results.push({
        xpath: item.xpath || getXPath(target),
        label: item.field_label || item.label || getLabel(target),
        value,
        confidence: Number(item.confidence || 0),
        filled: Boolean(fillOutcome.filled),
        message: fillOutcome.message
      });
    }

    return results;
  }

  async function runFillProcess() {
    state.isProcessing = true;
    setButtonState("loading");

    try {
      const fields = collectFormFields();
      if (!fields.length) {
        throw new Error("No fillable form fields detected");
      }

      const metadata = extractJobMetadata();
      const tokenResponse = await sendRuntimeMessage({ type: "GET_TOKEN" });
      if (!tokenResponse?.ok || !tokenResponse.token) {
        throw new Error("Missing auth token. Login required in extension popup.");
      }

      state.backendUrl = normalizeBaseUrl(tokenResponse.backendUrl || state.backendUrl);
      const apiBase = getApiBase(state.backendUrl);

      const response = await fetch(`${apiBase}/ai/fill-form`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenResponse.token}`
        },
        body: JSON.stringify({
          fields,
          jobDescription: metadata.jobDescription,
          jobTitle: metadata.jobTitle,
          companyName: metadata.companyName
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Daily limit reached");
        }
        if (response.status === 401) {
          throw new Error("Authentication expired. Please sign in again.");
        }
        const detail = await response.text();
        throw new Error(`AI request failed (${response.status}): ${detail}`);
      }

      const payload = await response.json();
      const aiItems = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
      if (!aiItems.length) {
        throw new Error("AI returned no fill suggestions");
      }

      const fillResults = await applyAiResults(aiItems);
      const filledCount = fillResults.filter((item) => item.filled).length;

      await sendRuntimeMessage({ type: "INCREMENT_USAGE" });
      setButtonState("success", { filledCount });

      if (state.showResultsPanel) {
        showResultsOverlay(fillResults);
      }
    } catch (error) {
      console.error("[zoommate] Fill process failed", error);
      setButtonState("error", { message: String(error.message || error) });
    } finally {
      state.isProcessing = false;
      setTimeout(() => {
        setButtonState("idle");
      }, 4000);
    }
  }

  function monitorDynamicFields() {
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    const callback = async (mutations) => {
      let hasNewFormField = false;

      for (const mutation of mutations) {
        if (mutation.type !== "childList" || mutation.addedNodes.length === 0) continue;

        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;

          if (node.matches?.("input, textarea, select") || node.querySelector?.("input, textarea, select")) {
            hasNewFormField = true;
            break;
          }
        }

        if (hasNewFormField) break;
      }

      if (!hasNewFormField) return;
      await sleep(250);

      const fields = collectFormFields();
      if (fields.length > state.lastFieldCount && state.autoDetectForms) {
        injectFloatingButton();
      }
    };

    state.observer = new MutationObserver(callback);
    state.observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true
    });
  }

  async function updateProviderBadge() {
    const providerResponse = await sendRuntimeMessage({ type: "GET_AI_PROVIDER" });
    if (providerResponse?.ok && providerResponse.provider) {
      state.provider = providerResponse.provider;
    }

    const badge = document.querySelector(`#${FLOATING_BUTTON_ID} .jobfill-ai-provider`);
    if (badge) {
      badge.textContent = state.provider;
    }
  }

  async function initialize() {
    installAuthBridgeListener();

    const settingsResponse = await sendRuntimeMessage({ type: "GET_SETTINGS" });
    if (settingsResponse?.ok) {
      state.autoDetectForms = settingsResponse.autoDetectForms !== false;
      state.showResultsPanel = settingsResponse.showResultsPanel !== false;
      state.backendUrl = normalizeBaseUrl(settingsResponse.backendUrl || DEFAULT_BACKEND_URL);
    }

    const detection = detectJobPage(location.href, document);
    state.atsType = detection.atsType;

    if (state.autoDetectForms && detection.isJobPage) {
      injectFloatingButton();
      await updateProviderBadge();
    }

    monitorDynamicFields();

    // Refresh provider badge periodically while page is open.
    setInterval(() => {
      if (document.getElementById(FLOATING_BUTTON_ID)) {
        void updateProviderBadge();
      }
    }, 60_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      void initialize();
    });
  } else {
    void initialize();
  }
})();
