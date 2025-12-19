/*!
 * braillemonitor.js – Reusable Braille monitor + thumbkey component
 * -----------------------------------------------------------------
 * CHANGE: Adds Unicode braille (⠁⠃⠉…) ABOVE each printed character.
 *
 * Requires a small CSS tweak (see comment near the bottom).
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
  // NEW: Basic Unicode braille mapping for common characters
  // -------------------------------------------------------------------
  const BRAILLE_MAP = {
    // letters (Grade 1)
    a: "⠁", b: "⠃", c: "⠉", d: "⠙", e: "⠑",
    f: "⠋", g: "⠛", h: "⠓", i: "⠊", j: "⠚",
    k: "⠅", l: "⠇", m: "⠍", n: "⠝", o: "⠕",
    p: "⠏", q: "⠟", r: "⠗", s: "⠎", t: "⠞",
    u: "⠥", v: "⠧", w: "⠺", x: "⠭", y: "⠽", z: "⠵",

    // digits (1-0 use a-j patterns; typically preceded by number sign ⠼)
    "1": "⠼⠁", "2": "⠼⠃", "3": "⠼⠉", "4": "⠼⠙", "5": "⠼⠑",
    "6": "⠼⠋", "7": "⠼⠛", "8": "⠼⠓", "9": "⠼⠊", "0": "⠼⠚",

    // space + a few punctuation marks
    " ": "⠀",           // U+2800 blank braille
    ".": "⠲",
    ",": "⠂",
    ";": "⠆",
    ":": "⠒",
    "?": "⠦",
    "!": "⠖",
    "-": "⠤",
    "'": "⠄",
    "\"": "⠶",
    "(": "⠐⠣",
    ")": "⠐⠜",
    "/": "⠌"
  };

  function toBrailleUnicode(ch) {
    if (ch == null) return "⠀";
    const s = String(ch);
    if (!s) return "⠀";

    // keep one character (your monitor is cell-based)
    const c = s[0];

    // direct map
    if (BRAILLE_MAP[c]) return BRAILLE_MAP[c];

    // letters case-insensitive
    const lower = c.toLowerCase();
    if (BRAILLE_MAP[lower]) {
      // If you want an uppercase prefix, you can use "⠠" + letter
      // return (c !== lower ? "⠠" : "") + BRAILLE_MAP[lower];
      return BRAILLE_MAP[lower];
    }

    // fallback: unknown -> full cell (visually obvious)
    return "⣿";
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
        { key: "leftthumb", label: "⟵ Left" },
        { key: "middleleftthumb", label: "⟵ Mid-Left" },
        { key: "middlerightthumb", label: "Mid-Right ⟶" },
        { key: "rightthumb", label: "Right ⟶" }
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
        info.textContent =
          "Deze monitor toont 1-op-1 de tekst op de brailleleesregel. " +
          "Klik op een cel om een cursorrouting te simuleren. " +
          "De knoppen bootsen de duimtoetsen na en lichten op bij echte duimtoetsen.";
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
  // UPDATED: Render two lines per cell: print above, braille below
  // -------------------------------------------------------------------
      function rebuildCells() {
        monitorP.innerHTML = "";

        if (!currentText) {
          monitorP.textContent = "(leeg)";
          return;
        }

        for (let i = 0; i < currentText.length; i++) {
          const ch = currentText[i] || " ";
          const printChar = ch === " " ? "␣" : ch;
          const brailleChar = toBrailleUnicode(ch);

          const cell = document.createElement("span");
          cell.className = "monitor-cell monitor-cell--stack"; // <-- new helper class
          cell.dataset.index = String(i);
          cell.setAttribute("role", "option");
          cell.setAttribute("aria-label", "Cel " + i + " teken " + ch);

          const printLine = document.createElement("span");
          printLine.className = "monitor-cell__print";
          printLine.textContent = printChar;

          cell.appendChild(printLine);
          const brailleLine = document.createElement("span");
          brailleLine.className = "monitor-cell__braille";
          brailleLine.textContent = brailleChar;
          cell.appendChild(brailleLine);

          monitorP.appendChild(cell);
        }
      }

      function handleCellClick(event) {
        const target = event.target;
        if (!target) return;

        // Click might be on inner spans; walk up to the cell
        const cell = target.classList && target.classList.contains("monitor-cell")
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
            log("BrailleMonitor", "Error in thumb mapping for " + nameLower + ": " + (err && err.message), "error");
          }
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

/*
CSS you should add (example):

.monitor-cell--stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.05;
  padding: 0.1rem 0.15rem;
}

.monitor-cell__braille {
  font-size: 0.95em;
  opacity: 0.85;
}

.monitor-cell__print {
  font-size: 0.95em;
}
*/
