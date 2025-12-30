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

  // ============================================================
  // Activity lifecycle audio (robust for GitHub Pages + subfolders)
  // Tries: /audio/*.mp3, ../audio/*.mp3, ./audio/*.mp3
  // Uses: Howler if available, else HTML5 Audio
  // ============================================================

  function tryUrl(relOrAbs) {
    try { return new URL(relOrAbs, document.baseURI).toString(); }
    catch { return String(relOrAbs); }
  }

  async function urlExists(url) {
    try {
      const res = await fetch(url, { method: "HEAD", cache: "no-store" });
      return res.ok;
    } catch {
      return false;
    }
  }

  function playAudioUrl(url, log) {
    try {
      if (window.Howl) {
        const h = new Howl({
          src: [url],
          preload: true,
          volume: 1.0,
          onloaderror: (id, err) => log("[runner] howl load error", { url, err }),
          onplayerror: (id, err) => log("[runner] howl play error", { url, err })
        });
        h.play();
      } else {
        const a = new Audio(url);
        a.addEventListener("error", () => log("[runner] html5 audio error", { url }));
        const p = a.play();
        if (p && typeof p.catch === "function") {
          p.catch((e) => log("[runner] html5 audio play blocked", { url, error: String(e) }));
        }
      }
      log("[runner] play lifecycle audio", { url });
    } catch (e) {
      log("[runner] lifecycle audio exception", { url, error: String(e) });
    }
  }

  // Cache resolved URLs so we probe only once per page load
  const lifecycleAudioCache = { started: null, stopped: null, tried: { started: false, stopped: false } };

  async function resolveLifecycleAudio(which, log) {
    if (lifecycleAudioCache[which]) return lifecycleAudioCache[which];
    if (lifecycleAudioCache.tried[which]) return null;
    lifecycleAudioCache.tried[which] = true;

    const file = which === "started" ? "started.mp3" : "stopped.mp3";

    const candidates = [
      tryUrl(`/audio/${file}`),    // root
      tryUrl(`../audio/${file}`),  // when page is /pages/...
      tryUrl(`./audio/${file}`)    // when site mounted in subpath
    ];

    for (const url of candidates) {
      const ok = await urlExists(url);
      log("[runner] lifecycle audio probe", { which, url, ok });
      if (ok) {
        lifecycleAudioCache[which] = url;
        log("[runner] lifecycle audio resolved", { which, url });
        return url;
      }
    }

    log("[runner] lifecycle audio missing", { which, candidates });
    return null;
  }

  async function playStarted(log) {
    const url = await resolveLifecycleAudio("started", log);
    if (url) playAudioUrl(url, log);
  }

  async function playStopped(log) {
    const url = await resolveLifecycleAudio("stopped", log);
    if (url) playAudioUrl(url, log);
  }

  // ============================================================

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

    // ensure we only play stopped.mp3 once per run-token
    let stopSoundPlayedForToken = null;

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

    function playStopOnceFor(token) {
      if (stopSoundPlayedForToken === token) return;
      stopSoundPlayedForToken = token;
      void playStopped(log);
    }

    function cancelRun(reason = "cancelRun") {
      // cancel current run and invalidate async loops
      const token = runToken;

      // Avoid an immediate "stopped" when we internally restart to start a new run
      if (reason !== "startNewRun") {
        playStopOnceFor(token);
      }

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

      // stop any previous run (internal restart)
      cancelRun("startNewRun");

      const token = runToken;

      // reset per-run stop-sound latch
      stopSoundPlayedForToken = null;

      // Play started sound as soon as we have a valid ctx.activity (independent of module lookup)
      void playStarted(log);

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

        // natural completion OR any other exit path: play stop once
        playStopOnceFor(token);

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

      const token = runToken;

      playStopOnceFor(token);

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