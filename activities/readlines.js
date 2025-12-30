// /activities/readlines.js
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
      return Boolean(// /activities/readlines.js
// -----------------------------------------------------------------------------
// Activity: readlines
// Purpose
// - Read 1 line at a time from ctx.record.text (an array of strings in words.json)
// - Right thumb key  -> next line
// - Left thumb key   -> previous line
// - Shows the current line on the braille display (via whatever output adapter exists)
//
// Integration expectations (based on typical BrailleServer patterns)
// - activity-runner will call: activity.create().start(ctx)
// - ctx.record is the current word record from words.json
// - Key events arrive via ONE of these mechanisms:
//   A) ctx.onKey(callback)  -> returns unsubscribe()
//   B) window.BrailleBridge.onKey(callback) -> returns unsubscribe()
//   C) CustomEvent "braille:key" dispatched on window with { detail: keyEvent }
//
// Notes
// - This file registers itself as an activity named "readlines" in either:
//   - window.ActivityRegistry (if present), OR
//   - window.Activities (fallback map)
//
// -----------------------------------------------------------------------------
// Implementation
(function () {
  "use strict";

  // Small logger: uses window.logMessage if present (your repo often has Logging.js),
  // otherwise defaults to console.log.
  function log(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") window.logMessage(line);
    else console.log(line);
  }

  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  // ---------------------------------------------------------------------------
  // OUTPUT: Write one line to the braille display
  //
  // BrailleServer / BrailleBridge setups differ slightly across pages/branches.
  // Therefore we try multiple "adapters" in priority order.
  //
  // If none is found, we:
  // - update a DOM element (if you have a visual braille monitor),
  // - and finally log to console.
  // ---------------------------------------------------------------------------
  async function writeLine(ctx, text) {
    // 1) If activity-runner passes a braille/api object in ctx, use that first
    if (ctx?.braille?.writeText) return ctx.braille.writeText(text);
    if (ctx?.api?.braille?.write) return ctx.api.braille.write(text);
    if (ctx?.bridge?.braille?.writeText) return ctx.bridge.braille.writeText(text);

    // 2) Common global wrappers
    if (window.BrailleBridgeApi?.writeText) return window.BrailleBridgeApi.writeText(text);
    if (window.BrailleBridge?.writeText) return window.BrailleBridge.writeText(text);

    // 3) UI fallback: mirror line into an element if present
    const el = document.querySelector("#brailleLine, .braille-line, [data-braille-line]");
    if (el) {
      el.textContent = text;
      return;
    }

    // 4) Nothing found: only log
    log("[activity:readlines] writeLine: no output adapter found", { text });
  }

  // ---------------------------------------------------------------------------
  // INPUT: Thumb key detection
  //
  // Different braille displays / keymaps / websocket payloads use different names.
  // We normalize by building a "search string" from common fields.
  //
  // If needed, extend these matchers with what you actually see in your event logs.
  // ---------------------------------------------------------------------------
  function normalizeKeyString(ev) {
    return [
      ev?.key, ev?.code, ev?.id, ev?.name, ev?.action,
      ev?.data?.key, ev?.data?.code, ev?.data?.id, ev?.data?.name, ev?.data?.action
    ].filter(Boolean).join(" ").toLowerCase();
  }

  // Return true if the event looks like "right thumb key"
  function isRightThumb(ev) {
    const s = normalizeKeyString(ev);

    // Many possible naming conventions:
    // - thumbright / thumb_right / rightthumb / rthumb / thumb-r / rt
    // - "thumb" + "right"
    return (
      s.includes("thumbright") ||
      s.includes("thumb_right") ||
      s.includes("rightthumb") ||
      s.includes("rthumb") ||
      s.includes("thumb-r") ||
      s === "rt" ||
      (s.includes("thumb") && s.includes("right"))
    );
  }

  // Return true if the event looks like "left thumb key"
  function isLeftThumb(ev) {
    const s = normalizeKeyString(ev);

    return (
      s.includes("thumbleft") ||
      s.includes("thumb_left") ||
      s.includes("leftthumb") ||
      s.includes("lthumb") ||
      s.includes("thumb-l") ||
      s === "lt" ||
      (s.includes("thumb") && s.includes("left"))
    );
  }

  // ---------------------------------------------------------------------------
  // Activity factory: create() returns an instance with start/stop/isRunning
  // This matches the pattern you already use for other activities.
  // ---------------------------------------------------------------------------
  function create() {
    let running = false;

    // Promise returned by start() so the runner can await completion.
    let donePromise = null;
    let doneResolve = null;

    // Runtime state
    let ctx = null;
    let lines = [];   // ctx.record.text[]
    let index = 0;    // current line index

    // Unsubscribe/detach function for key listener
    let detach = null;

    function isRunning() { return running; }

    function clampIndex(i) {
      if (!lines.length) return 0;
      return Math.max(0, Math.min(lines.length - 1, i));
    }

    // Render current line onto the braille display
    async function render() {
      const text = lines[index] ?? "";
      log("[activity:readlines] render", { index, total: lines.length, text });

      await writeLine(ctx, text);

      // Optional: if runner supports a little "status" panel, expose state.
      // (No harm if ctx.setField does not exist.)
      if (typeof ctx?.setField === "function") {
        ctx.setField("readlines.index", index);
        ctx.setField("readlines.total", lines.length);
      }
    }

    // Move forward one line; finish at the end
    async function next() {
      if (!running) return;
      if (!lines.length) {
        // No lines? Immediately finish so the runner can continue.
        stop({ reason: "no-text" });
        return;
      }

      if (index < lines.length - 1) {
        index++;
        await render();
      } else {
        // End reached -> done
        stop({ reason: "done" });
      }
    }

    // Move back one line (stays at 0 if already at start)
    async function prev() {
      if (!running) return;
      if (!lines.length) return;

      if (index > 0) index--;
      await render();
    }

    // Attach key listener using whichever mechanism exists
    function attachKeyListener() {
      // A) Preferred: runner provides a key hook
      if (typeof ctx?.onKey === "function") {
        const unsub = ctx.onKey(async (ev) => {
          if (isRightThumb(ev)) return next();
          if (isLeftThumb(ev)) return prev();
        });
        detach = (typeof unsub === "function") ? unsub : null;
        log("[activity:readlines] listening via ctx.onKey");
        return;
      }

      // B) Alternative: global bridge key hook
      if (typeof window.BrailleBridge?.onKey === "function") {
        const unsub = window.BrailleBridge.onKey(async (ev) => {
          if (isRightThumb(ev)) return next();
          if (isLeftThumb(ev)) return prev();
        });
        detach = (typeof unsub === "function") ? unsub : null;
        log("[activity:readlines] listening via window.BrailleBridge.onKey");
        return;
      }

      // C) Fallback: DOM CustomEvent "braille:key"
      // Somewhere else in your repo you should be doing:
      // window.dispatchEvent(new CustomEvent("braille:key", { detail: keyEvent }));
      const handler = async (ev) => {
        const payload = ev?.detail ?? ev;
        if (isRightThumb(payload)) return next();
        if (isLeftThumb(payload)) return prev();
      };

      window.addEventListener("braille:key", handler);
      detach = () => window.removeEventListener("braille:key", handler);
      log("[activity:readlines] listening via window 'braille:key' event");
    }

    // start(ctx) is called by the activity-runner
    function start(startCtx) {
      // If already running, restart cleanly
      stop({ reason: "restart" });

      ctx = startCtx || null;

      // The content contract:
      // - record.text must be an array of strings
      const record = ctx?.record || {};
      lines = Array.isArray(record.text) ? record.text.slice() : [];
      index = clampIndex(0);

      running = true;
      donePromise = new Promise((resolve) => (doneResolve = resolve));

      log("[activity:readlines] start", {
        recordId: record?.id,
        word: record?.word,
        lines: lines.length
      });

      // Listen for thumb keys
      attachKeyListener();

      // Show first line immediately
      render();

      // Let runner await completion
      return donePromise;
    }

    // stop(...) resolves the done promise so the runner can continue.
    function stop(info) {
      // If we are not running and there is nothing to resolve, do nothing.
      if (!running && !doneResolve) return;

      running = false;

      // Unhook listener
      if (typeof detach === "function") {
        try { detach(); } catch {}
      }
      detach = null;

      // Resolve completion promise once
      const resolve = doneResolve;
      doneResolve = null;

      log("[activity:readlines] stop", info || { reason: "stop" });

      if (typeof resolve === "function") resolve(info || { reason: "stop" });
    }

    return { start, stop, isRunning };
  }

  // ---------------------------------------------------------------------------
  // Register activity so activity-runner can find it by id "readlines".
  // - If you have a registry: register("readlines", { create })
  // - Else: window.Activities.readlines = { create }
  // ---------------------------------------------------------------------------
  if (window.ActivityRegistry?.register) {
    window.ActivityRegistry.register("readlines", { create });
  } else {
    window.Activities = window.Activities || {};
    window.Activities.readlines = { create };
  }
})(););
    }

    function start(ctx) y{
      stop({ reason: "restart" });
      session = {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        ctx
      };
      log("[activity:words] start", {
        sessionId: session.id,
        recordId: ctx?.record?.id,
        word: ctx?.record?.word,
        words: Array.isArray(ctx?.record?.words) ? ctx.record.words : null
      });

      let tick = 0;
      intervalId = window.setInterval(() => {
        tick += 1;
        log("[activity:words] tick", { sessionId: session.id, tick });
      }, 750);
    }

    function stop(payload) {
      if (!isRunning()) return;
      window.clearInterval(intervalId);
      intervalId = null;
      log("[activity:words] stop", { sessionId: session?.id, payload });
      session = null;
    }

    return { start, stop, isRunning };
  }

  window.Activities = window.Activities || {};
  if (!window.Activities.words) window.Activities.words = create();
})();

