// /js/words.js
(function () {
  "use strict";

  // ------------------------------------------------------------
  // Logging helper
  // ------------------------------------------------------------
  function log(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") window.logMessage(line);
    else console.log(line);
  }

  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  log("[words] words.js loaded");

  // ------------------------------------------------------------
  // Activity lifecycle audio (GitHub Pages + iOS unlock)
  // ------------------------------------------------------------

  function getBasePath() {
    try {
      const host = String(location.hostname || "");
      const path = String(location.pathname || "/");
      const seg = path.split("/").filter(Boolean);
      if (host.endsWith("github.io") && seg.length > 0) {
        // first segment is repo name
        return "/" + seg[0];
      }
      return "";
    } catch {
      return "";
    }
  }

  const BASE_PATH = getBasePath();

  function lifecycleUrl(file) {
    return `${location.origin}${BASE_PATH}/audio/${file}`;
  }

  let audioUnlocked = false;

  function unlockAudioOnce() {
    if (audioUnlocked) return;

    try {
      // Howler unlock/resume
      if (window.Howler && window.Howler.ctx && window.Howler.ctx.state === "suspended") {
        window.Howler.ctx.resume().catch(() => {});
      }

      // HTML5 warm-up (must be after a gesture on iOS)
      const a = new Audio(lifecycleUrl("started.mp3"));
      a.muted = true;
      a.preload = "auto";
      const p = a.play();
      if (p && typeof p.then === "function") {
        p.then(() => { try { a.pause(); } catch {} }).catch(() => {});
      }
    } catch {}

    audioUnlocked = true;
    log("[lifecycle] audio unlocked");
  }

  function installAudioUnlock() {
    const once = () => {
      unlockAudioOnce();
      document.removeEventListener("pointerdown", once, true);
      document.removeEventListener("touchstart", once, true);
      document.removeEventListener("keydown", once, true);
    };
    document.addEventListener("pointerdown", once, true);
    document.addEventListener("touchstart", once, true);
    document.addEventListener("keydown", once, true);
  }

  function playLifecycleFile(file) {
    const url = lifecycleUrl(file);

    return new Promise((resolve) => {
      let done = false;
      let watchdog = null;

      function finish(reason) {
        if (done) return;
        done = true;
        if (watchdog) {
          try { clearTimeout(watchdog); } catch {}
          watchdog = null;
        }
        log("[lifecycle] done", { file, url, reason });
        resolve();
      }

      try {
        log("[lifecycle] play", { file, url, howler: Boolean(window.Howl), unlocked: audioUnlocked });

        // Safety watchdog so auto-run never hangs waiting for "ended"
        watchdog = setTimeout(() => finish("watchdog"), 8000);

        if (window.Howl) {
          const h = new Howl({
            src: [url],
            preload: true,
            volume: 1.0,
            onloaderror: (id, err) => { log("[lifecycle] howl load error", { file, url, err }); finish("loaderror"); },
            onplayerror: (id, err) => { log("[lifecycle] howl play error", { file, url, err }); finish("playerror"); },
            onend: () => finish("ended")
          });

          h.play();
        } else {
          const a = new Audio(url);
          a.preload = "auto";

          a.addEventListener("ended", () => finish("ended"), { once: true });
          a.addEventListener("error", () => finish("error"), { once: true });

          const p = a.play();
          if (p && typeof p.catch === "function") {
            p.catch((e) => {
              log("[lifecycle] html5 play blocked", { file, url, error: String(e) });
              finish("blocked");
            });
          }
        }
      } catch (e) {
        log("[lifecycle] exception", { file, url, error: String(e) });
        finish("exception");
      }
    });
  }

  async function playStarted() { await playLifecycleFile("started.mp3"); }
  async function playStopped() { await playLifecycleFile("stopped.mp3"); }

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

  let stoppedPlayedForThisRun = false;

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

  function $opt(id) {
    return document.getElementById(id);
  }

  function setStatus(text) {
    const el = $("data-status");
    if (el) el.textContent = "Data: " + text;
  }

  function setActivityStatus(text) {
    const el = $("activity-status");
    if (el) el.textContent = "Status: " + text;
  }

  // ------------------------------------------------------------
  // Activity button state styling hooks
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

      btn.setAttribute("aria-pressed", isSelected ? "true" : "false");
      if (isSelected) btn.setAttribute("aria-current", "true");
      else btn.removeAttribute("aria-current");
    }
  }

  // ------------------------------------------------------------
  // SINGLE toggle run button UI (optional)
  // ------------------------------------------------------------
  function setRunnerUi({ isRunning }) {
    const runBtn = $opt("run-activity-btn"); // optional
    const autoRun = $opt("auto-run");

    if (autoRun) autoRun.disabled = Boolean(isRunning);

    if (runBtn) {
      runBtn.textContent = isRunning ? "Stop" : "Start";
      runBtn.setAttribute("aria-pressed", isRunning ? "true" : "false");
      runBtn.classList.toggle("is-running", Boolean(isRunning));
    }

    updateActivityButtonStates();
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

  function getIdleBrailleText() {
    const item = records[currentIndex];
    return item && item.word != null ? String(item.word) : "";
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
      `knownLetters: ${Array.isArray(item.knownLetters) ? item.knownLetters.join(" ") : "–"}`,
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

  function getActivities(item) {
    if (Array.isArray(item.activities) && item.activities.length) {
      return item.activities
        .filter(a => a && typeof a === "object")
        .map(a => ({
          id: String(a.id ?? "").trim(),
          caption: String(a.caption ?? "").trim(),
          instruction: String(a.instruction ?? "").trim(),
          index: a.index,
          nrof: a.nrof,
          lineLen: a.lineLen
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
    updateActivityButtonStates();
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
    const activityInstructionEl = document.getElementById("activity-instruction");

    if (!activityIndexEl || !activityIdEl || !activityButtonsEl) {
      log("[words] Missing activity DOM elements; cannot render activity.");
      return;
    }

    if (!activities.length) {
      activityIndexEl.textContent = "0 / 0";
      activityIdEl.textContent = "Activity: –";
      if (activityInstructionEl) activityInstructionEl.textContent = "–";
      activityButtonsEl.innerHTML = "";
      if (!running) updateBrailleLine(getIdleBrailleText(), { reason: "activity-empty-idle" });
      return;
    }

    const active = activities[currentActivityIndex] ?? activities[0];
    if (!active) return;

    activityIndexEl.textContent = `${currentActivityIndex + 1} / ${activities.length}`;
    activityIdEl.textContent = `Activity: ${String(active.id ?? "–")}`;

    const instruction = String(active.instruction ?? "").trim();
    if (activityInstructionEl) activityInstructionEl.textContent = instruction || active.caption || "–";

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
        cancelRun("stop");
        setActiveActivity(i);
      });

      activityButtonsEl.appendChild(btn);
    }

    updateActivityButtonStates();

    if (!running) updateBrailleLine(getIdleBrailleText(), { reason: "activity-change-idle" });
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

  function cancelRun(reason = "stop") {
    if (reason !== "restart" && running && !stoppedPlayedForThisRun) {
      stoppedPlayedForThisRun = true;
      playStopped(); // do not await on manual stop
    }

    runToken += 1;
    running = false;
    stopActiveActivity({ reason });
    setRunnerUi({ isRunning: false });
    setActivityStatus("idle");
    updateBrailleLine(getIdleBrailleText(), { reason: "cancelRun-idle" });
  }

  function waitForStopOrDone(currentToken) {
    return new Promise((resolve) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const p = activeActivityDonePromise;
      if (p && typeof p.then === "function") {
        p.then(finish).catch(finish);
      }

      const poll = () => {
        if (currentToken !== runToken) return finish();
        if (!running) return finish();
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
  }

  async function startSelectedActivity({ autoStarted = false } = {}) {
    const cur = getCurrentActivity();
    if (!cur) return;

    cancelRun("restart");
    const token = runToken;

    stoppedPlayedForThisRun = false;

    await playStarted();

    const activityKey = canonicalActivityId(cur.activity.id);
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

      activeActivityDonePromise =
        (maybePromise && typeof maybePromise.then === "function") ? maybePromise : null;
    } else {
      activeActivityModule = null;
      activeActivityDonePromise = null;
      log("[words] No activity module found", { activityKey });
    }

    running = true;
    setRunnerUi({ isRunning: true });
    setActivityStatus(autoStarted ? "running (auto)" : "running");

    try {
      await waitForStopOrDone(token);
    } finally {
      if (token !== runToken) return;

      if (!stoppedPlayedForThisRun) {
        stoppedPlayedForThisRun = true;
        await playStopped(); // IMPORTANT: wait so it won't overlap the next started cue
      }

      running = false;
      setRunnerUi({ isRunning: false });
      setActivityStatus("done");

      stopActiveActivity({ reason: "finally" });

      updateBrailleLine(getIdleBrailleText(), { reason: "activity-done-idle" });

      const autoRun = $opt("auto-run");
      if (autoRun && autoRun.checked) {
        advanceToNextActivityOrWord({ autoStart: true });
      }
    }
  }

  function toggleRun() {
    if (running) cancelRun("stop");
    else startSelectedActivity({ autoStarted: false });
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

  function next() {
    if (!records.length) return;
    cancelRun("stop");
    currentIndex = (currentIndex + 1) % records.length;
    currentActivityIndex = 0;
    render();
  }

  function prev() {
    if (!records.length) return;
    cancelRun("stop");
    currentIndex = (currentIndex - 1 + records.length) % records.length;
    currentActivityIndex = 0;
    render();
  }

  function rightThumbAction() {
    const cur = getCurrentActivity();
    const key = canonicalActivityId(cur?.activity?.id);

    if (running && activeActivityModule && typeof activeActivityModule.onRightThumb === "function") {
      activeActivityModule.onRightThumb();
      return;
    }

    if (running && key === "story" && activeActivityModule && typeof activeActivityModule.togglePlayPause === "function") {
      activeActivityModule.togglePlayPause("RightThumb");
      return;
    }

    if (!running) startSelectedActivity({ autoStarted: false });
  }

  function leftThumbAction() {
    if (running && activeActivityModule && typeof activeActivityModule.onLeftThumb === "function") {
      activeActivityModule.onLeftThumb();
      return;
    }
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
      log("[words] ERROR loading JSON", { message: err?.message || String(err) });

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
          log("[words] ERROR loading local JSON", { message: fallbackErr?.message || String(fallbackErr) });
        }
      }

      if (location.protocol === "file:") setStatus("laden mislukt: open via http:// (file:// blokkeert fetch)");
      else setStatus("laden mislukt (zie log/console)");
    }
  }

  function render() {
    if (!records.length) {
      setStatus("geen records");
      const allEl = $("field-all");
      if (allEl) allEl.textContent = "–";
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

    const allEl = $("field-all");
    if (allEl) allEl.textContent = formatAllFields(item);

    const activities = getActivities(item);
    if (currentActivityIndex >= activities.length) currentActivityIndex = 0;
    renderActivity(item, activities);

    setRunnerUi({ isRunning: false });
    setActivityStatus("idle");
    setStatus(`geladen (${records.length})`);

    if (!running) updateBrailleLine(getIdleBrailleText(), { reason: "render-idle" });
  }

  window.BrailleUI = window.BrailleUI || {};
  window.BrailleUI.setLine = function (text, meta) {
    updateBrailleLine(String(text ?? ""), meta || { reason: "activity" });
  };
  window.BrailleUI.clear = function (meta) {
    updateBrailleLine("", meta || { reason: "activity-clear" });
  };

  document.addEventListener("DOMContentLoaded", () => {
    log("[words] DOMContentLoaded");
    log("[lifecycle] basePath", { BASE_PATH, origin: location.origin });

    installAudioUnlock();

    const nextBtn = $("next-btn");
    const prevBtn = $("prev-btn");
    const runBtn = $opt("run-activity-btn"); // optional
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
    }

    if (window.BrailleMonitor && typeof BrailleMonitor.init === "function") {
      brailleMonitor = BrailleMonitor.init({
        containerId: "brailleMonitorComponent",
        onCursorClick(info) { dispatchCursorSelection(info, "monitor"); },
        mapping: {
          leftthumb: () => leftThumbAction(),
          rightthumb: () => rightThumbAction(),
          middleleftthumb: () => {},
          middlerightthumb: () => {}
        }
      });
    }

    if (nextBtn) nextBtn.addEventListener("click", next);
    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (runBtn) runBtn.addEventListener("click", toggleRun);

    function setFieldsPanelVisible(visible) {
      if (!toggleFieldsBtn || !fieldsPanel) return;
      fieldsPanel.classList.toggle("hidden", !visible);
      toggleFieldsBtn.textContent = visible ? "Verberg velden" : "Velden";
      toggleFieldsBtn.setAttribute("aria-expanded", visible ? "true" : "false");
    }

    if (toggleFieldsBtn && fieldsPanel) {
      setFieldsPanelVisible(false);
      toggleFieldsBtn.addEventListener("click", () => {
        const isHidden = fieldsPanel.classList.contains("hidden");
        setFieldsPanelVisible(isHidden);
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") next();
      if (e.key === "ArrowUp") prev();
      if (e.key === "Enter") toggleRun();
    });

    loadData();
  });
})();