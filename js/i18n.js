// /js/i18n.js
(function () {
  "use strict";

  const DEFAULT_LANG = "nl";

  // ------------------------------------------------------------
  // Logging helpers (console + optional window.logMessage hook)
  // ------------------------------------------------------------
  function log(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") window.logMessage(line);
    console.log(line);
  }
  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  function normalizeLang(tag) {
    const t = String(tag || "").trim().toLowerCase();
    const base = t.split("-")[0];
    return (base === "nl" || base === "en") ? base : DEFAULT_LANG;
  }

  async function fetchJson(url) {
    log("[i18n] fetch", { url });
    const res = await fetch(url, { cache: "no-store" });
    log("[i18n] fetch result", { url, ok: res.ok, status: res.status });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    const json = await res.json();
    log("[i18n] json loaded", { url, keys: Object.keys(json || {}).length });
    return json;
  }

  function applyDict(dict) {
    const nodes = Array.from(document.querySelectorAll("[data-i18n]"));
    let applied = 0;

    nodes.forEach(el => {
      const key = el.getAttribute("data-i18n");
      const val = dict && dict[key];
      if (typeof val === "string") {
        el.textContent = val;
        applied++;
      }
    });

    log("[i18n] applied", { nodes: nodes.length, applied });
    return { nodes: nodes.length, applied };
  }

  async function loadDict({ lang, basePath }) {
    const L = normalizeLang(lang);
    const bp = String(basePath || "");
    const url = `${bp}i18n/${L}.json`;

    try {
      return await fetchJson(url);
    } catch (e1) {
      log("[i18n] load failed; falling back", { lang: L, error: String(e1) });
      if (L === DEFAULT_LANG) throw e1;
      const fallbackUrl = `${bp}i18n/${DEFAULT_LANG}.json`;
      return await fetchJson(fallbackUrl);
    }
  }

  async function loadAndApply({ lang, basePath }) {
    const L = normalizeLang(lang);
    document.documentElement.setAttribute("lang", L);

    log("[i18n] loadAndApply", { lang: L, basePath: String(basePath || "") });

    const dict = await loadDict({ lang: L, basePath });
    const applied = applyDict(dict);

    return { lang: L, dict, applied };
  }

  function t(dict, key, fallback) {
    const val = dict && dict[key];
    return (typeof val === "string") ? val : (fallback != null ? String(fallback) : String(key));
  }

  window.I18n = { loadAndApply, loadDict, t, normalizeLang, log };
})();