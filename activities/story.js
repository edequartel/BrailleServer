// /activities/story.js
(function () {
  "use strict";

  function log(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") window.logMessage(line);
    else console.log(line);
  }

  function safeJson(x) {
    try {
      return JSON.stringify(x);
    } catch (err) {
      return String(x);
    }
  }

  const DEFAULT_LANG = "nl";

  function create() {
    let intervalId = null;
    let session = null;
    let playToken = 0;
    let currentHowl = null;
    let currentUrl = null;
    let donePromise = null;
    let doneResolve = null;

    function isRunning() {
      return Boolean(intervalId);
    }

    async function ensureSoundsReady() {
      if (typeof Howl === "undefined") {
        throw new Error("Howler.js not loaded");
      }
      if (typeof Sounds === "undefined" || !Sounds || typeof Sounds.init !== "function") {
        throw new Error("Sounds.js not loaded");
      }

      await Sounds.init("../config/sounds.json", (line) => log("[Sounds]", line));
    }

    function stopCurrentHowl() {
      if (!currentHowl) return;
      try {
        currentHowl.stop();
      } catch (err) {
        // ignore
      } finally {
        currentHowl = null;
        currentUrl = null;
      }
    }

    function ensureDonePromise() {
      if (donePromise) return donePromise;
      donePromise = new Promise((resolve) => {
        doneResolve = resolve;
      });
      return donePromise;
    }

    function resolveDone(payload) {
      if (!doneResolve) return;
      const resolve = doneResolve;
      doneResolve = null;
      donePromise = null;
      resolve(payload);
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
          howl.stop();
          howl.play();
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

      log("[activity:story] audio sequence", { lang, count: storyFiles.length, index: hasValidIndex ? parsedIndex : indexRaw });
      if (!storyFiles.length) {
        log("[activity:story] no story files to play", { recordId: record?.id, word: record?.word });
        return;
      }
      if (!hasValidIndex) {
        log("[activity:story] missing/invalid index; nothing played", { index: indexRaw });
        return;
      }

      await ensureSoundsReady();
      log("[activity:story] Sounds ready");

      const filesToPlay = parsedIndex === -1
        ? storyFiles
        : (parsedIndex >= 0 && parsedIndex < storyFiles.length)
          ? [storyFiles[parsedIndex]]
          : [];

      if (!filesToPlay.length) {
        log("[activity:story] index out of range; nothing played", { index: parsedIndex, count: storyFiles.length });
        return;
      }

      for (const fileName of filesToPlay) {
        if (token !== playToken) return;
        const key = normalizeStoryKey(fileName);
        if (!key) continue;

        const url = Sounds._buildUrl(lang, "stories", key);
        currentUrl = url;
        currentHowl = Sounds._getHowl(url);
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
      log("[activity:story] audio done");
      stop({ reason: "audioEnd" });
    }

    function start(ctx) {
      stop({ reason: "restart" });
      ensureDonePromise();
      session = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ctx
      };
      log("[activity:story] start", {
        sessionId: session.id,
        recordId: ctx?.record?.id,
        word: ctx?.record?.word,
        storyLines: Array.isArray(ctx?.record?.story) ? ctx.record.story.length : null
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
      const url = currentUrl;
      if (payload?.reason && url) log("[activity:story] play stop", { url, reason: payload.reason });
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
