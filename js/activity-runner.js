// /js/activity-runner.js
(function () {
  "use strict";

  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  function defaultLog(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") window.logMessage(line);
    else console.log(line);
  }

  function createDeferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }

  function createActivityRunner(opts) {
    const log = typeof opts?.log === "function" ? opts.log : defaultLog;

    const getActivityModule = opts?.getActivityModule;
    const canonicalActivityId = opts?.canonicalActivityId;
    const getCurrentContext = opts?.getCurrentContext;

    const onRunningChange = opts?.onRunningChange;
    const onStatus = opts?.onStatus;
    const onAutoAdvance = opts?.onAutoAdvance;
    const isAutoRunEnabled = opts?.isAutoRunEnabled;

    if (typeof getActivityModule !== "function") throw new Error("ActivityRunner: getActivityModule missing");
    if (typeof canonicalActivityId !== "function") throw new Error("ActivityRunner: canonicalActivityId missing");
    if (typeof getCurrentContext !== "function") throw new Error("ActivityRunner: getCurrentContext missing");

    let runToken = 0;
    let running = false;
    let activeActivityModule = null;
    let activeActivityDonePromise = null;

    // resolves when stop() is called for the current run
    let stopDeferred = null;

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

    function setRunning(next, statusText) {
      running = Boolean(next);
      if (typeof onRunningChange === "function") onRunningChange(running);
      if (typeof onStatus === "function" && typeof statusText === "string") onStatus(statusText);
    }

    function cancelRun(reason = "cancelRun") {
      runToken += 1;

      // resolve any pending stop waiters
      if (stopDeferred) {
        try { stopDeferred.resolve(); } catch {}
        stopDeferred = null;
      }

      stopActiveActivity({ reason });
      setRunning(false, "idle");
    }

    async function start({ autoStarted = false } = {}) {
      const ctx = getCurrentContext();
      if (!ctx || !ctx.activity) return;

      // stop any previous run
      cancelRun("startNewRun");
      const token = runToken;

      const activityKey = canonicalActivityId(ctx.activity.id);

      const mod = getActivityModule(activityKey);
      if (mod) {
        activeActivityModule = mod;
        const maybePromise = mod.start({
          activityKey,
          activityId: ctx.activity?.id ?? null,
          activityCaption: ctx.activity?.caption ?? null,
          activity: ctx.activity ?? null,
          record: ctx.item ?? null,
          recordIndex: ctx.recordIndex ?? null,
          activityIndex: ctx.activityIndex ?? null,
          autoStarted: Boolean(autoStarted)
        });
        activeActivityDonePromise =
          (maybePromise && typeof maybePromise.then === "function") ? maybePromise : null;
      } else {
        activeActivityModule = null;
        activeActivityDonePromise = null;
        log("[runner] No activity module found", { activityKey });
      }

      // create new stop signal for this run
      stopDeferred = createDeferred();

      setRunning(true, autoStarted ? "running (auto)" : "running");

      try {
        // race: stop button, activity resolves, or cancellation/restart
        await Promise.race([
          stopDeferred.promise,
          activeActivityDonePromise || new Promise(() => {}),
          new Promise((resolve) => {
            const poll = () => {
              if (token !== runToken) return resolve();
              requestAnimationFrame(poll);
            };
            requestAnimationFrame(poll);
          })
        ]);
      } finally {
        if (token !== runToken) return;

        // clean up stop waiter
        if (stopDeferred) {
          try { stopDeferred.resolve(); } catch {}
          stopDeferred = null;
        }

        setRunning(false, "done");
        stopActiveActivity({ reason: "finally" });

        if (typeof isAutoRunEnabled === "function" && isAutoRunEnabled()) {
          if (typeof onAutoAdvance === "function") onAutoAdvance();
        }
      }
    }

    function stop(reason = "stop") {
      if (!running) return;
      // resolve current wait + stop module
      if (stopDeferred) {
        try { stopDeferred.resolve(); } catch {}
        stopDeferred = null;
      }
      stopActiveActivity({ reason });
      setRunning(false, "idle");
      runToken += 1;
    }

    function isRunning() {
      return running;
    }

    function getActiveModule() {
      return activeActivityModule;
    }

    return { start, stop, cancelRun, isRunning, getActiveModule };
  }

  window.ActivityRunner = { create: createActivityRunner };
})();