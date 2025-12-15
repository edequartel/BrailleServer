### QRCode Link Button – Short Explanation

This script adds QR-code functionality to buttons on the page.

- Each `.qrcode-link-button` must have a `data-url` attribute.
- When the button is clicked, a modal (`.qrcode-modal`) opens.
- Inside the modal, a QR code is generated as an `<img>` using an external QR API.
- The QR encodes the URL from `data-url`.
- The modal can be closed by:
  - Clicking the close button (`#qrcodeClose`)
  - Clicking the backdrop
  - Pressing the Escape key
- On page load, all `.qrcode-link-button` elements are automatically initialized.
- The `QRCodeLinkButton` class is exposed on `window` for debugging or manual use.