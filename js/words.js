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
    } catch (err) {
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
  let runToken = 0;
  let running = false;

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

  function setActivityStatus(text) {
    const el = $("activity-status");
    if (el) el.textContent = "Status: " + text;
  }

  function setRunnerUi({ isRunning }) {
    const startBtn = $("start-activity-btn");
    const doneBtn = $("done-activity-btn");
    const autoRun = $("auto-run");

    if (startBtn) startBtn.disabled = Boolean(isRunning);
    if (doneBtn) doneBtn.disabled = !isRunning;
    if (autoRun) autoRun.disabled = Boolean(isRunning);
  }

  function formatAllFields(item) {
    if (!item || typeof item !== "object") return "–";

    const activities = Array.isArray(item.activities) ? item.activities : [];
    const activityLines = activities
      .filter(a => a && typeof a === "object")
      .map(a => {
        const id = String(a.id ?? "").trim();
        const caption = String(a.caption ?? "").trim();
        if (!id && !caption) return null;
        return caption ? `${id} — ${caption}` : id;
      })
      .filter(Boolean);

    const lines = [
      `id: ${item.id ?? "–"}`,
      `word: ${item.word ?? "–"}`,
      `icon: ${item.icon ?? "–"}`,
      `short: ${typeof item.short === "boolean" ? item.short : (item.short ?? "–")}`,
      `letters: ${Array.isArray(item.letters) ? item.letters.join(" ") : "–"}`,
      `words: ${Array.isArray(item.words) ? item.words.join(", ") : "–"}`,
      `story: ${Array.isArray(item.story) ? item.story.join(", ") : "–"}`,
      `sounds: ${Array.isArray(item.sounds) ? item.sounds.join(", ") : "–"}`,
      `activities (${activityLines.length}):${activityLines.length ? "\n  - " + activityLines.join("\n  - ") : " –"}`
    ];

    return lines.join("\n");
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
    const rawId = String(activityId ?? "");
    const id = rawId.trim().toLowerCase();
    const canonical =
      id.startsWith("tts") ? "tts" :
      id.startsWith("letters") ? "letters" :
      id.startsWith("words") ? "words" :
      id.startsWith("story") ? "story" :
      id.startsWith("sounds") ? "sounds" :
      id;

    switch (canonical) {
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
          caption: rawId ? `Activity: ${rawId}` : "Details",
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

  function getCurrentActivity() {
    const item = records[currentIndex];
    if (!item) return null;
    const activities = getActivities(item);
    if (!activities.length) return null;
    const active = activities[currentActivityIndex] ?? activities[0];
    if (!active) return null;
    return { item, activities, activity: active };
  }

  function renderActivity(item, activities) {
    const activityIndexEl = $("activity-index");
    const activityIdEl = $("activity-id");
    const activityCaptionEl = $("activity-caption");
    const activityDetailEl = $("activity-detail");
    const activityButtonsEl = $("activity-buttons");
    const prevActivityBtn = $("prev-activity-btn");
    const nextActivityBtn = $("next-activity-btn");

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
      if (prevActivityBtn) prevActivityBtn.disabled = true;
      if (nextActivityBtn) nextActivityBtn.disabled = true;
      return;
    }

    const canCycle = activities.length > 1;
    if (prevActivityBtn) prevActivityBtn.disabled = !canCycle;
    if (nextActivityBtn) nextActivityBtn.disabled = !canCycle;

    const active = activities[currentActivityIndex] ?? activities[0];
    if (!active) return;

    activityIndexEl.textContent = `${currentActivityIndex + 1} / ${activities.length}`;
    const rawId = String(active.id ?? "");
    const id = rawId.trim().toLowerCase();
    const canonical =
      id.startsWith("tts") ? "tts" :
      id.startsWith("letters") ? "letters" :
      id.startsWith("words") ? "words" :
      id.startsWith("story") ? "story" :
      id.startsWith("sounds") ? "sounds" :
      id;
    activityIdEl.textContent = canonical && canonical !== id ? `Activity: ${rawId} (${canonical})` : `Activity: ${rawId}`;

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
        cancelRun();
        setActiveActivity(i);
        startSelectedActivity({ autoStarted: true });
      });
      activityButtonsEl.appendChild(btn);
    }
  }

  function cancelRun() {
    runToken += 1;
    running = false;
    const mock = getMockActivity();
    if (mock?.isRunning?.()) mock.stop({ reason: "cancelRun" });
    setRunnerUi({ isRunning: false });
    setActivityStatus("idle");
  }

  function getMockActivity() {
    const mock = window.MockActivity;
    if (mock && typeof mock.start === "function" && typeof mock.stop === "function") return mock;
    return null;
  }

  function canonicalActivityId(activityId) {
    const rawId = String(activityId ?? "");
    const id = rawId.trim().toLowerCase();
    return id.startsWith("tts") ? "tts"
      : id.startsWith("letters") ? "letters"
        : id.startsWith("words") ? "words"
          : id.startsWith("story") ? "story"
            : id.startsWith("sounds") ? "sounds"
              : id;
  }

  function waitForDone(currentToken) {
    return new Promise((resolve) => {
      const doneBtn = $("done-activity-btn");
      if (!doneBtn) return resolve();

      const onDone = () => {
        const mock = getMockActivity();
        if (mock?.isRunning?.()) mock.stop({ reason: "doneClick" });
        doneBtn.removeEventListener("click", onDone);
        resolve();
      };

      doneBtn.addEventListener("click", onDone);

      // If cancelled/restarted, resolve silently and detach.
      const poll = () => {
        if (currentToken !== runToken) {
          doneBtn.removeEventListener("click", onDone);
          resolve();
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  const handlers = {
    async tts(ctx) {
      log("[words] Run activity tts", { id: ctx.item.id, word: ctx.item.word });
      setActivityStatus("running (tts)");
      return waitForDone(ctx.token);
    },
    async letters(ctx) {
      log("[words] Run activity letters", { id: ctx.item.id });
      setActivityStatus("running (letters)");
      return waitForDone(ctx.token);
    },
    async words(ctx) {
      log("[words] Run activity words", { id: ctx.item.id });
      setActivityStatus("running (words)");
      return waitForDone(ctx.token);
    },
    async story(ctx) {
      log("[words] Run activity story", { id: ctx.item.id });
      setActivityStatus("running (story)");
      return waitForDone(ctx.token);
    },
    async sounds(ctx) {
      log("[words] Run activity sounds", { id: ctx.item.id });
      setActivityStatus("running (sounds)");
      return waitForDone(ctx.token);
    },
    async default(ctx) {
      log("[words] Run activity (default)", { id: ctx.item.id, activityId: ctx.activity.id });
      setActivityStatus("running");
      return waitForDone(ctx.token);
    }
  };

  async function startSelectedActivity({ autoStarted = false } = {}) {
    const cur = getCurrentActivity();
    if (!cur) return;

    cancelRun();
    const token = runToken;

    const activityKey = canonicalActivityId(cur.activity.id);
    const handler = handlers[activityKey] || handlers.default;

    const mock = getMockActivity();
    if (mock && !autoStarted) {
      mock.start({
        recordId: cur.item?.id ?? null,
        activityId: cur.activity?.id ?? null,
        activityKey
      });
    }

    running = true;
    setRunnerUi({ isRunning: true });
    setActivityStatus(autoStarted ? "running (auto)" : "running");

    try {
      await handler({ ...cur, token });
    } finally {
      // If a new run started, ignore.
      if (token !== runToken) return;
      running = false;
      setRunnerUi({ isRunning: false });
      setActivityStatus("done");

      if (mock?.isRunning?.()) mock.stop({ reason: "finally" });

      const autoRun = $("auto-run");
      if (autoRun && autoRun.checked) {
        advanceToNextActivityOrWord({ autoStart: true });
      }
    }
  }

  function advanceToNextActivityOrWord({ autoStart = false } = {}) {
    if (!records.length) return;
    const item = records[currentIndex];
    const activities = getActivities(item);
    const nextIndex = currentActivityIndex + 1;

    if (nextIndex < activities.length) {
      setActiveActivity(nextIndex);
    } else {
      currentIndex = (currentIndex + 1) % records.length;
      currentActivityIndex = 0;
      render();
    }

    if (autoStart) startSelectedActivity({ autoStarted: true });
  }

  function render() {
    if (!records.length) {
      log("[words] render() called with no records");
      setStatus("geen records");
      const allEl = $("field-all");
      if (allEl) allEl.textContent = "–";
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

    const allEl = $("field-all");
    if (allEl) allEl.textContent = formatAllFields(item);

    const activities = getActivities(item);
    if (currentActivityIndex >= activities.length) currentActivityIndex = 0;
    renderActivity(item, activities);
    setRunnerUi({ isRunning: false });
    setActivityStatus("idle");

    setStatus(`geladen (${records.length})`);
  }

  // ------------------------------------------------------------
  // Navigation
  // ------------------------------------------------------------
  function next() {
    if (!records.length) return;
    cancelRun();
    currentIndex = (currentIndex + 1) % records.length;
    currentActivityIndex = 0;
    log("[words] Next pressed", { currentIndex });
    render();
  }

  function prev() {
    if (!records.length) return;
    cancelRun();
    currentIndex = (currentIndex - 1 + records.length) % records.length;
    currentActivityIndex = 0;
    log("[words] Prev pressed", { currentIndex });
    render();
  }

  function nextActivity() {
    if (!records.length) return;
    const item = records[currentIndex];
    const activities = getActivities(item);
    if (activities.length < 2) return;
    cancelRun();
    currentActivityIndex = (currentActivityIndex + 1) % activities.length;
    log("[words] Next activity", { currentActivityIndex });
    renderActivity(item, activities);
  }

  function prevActivity() {
    if (!records.length) return;
    const item = records[currentIndex];
    const activities = getActivities(item);
    if (activities.length < 2) return;
    cancelRun();
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
    const startActivityBtn = $("start-activity-btn");
    const doneActivityBtn = $("done-activity-btn");
    const toggleFieldsBtn = $("toggle-fields-btn");
    const fieldsPanel = $("fields-panel");

    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (nextActivityBtn) nextActivityBtn.addEventListener("click", nextActivity);
    if (prevActivityBtn) prevActivityBtn.addEventListener("click", prevActivity);
    if (startActivityBtn) startActivityBtn.addEventListener("click", () => startSelectedActivity({ autoStarted: false }));
    // doneActivityBtn is handled by waitForDone() per run.

    function setFieldsPanelVisible(visible) {
      if (!toggleFieldsBtn || !fieldsPanel) return;
      fieldsPanel.classList.toggle("hidden", !visible);
      toggleFieldsBtn.textContent = visible ? "Verberg velden" : "Velden";
      toggleFieldsBtn.setAttribute("aria-expanded", visible ? "true" : "false");
      if (visible) {
        try {
          fieldsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (err) {
          fieldsPanel.scrollIntoView();
        }
      }
      log("[words] Fields panel", { visible });
    }

    if (toggleFieldsBtn && fieldsPanel) {
      setFieldsPanelVisible(false);
      toggleFieldsBtn.addEventListener("click", () => {
        const isHidden = fieldsPanel.classList.contains("hidden");
        setFieldsPanelVisible(isHidden);
      });
    } else {
      log("[words] Fields toggle missing", {
        hasToggleButton: Boolean(toggleFieldsBtn),
        hasPanel: Boolean(fieldsPanel)
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") nextActivity();
      if (e.key === "ArrowLeft") prevActivity();
      if (e.key === "ArrowDown") next();
      if (e.key === "ArrowUp") prev();
      if (e.key === "Enter") startSelectedActivity({ autoStarted: false });
    });

    loadData();
  });
})();
