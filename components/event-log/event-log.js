class EventLog {
  constructor(container, options = {}) {
    this.container = container;
    this.maxEntries = options.maxEntries ?? 500;

    this._render();
    this._bind();
  }

  _render() {
    this.container.innerHTML = `
      <div class="event-log">
        <div class="event-log__header">
          <span class="event-log__title">Event log</span>
          <div class="event-log__controls">
            <button type="button" data-action="clear">Clear</button>
          </div>
        </div>
        <div class="event-log__body" role="log" aria-live="polite"></div>
      </div>
    `;

    this.body = this.container.querySelector(".event-log__body");
  }

  _bind() {
    this.container.addEventListener("click", (e) => {
      if (e.target?.dataset?.action === "clear") {
        this.clear();
      }
    });
  }

  log(message, type = "system") {
    if (!this.body) return;

    const entry = document.createElement("div");
    entry.className = `event-log__entry event-log__entry--${type}`;
    entry.textContent = `[${this._timestamp()}] ${message}`;

    this.body.appendChild(entry);

    while (this.body.children.length > this.maxEntries) {
      this.body.removeChild(this.body.firstChild);
    }

    this.body.scrollTop = this.body.scrollHeight;
  }

  clear() {
    if (this.body) this.body.innerHTML = "";
  }

  _timestamp() {
    return new Date().toLocaleTimeString("nl-NL", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3
    });
  }
}

window.EventLog = EventLog;