/*!
 * BrailleUI v2 – Higher-level layer on top of BrailleBridge
 * ---------------------------------------------------------
 * Responsibilities:
 *  - Maintain an internal model of the current braille line (1:1 with display)
 *  - Be the ONLY place that sends text to BrailleBridge
 *  - Provide helper functions:
 *        getCurrentLine()
 *        getCharAt(index)
 *        getWordAt(index)
 *        setText(...)
 *        setTokens([...])
 *        repeatLine()
 *        clear()
 *  - Page (multi-line) helpers:
 *        setPageLines([...])
 *        setPageText(text, options?)
 *        nextLine(), prevLine(), gotoLine(idx), getPageInfo()
 *  - Expose events based on cursor routing:
 *        "lineChanged", "cursor", "cursorChar", "cursorWord"
 *        (now all include lineIndex + column)
 *  - Optional: attach a "monitor" DOM element that always mirrors the line
 *
 * Dependencies:
 *  - braillebridge.js must be loaded first (global.BrailleBridge)
 */

(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // SIMPLE EVENT EMITTER
  // ---------------------------------------------------------------------------
  class Emitter {
    constructor() {
      this._handlers = new Map();
    }

    on(eventName, handler) {
      if (!this._handlers.has(eventName)) {
        this._handlers.set(eventName, new Set());
      }
      this._handlers.get(eventName).add(handler);
      return () => this.off(eventName, handler);
    }

    off(eventName, handler) {
      const set = this._handlers.get(eventName);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        this._handlers.delete(eventName);
      }
    }

    emit(eventName, payload) {
      const set = this._handlers.get(eventName);
      if (!set) return;
      for (const fn of set) {
        try {
          fn(payload);
        } catch (err) {
          console.error("[BrailleUI] handler error for", eventName, err);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // BRAILLE UI CORE
  // ---------------------------------------------------------------------------
  const DEFAULT_OPTIONS = {
    displayCells: 40,           // must match device / BrailleBridge config
    padToCells: true,           // pad with spaces to displayCells
    wordSeparators: /\s+/,      // used for fallback word detection
    bridge: null,               // BrailleBridge instance (default: global.BrailleBridge)
    autoAttachCursor: true,     // automatically listen to BrailleBridge "cursor"
    debug: false                // BrailleUI internal debug logging
  };

  class BrailleUIClass extends Emitter {
    constructor(options = {}) {
      super();

      this._options = { ...DEFAULT_OPTIONS, ...options };
      this._bridge = this._options.bridge || global.BrailleBridge || null;

      if (!this._bridge) {
        throw new Error("BrailleUI: No BrailleBridge instance found. Load braillebridge.js first.");
      }

      // Internal state
      this._line = "";              // full padded line (length = displayCells)
      this._indexToToken = {};      // index → token (if setTokens used)
      this._monitorEl = null;       // DOM element for visual monitor

      // Page state
      this._pageLines = null;       // array of strings (padded)
      this._currentLineIdx = 0;     // index into _pageLines

      this._cursorSubscription = null;

      if (this._options.autoAttachCursor) {
        this._attachToBridgeCursor();
      }
    }

    // -----------------------------------------------------------------------
    // PRIVATE HELPERS
    // -----------------------------------------------------------------------
    _logDebug(...args) {
      if (!this._options.debug) return;
      const msg = args.map(a => String(a)).join(" ");

      if (global.BrailleLog && typeof global.BrailleLog.log === "function") {
        global.BrailleLog.log("BrailleUI", msg);
      } else if (typeof console !== "undefined" && console.log) {
        console.log("[BrailleUI]", ...args);
      }
    }

    _attachToBridgeCursor() {
      if (!this._bridge || !this._bridge.on) return;
      if (this._cursorSubscription) return; // already attached

      this._cursorSubscription = this._bridge.on("cursor", (evt) => {
        const idx = evt.index;
        const char = this.getCharAt(idx);
        const wordInfo = this.getWordAt(idx, { withBounds: true });

        const lineIndex = this._pageLines ? this._currentLineIdx : 0;
        const column = idx;

        const basePayload = {
          index: idx,        // backwards compatible
          column,
          lineIndex,
          char: char,
          word: wordInfo ? wordInfo.word : null,
          start: wordInfo ? wordInfo.start : null,
          end: wordInfo ? wordInfo.end : null,
          raw: evt
        };

        // Generic cursor event
        this.emit("cursor", basePayload);

        // More specific events
        this.emit("cursorChar", {
          index: idx,
          column,
          lineIndex,
          char: char,
          raw: evt
        });

        if (wordInfo) {
          this.emit("cursorWord", {
            index: idx,
            column,
            lineIndex,
            word: wordInfo.word,
            start: wordInfo.start,
            end: wordInfo.end,
            raw: evt
          });
        }
      });
    }

_updateMonitor() {
  if (!this._monitorEl) return;

  // Laat de volledige interne braille-regel zien, 1:1 met de display.
  // Als er nog niets is, toon "(leeg)".
  const visible = (this._line && this._line.length > 0) ? this._line : "(leeg)";

  this._monitorEl.textContent = visible;
}

    _buildLineFromTokens(tokens) {
      const cells = this._options.displayCells;
      let line = "";
      const map = {}; // cursorIndex → token

      for (const t of tokens) {
        const token = String(t);
        const toAdd = (line.length === 0) ? token : " " + token;

        if (line.length + toAdd.length > cells) {
          break;
        }

        const startIndex = line.length + (line.length === 0 ? 0 : 1);
        line += toAdd;

        // Map every non-space character of this token
        for (let i = 0; i < token.length; i++) {
          map[startIndex + i] = token;
        }
      }

      if (line.length < cells && this._options.padToCells) {
        line = line.padEnd(cells, " ");
      } else if (line.length > cells) {
        line = line.substring(0, cells);
      }

      return { line, map };
    }

    _normalizeLine(line) {
      const cells = this._options.displayCells;
      let padded = String(line || "");
      if (this._options.padToCells) {
        padded = padded.padEnd(cells, " ").substring(0, cells);
      } else if (padded.length > cells) {
        padded = padded.substring(0, cells);
      }
      return padded;
    }

    _setLineInternal(line, indexToToken = null) {
      this._line = this._normalizeLine(line);
      this._indexToToken = indexToToken || {};

      this._logDebug("New line set:", this._line);

      this._updateMonitor();
      this.emit("lineChanged", {
        line: this._line,
        lineIndex: this._pageLines ? this._currentLineIdx : 0
      });
    }

    // Simple word-wrap for page text
    _wrapTextToLines(text, cells) {
      const words = String(text || "").split(/\s+/);
      const lines = [];
      let current = "";

      for (const w of words) {
        if (!w) continue;
        if (current.length === 0) {
          // first word
          if (w.length > cells) {
            // hard cut
            lines.push(w.substring(0, cells));
          } else {
            current = w;
          }
        } else {
          const candidate = current + " " + w;
          if (candidate.length <= cells) {
            current = candidate;
          } else {
            lines.push(current);
            if (w.length > cells) {
              lines.push(w.substring(0, cells));
              current = "";
            } else {
              current = w;
            }
          }
        }
      }
      if (current.length > 0) lines.push(current);

      return lines;
    }

    // -----------------------------------------------------------------------
    // PUBLIC API – INITIALISATION / CONFIG
    // -----------------------------------------------------------------------
    setOptions(partial) {
      this._options = { ...this._options, ...partial };
      if (typeof partial.displayCells === "number") {
        // Re-apply padding with new cell count
        this._setLineInternal(this._line, this._indexToToken);

        // Re-normalise page lines if any
        if (this._pageLines) {
          this._pageLines = this._pageLines.map(line => this._normalizeLine(line));
        }
      }
    }

    getOptions() {
      return { ...this._options };
    }

    attachMonitor(elementOrId) {
      if (typeof elementOrId === "string") {
        const el = document.getElementById(elementOrId);
        if (!el) {
          throw new Error("BrailleUI.attachMonitor: element id not found: " + elementOrId);
        }
        this._monitorEl = el;
      } else {
        this._monitorEl = elementOrId;
      }
      this._updateMonitor();
    }

    // -----------------------------------------------------------------------
    // PUBLIC API – SEND LINE TO BRAILLE (ONLY PLACE THAT DOES THIS)
    // -----------------------------------------------------------------------

    /**
     * Single-line text mode: set plain text line.
     * Clears any page state.
     */
    async setText(text) {
      this._pageLines = null;
      this._currentLineIdx = 0;

      this._setLineInternal(text, null);

      if (!this._bridge || !this._bridge.sendText) {
        throw new Error("BrailleUI.setText: BrailleBridge is not available or has no sendText()");
      }

      return this._bridge.sendText(this._line, {
        pad: false,           // already padded here
        cells: this._options.displayCells
      });
    }

    /**
     * Single-line text mode based on tokens (letters or words).
     * Clears any page state.
     */
    async setTokens(tokens) {
      this._pageLines = null;
      this._currentLineIdx = 0;

      const arr = Array.isArray(tokens) ? tokens : [];
      const { line, map } = this._buildLineFromTokens(arr);

      this._setLineInternal(line, map);

      if (!this._bridge || !this._bridge.sendText) {
        throw new Error("BrailleUI.setTokens: BrailleBridge is not available or has no sendText()");
      }

      return this._bridge.sendText(this._line, {
        pad: false,
        cells: this._options.displayCells
      });
    }

    /**
     * Re-send the current line to the braille display.
     */
    async repeatLine() {
      if (!this._line) return;
      if (!this._bridge || !this._bridge.sendText) {
        throw new Error("BrailleUI.repeatLine: BrailleBridge is not available or has no sendText()");
      }
      return this._bridge.sendText(this._line, {
        pad: false,
        cells: this._options.displayCells
      });
    }

    /**
     * Clear braille display + internal model + page state.
     */
    async clear() {
      this._line = "";
      this._indexToToken = {};
      this._pageLines = null;
      this._currentLineIdx = 0;
      this._updateMonitor();
      this.emit("lineChanged", { line: this._line, lineIndex: 0 });

      if (this._bridge && this._bridge.clearDisplay) {
        return this._bridge.clearDisplay();
      }
    }

    // -----------------------------------------------------------------------
    // PUBLIC API – PAGE (MULTI-LINE) SUPPORT
    // -----------------------------------------------------------------------

    /**
     * Set a page as explicit lines.
     * lines: array of strings (un-padded, we pad them)
     * current line will be index 0.
     */
    async setPageLines(lines) {
      const arr = Array.isArray(lines) ? lines : [];
      const cells = this._options.displayCells;

      this._pageLines = arr.map(l => this._normalizeLine(l));
      this._currentLineIdx = 0;

      const first = this._pageLines[0] || "";
      this._setLineInternal(first, null);

      if (!this._bridge || !this._bridge.sendText) {
        throw new Error("BrailleUI.setPageLines: BrailleBridge is not available or has no sendText()");
      }

      return this._bridge.sendText(this._line, {
        pad: false,
        cells
      });
    }

    /**
     * Set a page from a long text string (word-wrapped).
     * options.wrap: "word" (default) or "char"
     * options.maxLines: optional limit on number of lines
     */
    async setPageText(text, options = {}) {
      const cells = this._options.displayCells;
      const { wrap = "word", maxLines = null } = options;

      let lines;
      if (wrap === "char") {
        const s = String(text || "");
        lines = [];
        for (let i = 0; i < s.length; i += cells) {
          lines.push(s.substring(i, i + cells));
        }
      } else {
        // word-wrap
        lines = this._wrapTextToLines(text, cells);
      }

      if (typeof maxLines === "number" && maxLines > 0) {
        lines = lines.slice(0, maxLines);
      }

      return this.setPageLines(lines);
    }

    /**
     * Is BrailleUI currently in page mode?
     */
    isPageMode() {
      return Array.isArray(this._pageLines) && this._pageLines.length > 0;
    }

    /**
     * Get info about the current page:
     *   { lines, currentLineIndex }
     */
    getPageInfo() {
      return {
        lines: this._pageLines ? this._pageLines.length : 0,
        currentLineIndex: this._pageLines ? this._currentLineIdx : 0
      };
    }

    /**
     * Switch to a specific line index in page mode.
     */
    async gotoLine(index) {
      if (!this.isPageMode()) return false;
      const max = this._pageLines.length;
      if (index < 0 || index >= max) return false;

      this._currentLineIdx = index;
      const line = this._pageLines[index] || "";
      this._setLineInternal(line, null);

      if (!this._bridge || !this._bridge.sendText) {
        throw new Error("BrailleUI.gotoLine: BrailleBridge is not available or has no sendText()");
      }

      await this._bridge.sendText(this._line, {
        pad: false,
        cells: this._options.displayCells
      });

      this._logDebug("gotoLine ->", index);
      return true;
    }

    /**
     * Go to next line in page mode.
     */
    async nextLine() {
      if (!this.isPageMode()) return false;
      const next = this._currentLineIdx + 1;
      return this.gotoLine(next);
    }

    /**
     * Go to previous line in page mode.
     */
    async prevLine() {
      if (!this.isPageMode()) return false;
      const prev = this._currentLineIdx - 1;
      return this.gotoLine(prev);
    }

    // -----------------------------------------------------------------------
    // PUBLIC API – QUERY CURRENT LINE
    // -----------------------------------------------------------------------
    getCurrentLine() {
      return this._line;
    }

    /**
     * Return character at braille cell index (0-based).
     */
    getCharAt(index) {
      if (typeof index !== "number") return null;
      if (index < 0 || index >= this._line.length) return null;
      return this._line.charAt(index);
    }

    /**
     * Return word at given index.
     * Options:
     *   withBounds: if true, returns { word, start, end }  (end exclusive)
     *
     * First tries the token map (from setTokens), then falls back to scanning.
     */
    getWordAt(index, options = {}) {
      if (typeof index !== "number") return null;
      if (index < 0 || index >= this._line.length) return null;

      const { withBounds = false } = options;

      // 1) token map (from setTokens)
      const token = this._indexToToken[index];
      if (token) {
        if (!withBounds) return { word: token };

        const line = this._line;
        const len = line.length;

        let start = index;
        while (start > 0 && this._indexToToken[start - 1] === token) {
          start--;
        }
        let end = index + 1;
        while (end < len && this._indexToToken[end] === token) {
          end++;
        }
        return { word: token, start, end };
      }

      // 2) Fallback: infer from spaces
      const line = this._line;
      const sep = this._options.wordSeparators;
      const isSep = (ch) => {
        if (!ch) return true;
        if (sep instanceof RegExp) return sep.test(ch);
        return String(sep).indexOf(ch) !== -1;
      };

      if (isSep(line.charAt(index))) {
        return null;
      }

      let start = index;
      while (start > 0 && !isSep(line.charAt(start - 1))) {
        start--;
      }

      let end = index + 1;
      while (end < line.length && !isSep(line.charAt(end))) {
        end++;
      }

      const word = line.substring(start, end);
      if (!word.trim()) return null;

      if (withBounds) return { word: word.trim(), start, end };
      return { word: word.trim() };
    }
  }

  // ---------------------------------------------------------------------------
  // GLOBAL EXPORT
  // ---------------------------------------------------------------------------
  const BrailleUI = new BrailleUIClass();

  global.BrailleUI = BrailleUI;
  global.createBrailleUI = function (options) {
    return new BrailleUIClass(options);
  };

})(window);
