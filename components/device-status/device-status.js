/*!
 * device-status.js – Reusable device status indicator
 *
 * Usage:
 *   <div id="deviceStatus"></div>
 *   const ds = new DeviceStatus({ containerId: "deviceStatus" });
 *   ds.setState("connecting", "Connecting to BrailleBridge...");
 *   ds.setState("connected", "Braille display connected");
 *
 * Optional:
 *   ds.bindToBrailleBridge(window.BrailleBridge);
 *   ds.startPolling({ url: "http://localhost:7777/status", intervalMs: 1500 });
 */

(function (global) {
  "use strict";

  class DeviceStatus {
    constructor(options) {
      const opts = Object.assign(
        {
          containerId: null,
          label: "Device",
          initialState: "unknown",
          initialText: "Unknown"
        },
        options || {}
      );

      if (!opts.containerId) {
        throw new Error("DeviceStatus: containerId is required");
      }

      const container = document.getElementById(opts.containerId);
      if (!container) {
        throw new Error(
          "DeviceStatus: No element with id '" + opts.containerId + "'"
        );
      }

      this.container = container;
      this.label = opts.label;
      this._pollTimer = null;

      this._render();
      this.setState(opts.initialState, opts.initialText);
    }

    _render() {
      this.container.innerHTML = "";

      const root = document.createElement("div");
      root.className = "device-status device-status--unknown";

      const left = document.createElement("div");
      left.className = "device-status__left";

      const dot = document.createElement("span");
      dot.className = "device-status__dot";
      dot.setAttribute("aria-hidden", "true");

      const title = document.createElement("span");
      title.className = "device-status__title";
      title.textContent = this.label;

      left.appendChild(dot);
      left.appendChild(title);

      const text = document.createElement("div");
      text.className = "device-status__text";
      text.textContent = "--";

      root.appendChild(left);
      root.appendChild(text);

      this.root = root;
      this.textEl = text;

      this.container.appendChild(root);
    }

    setState(state, text) {
      const s = String(state || "unknown").toLowerCase();

      // remove any previous state class
      this.root.classList.remove(
        "device-status--unknown",
        "device-status--connecting",
        "device-status--connected",
        "device-status--disconnected",
        "device-status--error"
      );

      const allowed = new Set([
        "unknown",
        "connecting",
        "connected",
        "disconnected",
        "error"
      ]);

      const finalState = allowed.has(s) ? s : "unknown";
      this.root.classList.add("device-status--" + finalState);

      this.textEl.textContent = text != null ? String(text) : "";
    }

    // Optional: listen to BrailleBridge events if your bridge exposes them.
    bindToBrailleBridge(bridge) {
      if (!bridge || typeof bridge.on !== "function") {
        this.setState("disconnected", "BrailleBridge not available");
        return;
      }

      // If you have a status event, use it.
      // Expected payload examples:
      //   { state: "connected", text: "..." }
      //   { connected: true, device: "Focus 40" }
      bridge.on("status", (evt) => {
        if (!evt) return;

        if (typeof evt.state === "string") {
          this.setState(evt.state, evt.text || "");
          return;
        }

        if (typeof evt.connected === "boolean") {
          this.setState(
            evt.connected ? "connected" : "disconnected",
            evt.device ? String(evt.device) : evt.connected ? "Connected" : "Disconnected"
          );
        }
      });

      // If you have connection lifecycle events, use them.
      bridge.on("connected", (evt) => {
        const dev = evt && evt.device ? String(evt.device) : "Connected";
        this.setState("connected", dev);
      });

      bridge.on("disconnected", () => {
        this.setState("disconnected", "Disconnected");
      });

      bridge.on("error", (evt) => {
        const msg = evt && evt.message ? String(evt.message) : "Error";
        this.setState("error", msg);
      });
    }

    // Optional: poll a local HTTP endpoint if you expose one.
    startPolling(options) {
      const opts = Object.assign(
        {
          url: null,
          intervalMs: 1500
        },
        options || {}
      );

      if (!opts.url) return;

      this.stopPolling();
      this.setState("connecting", "Checking status...");

      const tick = async () => {
        try {
          const res = await fetch(opts.url, { cache: "no-store" });
          if (!res.ok) throw new Error("HTTP " + res.status);

          const data = await res.json();

          // Accept flexible payloads:
          // { state, text } OR { connected, device } OR { ok }
          if (data && typeof data.state === "string") {
            this.setState(data.state, data.text || "");
          } else if (data && typeof data.connected === "boolean") {
            this.setState(
              data.connected ? "connected" : "disconnected",
              data.device ? String(data.device) : data.connected ? "Connected" : "Disconnected"
            );
          } else if (data && data.ok === true) {
            this.setState("connected", "OK");
          } else {
            this.setState("unknown", "Unknown response");
          }
        } catch (err) {
          this.setState("disconnected", "No connection");
        }
      };

      tick();
      this._pollTimer = setInterval(tick, Math.max(500, opts.intervalMs | 0));
    }

    stopPolling() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
      }
    }
  }

  global.DeviceStatus = DeviceStatus;
})(window);