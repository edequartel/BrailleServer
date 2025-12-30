// /activities/tts.js
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
      log("[activity:tts] start", { sessionId: session.id, word: ctx?.record?.word, recordId: ctx?.record?.id });

      let tick = 0;
      intervalId = window.setInterval(() => {
        tick += 1;
        log("[activity:tts] tick", { sessionId: session.id, tick });
      }, 750);
    }

    function stop(payload) {
      if (!isRunning()) return;
      window.clearInterval(intervalId);
      intervalId = null;
      log("[activity:tts] stop", { sessionId: session?.id, payload });
      session = null;
    }

    return { start, stop, isRunning };
  }

  window.Activities = window.Activities || {};
  if (!window.Activities.tts) window.Activities.tts = create();
})();

