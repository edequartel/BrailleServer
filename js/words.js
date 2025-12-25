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
  // Chip button styling injection (NEW)
  // States:
  // - default (non-selected)
  // - .is-selected (selected activity)
  // - .is-active (selected AND currently running)
  // ------------------------------------------------------------
  function injectActivityChipStyles() {
    if (document.getElementById("words-activity-chip-styles")) return;

    const style = document.createElement("style");
    style.id = "words-activity-chip-styles";
    style.textContent = `
      /* Activity "chip" buttons: default / selected / active */

      #activity-buttons .chip {
        appearance: none;
        border: 1px solid rgba(0,0,0,.18);
        background: rgba(0,0,0,.04);
        color: inherit;
        border-radius: 999px;
        padding: 0.35rem 0.7rem;
        font: inherit;
        line-height: 1.1;
        cursor: pointer;
        user-select: none;
        transition: background-color .12s ease, border-color .12s ease, box-shadow .12s ease, transform .04s ease;
      }

      #activity-buttons .chip:hover {
        background: rgba(0,0,0,.06);
      }

      #activity-buttons .chip:active {
        transform: translateY(1px);
      }

      #activity-buttons .chip:focus-visible {
        outline: none;
        box-shadow: 0 0 0 3px rgba(79,107,237,.35);
      }

      /* SELECTED (but not running) */
      #activity-buttons .chip.is-selected {
        background: rgba(79,107,237,.16);
        border-color: rgba(79,107,237,.6);
        box-shadow: 0 0 0 2px rgba(79,107,237,.12) inset;
      }

      /* ACTIVE = selected AND currently running */
      #activity-buttons .chip.is-active {
        background: rgba(20,140,60,.18);
        border-color: rgba(20,140,60,.65);
        box-shadow: 0 0 0 2px rgba(20,140,60,.14) inset, 0 0 0 3px rgba(20,140,60,.18);
      }

      /* If both classes exist, active should win */
      #activity-buttons .chip.is-selected.is-active {
        background: rgba(20,140,60,.18);
        border-color: rgba(20,140,60,.65);
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------
  // Config
  // ------------------------------------------------------------
  const LOCAL_DATA_URL = "../config/words.json";
  const REMOTE_DATA_URL = "https://edequartel.github.io/BrailleServer/config/words.json";

  // ------------------------------------------------------------
  // State
  // ------------------------------------------------------------
  let records = [];
  let currentIndex = 0;
  let currentActivityIndex = 0;
  let runToken = 0;
  let running = false;
  let activeActivityModule = null;
  let activeActivityDonePromise = null;
  let brailleMonitor = null;
  let brailleLine = "";
  const BRAILLE_CELLS = 40;

  const BRAILLE_UNICODE_MAP = {
    a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑",
    f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚",
    k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕",
    p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞",
    u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵",
    "1": "⠼⠁", "2": "⠼⠃", "3": "⠼⠉", "4": "⠼⠙", "5": "⠼⠑",
    "6": "⠼⠋", "7": "⠼⠛", "8": "⠼⠓", "9": "⠼⠊", "0": "⠼⠚",
    " ": "⠀",
    ".": "⠲",
    ",": "⠂",
    ";": "⠆",
    ":": "⠒",
    "?": "⠦",
    "!": "⠖",
    "-": "⠤",
    "'": "⠄",
    "\"": "⠶",
    "(": "⠐⠣",
    ")": "⠐⠜",
    "/": "⠌"
  };

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

    // NEW: keep chip visual state in sync with running flag
    updateActivityButtonStates();
  }

  // ------------------------------------------------------------
  // Activity button state updater (NEW)
  // ------------------------------------------------------------
  function updateActivityButtonStates() {
    const wrap = $("activity-buttons");
    if (!wrap) return;

    const buttons = wrap.querySelectorAll("button.chip");
    for (const btn of buttons) {
      const i = Number(btn.dataset.index);
      const isSelected = Number.isFinite(i) && i === currentActivityIndex;
      const isActive = isSelected && Boolean(running);

      btn.classList.toggle("is-selected", isSelected);
      btn.classList.toggle("is-active", isActive);

      // Accessibility hints
      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if (isSelected) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    }
  }

  // ------------------------------------------------------------
  // Emoji/icon helpers
  // ------------------------------------------------------------
  function getEmojiForItem(item) {
    const direct = String(item?.emoji ?? "").trim();
    if (direct) return direct;

    const icon = String(item?.icon ?? "").trim().toLowerCase();
    const map = {
      "ball.icon": "⚽",
      "comb.icon": "💇",
      "monkey.icon": "🐒",
      "branch.icon": "🌿"
    };
    return map[icon] || "";
  }

  function toBrailleUnicode(text) {
    const raw = String(text ?? "");
    if (!raw) return "–";
    let out = "";
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (BRAILLE_UNICODE_MAP[ch]) {
        out += BRAILLE_UNICODE_MAP[ch];
        continue;
      }
      const lower = ch.toLowerCase();
      if (BRAILLE_UNICODE_MAP[lower]) {
        out += BRAILLE_UNICODE_MAP[lower];
        continue;
      }
      out += "⣿";
    }
    return out;
  }

  function compactSingleLine(text) {
    return String(text ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeBrailleText(text) {
    const single = compactSingleLine(text);
    if (!single) return "";
    return single.padEnd(BRAILLE_CELLS, " ").substring(0, BRAILLE_CELLS);
  }

  function updateBrailleLine(text, meta = {}) {
    const next = normalizeBrailleText(text);
    if (next === brailleLine) return;
    brailleLine = next;

    if (brailleMonitor && typeof brailleMonitor.setText === "function") {
      if (next) brailleMonitor.setText(next);
      else if (typeof brailleMonitor.clear === "function") brailleMonitor.clear();
      else brailleMonitor.setText("");
    }

    if (window.BrailleBridge) {
      if (!next && typeof BrailleBridge.clearDisplay === "function") {
        BrailleBridge.clearDisplay().catch((err) => {
          log("[words] BrailleBridge.clearDisplay failed", { message: err?.message });
        });
      } else if (typeof BrailleBridge.sendText === "function") {
        BrailleBridge.sendText(next).catch((err) => {
          log("[words] BrailleBridge.sendText failed", { message: err?.message });
        });
      }
    }

    log("[words] Braille line updated", { len: next.length, reason: meta.reason || "unspecified" });
  }

  function getBrailleTextForCurrent() {
    const item = records[currentIndex];
    if (!item) return "";

    const cur = getCurrentActivity();
    if (cur && cur.activity) {
      const { detail } = formatActivityDetail(cur.activity.id, item);
      const detailText = compactSingleLine(detail);
      if (detailText && detailText !== "–") return detailText;
    }

    return item.word != null ? String(item.word) : "";
  }

  function computeWordAt(text, index) {
    if (!text) return "";
    const len = text.length;
    if (index < 0 || index >= len) return "";
    let start = index;
    let end = index;
    while (start > 0 && text[start - 1] !== " ") start--;
    while (end < len - 1 && text[end + 1] !== " ") end++;
    return text.substring(start, end + 1).trim();
  }

  function dispatchCursorSelection(info, source) {
    const index = typeof info?.index === "number" ? info.index : null;
    const letter = info?.letter ?? (index != null ? brailleLine[index] || " " : " ");
    const word = info?.word ?? (index != null ? computeWordAt(brailleLine, index) : "");

    log("[words] Cursor selection", { source, index, letter, word });

    if (activeActivityModule && typeof activeActivityModule.onCursor === "function") {
      activeActivityModule.onCursor({ source, index, letter, word });
    }
  }

  function formatAllFields(item) {
    if (!item || typeof item !== "object") return "–";

    const activities = Array.isArray(item.activities) ? item.activities : [];
    const activityLines = activities
      .filter(a => a && typeof a === "object")
      .map(a => {
        const id = String(a.id ?? "").trim();
        const caption = String(a.caption ?? "").trim();
        const instruction = String(a.instruction ?? "").trim();
        if (!id && !caption) return null;
        if (caption && instruction) return `${id} -- ${caption} -- ${instruction}`;
        if (caption) return `${id} -- ${caption}`;
        if (instruction) return `${id} -- ${instruction}`;
        return id;
      })
      .filter(Boolean);

    const lines = [
      `id: ${item.id ?? "–"}`,
      `word: ${item.word ?? "–"}`,
      `icon: ${item.icon ?? "–"}`,
      `emoji: ${item.emoji ?? "–"}`,
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
        .map(a => ({
          id: String(a.id ?? "").trim(),
          caption: String(a.caption ?? "").trim(),
          instruction: String(a.instruction ?? "").trim(),
          index: a.index
        }))
        .filter(a => a.id);
    }

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
        return { caption: "Luister (woord)", detail: item.word ? String(item.word) : "–" };
      case "letters":
        return { caption: "Oefen letters", detail: Array.isArray(item.letters) && item.letters.length ? item.letters.join(" ") : "–" };
      case "words":
        return { caption: "Maak woorden", detail: Array.isArray(item.words) && item.words.length ? item.words.join(", ") : "–" };
      case "story":
        return { caption: "Luister (verhaal)", detail: Array.isArray(item.story) && item.story.length ? item.story.join("\n") : "–" };
      case "sounds":
        return { caption: "Geluiden", detail: Array.isArray(item.sounds) && item.sounds.length ? item.sounds.join("\n") : "–" };
      default:
        return { caption: rawId ? `Activity: ${rawId}` : "Details", detail: safeJson(item) };
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
    updateActivityButtonStates(); // NEW
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
    const activityButtonsEl = $("activity-buttons");
    const activityCaptionEl = document.getElementById("activity-caption");
    const activityDetailEl = document.getElementById("activity-detail");
    const activityInstructionEl = document.getElementById("activity-instruction");
    const activityInstructionLabelEl = document.getElementById("activity-instruction-label");
    const prevActivityBtn = $("prev-activity-btn");
    const nextActivityBtn = $("next-activity-btn");

    if (!activityIndexEl || !activityIdEl || !activityButtonsEl) {
      log("[words] Missing activity DOM elements; cannot render activity.");
      return;
    }

    if (!activities.length) {
      activityIndexEl.textContent = "0 / 0";
      activityIdEl.textContent = "Activity: –";
      if (activityCaptionEl) activityCaptionEl.textContent = "Details";
      if (activityDetailEl) activityDetailEl.textContent = "–";
      if (activityInstructionEl) activityInstructionEl.textContent = "–";
      if (activityInstructionEl) activityInstructionEl.style.display = "";
      if (activityInstructionLabelEl) activityInstructionLabelEl.style.display = "";
      activityButtonsEl.innerHTML = "";
      if (prevActivityBtn) prevActivityBtn.disabled = true;
      if (nextActivityBtn) nextActivityBtn.disabled = true;
      updateBrailleLine(getBrailleTextForCurrent(), { reason: "activity-empty" });
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

    activityIdEl.textContent = canonical && canonical !== id
      ? `Activity: ${rawId} (${canonical})`
      : `Activity: ${rawId}`;

    const { caption, detail } = formatActivityDetail(active.id, item);
    const instruction = String(active.instruction ?? "").trim();

    if (activityCaptionEl) activityCaptionEl.textContent = active.caption || caption || "Details";
    if (activityDetailEl) activityDetailEl.textContent = detail ?? "–";
    if (activityInstructionEl) activityInstructionEl.textContent = instruction || "–";
    if (activityInstructionEl) activityInstructionEl.style.display = "";
    if (activityInstructionLabelEl) activityInstructionLabelEl.style.display = "";

    activityButtonsEl.innerHTML = "";
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.index = String(i); // NEW
      btn.textContent = a.caption || a.id;
      btn.title = a.id;

      btn.addEventListener("click", () => {
        log("[words] Activity selected", { id: a.id, index: i });
        cancelRun();
        setActiveActivity(i);
      });

      activityButtonsEl.appendChild(btn);
    }

    // NEW: after buttons exist, apply selected/active classes
    updateActivityButtonStates();

    updateBrailleLine(getBrailleTextForCurrent(), { reason: "activity-change" });
  }

  function cancelRun() {
    runToken += 1;
    running = false;
    stopActiveActivity({ reason: "cancelRun" });
    setRunnerUi({ isRunning: false });
    setActivityStatus("idle");
    updateActivityButtonStates(); // NEW
  }

  function getActivityModule(activityKey) {
    const acts = window.Activities;
    if (!acts || typeof acts !== "object") return null;
    const mod = acts[activityKey];
    if (!mod || typeof mod !== "object") return null;
    if (typeof mod.start !== "function" || typeof mod.stop !== "function") return null;
    return mod;
  }

  function stopActiveActivity(payload) {
    try {
      if (activeActivityModule && typeof activeActivityModule.stop === "function") {
        activeActivityModule.stop(payload);
      }
    } finally {
      activeActivityModule = null;
      activeActivityDonePromise = null;
    }
  }

  function waitForDoneOrActivityEnd(currentToken) {
    return new Promise((resolve) => {
      const doneBtn = $("done-activity-btn");
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (doneBtn) doneBtn.removeEventListener("click", onDone);
        resolve();
      };

      const onDone = () => {
        stopActiveActivity({ reason: "doneClick" });
        finish();
      };

      if (doneBtn) doneBtn.addEventListener("click", onDone);

      const p = activeActivityDonePromise;
      if (p && typeof p.then === "function") {
        p.then(() => {
          stopActiveActivity({ reason: "activityDone" });
          finish();
        }).catch(() => {
          stopActiveActivity({ reason: "activityError" });
          finish();
        });
      }

      const poll = () => {
        if (currentToken !== runToken) {
          finish();
          return;
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
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
        stopActiveActivity({ reason: "doneClick" });
        doneBtn.removeEventListener("click", onDone);
        resolve();
      };

      doneBtn.addEventListener("click", onDone);

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
      return waitForDoneOrActivityEnd(ctx.token);
    },
    async words(ctx) {
      log("[words] Run activity words", { id: ctx.item.id });
      setActivityStatus("running (words)");
      return waitForDone(ctx.token);
    },
    async story(ctx) {
      log("[words] Run activity story", { id: ctx.item.id });
      setActivityStatus("running (story)");
      return waitForDoneOrActivityEnd(ctx.token);
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

    const activityModule = getActivityModule(activityKey);
    if (activityModule) {
      activeActivityModule = activityModule;
      const maybePromise = activityModule.start({
        activityKey,
        activityId: cur.activity?.id ?? null,
        activityCaption: cur.activity?.caption ?? null,
        activity: cur.activity ?? null,
        record: cur.item ?? null,
        recordIndex: currentIndex,
        activityIndex: currentActivityIndex,
        autoStarted: Boolean(autoStarted)
      });
      activeActivityDonePromise = (maybePromise && typeof maybePromise.then === "function") ? maybePromise : null;
    } else {
      activeActivityModule = null;
      activeActivityDonePromise = null;
      log("[words] No activity module found", { activityKey });
    }

    running = true;
    setRunnerUi({ isRunning: true });
    setActivityStatus(autoStarted ? "running (auto)" : "running");
    updateActivityButtonStates(); // NEW: show "active" color on selected button

    try {
      await handler({ ...cur, token });
    } finally {
      if (token !== runToken) return;

      running = false;
      setRunnerUi({ isRunning: false });
      setActivityStatus("done");

      stopActiveActivity({ reason: "finally" });

      updateActivityButtonStates(); // NEW: remove "active" color

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
    const emojiEl = $("field-emoji");

    if (!idEl || !indexEl || !wordEl) {
      log("[words] Critical DOM elements missing; cannot render.");
      setStatus("HTML mist ids");
      return;
    }

    idEl.textContent = "ID: " + (item.id ?? "–");
    indexEl.textContent = `${currentIndex + 1} / ${records.length}`;

    wordEl.textContent = item.word || "–";

    if (emojiEl) {
      const em = getEmojiForItem(item);
      emojiEl.textContent = em || " ";
      emojiEl.style.display = em ? "" : "none";
      emojiEl.setAttribute("aria-label", em ? `Emoji: ${em}` : "Geen emoji");
    }

    const wordBrailleEl = $("field-word-braille");
    if (wordBrailleEl) {
      wordBrailleEl.textContent = toBrailleUnicode(item.word || "");
    }

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
    const params = new URLSearchParams(window.location.search || "");
    const overrideUrl = params.get("data");
    const preferred = overrideUrl ? overrideUrl : REMOTE_DATA_URL;
    const resolvedUrl = new URL(preferred, window.location.href).toString();
    log("[words] Loading JSON", { url: resolvedUrl, source: preferred });
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

      records = json;
      currentIndex = 0;
      currentActivityIndex = 0;

      log("[words] JSON parsed", { count: records.length, firstId: records[0]?.id });
      setStatus(`geladen (${records.length})`);

      render();
    } catch (err) {
      log("[words] ERROR loading JSON", { message: err.message });

      if (!overrideUrl && preferred === REMOTE_DATA_URL) {
        const fallbackUrl = new URL(LOCAL_DATA_URL, window.location.href).toString();
        log("[words] Fallback to local JSON", { url: fallbackUrl });
        setStatus("online mislukt, probeer lokaal...");
        try {
          const res = await fetch(fallbackUrl, { cache: "no-store" });
          log("[words] Fallback response", { status: res.status, ok: res.ok });
          if (!res.ok) {
            setStatus(`fout HTTP ${res.status}`);
            throw new Error(`HTTP ${res.status}`);
          }
          const json = await res.json();
          if (!Array.isArray(json)) {
            setStatus("fout: geen array");
            throw new Error("words.json is not an array");
          }
          records = json;
          currentIndex = 0;
          currentActivityIndex = 0;
          log("[words] JSON parsed (remote)", { count: records.length, firstId: records[0]?.id });
          setStatus(`geladen (${records.length})`);
          render();
          return;
        } catch (fallbackErr) {
          log("[words] ERROR loading remote JSON", { message: fallbackErr.message });
        }
      }

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

    // NEW: ensure chip colors exist (even if your CSS doesn't define them yet)
    injectActivityChipStyles();

    const nextBtn = $("next-btn");
    const prevBtn = $("prev-btn");
    const nextActivityBtn = $("next-activity-btn");
    const prevActivityBtn = $("prev-activity-btn");
    const startActivityBtn = $("start-activity-btn");
    const toggleFieldsBtn = $("toggle-fields-btn");
    const fieldsPanel = $("fields-panel");

    if (window.BrailleBridge && typeof BrailleBridge.connect === "function") {
      BrailleBridge.connect();
      BrailleBridge.on("cursor", (evt) => {
        if (typeof evt?.index !== "number") return;
        dispatchCursorSelection({ index: evt.index }, "bridge");
      });
      BrailleBridge.on("connected", () => log("[words] BrailleBridge connected"));
      BrailleBridge.on("disconnected", () => log("[words] BrailleBridge disconnected"));
    } else {
      log("[words] BrailleBridge not available");
    }

    if (window.BrailleMonitor && typeof BrailleMonitor.init === "function") {
      brailleMonitor = BrailleMonitor.init({
        containerId: "brailleMonitorComponent",
        onCursorClick(info) {
          dispatchCursorSelection(info, "monitor");
        },
        mapping: {
          leftthumb: () => prev(),
          rightthumb: () => next(),
          middleleftthumb: () => prevActivity(),
          middlerightthumb: () => nextActivity()
        }
      });
    } else {
      log("[words] BrailleMonitor component not available");
    }

    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (nextActivityBtn) nextActivityBtn.addEventListener("click", nextActivity);
    if (prevActivityBtn) prevActivityBtn.addEventListener("click", prevActivity);
    if (startActivityBtn) startActivityBtn.addEventListener("click", () => startSelectedActivity({ autoStarted: false }));

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