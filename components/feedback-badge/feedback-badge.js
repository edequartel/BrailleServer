/*!
 * /components/feedback-badge/feedback-badge.js
 * Simple reusable feedback badge: correct / wrong / info
 */

(function (global) {
  "use strict";

  class FeedbackBadge {
    constructor(options) {
      const opts = Object.assign(
        {
          containerId: null
        },
        options || {}
      );

      if (!opts.containerId) {
        throw new Error("FeedbackBadge: containerId is required");
      }

      const container = document.getElementById(opts.containerId);
      if (!container) {
        throw new Error("FeedbackBadge: No element with id '" + opts.containerId + "'");
      }

      this.container = container;
      this._timer = null;

      this._render();
      this.clear();
    }

    _render() {
      this.container.innerHTML = "";

      const root = document.createElement("div");
      root.className = "feedback-badge feedback-badge--hidden feedback-badge--info";

      const icon = document.createElement("span");
      icon.className = "feedback-badge__icon";
      icon.textContent = "•";

      const text = document.createElement("span");
      text.className = "feedback-badge__text";
      text.textContent = "";

      root.appendChild(icon);
      root.appendChild(text);

      this.root = root;
      this.iconEl = icon;
      this.textEl = text;

      this.container.appendChild(root);
    }

    show(type, message, autoHideMs) {
      const t = String(type || "info").toLowerCase();
      const msg = message != null ? String(message) : "";

      this._clearTimer();

      this.root.classList.remove("feedback-badge--hidden", "feedback-badge--correct", "feedback-badge--wrong", "feedback-badge--info");

      if (t === "correct") {
        this.root.classList.add("feedback-badge--correct");
        this.iconEl.textContent = "✓";
      } else if (t === "wrong") {
        this.root.classList.add("feedback-badge--wrong");
        this.iconEl.textContent = "✗";
      } else {
        this.root.classList.add("feedback-badge--info");
        this.iconEl.textContent = "•";
      }

      this.textEl.textContent = msg;

      if (autoHideMs && Number(autoHideMs) > 0) {
        this._timer = setTimeout(() => this.clear(), Number(autoHideMs));
      }
    }

    clear() {
      this._clearTimer();
      this.root.classList.add("feedback-badge--hidden");
      this.textEl.textContent = "";
      this.iconEl.textContent = "•";
    }

    _clearTimer() {
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = null;
      }
    }
  }

  global.FeedbackBadge = FeedbackBadge;
})(window);