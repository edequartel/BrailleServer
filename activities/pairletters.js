// /activities/pairletters.js
(function () {
  "use strict";

  // VERSION MARKER (cache/path debugging)
  console.log("[pairletters] LOADED version 2025-12-31 twoletters-collect-targetcount");

  function log(msg, data) {
    const line = data ? `${msg} ${safeJson(data)}` : msg;
    if (typeof window.logMessage === "function") window.logMessage(line);
    else console.log(line);
  }
  function safeJson(x) {
    try { return JSON.stringify(x); } catch { return String(x); }
  }

  const DEFAULT_ROUNDS = 5;
  const DEFAULT_LINE_LEN = 18;
  const FEEDBACK_MS = 300;
  const FLIPBACK_MS = 650;
  const DEFAULT_TARGET_COUNT = 2;

  function create() {
    let running = false;

    let donePromise = null;
    let doneResolve = null;

    // run config
    let round = 0;
    let totalRounds = DEFAULT_ROUNDS;
    let lineLenCells = DEFAULT_LINE_LEN;

    // when true: line contains exactly 2 distinct letters: target + distractor
    // AND selection mode becomes "collect targetCount targets" (not a pair game)
    let twoLettersOnly = false;

    // used only when twoletters:true
    let targetCount = DEFAULT_TARGET_COUNT;

    // round state
    let cells = [];
    let lineText = "";
    let known = [];
    let fresh = [];
    let currentTarget = "a";
    let currentDistractor = "b";

    // selection state (pair-mode)
    let stage = 0;
    let firstIdx = null;
    let firstLetter = "";
    let secondIdx = null;
    let secondLetter = "";

    // selection state (collect-mode)
    let selectedTargets = new Set(); // indices already found (target only)

    // mapping support
    let cellCharStarts = [];

    // control
    let playToken = 0;
    let roundDoneResolve = null;
    let inputLocked = false;
    let selectionEpoch = 0;

    // record
    let ctxRecord = null;

    // ------------------------------------------------------------
    // Promise helpers
    // ------------------------------------------------------------
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

    // ------------------------------------------------------------
    // Utilities
    // ------------------------------------------------------------
    function uniqLetters(arr) {
      const out = [];
      const seen = new Set();
      for (const x of (Array.isArray(arr) ? arr : [])) {
        const s = String(x || "").trim().toLowerCase();
        if (!s || s.length !== 1 || seen.has(s)) continue;
        seen.add(s);
        out.push(s);
      }
      return out;
    }

    function computePools(record) {
      const knownLetters = uniqLetters(record?.knownLetters);
      const letters = uniqLetters(record?.letters);
      const knownSet = new Set(knownLetters);
      const freshLetters = letters.filter(ch => !knownSet.has(ch));
      return { knownLetters, freshLetters };
    }

    function clampInt(x, min, max, fallback) {
      const n = Number(x);
      if (!Number.isFinite(n)) return fallback;
      const i = Math.floor(n);
      return Math.max(min, Math.min(max, i));
    }

    function readBool(a, keys, fallback) {
      for (const k of keys) {
        if (a && Object.prototype.hasOwnProperty.call(a, k)) {
          const v = a[k];
          if (v === true) return true;
          if (v === false) return false;
          const s = String(v).trim().toLowerCase();
          if (s === "true") return true;
          if (s === "false") return false;
        }
      }
      return fallback;
    }

    function readConfigFromCtx(ctx) {
      const a = ctx?.activity || {};

      totalRounds = clampInt(a.nrof ?? a.nrOf ?? a.nRounds, 1, 200, DEFAULT_ROUNDS);
      lineLenCells = clampInt(a.lineLen ?? a.lineLength ?? a.len, 2, 40, DEFAULT_LINE_LEN);

      twoLettersOnly = readBool(a, ["twoletters", "twoLetters", "twoLettersOnly"], false);

      const tc = a.targetCount ?? a.targetcount ?? a.targets ?? a.targetCounts;
      targetCount = clampInt(tc, 2, 40, DEFAULT_TARGET_COUNT);

      log("[pairletters] activity cfg", a);
      log("[pairletters] config", { totalRounds, lineLenCells, twoLettersOnly, targetCount });
    }

    function pickTarget() {
      if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
      if (known.length) return known[Math.floor(Math.random() * known.length)];
      const rl = uniqLetters(ctxRecord?.letters);
      if (rl.length) return rl[Math.floor(Math.random() * rl.length)];
      return "a";
    }

    // distractor: prefer letters from record.letters (the word's letters)
    function pickDistractor(target) {
      const recordPool = uniqLetters(ctxRecord?.letters).filter(ch => ch !== target);
      if (recordPool.length) return recordPool[Math.floor(Math.random() * recordPool.length)];

      const globalPool = uniqLetters([...known, ...fresh]).filter(ch => ch !== target);
      if (globalPool.length) return globalPool[Math.floor(Math.random() * globalPool.length)];

      return target;
    }

    // ------------------------------------------------------------
    // Cell builders
    // ------------------------------------------------------------
    // Default (old): many letters, target appears exactly twice, others mostly unique.
    function buildCellsMultiLetter(target, requestedLen) {
      const poolAll = uniqLetters([...known, ...fresh]);
      const others = poolAll.filter(ch => ch !== target);

      let len = clampInt(requestedLen, 2, 40, DEFAULT_LINE_LEN);
      const maxPossible = others.length + 2;
      if (len > maxPossible) {
        log("[pairletters] warning: lineLen reduced (pool too small)", {
          requested: len,
          maxPossible,
          pool: poolAll.join(""),
          target
        });
        len = maxPossible;
      }
      len = Math.max(2, len);

      const arr = new Array(len).fill("x");
      const pos1 = Math.floor(Math.random() * len);
      let pos2 = Math.floor(Math.random() * len);
      while (pos2 === pos1) pos2 = Math.floor(Math.random() * len);

      arr[pos1] = target;
      arr[pos2] = target;

      // shuffle others
      const shuffled = others.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      let k = 0;
      for (let i = 0; i < len; i++) {
        if (i === pos1 || i === pos2) continue;
        arr[i] = shuffled[k++] ?? target;
      }
      return arr;
    }

    // twoletters:true: exactly 2 distinct letters; target occurs targetCount times; rest is distractor.
    function buildCellsTwoLetter(target, distractor, requestedLen) {
      let len = clampInt(requestedLen, 2, 40, DEFAULT_LINE_LEN);
      len = Math.max(2, len);

      // ensure at least 1 distractor remains
      const maxTargets = Math.max(2, len - 1);
      const tCount = Math.max(2, Math.min(maxTargets, targetCount));

      const arr = new Array(len).fill(distractor);

      const idxs = Array.from({ length: len }, (_, i) => i);
      for (let i = idxs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
      }

      for (let i = 0; i < tCount; i++) arr[idxs[i]] = target;

      // HARD INVARIANT: only 2 letters
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] !== target) arr[i] = distractor;
      }

      return arr;
    }

    // ------------------------------------------------------------
    // Rendering & mapping
    // Masking rule: ALWAYS turn selected indices into "é"
    // - Pair mode: mask firstIdx/secondIdx
    // - Collect mode (twoletters:true): mask all selectedTargets
    // ------------------------------------------------------------
    function isMaskedIndex(i) {
      if (twoLettersOnly) return selectedTargets.has(i);
      return i === firstIdx || i === secondIdx;
    }

    function renderLineAndMapping() {
      const parts = [];
      cellCharStarts = [];
      let charPos = 0;

      for (let i = 0; i < cells.length; i++) {
        if (i > 0) {
          parts.push(" ");
          charPos += 1;
        }
        cellCharStarts[i] = charPos;

        const shown = isMaskedIndex(i) ? "é" : (cells[i] || " ");
        parts.push(shown);
        charPos += 1;
      }

      lineText = parts.join("");
      return lineText;
    }

    function toCellIndex(rawIndex) {
      if (rawIndex == null) return null;
      const n = Number(rawIndex);
      if (!Number.isFinite(n)) return null;
      const i = Math.floor(n);

      if (!cells || !cells.length) return null;

      // Prefer char index into lineText (spaces included)
      if (lineText && i >= 0 && i < lineText.length) {
        if (lineText[i] === " ") return null;
        let best = 0;
        for (let k = 0; k < cellCharStarts.length; k++) {
          if (cellCharStarts[k] <= i) best = k;
          else break;
        }
        if (best >= 0 && best < cells.length) return best;
      }

      // Fallback: treat as cell index
      if (i >= 0 && i < cells.length) return i;
      return null;
    }

    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    function sendToBraille(text) {
      const t = String(text || "");

      if (window.BrailleUI && typeof window.BrailleUI.setLine === "function") {
        window.BrailleUI.setLine(t, { reason: "pairletters" });
        return Promise.resolve();
      }
      if (window.BrailleBridge && typeof window.BrailleBridge.sendText === "function") {
        return window.BrailleBridge.sendText(t).catch(() => {});
      }
      return Promise.resolve();
    }

    async function flashMessage(msg) {
      const saved = lineText;
      try {
        await sendToBraille(msg);
        await sleep(FEEDBACK_MS);
      } finally {
        await sendToBraille(saved);
      }
    }

    function waitForRoundCompletion(token) {
      return new Promise((resolve) => {
        if (token !== playToken) return resolve();
        roundDoneResolve = resolve;
      });
    }

    function resolveRound() {
      const r = roundDoneResolve;
      roundDoneResolve = null;
      if (typeof r === "function") r();
    }

    function resetSelectionState() {
      // pair-mode
      stage = 0;
      firstIdx = null;
      firstLetter = "";
      secondIdx = null;
      secondLetter = "";

      // collect-mode
      selectedTargets.clear();

      inputLocked = false;
    }

    async function redraw(reason) {
      renderLineAndMapping();
      log("[pairletters] redraw", {
        reason,
        lineText,
        twoLettersOnly,
        target: currentTarget,
        distractor: currentDistractor,
        targetCount,
        found: selectedTargets.size,
        unique: Array.from(new Set(cells))
      });
      await sendToBraille(lineText);
    }

    async function nextRound(token) {
      if (token !== playToken) return;

      selectionEpoch += 1;
      resetSelectionState();

      currentTarget = pickTarget();

      if (twoLettersOnly) {
        currentDistractor = pickDistractor(currentTarget);
        cells = buildCellsTwoLetter(currentTarget, currentDistractor, lineLenCells);

        log("[pairletters] twoletters round", {
          target: currentTarget,
          distractor: currentDistractor,
          targetCount,
          len: cells.length,
          unique: Array.from(new Set(cells))
        });
      } else {
        currentDistractor = "";
        cells = buildCellsMultiLetter(currentTarget, lineLenCells);
      }

      await redraw("new-round");
    }

    async function run(ctx, token) {
      ctxRecord = ctx?.record || {};
      const pools = computePools(ctxRecord);
      known = pools.knownLetters;
      fresh = pools.freshLetters;

      readConfigFromCtx(ctx);

      log("[pairletters] start run", {
        recordId: ctxRecord?.id,
        word: ctxRecord?.word,
        knownLetters: known,
        freshLetters: fresh,
        rounds: totalRounds,
        lineLen: lineLenCells,
        twoLettersOnly,
        targetCount
      });

      round = 0;
      while (round < totalRounds) {
        if (token !== playToken) return;

        await nextRound(token);
        await waitForRoundCompletion(token);

        round += 1;
      }

      if (token !== playToken) return;

      await flashMessage("klaar");
      stop({ reason: "done" });
    }

    function start(ctx) {
      stop({ reason: "restart" });
      ensureDonePromise();

      running = true;
      playToken += 1;
      const token = playToken;

      run(ctx, token).catch((err) => {
        log("[pairletters] error", { message: err?.message || String(err) });
        resolveDone({ ok: false, error: err?.message || String(err) });
      });

      return donePromise;
    }

    function stop(payload) {
      if (!running && !donePromise) return;

      running = false;
      playToken += 1;

      inputLocked = false;

      log("[pairletters] stop", payload || {});
      resolveDone({ ok: true, payload });
    }

    function isRunning() {
      return Boolean(running);
    }

    function normLetter(x) {
      const s = String(x ?? "").trim().toLowerCase();
      if (!s) return "";
      if (s === "é") return "";
      if (s.length !== 1) return "";
      if (s < "a" || s > "z") return "";
      return s;
    }

    async function handleMismatch(epochAtPick) {
      await flashMessage("fout");
      await sleep(FLIPBACK_MS);

      if (!running) return;
      if (epochAtPick !== selectionEpoch) return;

      // in collect-mode you start over within the same round
      resetSelectionState();
      await redraw("flipback");
    }

    async function handleMatch(epochAtPick) {
      await flashMessage("goed");
      if (!running) return;
      if (epochAtPick !== selectionEpoch) return;

      resolveRound();
    }

    // ------------------------------------------------------------
    // Input handling:
    // - twoletters:false => classic "pair" memory behaviour (2 picks, same letter)
    // - twoletters:true  => COLLECT targetCount occurrences of currentTarget
    // ------------------------------------------------------------
    function onCursor(info) {
      if (!running) return;
      if (inputLocked) return;

      const idx = toCellIndex(info?.index);
      if (idx == null) return;
      if (idx < 0 || idx >= cells.length) return;

      // ignore selecting already masked indices
      if (twoLettersOnly) {
        if (selectedTargets.has(idx)) return;
      } else {
        if (idx === firstIdx || idx === secondIdx) return;
      }

      const letter = normLetter(cells[idx]);
      if (!letter) return;

      // ----------------------------------------------------------
      // COLLECT MODE (twoletters:true)
      // ----------------------------------------------------------
      if (twoLettersOnly) {
        const epochAtPick = selectionEpoch;

        // wrong letter -> fail
        if (letter !== currentTarget) {
          inputLocked = true;
          handleMismatch(epochAtPick).catch(() => {});
          return;
        }

        // correct target -> mark it
        selectedTargets.add(idx);
        redraw("collect-target").catch(() => {});

        // finished?
        if (selectedTargets.size >= targetCount) {
          inputLocked = true;
          handleMatch(epochAtPick).catch(() => {});
        }

        return;
      }

      // ----------------------------------------------------------
      // PAIR MODE (twoletters:false) - keep old behaviour
      // ----------------------------------------------------------

      // Stage 0 -> first pick
      if (stage === 0) {
        firstIdx = idx;
        firstLetter = letter;
        secondIdx = null;
        secondLetter = "";
        stage = 1;

        redraw("pick-first").catch(() => {});
        return;
      }

      // Stage 1 -> second pick + compare
      if (stage === 1) {
        secondIdx = idx;
        secondLetter = letter;
        stage = 2;

        redraw("pick-second").catch(() => {});
        const epochAtPick = selectionEpoch;

        const sameLetter = (secondLetter === firstLetter);
        inputLocked = true;

        if (sameLetter) {
          handleMatch(epochAtPick).catch(() => {});
        } else {
          handleMismatch(epochAtPick).catch(() => {});
        }
      }
    }

    return { start, stop, isRunning, onCursor };
  }

  window.Activities = window.Activities || {};
  window.Activities.pairletters = create();
})();