/*!
 * BrailleBridge JavaScript Framework
 * ----------------------------------
 * Two-way communication with the local BrailleBridge:
 *  - HTTP  : send text to braille display (/braille) and clear (/clear)
 *  - WS    : receive key events (cursor routing, thumbkeys, etc.)
 *
 * Usage (simple):
 *   BrailleBridge.connect();
 *   BrailleBridge.on("cursor", evt => console.log(evt.index));
 *   BrailleBridge.sendText("Hallo braille!");
 */

(function (global) {
  "use strict";

  // ---------------------------------------------------------------------------
  // DEFAULT CONFIG
  // ---------------------------------------------------------------------------
  const DEFAULT_CONFIG = {
    baseUrl: "http://localhost:5000", // HTTP base
    wsUrl: "ws://localhost:5000/ws",  // WebSocket URL
    displayCells: 40,                 // default braille cells to pad to
    autoReconnect: true,
    reconnectDelay: 2000,             // ms initial delay
    maxReconnectDelay: 10000,         // ms max delay
    debug: false                      // debug logs to console
  };

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
          console.error("BrailleBridge handler error for", eventName, err);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // BRIDGE CLASS
  // ---------------------------------------------------------------------------
  class Bridge extends Emitter {
    constructor(config = {}) {
      super();
      this._config = { ...DEFAULT_CONFIG, ...config };

      this._ws = null;
      this._manualClose = false;
      this._reconnectTimer = null;
      this._currentDelay = this._config.reconnectDelay;
    }

    // ----- CONFIG ------------------------------------------------------------
    setConfig(partial) {
      this._config = { ...this._config, ...partial };
    }

    getConfig() {
      return { ...this._config };
    }

    // ----- LOGGING -----------------------------------------------------------
    _logDebug(...args) {
      if (this._config.debug) {
        console.log("[BrailleBridge]", ...args);
      }
    }

    // ----- HTTP HELPERS ------------------------------------------------------
    async _post(path, body, contentType = "text/plain; charset=utf-8") {
      const url = this._config.baseUrl + path;
      this._logDebug("HTTP POST", url, "body=", body);

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": contentType
        },
        body
      });

      const text = await res.text().catch(() => "");
      this.emit("http", { path, ok: res.ok, status: res.status, body: text });
      return { ok: res.ok, status: res.status, body: text };
    }

    async _get(path) {
      const url = this._config.baseUrl + path;
      this._logDebug("HTTP GET", url);

      const res = await fetch(url, {
        method: "GET"
      });

      const text = await res.text().catch(() => "");
      this.emit("http", { path, ok: res.ok, status: res.status, body: text });
      return { ok: res.ok, status: res.status, body: text };
    }

    // ----- PUBLIC HTTP API ---------------------------------------------------
    /**
     * Send text to the braille display.
     * Options:
     *   - pad (bool)       : pad or cut to displayCells (default true)
     *   - cells (number)   : override displayCells for this call
     */
    async sendText(text, options = {}) {
      const {
        pad = true,
        cells = this._config.displayCells
      } = options;

      let line = String(text || "");
      if (pad) {
        line = line.padEnd(cells, " ").substring(0, cells);
      }

      this._logDebug("sendText:", { line });
      return this._post("/braille", line);
    }

    /**
     * Alias for sendText()
     */
    async sendToBraille(text, options = {}) {
      return this.sendText(text, options);
    }

	/**
	 * Clear the braille display.
	 */
	async clearDisplay() {
	  this._logDebug("clearDisplay()");
	  try {
		// 👇 use GET instead of POST
		const result = await this._get("/clear");
		return result;
	  } catch (err) {
		this.emit("error", { type: "http", error: err });
		throw err;
	  }
	}

    async ping() {
      // optional: if you implement /ping in your bridge
      return this._get("/ping");
    }

    // ----- WEBSOCKET HANDLING ------------------------------------------------
    connect() {
      if (this._ws && (this._ws.readyState === WebSocket.OPEN || this._ws.readyState === WebSocket.CONNECTING)) {
        this._logDebug("WebSocket already open/connecting");
        return;
      }

      this._manualClose = false;
      const wsUrl = this._config.wsUrl;
      this._logDebug("Connecting WebSocket:", wsUrl);

      try {
        const ws = new WebSocket(wsUrl);
        this._ws = ws;

        ws.onopen = () => {
          this._logDebug("WebSocket OPEN");
          this._currentDelay = this._config.reconnectDelay;
          this.emit("connected", { wsUrl });
        };

        ws.onclose = (evt) => {
          this._logDebug("WebSocket CLOSE", evt.code, evt.reason);
          this.emit("disconnected", { code: evt.code, reason: evt.reason });

          this._ws = null;

          // Auto reconnect if not manual close
          if (!this._manualClose && this._config.autoReconnect) {
            this._scheduleReconnect();
          }
        };

        ws.onerror = (err) => {
          this._logDebug("WebSocket ERROR", err);
          this.emit("error", { type: "ws", error: err });
        };

        ws.onmessage = (evt) => {
          this._handleWsMessage(evt.data);
        };
      } catch (err) {
        this._logDebug("WebSocket connect error", err);
        this.emit("error", { type: "ws", error: err });
        // maybe schedule reconnect
        if (this._config.autoReconnect) {
          this._scheduleReconnect();
        }
      }
    }

    _scheduleReconnect() {
      if (this._reconnectTimer) return;

      const delay = this._currentDelay;
      this._logDebug("Scheduling reconnect in", delay, "ms");

      this._reconnectTimer = setTimeout(() => {
        this._reconnectTimer = null;
        this._currentDelay = Math.min(
          this._currentDelay * 2,
          this._config.maxReconnectDelay
        );
        this.connect();
      }, delay);
    }

    disconnect() {
      this._manualClose = true;
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      if (this._ws) {
        this._logDebug("Manual WS close");
        this._ws.close();
      }
    }

    isConnected() {
      return !!this._ws && this._ws.readyState === WebSocket.OPEN;
    }

    sendWs(data) {
      if (!this.isConnected()) {
        this._logDebug("sendWs: not connected");
        return;
      }
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      this._logDebug("sendWs:", payload);
      this._ws.send(payload);
    }

    // ----- MESSAGE NORMALIZATION --------------------------------------------
    _handleWsMessage(rawData) {
      this._logDebug("WS message:", rawData);
      this.emit("raw", rawData);

      let msg;
      try {
        msg = JSON.parse(rawData);
      } catch (e) {
        this.emit("error", { type: "parse", error: e, raw: rawData });
        return;
      }

      // Normalize some common shapes from your bridge
      // Example variants seen:
      //  { Kind:1, IsPress:true, CursorIndex:9 }
      //  { kind:"cursorRoutingStrip", press:true, cursorIndex:9 }
      //  { Kind:2, IsPress:true, Name:"LeftThumb" }
      const kindRaw = msg.kind ?? msg.Kind ?? "";
      const kind = String(kindRaw).toLowerCase();
      const isPress = msg.isPress ?? msg.IsPress ?? msg.press;
      const press = (isPress !== false); // default true if undefined

      const normalBase = {
        raw: msg,
        kindRaw,
        kind,
        press
      };

      // Fire generic 'message' event
      this.emit("message", normalBase);

      // Braille line (SSoC) message
      const msgTypeRaw = msg.type ?? msg.Type ?? "";
      const msgType = String(msgTypeRaw).toLowerCase();
      if (msgType === "brailleline") {
        const evt = {
          ...normalBase,
          type: "brailleLine",
          sourceText: msg.SourceText ?? msg.sourceText ?? "",
          brailleUnicode: msg?.Braille?.UnicodeText ?? msg?.braille?.unicodeText ?? ""
        };
        this.emit("brailleline", evt);
        return;
      }

      if (!press) {
        // Only react on key down by default
        return;
      }

      // Cursor routing
      if (
        kind === "cursorroutingstrip" ||
        kind === "cursorrouting" ||
        (typeof msg.Kind === "number" && msg.Kind === 1)
      ) {
        const idx = msg.cursorIndex ?? msg.CursorIndex ?? msg.index ?? msg.btn;
        if (typeof idx === "number") {
          const evt = {
            ...normalBase,
            index: idx
          };
          this.emit("cursor", evt);
          return;
        } else {
          this.emit("error", {
            type: "cursor",
            error: "No numeric cursor index",
            raw: msg
          });
          return;
        }
      }

      // Thumbkey / space bar cluster
      if (
        kind === "thumbkey" ||
        kind === "thumb" ||
        (typeof msg.Kind === "number" && msg.Kind === 2)
      ) {
        const name = msg.name ?? msg.Name ?? msg.buttonName ?? "";
        const evt = {
          ...normalBase,
          name,
          nameLower: String(name).toLowerCase()
        };
        this.emit("thumbkey", evt);
        return;
      }

      // Other / unknown kinds
      this.emit("unknown", normalBase);
    }
  }

  // ---------------------------------------------------------------------------
  // GLOBAL EXPORT
  // ---------------------------------------------------------------------------
  // Single shared instance:
  const defaultBridge = new Bridge();

  // Expose:
  //   window.BrailleBridge      → default instance
  //   window.createBrailleBridge(config) → factory for extra instances
  global.BrailleBridge = defaultBridge;
  global.createBrailleBridge = function (config) {
    return new Bridge(config);
  };

})(window);
