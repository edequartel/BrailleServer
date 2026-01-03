// /js/runner.js
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

  log("[runner] runner.js loaded");

  // ------------------------------------------------------------
  // Copy log button (next to Clear)
  // ------------------------------------------------------------
  function installLogCopyButton() {
    const clearBtn = document.getElementById("clear-log-btn");
    if (!clearBtn) {
      log("[runner] No #clear-log-btn found; copy-log button not installed");
      return;
    }
    if (document.getElementById("copy-log-btn")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "copy-log-btn";
    btn.className = clearBtn.className || "";
    btn.textContent = "Copy";
    btn.title = "Copy log to clipboard";
    btn.setAttribute("aria-label", "Copy log to clipboard");
    clearBtn.insertAdjacentElement("afterend", btn);

    function getLogText() {
      const el =
        document.getElementById("log") ||
        document.getElementById("event-log") ||
        document.getElementById("eventLog") ||
        document.getElementById("log-output") ||
        document.getElementById("logOutput") ||
        document.getElementById("debug-log") ||
        document.getElementById("debugLog");

      if (!el) return "";
      if (typeof el.value === "string") return el.value;
      return (el.innerText || el.textContent || "").trim();
    }

    async function copyTextToClipboard(text) {
      const t = String(text ?? "");
      if (!t) return false;

      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        try {
          await navigator.clipboard.writeText(t);
          return true;
        } catch (e) {
          log("[runner] clipboard.writeText failed", { error: String(e) });
        }
      }

      try {
        const ta = document.createElement("textarea");
        ta.value = t;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return Boolean(ok);
      } catch (e) {
        log("[runner] execCommand(copy) failed", { error: String(e) });
        return false;
      }
    }

    btn.addEventListener("click", async () => {
      const text = getLogText();
      const ok = await copyTextToClipboard(text);
      if (ok) log("[runner] log copied to clipboard", { chars: text.length });
      else log("[runner] could not copy log (clipboard blocked or no log element found)");
    });

    log("[runner] copy-log button installed");
  }

  // ------------------------------------------------------------
  // Activity lifecycle audio (GitHub Pages + iOS unlock)
  // ------------------------------------------------------------
  function getBasePath() {
    try {
      const host = String(location.hostname || "");
      const path = String(location.pathname || "/");
      const seg = path.split("/").filter(Boolean);
      if (host.endsWith("github.io") && seg.length > 0) return "/" + seg[0];
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
      if (window.Howler && window.Howler.ctx && window.Howler.ctx.state === "suspended") {
        window.Howler.ctx.resume().catch(() => {});
      }

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
        log("[lifecycle] play", { file, url, howl: Boolean(window.Howl), howler: Boolean(window.Howler), unlocked: audioUnlocked });

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
  // Instruction audio right after "started.mp3"
  // ------------------------------------------------------------
  function looksLikeDisabledInstruction(s) {
    const t = String(s ?? "").trim().toLowerCase();
    if (!t) return true;
    return (t === "–" || t === "-" || t === "none" || t === "off" || t === "placeholder" || t === "instruction");
  }

  function normalizeInstructionFilename(s) {
    const t = String(s ?? "").trim();
    if (!t) return "";
    if (!t.toLowerCase().endsWith(".mp3")) return "";
    const name = t.split("/").pop().split("\\").pop();
    return name;
  }

  function getInstructionMp3ForCurrent(cur) {
    const instr = cur?.activity?.instruction;
    if (looksLikeDisabledInstruction(instr)) return "";
    return normalizeInstructionFilename(instr);
  }

  async function playInstructionAfterStarted(cur) {
    const file = getInstructionMp3ForCurrent(cur);
    if (!file) return;
    await playLifecycleFile(file);
  }

  // ------------------------------------------------------------
  // Config
  // ------------------------------------------------------------
  // Important:
  // - Local dev: http://localhost:PORT/pages/activity-runner.html
  //   -> config lives at http://localhost:PORT/config/words.json (same origin)
  // - GitHub Pages: https://.../BrailleServer/pages/activity-runner.html
  //   -> config lives at https://.../BrailleServer/config/words.json
  const DATA_URL = "../config/nl/mpop.json"; // single source; works both locally and on GitHub Pages

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

  // ------------------------------------------------------------
  // Header braille (NL signs aware): add ⠠ for capitals, ⠼ at digit-run start
  // This is for the *visual header* (#field-word-braille), NOT for routing.
  // ------------------------------------------------------------
  const SIGN_CAPITAL = "⠠";     // dot 6
  const SIGN_NUMBER  = "⠼";     // 3456
  const BRAILLE_BLANK = "⠀";    // U+2800
  const BRAILLE_UNKNOWN = "⣿";

  const BRAILLE_LETTERS = {
    a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑",
    f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚",
    k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕",
    p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞",
    u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵"
  };

  const BRAILLE_DIGITS = {
    "1": "⠁", "2": "⠃", "3": "⠉", "4": "⠙", "5": "⠑",
    "6": "⠋", "7": "⠛", "8": "⠓", "9": "⠊", "0": "⠚"
  };

  const BRAILLE_PUNCT = {
    " ": BRAILLE_BLANK,
    ".": "⠲",
    ",": "⠂",
    ";": "⠆",
    ":": "⠒",
    "?": "⠦",
    "!": "⠖",
    "-": "⠤",
    "'": "⠄",
    "\"": "⠶",
    "/": "⠌",
    "(": "⠐⠣",
    ")": "⠐⠜"
  };

  function isDigit(ch) { return ch >= "0" && ch <= "9"; }

  function toBrailleUnicode(text) {
    const raw = String(text ?? "");
    if (!raw) return "–";

    let out = "";
    let inNumberRun = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];

      // space / punctuation
      if (Object.prototype.hasOwnProperty.call(BRAILLE_PUNCT, ch)) {
        out += BRAILLE_PUNCT[ch];
        inNumberRun = false;
        continue;
      }

      // digits: number sign only at start of run
      if (isDigit(ch)) {
        const digitCell = BRAILLE_DIGITS[ch] || BRAILLE_UNKNOWN;
        if (!inNumberRun) out += SIGN_NUMBER;
        out += digitCell;
        inNumberRun = true;
        continue;
      } else {
        inNumberRun = false;
      }

      // letters + capitals
      const lower = ch.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(BRAILLE_LETTERS, lower)) {
        const cell = BRAILLE_LETTERS[lower];
        if (ch !== lower) out += SIGN_CAPITAL;
        out += cell;
        continue;
      }

      // unknown
      out += BRAILLE_UNKNOWN;
    }

    return out;
  }

  // ------------------------------------------------------------
  // DOM helper
  // ------------------------------------------------------------
  function $(id) {
    const el = document.getElementById(id);
    if (!el) log(`[runner] Missing element #${id}`);
    return el;
  }
  function $opt(id) { return document.getElementById(id); }

  // Meta/status elements are OPTIONAL after refactor
  function setStatus(text) {
    const el = $opt("data-status");
    if (el) el.textContent = "Data: " + text;
  }
  function setActivityStatus(text) {
    const el = $opt("activity-status");
    if (el) el.textContent = "Status: " + text;
  }

  // ------------------------------------------------------------
  // Language (aligned with Settings page localStorage key: bs_lang)
  // ------------------------------------------------------------
  const LANG_KEY = "bs_lang";

  function normalizeLang(tag) {
    const t = String(tag || "").trim().toLowerCase();
    const base = t.split("-")[0];
    return (base === "nl" || base === "en") ? base : "nl";
  }

  function resolveLang() {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored) return normalizeLang(stored);

    const htmlLang = document.documentElement.getAttribute("lang");
    if (htmlLang) return normalizeLang(htmlLang);

    const nav = (navigator.languages && navigator.languages[0]) ? navigator.languages[0] : navigator.language;
    return normalizeLang(nav || "nl");
  }

  function applyLangToHtml(lang) {
    document.documentElement.setAttribute("lang", lang);
  }

  let currentLang = "nl";

  // ------------------------------------------------------------
  // Activity button state styling hooks
  // ------------------------------------------------------------
  function updateActivityButtonStates() {
    const wrap = $opt("activity-buttons");
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
    const runBtn = $opt("run-activity-btn");   // OPTIONAL
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

  // ------------------------------------------------------------
  // Braille line to hardware/monitor: keep PRINT TEXT ONLY (no emoji)
  // ------------------------------------------------------------
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
          log("[runner] BrailleBridge.clearDisplay failed", { message: err?.message });
        });
      } else if (typeof BrailleBridge.sendText === "function") {
        BrailleBridge.sendText(next).catch((err) => {
          log("[runner] BrailleBridge.sendText failed", { message: err?.message });
        });
      }
    }

    log("[runner] Braille line updated", { len: next.length, reason: meta.reason || "unspecified" });
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

    log("[runner] Cursor selection", { source, index, letter, word });

    if (activeActivityModule && typeof activeActivityModule.onCursor === "function") {
      activeActivityModule.onCursor({ source, index, letter, word });
    }
  }

  // ------------------------------------------------------------
  // Markdown renderer for instruction panel (Marked)
  // ------------------------------------------------------------
  function renderMarkdownInto(el, md) {
    if (!el) return;

    const text = String(md ?? "");
    if (!text.trim()) {
      el.textContent = "–";
      return;
    }

    if (window.marked && typeof window.marked.parse === "function") {
      el.innerHTML = window.marked.parse(text);
    } else {
      el.textContent = text;
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
        const text = String(a.text ?? "").trim();

        if (!id && !caption) return null;

        const bits = [];
        bits.push(id || "–");
        if (caption) bits.push(caption);
        if (instruction) bits.push(instruction);
        if (text) bits.push(`text: ${text}`);
        return bits.join(" -- ");
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

  // ------------------------------------------------------------
  // Preserve ALL activity fields + normalize activity.text
  // ------------------------------------------------------------
  function getActivities(item) {
    if (Array.isArray(item.activities) && item.activities.length) {
      return item.activities
        .filter(a => a && typeof a === "object")
        .map(a => {
          const out = { ...a };
          out.id = String(a.id ?? "").trim();
          out.caption = String(a.caption ?? "").trim();
          out.instruction = String(a.instruction ?? "").trim();
          out.text = String(a.text ?? "").trim();
          return out;
        })
        .filter(a => a.id);
    }

    const activities = [{ id: "tts", caption: "Luister (woord)", instruction: "", text: "" }];
    if (Array.isArray(item.letters) && item.letters.length) activities.push({ id: "letters", caption: "Oefen letters", instruction: "", text: "" });
    if (Array.isArray(item.words) && item.words.length) activities.push({ id: "words", caption: "Maak woorden", instruction: "", text: "" });
    if (Array.isArray(item.story) && item.story.length) activities.push({ id: "story", caption: "Luister (verhaal)", instruction: "", text: "" });
    if (Array.isArray(item.sounds) && item.sounds.length) activities.push({ id: "sounds", caption: "Geluiden", instruction: "", text: "" });
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
    const activityIndexEl = $opt("activity-index");
    const activityIdEl = $opt("activity-id");
    const activityButtonsEl = $("activity-buttons");
    const activityInstructionEl = $opt("activity-instruction");

    if (!activityButtonsEl) {
      log("[runner] Missing #activity-buttons; cannot render activity.");
      return;
    }

    if (!activities.length) {
      if (activityIndexEl) activityIndexEl.textContent = "0 / 0";
      if (activityIdEl) activityIdEl.textContent = "Activity: –";
      if (activityInstructionEl) activityInstructionEl.textContent = "–";
      activityButtonsEl.innerHTML = "";
      if (!running) updateBrailleLine(getIdleBrailleText(), { reason: "activity-empty-idle" });
      return;
    }

    const active = activities[currentActivityIndex] ?? activities[0];
    if (!active) return;

    if (activityIndexEl) activityIndexEl.textContent = `${currentActivityIndex + 1} / ${activities.length}`;
    if (activityIdEl) activityIdEl.textContent = `Activity: ${String(active.id ?? "–")}`;

    const caption = String(active.caption ?? "").trim();
    const text = String(active.text ?? "").trim();

    const instr = String(active.instruction ?? "").trim();
    const instrUi = (instr && !instr.toLowerCase().endsWith(".mp3")) ? instr : "";

    const top = caption || instrUi || "–";
    const bottom = (caption && text) ? text : "";

    const md = bottom ? `**${top}**\n\n${bottom}` : `**${top}**`;
    renderMarkdownInto(activityInstructionEl, md);

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
      playStopped();
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
    await playInstructionAfterStarted(cur);

    const activityKey = canonicalActivityId(cur.activity.id);
    const activityModule = getActivityModule(activityKey);

    if (activityModule) {
      activeActivityModule = activityModule;

      const maybePromise = activityModule.start({
        activityKey,
        activityId: cur.activity?.id ?? null,
        activityCaption: cur.activity?.caption ?? null,
        activityText: cur.activity?.text ?? null,
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
      log("[runner] No activity module found", { activityKey });
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
        await playStopped();
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
    const preferred = overrideUrl ? overrideUrl : DATA_URL;
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
      log("[runner] ERROR loading JSON", { message: err?.message || String(err), url: resolvedUrl });
      if (location.protocol === "file:") setStatus("laden mislukt: open via http:// (file:// blokkeert fetch)");
      else setStatus("laden mislukt (zie log/console)");
    }
  }

  function render() {
    if (!records.length) {
      setStatus("geen records");
      const allEl = $opt("field-all");
      if (allEl) allEl.textContent = "–";

      // keep header sane
      const emojiEl = $opt("field-emoji");
      if (emojiEl) { emojiEl.textContent = "–"; emojiEl.style.display = ""; }
      const wordEl = $opt("field-word");
      if (wordEl) wordEl.textContent = "–";
      const wordBrailleEl = $opt("field-word-braille");
      if (wordBrailleEl) wordBrailleEl.textContent = "–";

      // keep monitor empty
      if (brailleMonitor && typeof brailleMonitor.clear === "function") brailleMonitor.clear();
      updateBrailleLine("", { reason: "render-empty" });
      return;
    }

    const item = records[currentIndex];

    // Meta elements OPTIONAL; only #field-word is required
    const idEl = $opt("item-id");
    const indexEl = $opt("item-index");
    const wordEl = $("field-word");
    const emojiEl = $opt("field-emoji");

    if (!wordEl) {
      setStatus("HTML mist #field-word");
      return;
    }

    const wordText = String(item.word ?? "–");

    // Always fill core word UI
    wordEl.textContent = wordText;

    // Fill meta only if present
    if (idEl) idEl.textContent = "ID: " + (item.id ?? "–");
    if (indexEl) indexEl.textContent = `${currentIndex + 1} / ${records.length}`;

    if (emojiEl) {
      const em = getEmojiForItem(item);
      // Show emoji if we have one; hide otherwise
      emojiEl.textContent = em || " ";
      emojiEl.style.display = em ? "" : "none";
    }

    // Header braille rendering (visual only; adds ⠠ and ⠼ rules)
    const wordBrailleEl = $opt("field-word-braille");
    if (wordBrailleEl) wordBrailleEl.textContent = toBrailleUnicode(wordText);

    const allEl = $opt("field-all");
    if (allEl) allEl.textContent = formatAllFields(item);

    const activities = getActivities(item);
    if (currentActivityIndex >= activities.length) currentActivityIndex = 0;
    renderActivity(item, activities);

    setRunnerUi({ isRunning: false });
    setActivityStatus("idle");
    setStatus(`geladen (${records.length})`);

    if (!running) updateBrailleLine(getIdleBrailleText(), { reason: "render-idle" });
  }

  // Public braille output API for activities
  window.BrailleUI = window.BrailleUI || {};
  window.BrailleUI.setLine = function (text, meta) {
    updateBrailleLine(String(text ?? ""), meta || { reason: "activity" });
  };
  window.BrailleUI.clear = function (meta) {
    updateBrailleLine("", meta || { reason: "activity-clear" });
  };

  document.addEventListener("DOMContentLoaded", () => {
    log("[runner] DOMContentLoaded");
    log("[lifecycle] basePath", { BASE_PATH, origin: location.origin });

    installAudioUnlock();
    installLogCopyButton();

    const nextBtn = $opt("next-btn");
    const prevBtn = $opt("prev-btn");
    const runBtn = $opt("run-activity-btn"); // OPTIONAL
    const toggleFieldsBtn = $opt("toggle-fields-btn");
    const fieldsPanel = $opt("fields-panel");

    // Sync language from Settings -> runner
    currentLang = resolveLang();
    applyLangToHtml(currentLang);
    log("[runner] resolved lang", { lang: currentLang });

    // Bridge events
    if (window.BrailleBridge && typeof BrailleBridge.connect === "function") {
      BrailleBridge.connect();
      BrailleBridge.on("cursor", (evt) => {
        if (typeof evt?.index !== "number") return;
        dispatchCursorSelection({ index: evt.index }, "bridge");
      });
      BrailleBridge.on("connected", () => log("[runner] BrailleBridge connected"));
      BrailleBridge.on("disconnected", () => log("[runner] BrailleBridge disconnected"));
    }

    // BrailleMonitor init (lang-aware)
    if (window.BrailleMonitor && typeof BrailleMonitor.init === "function") {
      brailleMonitor = BrailleMonitor.init({
        containerId: "brailleMonitorComponent",
        lang: currentLang,
        onCursorClick(info) { dispatchCursorSelection(info, "monitor"); },
        mapping: {
          leftthumb: () => leftThumbAction(),
          rightthumb: () => rightThumbAction(),
          middleleftthumb: () => {},
          middlerightthumb: () => {}
        }
      });
      log("[runner] BrailleMonitor init", { ok: Boolean(brailleMonitor), lang: currentLang });
    } else {
      log("[runner] BrailleMonitor not available");
    }

    // Apply language changes when returning from Settings (iOS BFCache safe)
    function applyLanguageIfChanged(reason) {
      const next = resolveLang();
      if (next === currentLang) return;

      currentLang = next;
      applyLangToHtml(currentLang);
      log("[runner] lang changed", { lang: currentLang, reason });

      if (brailleMonitor && typeof brailleMonitor.setLang === "function") {
        brailleMonitor.setLang(currentLang);
      }

      // re-render header braille too
      render();

      if (!running) updateBrailleLine(getIdleBrailleText(), { reason: "lang-change-idle" });
    }

    window.addEventListener("pageshow", () => applyLanguageIfChanged("pageshow"));
    window.addEventListener("storage", (e) => {
      if (e && e.key === LANG_KEY) applyLanguageIfChanged("storage");
    });

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