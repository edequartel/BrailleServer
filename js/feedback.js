/* /js/feedback.js
   Uses the CURRENT EventLog class exactly as you posted:
   - window.EventLog is a class
   - we create ONE instance at window.eventLog (if not already present)
   - feedback logs through window.eventLog.log(...)
   Config: /config/feedback.json
   Audio:  /audio/...
*/
(function () {
  "use strict";

  if (window.Feedback) {
    console.warn("[Feedback] already loaded");
    return;
  }

  const DEFAULT_FEEDBACK_MS = 300;
  let config = null;
  const SOUNDS_CONFIG_URL =
    (window.BOOTSTRAP && window.BOOTSTRAP.JSON && window.BOOTSTRAP.JSON.SOUNDS) ||
    "/config/sounds.json";
  const LANG_KEY = "bs_lang";

  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  function ensureEventLog() {
    // If the page already created an instance, use it.
    if (window.eventLog?.log) return window.eventLog;

    // If an element exists, we can auto-mount (demo convenience).
    const el = document.getElementById("eventLog");
    if (el && typeof window.EventLog === "function") {
      window.eventLog = new window.EventLog(el, { maxEntries: 500 });
      return window.eventLog;
    }

    return null;
  }

  function log(message, type = "system", data) {
    const full = data ? `${message} ${safeJson(data)}` : message;

    const logger = ensureEventLog();
    if (logger?.log) logger.log(`[feedback] ${full}`, type);
    else console.log(`[feedback:${type}] ${full}`);
  }

  async function loadConfig() {
    if (config) return config;

    log("load-config", "info", { url: "/config/feedback.json" });

    const res = await fetch("/config/feedback.json", { cache: "no-store" });
    if (!res.ok) {
      log("load-config failed", "error", { status: res.status });
      throw new Error(`[Feedback] Cannot load /config/feedback.json (HTTP ${res.status})`);
    }

    config = await res.json();
    log("config-loaded", "info", { keys: Object.keys(config) });

    return config;
  }

  function getFeedbackList(cfg, type) {
    const list = cfg?.feedback?.[type] || cfg?.[type];
    if (Array.isArray(list)) return list;
    if (list && typeof list === "object") return [list];
    return [];
  }

  function normalizeKey(file) {
    const base = String(file || "").split(/[\\/]/).pop() || "";
    return base.replace(/\.[^/.]+$/, "").trim().toLowerCase();
  }

  function resolveLang() {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored) return String(stored).trim().toLowerCase().split("-")[0];
    const htmlLang = document.documentElement.getAttribute("lang");
    if (htmlLang) return String(htmlLang).trim().toLowerCase().split("-")[0];
    return "nl";
  }

  async function ensureSoundsReady() {
    if (!window.Sounds || typeof Sounds.init !== "function") {
      throw new Error("Sounds module not available");
    }
    await Sounds.init(SOUNDS_CONFIG_URL, (line) => log("[Sounds]", "info", { line }));
  }

  async function playRandomSound(type, opts = {}) {
    const cfg = await loadConfig();
    const list = getFeedbackList(cfg, type);

    if (!list.length) {
      log("audio-skip", "warn", { type, reason: "no-feedback-files" });
      return null;
    }

    const pick = list[Math.floor(Math.random() * list.length)];
    const file = pick?.file;
    if (!file) {
      log("audio-skip", "warn", { type, reason: "missing-file" });
      return null;
    }

    await ensureSoundsReady();
    const key = normalizeKey(file);
    const lang = resolveLang();
    const url = Sounds._buildUrl(lang, "feedback", key);

    log("audio-play", "info", { type, file, url });
    log("audio-file", "info", { file, url });

    if (window.AudioPlayer?.play) {
      window.AudioPlayer.play(url, opts);
    } else {
      const audio = new Audio(url);
      audio.play().catch((err) => log("audio-error", "error", { type, url, err: err?.message || String(err) }));
    }

    return url;
  }

  async function show(type, opts = {}) {
    log("show", "system", { type, opts });

    const cfg = await loadConfig();
    const entry = (cfg?.feedback?.[type] && cfg.feedback[type]) || cfg[type];

    if (!entry) {
      log("unknown-type", "warn", { type });
      return;
    }

    const duration = opts.duration ?? entry.duration ?? DEFAULT_FEEDBACK_MS;

    // Audio
    await playRandomSound(type, opts).catch((err) => {
      log("audio-error", "error", { type, err: err?.message || String(err) });
    });

    // Braille
    if (entry.braille !== undefined) {
      log("braille-set", "info", { text: entry.braille });
      window.BrailleUI?.setLine(entry.braille, { source: "feedback", type });
    }

    // Auto clear
    if (duration > 0) {
      setTimeout(() => {
        log("braille-clear", "info", { afterMs: duration });
        window.BrailleUI?.clear({ source: "feedback" });
      }, duration);
    }
  }

  window.Feedback = { show, playRandomSound };
})();
