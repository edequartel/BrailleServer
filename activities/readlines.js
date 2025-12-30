// /activities/readlines.js
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

  function setLine(text, meta) {
    if (window.BrailleUI && typeof window.BrailleUI.setLine === "function") {
      window.BrailleUI.setLine(String(text ?? ""), meta || { reason: "readlines" });
      return;
    }
    log("[readlines] BrailleUI.setLine missing", { text });
  }

  function clear(meta) {
    if (window.BrailleUI && typeof window.BrailleUI.clear === "function") {
      window.BrailleUI.clear(meta || { reason: "readlines-clear" });
      return;
    }
    setLine("", meta);
  }

  // ---------------------------------------------------------------------------
  // Selection rules (as requested)
  //
  // ctx.record.text can be:
  //  - 2D: [ ["a","b"], ["c","d"] ]
  //  - 1D: [ "a","b","c" ]  (we treat as ONE array of items)
  //
  // If ctx.activity.index === -1:
  //   pick ONE random inner array from record.text (for 2D),
  //   then go through items with RT/LT.
  //
  // If ctx.activity.index !== -1 (0,1,2,...):
  //   take record.text[index] (for 2D),
  //   then go through items with RT/LT.
  //
  // If record.text is 1D, index is ignored and the single list is used.
  // ---------------------------------------------------------------------------

  function isArrayOfArrays(a) {
    return Array.isArray(a) && a.length > 0 && a.every(Array.isArray);
  }

  function normalizeRowToItems(row) {
    if (!Array.isArray(row)) return [];
    const out = [];
    for (const item of row) {
      const s = (item == null) ? "" : String(item);
      if (s !== "") out.push(s);
    }
    return out;
  }

  function clamp(i, min, max) {
    if (!Number.isFinite(i)) i = 0;
    return Math.max(min, Math.min(max, i));
  }

  function pickRowAndItems(recordText, activityIndex) {
    // Returns: { rowIndex: number|null, items: string[] }

    if (!Array.isArray(recordText) || recordText.length === 0) {
      return { rowIndex: null, items: [] };
    }

    // 1D text: ["a","b","c"] -> treat as single row
    if (!isArrayOfArrays(recordText)) {
      return { rowIndex: 0, items: normalizeRowToItems(recordText) };
    }

    // 2D text: [ [...], [...] ]
    const rows = recordText;

    const idx = Number.isInteger(activityIndex) ? activityIndex : null;

    let chosenRowIndex;
    if (idx === -1) {
      // Pick ONCE per start(), not per keypress
      chosenRowIndex = Math.floor(Math.random() * rows.length);
    } else if (idx != null) {
      chosenRowIndex = clamp(idx, 0, rows.length - 1);
    } else {
      // Default: first row
      chosenRowIndex = 0;
    }

    return {
      rowIndex: chosenRowIndex,
      items: normalizeRowToItems(rows[chosenRowIndex])
    };
  }

  // ---------------------------------------------------------------------------
  // Module state
  // ---------------------------------------------------------------------------
  let running = false;

  let donePromise = null;
  let doneResolve = null;

  let ctx = null;
  let items = [];           // items inside the chosen row
  let index = 0;            // item index within items
  let chosenRowIndex = null; // which row from record.text was chosen

  function isRunning() {
    return running;
  }

  function resolveDone(payload) {
    const r = doneResolve;
    doneResolve = null;
    if (typeof r === "function") r(payload || { reason: "done" });
  }

  function clampIndex(i) {
    if (!items.length) return 0;
    if (!Number.isInteger(i)) i = 0;
    return Math.max(0, Math.min(items.length - 1, i));
  }

  function currentText() {
    if (!items.length) return "";
    index = clampIndex(index);
    return String(items[index] ?? "");
  }

  function render(reason) {
    const text = currentText();
    setLine(text, {
      reason: reason || "render",
      index,
      total: items.length,
      rowIndex: chosenRowIndex
    });
    log("[readlines] render", {
      rowIndex: chosenRowIndex,
      index,
      total: items.length,
      text
    });
  }

  function nextItem() {
    if (!running) return;

    if (!items.length) {
      stop({ reason: "no-text" });
      return;
    }

    index = clampIndex(index);

    if (index < items.length - 1) {
      index++;
      render("next");
    } else {
      stop({ reason: "done" });
    }
  }

  function prevItem() {
    if (!running) return;
    if (!items.length) return;

    index = clampIndex(index);

    if (index > 0) {
      index--;
      render("prev");
    } else {
      // stay at first item; never allow -1
      index = 0;
      render("prev-boundary");
    }
  }

  // ---------------------------------------------------------------------------
  // REQUIRED by words.js: start() and stop()
  // ---------------------------------------------------------------------------
  function start(startCtx) {
    stop({ reason: "restart" });

    ctx = startCtx || null;
    const record = ctx?.record || {};
    const activityIndex = ctx?.activity?.index;

    const picked = pickRowAndItems(record.text, activityIndex);
    chosenRowIndex = picked.rowIndex;
    items = picked.items;

    index = 0;
    index = clampIndex(index);

    running = true;
    donePromise = new Promise((resolve) => (doneResolve = resolve));

    log("[readlines] start", {
      recordId: record?.id,
      word: record?.word,
      activityIndex,
      chosenRowIndex,
      items: items.length
    });

    render("start");
    return donePromise;
  }

  function stop(payload) {
    if (!running && !doneResolve) return;

    running = false;

    // Optional:
    // clear({ reason: "stop" });

    log("[readlines] stop", payload || { reason: "stop" });
    resolveDone(payload || { reason: "stop" });
  }

  // ---------------------------------------------------------------------------
  // Thumb forwarding API
  // ---------------------------------------------------------------------------
  function onRightThumb() {
    nextItem();
  }

  function onLeftThumb() {
    prevItem();
  }

  window.Activities = window.Activities || {};
  window.Activities.readlines = {
    start,
    stop,
    isRunning,
    onRightThumb,
    onLeftThumb
  };

  log("[readlines] readlines.js loaded");
})();