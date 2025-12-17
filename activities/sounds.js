// /activities/sounds.js
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

  function create() {
    let intervalId = null;
    let session = null;

    function isRunning() {
      return Boolean(intervalId);
    }

    function start(ctx) {
      stop({ reason: "restart" });
      session = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ctx
      };
      log("[activity:sounds] start", {
        sessionId: session.id,
        recordId: ctx?.record?.id,
        word: ctx?.record?.word,
        sounds: Array.isArray(ctx?.record?.sounds) ? ctx.record.sounds : null
      });

      let tick = 0;
      intervalId = window.setInterval(() => {
        tick += 1;
        log("[activity:sounds] tick", { sessionId: session.id, tick });
      }, 750);
    }

    function stop(payload) {
      if (!isRunning()) return;
      window.clearInterval(intervalId);
      intervalId = null;
      log("[activity:sounds] stop", { sessionId: session?.id, payload });
      session = null;
    }

    return { start, stop, isRunning };
  }

  window.Activities = window.Activities || {};
  if (!window.Activities.sounds) window.Activities.sounds = create();
})();

