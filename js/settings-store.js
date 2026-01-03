// /js/settings-store.js
(function () {
  "use strict";

  const STORAGE_KEY = "localstorage.json";

  const DEFAULTS = {
    lang: "nl",              // "nl" | "en"
    ssocSimulator: true,     // boolean
    method: "mpop.json",     // "mpop.json" | "marechal.json"
    brailleMode: "literacy"  // "literacy" (6-dot) | "computer" (8-dot)
  };

  // ------------------------------------------------------------
  // Logging helpers
  // ------------------------------------------------------------
  function log(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") window.logMessage(line);
    console.log(line);
  }

  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  // ------------------------------------------------------------
  // Normalizers (important for robustness)
  // ------------------------------------------------------------
  function normalizeLang(x) {
    const t = String(x || "").trim().toLowerCase();
    const base = t.split("-")[0];
    return (base === "nl" || base === "en") ? base : DEFAULTS.lang;
  }

  function normalizeMethod(x) {
    const t = String(x || "").trim();
    return (t === "mpop.json" || t === "marechal.json") ? t : DEFAULTS.method;
  }

  function normalizeBrailleMode(x) {
    const t = String(x || "").trim().toLowerCase();
    return (t === "literacy" || t === "computer") ? t : DEFAULTS.brailleMode;
  }

  function normalize(state) {
    return {
      lang: normalizeLang(state.lang),
      ssocSimulator: !!state.ssocSimulator,
      method: normalizeMethod(state.method),
      brailleMode: normalizeBrailleMode(state.brailleMode)
    };
  }

  // ------------------------------------------------------------
  // Storage access
  // ------------------------------------------------------------
  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        log("[settings-store] load: empty, using defaults");
        return { ...DEFAULTS };
      }
      const parsed = JSON.parse(raw);
      const normalized = normalize({ ...DEFAULTS, ...parsed });
      log("[settings-store] load", normalized);
      return normalized;
    } catch (e) {
      log("[settings-store] load failed, resetting", { error: String(e), raw });
      return { ...DEFAULTS };
    }
  }

  function save(state) {
    const normalized = normalize(state);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      log("[settings-store] save", normalized);
      return normalized;
    } catch (e) {
      log("[settings-store] save failed", { error: String(e), state: normalized });
      return normalized;
    }
  }

  function patch(partial) {
    const current = load();
    const next = { ...current, ...partial };
    return save(next);
  }

  // ------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------
  window.SettingsStore = {
    STORAGE_KEY,
    DEFAULTS,
    load,
    save,
    patch
  };

  log("[settings-store] initialized", { key: STORAGE_KEY });
})();