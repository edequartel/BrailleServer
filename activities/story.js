// /activities/story.js
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

  const DEFAULT_LANG = "nl";

  function create() {
    let intervalId = null;
    let session = null;
    let playToken = 0;

    let currentHowl = null;
    let currentUrl = null;
    let currentSoundId = null;

    let donePromise = null;
    let doneResolve = null;

    let isPaused = false;

    // Debounce to avoid double firing (keydown+keyup / duplicates)
    let lastToggleAt = 0;
    const TOGGLE_DEBOUNCE_MS = 220;

    function isRunning() {
      return Boolean(intervalId);
    }

    async function ensureSoundsReady() {
      if (typeof Howl === "undefined") throw new Error("Howler.js not loaded");
      if (typeof Sounds === "undefined" || !Sounds || typeof Sounds.init !== "function") {
        throw new Error("Sounds.js not loaded");
      }
      await Sounds.init("../config/sounds.json", (line) => log("[Sounds]", line));
    }

    function stopCurrentHowl() {
      if (!currentHowl) return;
      try {
        if (currentSoundId != null) currentHowl.stop(currentSoundId);
        else currentHowl.stop();
      } catch {
        // ignore
      } finally {
        currentHowl = null;
        currentUrl = null;
        currentSoundId = null;
        isPaused = false;
      }
    }

    function ensureDonePromise() {
      if (donePromise) return donePromise;
      donePromise = new Promise((resolve) => { doneResolve = resolve; });
      return donePromise;
    }

    function resolveDone(payload) {
      if (!doneResolve) return;
      const r = doneResolve;
      doneResolve = null;
      donePromise = null;
      r(payload);
    }

    function playHowl(howl, token) {
      return new Promise((resolve, reject) => {
        if (!howl) return resolve();
        if (token !== playToken) return resolve();

        const onEnd = () => resolve();
        const onLoadError = (id, err) => reject(new Error(String(err || "loaderror")));
        const onPlayError = (id, err) => reject(new Error(String(err || "playerror")));

        howl.once("end", onEnd);
        howl.once("loaderror", onLoadError);
        howl.once("playerror", onPlayError);

        try {
          isPaused = false;
          howl.stop();

          // IMPORTANT: store the soundId to resume correctly
          currentSoundId = howl.play();
        } catch (err) {
          reject(err);
        }
      });
    }

    function normalizeStoryKey(fileName) {
      const raw = String(fileName || "").trim();
      if (!raw) return "";
      const base = raw.split(/[\\/]/).pop() || raw;
      return base.replace(/\.[^/.]+$/, "").trim().toLowerCase();
    }

    async function playStory(ctx) {
      const token = playToken;

      const record = ctx?.record || {};
      const storyFiles = Array.isArray(record.story) ? record.story : [];
      const lang = ctx?.lang || DEFAULT_LANG;

      const indexRaw = ctx?.activity?.index;
      const parsedIndex = Number(indexRaw);
      const hasValidIndex = Number.isFinite(parsedIndex);

      log("[activity:story] audio sequence", {
        lang,
        count: storyFiles.length,
        index: hasValidIndex ? parsedIndex : indexRaw
      });

      if (!storyFiles.length) return;
      if (!hasValidIndex) return;

      await ensureSoundsReady();

      const filesToPlay =
        parsedIndex === -1
          ? storyFiles
          : parsedIndex >= 0 && parsedIndex < storyFiles.length
            ? [storyFiles[parsedIndex]]
            : [];

      if (!filesToPlay.length) return;

      for (const fileName of filesToPlay) {
        if (token !== playToken) return;

        const key = normalizeStoryKey(fileName);
        if (!key) continue;

        const url = Sounds._buildUrl(lang, "stories", key);
        currentUrl = url;
        currentHowl = Sounds._getHowl(url);
        currentSoundId = null;
        isPaused = false;

        log("[activity:story] play start", { key, url, fileName: String(fileName) });

        try {
          // eslint-disable-next-line no-await-in-loop
          await playHowl(currentHowl, token);
          log("[activity:story] play end", { key, url, fileName: String(fileName) });
        } finally {
          stopCurrentHowl();
        }
      }

      if (token !== playToken) return;
      stop({ reason: "audioEnd" });
    }

    // RightThumb ONLY: toggle play/pause (no restart)
    function togglePlayPause(source) {
      const now = Date.now();
      if (now - lastToggleAt < TOGGLE_DEBOUNCE_MS) return;
      lastToggleAt = now;

      if (!isRunning() || !currentHowl) return;

      try {
        const id = currentSoundId;

        if (currentHowl.playing(id)) {
          currentHowl.pause(id);
          isPaused = true;
          log("[activity:story] paused", { source, url: currentUrl, soundId: id });
          return;
        }

        if (isPaused && id != null) {
          currentHowl.play(id); // resumes same instance
          isPaused = false;
          log("[activity:story] resumed", { source, url: currentUrl, soundId: id });
          return;
        }

        log("[activity:story] toggle ignored (not playing, not paused)", { source, url: currentUrl, soundId: id });
      } catch (err) {
        log("[activity:story] toggle error", { source, message: err?.message || String(err) });
      }
    }

    function normalizeKeyName(x) {
      return String(x || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "")
        .replace(/[_-]/g, "");
    }

    function extractKeyNameFromEvent(ev) {
      if (!ev) return "";
      if (typeof ev === "string") return ev;
      const d = ev.detail || {};
      return d.keyName || d.key || d.name || ev.keyName || ev.key || ev.code || "";
    }

    function handleThumbKeys(ev, sourceLabel) {
      const raw = extractKeyNameFromEvent(ev);
      const k = normalizeKeyName(raw);
      if (!k) return;

      const isRightThumb =
        k === "rightthumb" ||
        k === "rt" ||
        k === "thumbright" ||
        k === "rightthumbkey";

      if (isRightThumb) togglePlayPause(sourceLabel || raw);
      // All other keys ignored
    }

    (function attachKeyListenersOnce() {
      if (window.__storyThumbKeysAttached) return;
      window.__storyThumbKeysAttached = true;

      window.addEventListener("braillebridge:key", (ev) => handleThumbKeys(ev, "braillebridge:key"));
      window.addEventListener("braille-key", (ev) => handleThumbKeys(ev, "braille-key"));
      window.addEventListener("braillebridgeKey", (ev) => handleThumbKeys(ev, "braillebridgeKey"));

      // Dev fallback: Space toggles
      window.addEventListener("keydown", (ev) => {
        if (ev.code === "Space") handleThumbKeys({ detail: { keyName: "RightThumb" } }, "keydown:Space");
      });

      log("[activity:story] right-thumb toggle listeners attached");
    })();

    function start(ctx) {
      stop({ reason: "restart" });
      ensureDonePromise();

      isPaused = false;
      currentSoundId = null;

      session = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ctx
      };

      log("[activity:story] start", {
        sessionId: session.id,
        recordId: ctx?.record?.id,
        word: ctx?.record?.word
      });

      let tick = 0;
      intervalId = window.setInterval(() => {
        tick += 1;
        log("[activity:story] tick", { sessionId: session.id, tick });
      }, 750);

      playToken += 1;
      playStory(ctx).catch((err) => {
        log("[activity:story] audio error", { message: err?.message || String(err) });
        resolveDone({ ok: false, error: err?.message || String(err) });
      });

      return donePromise;
    }

    function stop(payload) {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }

      playToken += 1;

      stopCurrentHowl();
      log("[activity:story] stop", { sessionId: session?.id, payload });

      session = null;
      resolveDone({ ok: true, payload });
    }

    return { start, stop, isRunning };
  }

  window.Activities = window.Activities || {};
  if (!window.Activities.story) window.Activities.story = create();
})();