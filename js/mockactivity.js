// /js/mockactivity.js
(function () {
  "use strict";

  function nowMs() {
    return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  }

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

  function createMockActivity() {
    let intervalId = null;
    let startedAt = null;
    let session = null;

    function isRunning() {
      return Boolean(intervalId);
    }

    function start(payload = {}) {
      if (isRunning()) stop({ reason: "restart" });

      startedAt = nowMs();
      session = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        startedAt,
        payload
      };

      log("[mockActivity] start", { sessionId: session.id, payload });

      let tick = 0;
      intervalId = window.setInterval(() => {
        tick += 1;
        log("[mockActivity] tick", { sessionId: session.id, tick });
      }, 1000);
    }

    function stop(payload = {}) {
      if (!isRunning()) return;

      window.clearInterval(intervalId);
      intervalId = null;

      const endedAt = nowMs();
      const durationMs = startedAt ? Math.max(0, Math.round(endedAt - startedAt)) : null;
      log("[mockActivity] stop", { sessionId: session?.id, durationMs, payload });

      startedAt = null;
      session = null;
    }

    return { start, stop, isRunning };
  }

  if (!window.MockActivity) {
    window.MockActivity = createMockActivity();
    log("[mockActivity] ready");
  }
})();
