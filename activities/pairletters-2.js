// /activities/pairletters.js
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

  const DEFAULT_ROUNDS = 5;
  const DEFAULT_LINE_LEN = 18; // number of CELLS

  // Tunables (separate concerns)
  const FEEDBACK_MS = 300;  // how long "goed/fout/klaar" is shown
  const FLIPBACK_MS = 650;  // how long the 2 open cards remain visible before flipping back

  function create() {
    let running = false;

    let donePromise = null;
    let doneResolve = null;

    // run config
    let round = 0;
    let totalRounds = DEFAULT_ROUNDS;
    let lineLenCells = DEFAULT_LINE_LEN;

    // round state
    let cells = [];      // letters per cell index 0..cells.length-1
    let lineText = "";   // rendered as "a b c ..."
    let known = [];
    let fresh = [];

    // memory selection state
    // stage 0: none selected
    // stage 1: first selected
    // stage 2: second selected (waiting for eval/flipback/next)
    let stage = 0;
    let firstIdx = null;
    let firstLetter = "";
    let secondIdx = null;
    let secondLetter = "";

    // mapping support
    let cellCharStarts = [];

    // control / safety
    let playToken = 0;
    let roundDoneResolve = null;
    let inputLocked = false;
    let selectionEpoch = 0;

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
    // Utility
    // ------------------------------------------------------------
    function uniqLetters(arr) {
      const out = [];
      const seen = new Set();
      for (const x of (Array.isArray(arr) ? arr : [])) {
        const s = String(x || "").trim().toLowerCase();
        if (!s) continue;
        if (s.length !== 1) continue;
        if (seen.has(s)) continue;
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

    function readConfigFromCtx(ctx) {
      const a = ctx?.activity || {};
      totalRounds = clampInt(a.nrof ?? a.nrOf ?? a.nRounds, 1, 200, DEFAULT_ROUNDS);
      lineLenCells = clampInt(a.lineLen ?? a.lineLength ?? a.len, 2, 40, DEFAULT_LINE_LEN);
      log("[pairletters] config", { totalRounds, lineLen: lineLenCells });
    }

    function pickTarget() {
      if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
      if (known.length) return known[Math.floor(Math.random() * known.length)];
      return "a";
    }

    function buildCells(targetLetter, requestedLenCells) {
      // IMPORTANT: only from knownLetters + new letters (fresh)
      const poolAll = uniqLetters([...(known || []), ...(fresh || [])]);
      const candidates = poolAll.filter(ch => ch && ch !== targetLetter);

      const maxLenPossible = candidates.length + 2; // target twice + all others unique
      let len = clampInt(requestedLenCells, 2, 40, DEFAULT_LINE_LEN);

      if (len > maxLenPossible) {
        log("[pairletters] warning: lineLen reduced (pool too small)", {
          requested: len,
          maxPossible: maxLenPossible,
          pool: poolAll.join(""),
          target: targetLetter
        });
        len = maxLenPossible;
      }
      len = Math.max(2, len);

      const pos1 = Math.floor(Math.random() * len);
      let pos2 = Math.floor(Math.random() * len);
      while (pos2 === pos1) pos2 = Math.floor(Math.random() * len);

      const arr = new Array(len).fill("x");
      arr[pos1] = targetLetter;
      arr[pos2] = targetLetter;

      // shuffle candidates
      const available = candidates.slice();
      for (let i = available.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = available[i];
        available[i] = available[j];
        available[j] = tmp;
      }

      let takeIdx = 0;
      for (let i = 0; i < len; i++) {
        if (i === pos1 || i === pos2) continue;
        arr[i] = available[takeIdx++] || targetLetter; // should not happen due to reduction
      }

      return arr;
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

        const shown = (i === firstIdx || i === secondIdx) ? "é" : (cells[i] || " ");
        parts.push(shown);
        charPos += 1;
      }

      lineText = parts.join("");
      return lineText;
    }

    // ------------------------------------------------------------
    // Index mapping:
    // Prefer char-index mapping (monitor returns indices in lineText space)
    // IMPORTANT FIX: selecting a SPACE must result in NO ACTION.
    // ------------------------------------------------------------
    function toCellIndex(rawIndex) {
      if (rawIndex == null) return null;
      const idx = Number(rawIndex);
      if (!Number.isFinite(idx)) return null;
      const i = Math.floor(idx);

      if (!cells || !cells.length) return null;

      // 1) Prefer char-index if inside lineText
      if (lineText && i >= 0 && i < lineText.length) {
        // If cursor is on a space between letters: ignore completely.
        if (lineText[i] === " ") return null;

        let best = 0;
        for (let k = 0; k < cellCharStarts.length; k++) {
          if (cellCharStarts[k] <= i) best = k;
          else break;
        }
        if (best >= 0 && best < cells.length) return best;
      }

      // 2) Fallback: treat as cell-index
      if (i >= 0 && i < cells.length) return i;

      return null;
    }

    function sleep(ms) {
      return new Promise(r => setTimeout(r, ms));
    }

    function sendToBraille(text) {
      const t = String(text || "");

      // preferred: through BrailleUI pipeline (if present)
      if (window.BrailleUI && typeof window.BrailleUI.setLine === "function") {
        window.BrailleUI.setLine(t, { reason: "pairletters" });
        return Promise.resolve();
      }

      // fallback: direct bridge
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
      stage = 0;
      firstIdx = null;
      firstLetter = "";
      secondIdx = null;
      secondLetter = "";
    }

    async function redraw(reason) {
      renderLineAndMapping();
      log("[pairletters] redraw", {
        reason,
        stage,
        firstIdx,
        firstLetter,
        secondIdx,
        secondLetter,
        lineText
      });
      await sendToBraille(lineText);
    }

    async function nextRound(token) {
      if (token !== playToken) return;

      selectionEpoch += 1;
      inputLocked = false;

      resetSelectionState();

      const target = pickTarget();
      cells = buildCells(target, lineLenCells);

      await redraw("new-round");

      log("[pairletters] round start", {
        round: round + 1,
        totalRounds,
        lineLenRequested: lineLenCells,
        lineLenEffective: cells.length,
        epoch: selectionEpoch
      });
    }

    async function run(ctx, token) {
      const rec = ctx?.record || {};
      const { knownLetters, freshLetters } = computePools(rec);
      known = knownLetters;
      fresh = freshLetters;

      readConfigFromCtx(ctx);

      log("[pairletters] start run", {
        recordId: rec?.id,
        word: rec?.word,
        knownLetters: known,
        freshLetters: fresh,
        rounds: totalRounds,
        lineLen: lineLenCells
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

    // ------------------------------------------------------------
    // Cursor selection: robust against inconsistent (index, letter) from monitor
    // ------------------------------------------------------------
    function normLetter(x) {
      const s = String(x ?? "").trim().toLowerCase();
      if (!s) return "";
      if (s === "é") return "";
      if (s.length !== 1) return "";
      if (s < "a" || s > "z") return "";
      return s;
    }

    function findNearestIndexWithLetter(letter, aroundIdx, excludeIdxSet) {
      if (!letter) return null;
      let bestIdx = null;
      let bestDist = Infinity;

      for (let i = 0; i < cells.length; i++) {
        if (excludeIdxSet && excludeIdxSet.has(i)) continue;
        if (cells[i] !== letter) continue;

        const d = Math.abs(i - aroundIdx);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    async function handleMismatch(epochAtPick) {
      // show feedback briefly
      await flashMessage("fout");

      // keep the two selected visible for a moment (cards "open")
      await sleep(FLIPBACK_MS);

      // If a new round started or activity stopped, do nothing
      if (!running) return;
      if (epochAtPick !== selectionEpoch) return;

      // flip back
      resetSelectionState();
      await redraw("flipback");
      inputLocked = false;
    }

    async function handleMatch(epochAtPick) {
      await flashMessage("goed");
      if (!running) return;
      if (epochAtPick !== selectionEpoch) return;

      // proceed to next line
      resolveRound();
    }

    function onCursor(info) {
      if (!running) return;
      if (inputLocked) return;

      const rawIdx = info?.index;

      // 1) map raw index -> cell index
      let idx = toCellIndex(rawIdx);
      if (idx == null) return; // includes: cursor on SPACE -> no action
      if (idx < 0 || idx >= cells.length) return;

      // 2) compare mapped cell letter with monitor-provided letter (if any)
      const mappedLetter = normLetter(cells[idx]);
      const providedLetter = normLetter(info?.letter);

      if (providedLetter && providedLetter !== mappedLetter) {
        const exclude = new Set();
        if (firstIdx != null) exclude.add(firstIdx);
        if (secondIdx != null) exclude.add(secondIdx);

        const corrected = findNearestIndexWithLetter(providedLetter, idx, exclude);

        log("[pairletters] cursor adjust", {
          rawIdx,
          providedLetter,
          mappedIdx: idx,
          mappedLetter,
          correctedIdx: corrected,
          correctedLetter: corrected != null ? cells[corrected] : null,
          lineText,
          cellCharStarts
        });

        if (corrected == null) return;
        idx = corrected;
      } else {
        log("[pairletters] cursor", {
          rawIdx,
          providedLetter: providedLetter || null,
          mappedIdx: idx,
          mappedLetter,
          lineText,
          cellCharStarts
        });
      }

      const letter = normLetter(cells[idx]);
      if (!letter) return;

      // ignore selecting same open card again
      if (idx === firstIdx || idx === secondIdx) return;

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
        const isMatch = (secondLetter === firstLetter);

        inputLocked = true;

        if (isMatch) {
          // do not flip back; just advance
          handleMatch(epochAtPick).catch(() => {});
          return;
        }

        // mismatch: show feedback, wait, flip back, unlock
        handleMismatch(epochAtPick).catch(() => {});
        return;
      }

      // Stage 2: waiting; ignore
    }

    return { start, stop, isRunning, onCursor };
  }

  window.Activities = window.Activities || {};
  window.Activities.pairletters = create();
})();