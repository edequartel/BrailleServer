// /js/words.js
(function () {
  "use strict";

  function log(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") window.logMessage(line);
    else console.log(line);
  }

  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  log("[words] words.js loaded");

  const LOCAL_DATA_URL = "../config/words.json";
  const REMOTE_DATA_URL = "https://edequartel.github.io/BrailleServer/config/words.json";

  let records = [];
  let currentIndex = 0;
  let currentActivityIndex = 0;

  let runner = null;
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

  function updateActivityButtonStates() {
    const wrap = $("activity-buttons");
    if (!wrap) return;

    const isRunning = runner ? runner.isRunning() : false;
    const buttons = wrap.querySelectorAll("button.chip");
    for (const btn of buttons) {
      const i = Number(btn.dataset.index);
      const isSelected = Number.isFinite(i) && i === currentActivityIndex;
      const isActive = isSelected && Boolean(isRunning);

      btn.classList.toggle("is-selected", isSelected);
      btn.classList.toggle("is-active", isActive);

      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if (isSelected) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    }
  }

  function setRunnerUi({ isRunning }) {
    const runBtn = $("run-activity-btn");
    const autoRun = $("auto-run");

    if (runBtn) {
      runBtn.textContent = isRunning ? "Stop" : "Start";
      runBtn.setAttribute("aria-pressed", isRunning ? "true" : "false");
      runBtn.classList.toggle("danger", Boolean(isRunning));
    }

    if (autoRun) autoRun.disabled = Boolean(isRunning);

    updateActivityButtonStates();
  }

  function getEmojiForItem(item) {
    const direct = String(item?.emoji ?? "").trim();
    if (direct) return direct;

    const icon = String(item?.icon ?? "").trim().toLowerCase();
    const map = { "ball.icon": "⚽", "comb.icon": "💇", "monkey.icon": "🐒", "branch.icon": "🌿" };
    return map[icon] || "";
  }

  function toBrailleUnicode(text) {
    const raw = String(text ?? "");
    if (!raw) return "–";
    let out = "";
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (BRAILLE_UNICODE_MAP[ch]) { out += BRAILLE_UNICODE_MAP[ch]; continue; }
      const lower = ch.toLowerCase();
      if (BRAILLE_UNICODE_MAP[lower]) { out += BRAILLE_UNICODE_MAP[lower]; continue; }
      out += "⣿";
    }
    return out;
  }

  function compactSingleLine(text) {
    return String(text ?? "").replace(/\s+/g, " ").trim();
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
        BrailleBridge.clearDisplay().catch((err) => log("[words] BrailleBridge.clearDisplay failed", { message: err?.message }));
      } else if (typeof BrailleBridge.sendText === "function") {
        BrailleBridge.sendText(next).catch((err) => log("[words] BrailleBridge.sendText failed", { message: err?.message }));
      }
    }

    log("[words] Braille line updated", { len: next.length, reason: meta.reason || "unspecified" });
  }

  function computeWordAt(text, index) {
    if (!text) return "";
    const len = text.length;
    if (index < 0 || index >= len) return "";
    let start = index, end = index;
    while (start > 0 && text[start - 1] !== " ") start--;
    while (end < len - 1 && text[end + 1] !== " ") end++;
    return text.substring(start, end + 1).trim();
  }

  function dispatchCursorSelection(info, source) {
    const index = typeof info?.index === "number" ? info.index : null;
    const letter = info?.letter ?? (index != null ? brailleLine[index] || " " : " ");
    const word = info?.word ?? (index != null ? computeWordAt(brailleLine, index) : "");

    log("[words] Cursor selection", { source, index, letter, word });

    const mod = runner ? runner.getActiveModule() : null;
    if (mod && typeof mod.onCursor === "function") {
      mod.onCursor({ source, index, letter, word });
    }
  }

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

  function getCurrentActivity() {
    const item = records[currentIndex];
    if (!item) return null;
    const activities = getActivities(item);
    if (!activities.length) return null;
    const active = activities[currentActivityIndex] ?? activities[0];
    if (!active) return null;
    return { item, activities, activity: active };
  }

  function getBrailleTextForCurrent() {
    const item = records[currentIndex];
    if (!item) return "";
    const cur = getCurrentActivity();
    if (cur && cur.activity) {
      // simplest: show instruction/detail
      const instruction = String(cur.activity.instruction ?? "").trim();
      if (instruction) return instruction;
    }
    return item.word != null ? String(item.word) : "";
  }

  function setActiveActivity(index) {
    const item = records[currentIndex];
    if (!item) return;
    const activities = getActivities(item);
    if (!activities.length) { currentActivityIndex = 0; return; }
    currentActivityIndex = Math.max(0, Math.min(index, activities.length - 1));
    renderActivity(item, activities);
    updateActivityButtonStates();
    updateBrailleLine(getBrailleTextForCurrent(), { reason: "activity-change" });
  }

  function renderActivity(item, activities) {
    const activityIndexEl = $("activity-index");
    const activityIdEl = $("activity-id");
    const activityButtonsEl = $("activity-buttons");
    const activityInstructionEl = $("activity-instruction");

    if (!activityIndexEl || !activityIdEl || !activityButtonsEl) return;

    if (!activities.length) {
      activityIndexEl.textContent = "0 / 0";
      activityIdEl.textContent = "Activity: –";
      if (activityInstructionEl) activityInstructionEl.textContent = "–";
      activityButtonsEl.innerHTML = "";
      updateBrailleLine(getBrailleTextForCurrent(), { reason: "activity-empty" });
      return;
    }

    const active = activities[currentActivityIndex] ?? activities[0];
    if (!active) return;

    activityIndexEl.textContent = `${currentActivityIndex + 1} / ${activities.length}`;
    activityIdEl.textContent = `Activity: ${String(active.id ?? "–")}`;

    const instruction = String(active.instruction ?? "").trim();
    if (activityInstructionEl) activityInstructionEl.textContent = instruction || "–";

    activityButtonsEl.innerHTML = "";
    for (let i = 0; i < activities.length; i++) {
      const a = activities[i];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip";
      btn.dataset.index = String(i);
      btn.textContent = a.caption || a.id;
      btn.title = a.id;

      btn.addEventListener("click", () => {
        if (runner) runner.stop("activityChange");
        setActiveActivity(i);
      });

      activityButtonsEl.appendChild(btn);
    }

    updateActivityButtonStates();
  }

  function getActivityModule(activityKey) {
    const acts = window.Activities;
    if (!acts || typeof acts !== "object") return null;
    const mod = acts[activityKey];
    if (!mod || typeof mod !== "object") return null;
    if (typeof mod.start !== "function" || typeof mod.stop !== "function") return null;
    return mod;
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

    if (autoStart && runner) runner.start({ autoStarted: true });
  }

  function next() {
    if (!records.length) return;
    if (runner) runner.stop("wordNext");
    currentIndex = (currentIndex + 1) % records.length;
    currentActivityIndex = 0;
    render();
  }

  function prev() {
    if (!records.length) return;
    if (runner) runner.stop("wordPrev");
    currentIndex = (currentIndex - 1 + records.length) % records.length;
    currentActivityIndex = 0;
    render();
  }

  async function loadData() {
    const params = new URLSearchParams(window.location.search || "");
    const overrideUrl = params.get("data");
    const preferred = overrideUrl ? overrideUrl : REMOTE_DATA_URL;
    const resolvedUrl = new URL(preferred, window.location.href).toString();
    setStatus("laden...");

    try {
      const res = await fetch(resolvedUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json)) throw new Error("words.json is not an array");

      records = json;
      currentIndex = 0;
      currentActivityIndex = 0;
      render();
    } catch (err) {
      log("[words] ERROR loading JSON", { message: err.message });

      if (!overrideUrl && preferred === REMOTE_DATA_URL) {
        const fallbackUrl = new URL(LOCAL_DATA_URL, window.location.href).toString();
        setStatus("online mislukt, probeer lokaal...");
        try {
          const res = await fetch(fallbackUrl, { cache: "no-store" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          if (!Array.isArray(json)) throw new Error("words.json is not an array");
          records = json;
          currentIndex = 0;
          currentActivityIndex = 0;
          render();
          return;
        } catch (fallbackErr) {
          log("[words] ERROR loading local JSON", { message: fallbackErr.message });
        }
      }

      if (location.protocol === "file:") setStatus("laden mislukt: open via http:// (file:// blokkeert fetch)");
      else setStatus("laden mislukt (zie log/console)");
    }
  }

  function render() {
    if (!records.length) {
      setStatus("geen records");
      return;
    }

    const item = records[currentIndex];

    const idEl = $("item-id");
    const indexEl = $("item-index");
    const wordEl = $("field-word");
    const emojiEl = $("field-emoji");

    if (!idEl || !indexEl || !wordEl) {
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
    }

    const wordBrailleEl = $("field-word-braille");
    if (wordBrailleEl) wordBrailleEl.textContent = toBrailleUnicode(item.word || "");

    const activities = getActivities(item);
    if (currentActivityIndex >= activities.length) currentActivityIndex = 0;
    renderActivity(item, activities);

    const isRunning = runner ? runner.isRunning() : false;
    setRunnerUi({ isRunning });
    setActivityStatus(isRunning ? "running" : "idle");
    setStatus(`geladen (${records.length})`);

    updateBrailleLine(getBrailleTextForCurrent(), { reason: "render" });
  }

  document.addEventListener("DOMContentLoaded", () => {
    log("[words] DOMContentLoaded");

    const prevBtn = $("prev-btn");
    const nextBtn = $("next-btn");
    const runBtn = $("run-activity-btn");

    if (window.BrailleBridge && typeof BrailleBridge.connect === "function") {
      BrailleBridge.connect();
      BrailleBridge.on("cursor", (evt) => {
        if (typeof evt?.index !== "number") return;
        dispatchCursorSelection({ index: evt.index }, "bridge");
      });
    }

    if (window.BrailleMonitor && typeof BrailleMonitor.init === "function") {
      brailleMonitor = BrailleMonitor.init({
        containerId: "brailleMonitorComponent",
        onCursorClick(info) { dispatchCursorSelection(info, "monitor"); },

        // Thumb keys ONLY start the selected activity
        mapping: {
          leftthumb: () => runner && runner.start({ autoStarted: false }),
          rightthumb: () => runner && runner.start({ autoStarted: false }),
          middleleftthumb: () => runner && runner.start({ autoStarted: false }),
          middlerightthumb: () => runner && runner.start({ autoStarted: false })
        }
      });
    }

    runner = window.ActivityRunner.create({
      log,
      getActivityModule,
      canonicalActivityId,

      getCurrentContext() {
        const cur = getCurrentActivity();
        if (!cur) return null;
        return { ...cur, recordIndex: currentIndex, activityIndex: currentActivityIndex };
      },

      onRunningChange(isRunning) {
        setRunnerUi({ isRunning });
      },

      onStatus(text) {
        setActivityStatus(text);
      },

      isAutoRunEnabled() {
        const el = $("auto-run");
        return Boolean(el && el.checked);
      },

      onAutoAdvance() {
        advanceToNextActivityOrWord({ autoStart: true });
      }
    });

    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (nextBtn) nextBtn.addEventListener("click", next);

    // SINGLE TOGGLE BUTTON
    if (runBtn) {
      runBtn.addEventListener("click", () => {
        if (!runner) return;
        if (runner.isRunning()) runner.stop("runToggleStop");
        else runner.start({ autoStarted: false });
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") next();
      if (e.key === "ArrowUp") prev();
      if (e.key === "Enter") runner && runner.start({ autoStarted: false });
      if (e.key === "Escape") runner && runner.stop("escape");
    });

    loadData();
  });
})();