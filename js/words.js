// /js/words.js
(function () {
  "use strict";

  // ------------------------------------------------------------
  // Logging helper: uses logging.js (logMessage) if available.
  // Falls back to console.log.
  // ------------------------------------------------------------
  function log(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") {
      window.logMessage(line);
    } else {
      console.log(line);
    }
  }

  function safeJson(x) {
    try {
      return JSON.stringify(x);
    } catch {
      return String(x);
    }
  }

  log("[words] words.js loaded");

  // ------------------------------------------------------------
  // Config
  // ------------------------------------------------------------
  const DATA_URL = "../config/words.json";

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  let records = [];
  let currentIndex = 0;
  let currentActivityIndex = 0;

  // ------------------------------------------------------------
  // DOM helper
  // ------------------------------------------------------------
  function $(id) {
    const el = document.getElementById(id);
    if (!el) log(`[words] Missing element #${id}`);
    return el;
  }

  function setStatus(text) {
    const el = $("data-status");
    if (el) el.textContent = "Data: " + text;
  }

  // ------------------------------------------------------------
  // Render
  // ------------------------------------------------------------
  function getActivities(item) {
    if (Array.isArray(item.activities) && item.activities.length) {
      return item.activities
        .filter(a => a && typeof a === "object")
        .map(a => ({ id: String(a.id ?? "").trim(), caption: String(a.caption ?? "").trim() }))
        .filter(a => a.id);
    }

    // Backwards-compatible fallback for older words.json
    const activities = [{ id: "tts", caption: "Luister (woord)" }];
    if (Array.isArray(item.letters) && item.letters.length) activities.push({ id: "letters", caption: "Oefen letters" });
    if (Array.isArray(item.words) && item.words.length) activities.push({ id: "words", caption: "Maak woorden" });
    if (Array.isArray(item.story) && item.story.length) activities.push({ id: "story", caption: "Luister (verhaal)" });
    if (Array.isArray(item.sounds) && item.sounds.length) activities.push({ id: "sounds", caption: "Geluiden" });
    return activities;
  }

  function formatActivityDetail(activityId, item) {
    switch (activityId) {
      case "tts":
        return {
          caption: "Luister (woord)",
          detail: item.word ? String(item.word) : "–"
        };
      case "letters":
        return {
          caption: "Oefen letters",
          detail: Array.isArray(item.letters) && item.letters.length ? item.letters.join(" ") : "–"
        };
      case "words":
        return {
          caption: "Maak woorden",
          detail: Array.isArray(item.words) && item.words.length ? item.words.join(", ") : "–"
        };
      case "story":
        return {
          caption: "Luister (verhaal)",
          detail: Array.isArray(item.story) && item.story.length ? item.story.join("\n") : "–"
        };
      case "sounds":
        return {
          caption: "Geluiden",
          detail: Array.isArray(item.sounds) && item.sounds.length ? item.sounds.join("\n") : "–"
        };
      default:
        return {
          caption: activityId ? `Activity: ${activityId}` : "Details",
          detail: safeJson(item)
        };
    }
  }

  function setActiveActivity(index) {
    const item = records[currentIndex];
    if (!item) return;
    const activities = getActivities(item);
    if (!activities.length) {
      currentActivityIndex = 0;
      return;
    }
    const nextIndex = Math.max(0, Math.min(index, activities.length - 1));
    currentActivityIndex = nextIndex;
    renderActivity(item, activities);
  }

  function renderActivity(item, activities) {
    const activityIndexEl = $("activity-index");
    const activityIdEl = $("activity-id");
    const activityCaptionEl = $("activity-caption");
    const activityDetailEl = $("activity-detail");
    const activityButtonsEl = $("activity-buttons");

    if (!activityIndexEl || !activityIdEl || !activityCaptionEl || !activityDetailEl || !activityButtonsEl) {
      log("[words] Missing activity DOM elements; cannot render activity.");
      return;
    }

    if (!activities.length) {
      activityIndexEl.textContent = "0 / 0";
      activityIdEl.textContent = "Activity: –";
      activityCaptionEl.textContent = "Details";
      activityDetailEl.textContent = "–";
      activityButtonsEl.innerHTML = "";
      return;
    }

    const active = activities[currentActivityIndex] ?? activities[0];
    if (!active) return;

    activityIndexEl.textContent = `${currentActivityIndex + 1} / ${activities.length}`;
    activityIdEl.textContent = `Activity: ${active.id}`;

    const { caption, detail } = formatActivityDetail(active.id, item);
    activityCaptionEl.textContent = caption || "Details";
    activityDetailEl.textContent = detail ?? "–";

    activityButtonsEl.innerHTML = "";
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip" + (i === currentActivityIndex ? " active" : "");
      btn.textContent = a.caption || a.id;
      btn.title = a.id;
      btn.addEventListener("click", () => {
        log("[words] Activity selected", { id: a.id, index: i });
        setActiveActivity(i);
      });
      activityButtonsEl.appendChild(btn);
    }
  }

  function render() {
    if (!records.length) {
      log("[words] render() called with no records");
      setStatus("geen records");
      return;
    }

    const item = records[currentIndex];
    log("[words] Rendering record", { index: currentIndex, id: item.id });

    const idEl = $("item-id");
    const indexEl = $("item-index");
    const wordEl = $("field-word");

    // Critical elements must exist
    if (!idEl || !indexEl || !wordEl) {
      log("[words] Critical DOM elements missing; cannot render.");
      setStatus("HTML mist ids");
      return;
    }

    idEl.textContent = "ID: " + (item.id ?? "–");
    indexEl.textContent = `${currentIndex + 1} / ${records.length}`;

    wordEl.textContent = item.word || "–";

    const iconEl = $("field-icon");
    if (iconEl) {
      iconEl.textContent = "Icon: " + (item.icon || "–");
    }

    const shortFlagEl = $("short-flag");
    if (shortFlagEl) {
      shortFlagEl.style.display = item.short ? "inline-flex" : "none";
    }

    const activities = getActivities(item);
    if (currentActivityIndex >= activities.length) currentActivityIndex = 0;
    renderActivity(item, activities);

    setStatus(`geladen (${records.length})`);
  }

  // ------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------
  function next() {
    if (!records.length) return;
    currentIndex = (currentIndex + 1) % records.length;
    currentActivityIndex = 0;
    log("[words] Next pressed", { currentIndex });
    render();
  }

  function prev() {
    if (!records.length) return;
    currentIndex = (currentIndex - 1 + records.length) % records.length;
    currentActivityIndex = 0;
    log("[words] Prev pressed", { currentIndex });
    render();
  }

  function nextActivity() {
    if (!records.length) return;
    const item = records[currentIndex];
    const activities = getActivities(item);
    if (!activities.length) return;
    currentActivityIndex = (currentActivityIndex + 1) % activities.length;
    log("[words] Next activity", { currentActivityIndex });
    renderActivity(item, activities);
  }

  function prevActivity() {
    if (!records.length) return;
    const item = records[currentIndex];
    const activities = getActivities(item);
    if (!activities.length) return;
    currentActivityIndex = (currentActivityIndex - 1 + activities.length) % activities.length;
    log("[words] Prev activity", { currentActivityIndex });
    renderActivity(item, activities);
  }

  // ------------------------------------------------------------
  // Load JSON
  // ------------------------------------------------------------
  async function loadData() {
    const resolvedUrl = new URL(DATA_URL, window.location.href).toString();
    log("[words] Loading JSON", { url: resolvedUrl });
    setStatus("laden...");

    try {
      const res = await fetch(resolvedUrl, { cache: "no-store" });
      log("[words] Fetch response", { status: res.status, ok: res.ok });

      if (!res.ok) {
        setStatus(`fout HTTP ${res.status}`);
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();

      if (!Array.isArray(json)) {
        setStatus("fout: geen array");
        throw new Error("words.json is not an array");
      }

      // Basic validation/logging
      records = json;
      currentIndex = 0;
      currentActivityIndex = 0;

      log("[words] JSON parsed", { count: records.length, firstId: records[0]?.id });
      setStatus(`geladen (${records.length})`);

      render();
    } catch (err) {
      log("[words] ERROR loading JSON", { message: err.message });
      // Helpful hint for the common case (opening via file://)
      if (location.protocol === "file:") {
        setStatus("laden mislukt: open via http:// (file:// blokkeert fetch)");
      } else {
        setStatus("laden mislukt (zie log/console)");
      }
    }
  }

  // ------------------------------------------------------------
  // Init
  // ------------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    log("[words] DOMContentLoaded");

    const nextBtn = $("next-btn");
    const prevBtn = $("prev-btn");
    const nextActivityBtn = $("next-activity-btn");
    const prevActivityBtn = $("prev-activity-btn");

    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (nextActivityBtn) nextActivityBtn.addEventListener("click", nextActivity);
    if (prevActivityBtn) prevActivityBtn.addEventListener("click", prevActivity);

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") nextActivity();
      if (e.key === "ArrowLeft") prevActivity();
      if (e.key === "ArrowDown") next();
      if (e.key === "ArrowUp") prev();
    });

    loadData();
  });
})();
