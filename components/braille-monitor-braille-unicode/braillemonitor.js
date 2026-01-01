/*!
 * braillemonitor.js – Reusable Braille monitor + thumbkey component
 * -----------------------------------------------------------------
 * CHANGE (2026-01-01):
 * - Do NOT render Unicode braille (U+2800…)
 * - Render Braille ASCII (0x20–0x5F) so the Bartimeus6Dots webfont can draw 6-dot cells.
 * - Braille line is shown ABOVE each printed character (stacked cell).
 *
 * IMPORTANT:
 * - Your CSS must apply "Bartimeus6Dots" to .monitor-cell__braille
 * - The Bartimeus6Dots font is expected to map Braille ASCII characters to dots.
 */

(function (global) {
  "use strict";

  function makeId(base, suffix) {
    return base + "_" + suffix;
  }

  function toEventLogType(level) {
    const lv = (level || "info").toLowerCase();
    if (lv === "error") return "error";
    if (lv === "warn") return "system";
    if (lv === "debug") return "system";
    return "system";
  }

  // -------------------------------------------------------------------
  // Braille ASCII mapping (6-dot)
  // - Produces characters in the ASCII range 0x20..0x5F
  // - This is what most 6-dot "Braille ASCII" webfonts expect.
  // -------------------------------------------------------------------

  // Direct "letter" mapping to Braille ASCII (A..Z)
  // (In Braille ASCII, A..Z map to dot patterns for a..z)
  const BRAILLE_ASCII_LETTERS = {
    a: "A", b: "B", c: "C", d: "D", e: "E",
    f: "F", g: "G", h: "H", i: "I", j: "J",
    k: "K", l: "L", m: "M", n: "N", o: "O",
    p: "P", q: "Q", r: "R", s: "S", t: "T",
    u: "U", v: "V", w: "W", x: "X", y: "Y", z: "Z"
  };

  // Digits in braille are typically "number sign" + a-j patterns in literary braille.
  // Your monitor is CELL-based (1 char per cell). So we choose a pragmatic approach:
  // - Show the a-j pattern in the braille cell (1..0 => A..J)
  // - Show the printed digit below as usual.
  //
  // If you later want true number sign behavior across multiple cells,
  // do it in the upstream text pipeline (runner/activity), not here.
  const BRAILLE_ASCII_DIGITS = {
    "1": "A", "2": "B", "3": "C", "4": "D", "5": "E",
    "6": "F", "7": "G", "8": "H", "9": "I", "0": "J"
  };

  // Some useful punctuation (Braille ASCII)
  // Keep it modest: only map what you actually render often.
  // Unknown punctuation falls back to "full cell" (see fallback below).
  const BRAILLE_ASCII_PUNCT = {
    " ": " ",     // blank cell
    ".": "4",
    ",": "1",
    ";": "2",
    ":": "3",
    "?": "8",
    "!": "6",
    "-": "-",
    "'": "'",
    "\"": "7",
    "/": "/",
    "(": "(",     // often implemented as a specific pattern; leave as-is if your font supports it
    ")": ")"      // idem
  };

  // Braille ASCII "full cell" is often "?" or "_" depending on font;
  // but a very clear visual fallback is "=" (dot-123456 is not standard in 6-dot).
  // Pragmatic: use "?" because many braille-ascii fonts render it as a noticeable pattern.
  // If you know your Bartimeus font's preferred "unknown" glyph, change this.
  const BRAILLE_FALLBACK = "?";

  function toBrailleAsciiCell(ch) {
    if (ch == null) return " ";
    const s = String(ch);
    if (!s) return " ";

    // one character (cell-based)
    const c = s[0];

    // space / punctuation
    if (BRAILLE_ASCII_PUNCT[c]) return BRAILLE_ASCII_PUNCT[c];

    // digits
    if (BRAILLE_ASCII_DIGITS[c]) return BRAILLE_ASCII_DIGITS[c];

    // letters (case-insensitive)
    const lower = c.toLowerCase();
    if (BRAILLE_ASCII_LETTERS[lower]) {
      // For uppercase you could add a separate "capital" prefix cell in a real braille stream,
      // but this monitor is 1-cell-per-character, so just show the letter pattern.
      return BRAILLE_ASCII_LETTERS[lower];
    }

    // fallback
    return BRAILLE_FALLBACK;
  }

  const BrailleMonitor = {
    init(options) {
      const opts = Object.assign(
        {
          containerId: null,
          mapping: {},
          onCursorClick: null,
          showInfo: true,
          logger: null
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
        if (global.console && console.log) {
          console.log("[" + source + "] " + msg);
        }
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
        // Keep simple, valid JS (no HTML comments in JS files)
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

      // -------------------------------------------------------------------
      // Render two lines per cell:
      // - Braille (Braille ASCII) ABOVE
      // - Print character BELOW
      // -------------------------------------------------------------------
      function rebuildCells() {
        monitorP.innerHTML = "";

        if (!currentText) {
          monitorP.textContent = "(leeg)";
          return;
        }

        for (let i = 0; i < currentText.length; i++) {
          const ch = currentText[i] || " ";

          // Keep your visible-space marker for print line
          const printChar = ch === " " ? "␣" : ch;

          // Braille ASCII cell for braille line (font will render dots)
          const brailleCell = toBrailleAsciiCell(ch);

          const cell = document.createElement("span");
          cell.className = "monitor-cell monitor-cell--stack";
          cell.dataset.index = String(i);
          cell.setAttribute("role", "option");
          cell.setAttribute("aria-label", "Cel " + i + " teken " + ch);

          // Braille line FIRST (above)
          const brailleLine = document.createElement("span");
          brailleLine.className = "monitor-cell__braille";
          brailleLine.textContent = brailleCell;
          cell.appendChild(brailleLine);

          // Print line SECOND (below)
          const printLine = document.createElement("span");
          printLine.className = "monitor-cell__print";
          printLine.textContent = printChar;
          cell.appendChild(printLine);

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

        if (opts.logger && typeof opts.logger.log === "function") {
          opts.logger.log(
            `BrailleMonitor: Cursor routing index=${index} letter="${letter}" word="${word}"`,
            "routing"
          );
        } else {
          log(
            "BrailleMonitor",
            "UI cursor click index=" + index + ' letter="' + letter + '" word="' + word + '"',
            "info"
          );
        }

        if (typeof opts.onCursorClick === "function") {
          try {
            opts.onCursorClick({ index, letter, word });
          } catch (err) {
            log("BrailleMonitor", "Error in onCursorClick: " + (err && err.message), "error");
          }
        }
      }

      monitorP.addEventListener("click", handleCellClick);

      function invokeThumbAction(nameLower) {
        const fn = opts.mapping[nameLower];
        if (typeof fn === "function") {
          try {
            fn();
          } catch (err) {
            log(
              "BrailleMonitor",
              "Error in thumb mapping for " + nameLower + ": " + (err && err.message),
              "error"
            );
          }
        } else {
          log("BrailleMonitor", "No mapping for thumbkey: " + nameLower, "debug");
        }
      }

      function flashThumbButton(nameLower) {
        const selector =
          "#" + thumbRowId + ' .thumb-key[data-thumb="' + nameLower.toLowerCase() + '"]';
        const btn = document.querySelector(selector);
        if (!btn) return;
        btn.classList.add("active");
        setTimeout(() => btn.classList.remove("active"), 150);
      }

      thumbRow.querySelectorAll(".thumb-key").forEach((btn) => {
        const nameLower = (btn.dataset.thumb || "").toLowerCase();
        btn.addEventListener("click", () => {
          if (opts.logger && typeof opts.logger.log === "function") {
            opts.logger.log(`BrailleMonitor: Thumbkey (sim) ${nameLower}`, "key");
          }
          invokeThumbAction(nameLower);
          flashThumbButton(nameLower);
        });
      });

      if (global.BrailleBridge && typeof global.BrailleBridge.on === "function") {
        global.BrailleBridge.on("thumbkey", (evt) => {
          const nameLower = (evt.nameLower || "").toLowerCase();

          if (opts.logger && typeof opts.logger.log === "function") {
            opts.logger.log(`BrailleBridge: Thumbkey ${nameLower}`, "key");
          } else {
            log("BrailleBridge", "Thumbkey event: " + nameLower, "info");
          }

          flashThumbButton(nameLower);
          invokeThumbAction(nameLower);
        });
      } else {
        log("BrailleMonitor", "BrailleBridge not available; cannot listen to thumbkeys", "warn");
      }

      function setText(text) {
        currentText = text != null ? String(text) : "";
        rebuildCells();

        if (opts.logger && typeof opts.logger.log === "function") {
          opts.logger.log(`BrailleMonitor: setText (${currentText.length} chars)`, "system");
        }
      }

      function clear() {
        setText("");
      }

      setText("");

      return {
        monitorId,
        thumbRowId,
        containerId: baseId,
        setText,
        clear
      };
    }
  };

  global.BrailleMonitor = BrailleMonitor;
})(window);