class EventLog {
  constructor(container, options = {}) {
    this.container = container;
    this.maxEntries = options.maxEntries ?? 500;

    this._render();
    this._bind();
  }

  _render() {
    this.container.innerHTML = "";
    this.container.appendChild(
      document.importNode(EventLog.template.content, true)
    );

    this.body = this.container.querySelector(".event-log__body");
  }

  _bind() {
    this.container.addEventListener("click", (e) => {
      if (e.target.dataset.action === "clear") {
        this.clear();
      }
    });
  }

  log(message, type = "system") {
    const entry = document.createElement("div");
    entry.className = `event-log__entry event-log__entry--${type}`;
    entry.textContent = `[${this._timestamp()}] ${message}`;

    this.body.appendChild(entry);

    if (this.body.children.length > this.maxEntries) {
      this.body.removeChild(this.body.firstChild);
    }

    this.body.scrollTop = this.body.scrollHeight;
  }

  clear() {
    this.body.innerHTML = "";
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

  static registerTemplate() {
    const template = document.createElement("template");
    template.innerHTML = EventLog.templateHTML;
    EventLog.template = template;
  }
}

EventLog.templateHTML = `
${document.currentScript?.previousElementSibling?.outerHTML ?? ""}
`;

EventLog.registerTemplate();