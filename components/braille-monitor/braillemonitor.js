/*!
 * /components/braille-monitor/braillemonitor.js
 * -----------------------------------------------------------------
 * UNICODE BRAILLE MONITOR (no Bartimeus6Dots)
 *
 * Key design:
 * - Keep 1 UI cell per PRINT character (cursor routing stable).
 * - Braille shown in the top line can be 1 or 2 unicode braille chars:
 *     b  -> ⠃
 *     B  -> ⠠⠃ (capital sign + ⠃)
 *     1  -> ⠼⠁ (number sign + ⠁)  [only at start of digit run]
 * - Space:
 *     print line shows ␣
 *     braille line shows U+2800 blank (⠀)
 *
 * Optional external translator hook:
 *   window.Braille.textToBrailleCells(text, { lang }) -> Array<string>
 * Must return array with SAME LENGTH as `text`.
 *
 * HARDENING:
 * - Even if translator forgets capital/number signs, we add them here so UI is correct.
 *
 * ADDED IN THIS VERSION:
 * - setLang(lang): switch language after init and re-render (safe for Settings page)
 */

(function (global) {
  "use strict";

  function makeId(base, suffix) { return base + "_" + suffix; }

  function toEventLogType(level) {
    const lv = (level || "info").toLowerCase();
    if (lv === "error") return "error";
    if (lv === "warn") return "system";
    if (lv === "debug") return "system";
    return "system";
  }

  // UI markers
  const VISIBLE_SPACE = "␣";
  const BRAILLE_BLANK = "⠀";       // U+2800
  const BRAILLE_UNKNOWN = "⣿";     // visible fallback

  // Signs
  const SIGN_CAPITAL = "⠠";        // dot 6
  const SIGN_NUMBER  = "⠼";        // 3456

  // Letters a-z (basic)
  const BRAILLE_LETTERS = {
    a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑",
    f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚",
    k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕",
    p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞",
    u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵"
  };

  // Digits 1-0 map to a-j after number sign
  const BRAILLE_DIGITS = {
    "1": "⠁", "2": "⠃", "3": "⠉", "4": "⠙", "5": "⠑",
    "6": "⠋", "7": "⠛", "8": "⠓", "9": "⠊", "0": "⠚"
  };

  // Punctuation (basic; refine later if needed)
  const BRAILLE_PUNCT = {
    " ": BRAILLE_BLANK,
    ".": "⠲",
    ",": "⠂",
    ";": "⠆",
    ":": "⠒",
    "?": "⠦",
    "!": "⠖",
    "-": "⠤",
    "'": "⠄",
    "\"": "⠶",
    "/": "⠌",
    "(": "⠐⠣",
    ")": "⠐⠜"
  };

  function visiblePrintChar(ch) {
    return ch === " " ? VISIBLE_SPACE : ch;
  }

  function isAsciiDigit(ch) {
    return ch >= "0" && ch <= "9";
  }

  function isAsciiLetter(ch) {
    const s = String(ch || "");
    if (!s) return false;
    const lower = s.toLowerCase();
    return lower >= "a" && lower <= "z";
  }

  /**
   * Default per-character braille cell generator (returns 1..2 braille unicode chars)
   * NOTE: For digits, this returns number sign per digit. We'll normalize digit-runs later.
   */
  function defaultCellForChar(ch) {
    const c = String(ch ?? "");
    if (!c) return BRAILLE_BLANK;

    // punctuation incl. space
    if (Object.prototype.hasOwnProperty.call(BRAILLE_PUNCT, c)) return BRAILLE_PUNCT[c];

    // digit -> number sign + a-j
    if (Object.prototype.hasOwnProperty.call(BRAILLE_DIGITS, c)) return SIGN_NUMBER + BRAILLE_DIGITS[c];

    // letter
    const lower = c.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(BRAILLE_LETTERS, lower)) {
      const letterCell = BRAILLE_LETTERS[lower];
      // uppercase -> capital sign + letter
      if (c !== lower) return SIGN_CAPITAL + letterCell;
      return letterCell;
    }

    return BRAILLE_UNKNOWN;
  }

  /**
   * Normalize translator output:
   * - Ensure array length matches text length
   * - Ensure space => BRAILLE_BLANK
   * - Ensure uppercase => has SIGN_CAPITAL prefix
   * - Ensure digit runs => SIGN_NUMBER only at start of run
   */
  function coerceCells(text, cells) {
    const raw = String(text ?? "");
    const out = new Array(raw.length);

    let inNumberRun = false;

    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i] ?? " ";
      let cell = (cells && cells[i] != null) ? String(cells[i]) : "";

      if (!cell) cell = BRAILLE_BLANK;

      // SPACE always blank cell
      if (ch === " ") {
        out[i] = BRAILLE_BLANK;
        inNumberRun = false;
        continue;
      }

      // DIGITS: enforce number sign only at start of run
      if (isAsciiDigit(ch)) {
        const digitCell = BRAILLE_DIGITS[ch] || BRAILLE_UNKNOWN;

        if (!inNumberRun) {
          cell = SIGN_NUMBER + digitCell;
          inNumberRun = true;
        } else {
          cell = digitCell; // no ⠼ inside run
        }

        out[i] = cell;
        continue;
      } else {
        inNumberRun = false;
      }

      // PUNCTUATION
      if (Object.prototype.hasOwnProperty.call(BRAILLE_PUNCT, ch)) {
        out[i] = BRAILLE_PUNCT[ch];
        continue;
      }

      // LETTERS (ASCII a-z only here)
      const lower = String(ch).toLowerCase();
      if (isAsciiLetter(lower) && Object.prototype.hasOwnProperty.call(BRAILLE_LETTERS, lower)) {
        const baseLetter = BRAILLE_LETTERS[lower];
        const isUpper = ch !== lower;

        if (isUpper) out[i] = SIGN_CAPITAL + baseLetter;
        else out[i] = baseLetter;

        continue;
      }

      // Unknown char fallback
      out[i] = cell || BRAILLE_UNKNOWN;
    }

    return out;
  }

  /**
   * Translate to an array of per-print-character braille cells (each cell is a string).
   * External hook must return Array<string> of same length as text.
   */
  function textToBrailleCells(text, { lang } = {}) {
    const raw = String(text ?? "");
    let cells = null;

    // Optional external translator hook
    if (global.Braille && typeof global.Braille.textToBrailleCells === "function") {
      try {
        const out = global.Braille.textToBrailleCells(raw, { lang });
        if (Array.isArray(out) && out.length === raw.length) {
          cells = out.map(x => (x == null ? "" : String(x)));
        }
      } catch {
        // ignore and fall back
      }
    }

    // If no translator output, use default mapping
    if (!cells) {
      cells = new Array(raw.length);
      for (let i = 0; i < raw.length; i++) cells[i] = defaultCellForChar(raw[i]);
    }

    // Always coerce (fix missing capital/number signs, normalize spaces)
    return coerceCells(raw, cells);
  }

  const BrailleMonitor = {
    init(options) {
      const opts = Object.assign(
        {
          containerId: null,
          mapping: {},
          onCursorClick: null,
          showInfo: true,
          logger: null,
          lang: null
        },
        options || {}
      );

      function log(source, msg, level) {
        if (opts.logger && typeof opts.logger.log === "function") {
          const type = toEventLogType(level);
          opts.logger.log(`${source}: ${msg}`, type);
          return;
        }
        if (global.Logging) {
          const fn =
            level === "error"
              ? Logging.error
              : level === "warn"
              ? Logging.warn
              : level === "debug"
              ? Logging.debug
              : Logging.info;
          fn.call(Logging, source, msg);
          return;
        }
        if (global.console && console.log) console.log("[" + source + "] " + msg);
      }

      if (!opts.containerId) {
        log("BrailleMonitor", "containerId is required", "error");
        return null;
      }

      const container = document.getElementById(opts.containerId);
      if (!container) {
        log("BrailleMonitor", "No element with id '" + opts.containerId + "'", "error");
        return null;
      }

      const baseId = opts.containerId;
      const monitorId = makeId(baseId, "monitor");
      const thumbRowId = makeId(baseId, "thumbRow");

      let currentText = "";
      let currentLang = opts.lang ? String(opts.lang) : null;

      const wrapper = document.createElement("div");
      wrapper.className = "braille-monitor-component";

      const monitorP = document.createElement("div");
      monitorP.id = monitorId;
      monitorP.className = "mono-box braille-monitor-cells";
      monitorP.setAttribute("role", "listbox");
      monitorP.setAttribute("aria-label", "Braillemonitor");

      const thumbRow = document.createElement("div");
      thumbRow.id = thumbRowId;
      thumbRow.className = "button-row thumb-row";

      const thumbDefs = [
        { key: "leftthumb", label: "•" },
        { key: "middleleftthumb", label: "••" },
        { key: "middlerightthumb", label: "••" },
        { key: "rightthumb", label: "•" }
      ];

      thumbDefs.forEach((def) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "thumb-key";
        btn.dataset.thumb = def.key;
        btn.textContent = def.label;
        thumbRow.appendChild(btn);
      });

      wrapper.appendChild(monitorP);
      wrapper.appendChild(thumbRow);

      if (opts.showInfo) {
        const info = document.createElement("p");
        info.className = "small";
        info.textContent = "";
        wrapper.appendChild(info);
      }

      container.innerHTML = "";
      container.appendChild(wrapper);

      function computeWordAt(index) {
        if (!currentText) return "";
        const len = currentText.length;
        if (index < 0 || index >= len) return "";

        let start = index;
        let end = index;
        while (start > 0 && currentText[start - 1] !== " ") start--;
        while (end < len - 1 && currentText[end + 1] !== " ") end++;
        return currentText.substring(start, end + 1).trim();
      }

      function rebuildCells() {
        monitorP.innerHTML = "";

        if (!currentText) {
          monitorP.textContent = "(leeg)";
          return;
        }

        const brailleCells = textToBrailleCells(currentText, { lang: currentLang });

        for (let i = 0; i < currentText.length; i++) {
          const ch = currentText[i] || " ";
          const printChar = visiblePrintChar(ch);
          const brailleCell = brailleCells[i] || BRAILLE_BLANK;

          const cell = document.createElement("span");
          cell.className = "monitor-cell monitor-cell--stack";
          cell.dataset.index = String(i);
          cell.setAttribute("role", "option");
          cell.setAttribute("aria-label", "Cel " + i + " teken " + ch);

          const brailleEl = document.createElement("span");
          brailleEl.className = "monitor-cell__braille";
          brailleEl.textContent = brailleCell; // 1..2 unicode braille chars
          cell.appendChild(brailleEl);

          const printEl = document.createElement("span");
          printEl.className = "monitor-cell__print";
          printEl.textContent = printChar;
          cell.appendChild(printEl);

          monitorP.appendChild(cell);
        }
      }

      function handleCellClick(event) {
        const target = event.target;
        if (!target) return;

        const cell =
          target.classList && target.classList.contains("monitor-cell")
            ? target
            : target.closest
            ? target.closest(".monitor-cell")
            : null;

        if (!cell) return;

        const index = parseInt(cell.dataset.index, 10);
        if (isNaN(index)) return;

        const letter = currentText[index] || " ";
        const word = computeWordAt(index);

        log("BrailleMonitor", "UI cursor click index=" + index + ' letter="' + letter + '" word="' + word + '"', "info");

        if (typeof opts.onCursorClick === "function") {
          try { opts.onCursorClick({ index, letter, word }); }
          catch (err) { log("BrailleMonitor", "Error in onCursorClick: " + (err && err.message), "error"); }
        }
      }

      monitorP.addEventListener("click", handleCellClick);

      function invokeThumbAction(nameLower) {
        const fn = opts.mapping[nameLower];
        if (typeof fn === "function") {
          try { fn(); }
          catch (err) { log("BrailleMonitor", "Error in thumb mapping for " + nameLower + ": " + (err && err.message), "error"); }
        } else {
          log("BrailleMonitor", "No mapping for thumbkey: " + nameLower, "debug");
        }
      }

      function flashThumbButton(nameLower) {
        const selector = "#" + thumbRowId + ' .thumb-key[data-thumb="' + nameLower.toLowerCase() + '"]';
        const btn = document.querySelector(selector);
        if (!btn) return;
        btn.classList.add("active");
        setTimeout(() => btn.classList.remove("active"), 150);
      }

      thumbRow.querySelectorAll(".thumb-key").forEach((btn) => {
        const nameLower = (btn.dataset.thumb || "").toLowerCase();
        btn.addEventListener("click", () => {
          invokeThumbAction(nameLower);
          flashThumbButton(nameLower);
        });
      });

      if (global.BrailleBridge && typeof global.BrailleBridge.on === "function") {
        global.BrailleBridge.on("thumbkey", (evt) => {
          const nameLower = (evt.nameLower || "").toLowerCase();
          flashThumbButton(nameLower);
          invokeThumbAction(nameLower);
        });
      }

      function setText(text) {
        currentText = text != null ? String(text) : "";
        rebuildCells();
      }

      function clear() { setText(""); }

      function setLang(lang) {
        currentLang = lang ? String(lang) : null;
        rebuildCells();
      }

      setText("");

      return { monitorId, thumbRowId, containerId: baseId, setText, clear, setLang };
    }
  };

  global.BrailleMonitor = BrailleMonitor;
})(window);