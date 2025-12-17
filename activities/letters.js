// /activities/letters.js
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
      }
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

    async function playLetters(ctx) {
      const token = playToken;
      const record = ctx?.record || {};
      const letters = Array.isArray(record.letters) ? record.letters : [];
      const lang = ctx?.lang || DEFAULT_LANG;

      log("[activity:letters] audio sequence", { lang, count: letters.length });
      if (!letters.length) {
        log("[activity:letters] no letters to play", { recordId: record?.id, word: record?.word });
        return;
      }

      await ensureSoundsReady();
      log("[activity:letters] Sounds ready");

      for (const letter of letters) {
        if (token !== playToken) return;
        const key = String(letter || "").trim().toLowerCase();
        if (!key) continue;

        const url = Sounds._buildUrl(lang, "letters", key);
        currentHowl = Sounds._getHowl(url);
        log("[activity:letters] play", { key, url });
        try {
          // eslint-disable-next-line no-await-in-loop
          await playHowl(currentHowl, token);
        } finally {
          stopCurrentHowl();
        }
      }
    }

    function start(ctx) {
      stop({ reason: "restart" });
      session = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ctx
      };
      log("[activity:letters] start", {
        sessionId: session.id,
        recordId: ctx?.record?.id,
        word: ctx?.record?.word,
        letters: Array.isArray(ctx?.record?.letters) ? ctx.record.letters : null
      });

      let tick = 0;
      intervalId = window.setInterval(() => {
        tick += 1;
        log("[activity:letters] XXXtick", { sessionId: session.id, tick });
      }, 750);

      playToken += 1;
      playLetters(ctx).catch((err) => {
        log("[activity:letters] audio error", { message: err?.message || String(err) });
      });
    }

    function stop(payload) {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      playToken += 1;
      stopCurrentHowl();
      log("[activity:letters] stop", { sessionId: session?.id, payload });
      session = null;
    }

    return { start, stop, isRunning };
  }

  window.Activities = window.Activities || {};
  if (!window.Activities.letters) window.Activities.letters = create();
})();
