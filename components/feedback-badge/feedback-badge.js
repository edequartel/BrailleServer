/* -------------------------------------------------------
   FeedbackBadge API
------------------------------------------------------- */

(function () {
  class FeedbackBadge {
    constructor(element) {
      this.el = element;
      this.iconEl = element.querySelector(".feedback-badge__icon");
      this.textEl = element.querySelector(".feedback-badge__text");
    }

    showCorrect(text = "Correct") {
      this._setState("correct", "✔", text);
    }

    showWrong(text = "Wrong") {
      this._setState("wrong", "✖", text);
    }

    hide() {
      this.el.classList.add("feedback-badge--hidden");
    }

    _setState(state, icon, text) {
      this.el.classList.remove(
        "feedback-badge--hidden",
        "feedback-badge--correct",
        "feedback-badge--wrong"
      );

      this.el.classList.add(`feedback-badge--${state}`);
      this.iconEl.textContent = icon;
      this.textEl.textContent = text;
    }
  }

  // Auto-bind first badge on page
  window.FeedbackBadge = FeedbackBadge;
})();