/* qrcode-link-button.js
   Shows a QR code (as an <img>) in a modal when the button is clicked.
   Expects:
   - button:  .qrcode-link-button  with data-url="https://..."
   - modal:   .qrcode-modal
   - target:  #qrcode
   - close:   #qrcodeClose
*/

(function () {
  class QRCodeLinkButton {
    constructor(buttonEl) {
      this.el = buttonEl;
      this.url = (this.el.dataset.url || "").trim();

      this.modal = document.querySelector(".qrcode-modal");
      this.qrContainer = document.getElementById("qrcode");
      this.closeBtn = document.getElementById("qrcodeClose");

      if (!this.url) console.warn("QRCodeLinkButton: missing data-url", this.el);
      if (!this.modal) console.warn("QRCodeLinkButton: .qrcode-modal not found");
      if (!this.qrContainer) console.warn("QRCodeLinkButton: #qrcode not found");
      if (!this.closeBtn) console.warn("QRCodeLinkButton: #qrcodeClose not found");

      this._bind();
    }

    _bind() {
      this.el.addEventListener("click", () => this.showQR());
      if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.hideQR());

      // Close when clicking on backdrop
      if (this.modal) {
        this.modal.addEventListener("click", (e) => {
          if (e.target === this.modal) this.hideQR();
        });
      }

      // Close with Escape
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.hideQR();
      });
    }

    showQR() {
      if (!this.url || !this.modal || !this.qrContainer) return;

      this.qrContainer.innerHTML = "";

      // QR image via qrserver (simple, no extra library)
      const img = document.createElement("img");
      img.alt = "QR code";
      img.width = 200;
      img.height = 200;
      img.src =
        "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=" +
        encodeURIComponent(this.url);

      this.qrContainer.appendChild(img);
      this.modal.classList.remove("qrcode-modal--hidden");
    }

    hideQR() {
      if (!this.modal || !this.qrContainer) return;
      this.modal.classList.add("qrcode-modal--hidden");
      this.qrContainer.innerHTML = "";
    }
  }

  // Expose for diagnostics/manual use
  window.QRCodeLinkButton = QRCodeLinkButton;

  // Auto-bind all buttons
  window.addEventListener("DOMContentLoaded", () => {
    document
      .querySelectorAll(".qrcode-link-button")
      .forEach((btn) => new QRCodeLinkButton(btn));
  });
})();