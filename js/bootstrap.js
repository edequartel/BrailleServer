/* ============================================================
   BrailleServer Bootstrap (Updated)
   - Works on GitHub Pages + Working Copy Preview + local hosting
   - BASE-aware patching for:
     * <link ... data-bs-href>  (supports href OR data-bs-href)
     * <script ... data-bs-src> (supports src  OR data-bs-src)
     * <a ... data-bs-a>        (patches href)
   - Optional: sequentially loads scripts that have data-bs-src
     while allowing legacy pages (already-loaded scripts) too.
   ============================================================ */

(() => {
  "use strict";

  /* ------------------------------------------------------------
     1) Environment detection
  ------------------------------------------------------------ */
  const isGitHubPages = location.hostname === "edequartel.github.io";
  const BASE = isGitHubPages ? "/BrailleServer" : "";

  /* ------------------------------------------------------------
     2) Expose global paths (optional but useful)
  ------------------------------------------------------------ */
  window.BOOTSTRAP = {
    BASE,

    JSON: {
      INSTRUCTIONS: `${BASE}/config/instructions.json`,
      WORDS:        `${BASE}/config/words.json`,
      SOUNDS:       `${BASE}/config/sounds.json`
    },

    AUDIO: {
      BASE:    `${BASE}/audio/`,
      UI:      `${BASE}/audio/ui/`,
      LETTERS: `${BASE}/audio/letters/`,
      WORDS:   `${BASE}/audio/words/`,
      STORIES: `${BASE}/audio/stories/`
    },

    COMPONENTS: `${BASE}/components/`
  };

  /* ------------------------------------------------------------
     3) Helper: prefix BASE only for site-root absolute paths
        and only if not already prefixed.
  ------------------------------------------------------------ */
  function withBase(url) {
    if (!url) return url;
    // Only patch absolute site-root paths like "/js/x.js"
    if (!url.startsWith("/")) return url;

    // If already has BASE prefix, keep it
    if (BASE && url.startsWith(BASE + "/")) return url;

    return BASE + url;
  }

  /* ------------------------------------------------------------
     4) Patch links, scripts, anchors in-place
        Supports BOTH markup styles:
          - <link href="/x.css" data-bs-href>
          - <link data-bs-href="/x.css">
          - <script src="/x.js" data-bs-src></script>
          - <script data-bs-src="/x.js"></script>
          - <a href="/x" data-bs-a>
  ------------------------------------------------------------ */
  function patchDomUrls() {
    // CSS links
    document.querySelectorAll("link[data-bs-href]").forEach(el => {
      const href = el.getAttribute("href") || el.getAttribute("data-bs-href");
      if (!href) return;
      el.setAttribute("href", withBase(href));
    });

    // Script tags (legacy pages may already have src present)
    document.querySelectorAll("script[data-bs-src]").forEach(el => {
      const src = el.getAttribute("src") || el.getAttribute("data-bs-src");
      if (!src) return;
      el.setAttribute("src", withBase(src));
    });

    // Anchors
    document.querySelectorAll("a[data-bs-a]").forEach(el => {
      const href = el.getAttribute("href");
      if (!href) return;
      el.setAttribute("href", withBase(href));
    });
  }

  /* ------------------------------------------------------------
     5) Optional: sequential loader for scripts that specify
        data-bs-src BUT do not already have a src attribute.
        This supports the "new" clean pattern:
          <script data-bs-src="/js/x.js"></script>
        While legacy pattern still works without duplication.
  ------------------------------------------------------------ */
  async function loadScriptsSequentially() {
    const nodes = Array.from(document.querySelectorAll("script[data-bs-src]"));

    for (const node of nodes) {
      // If legacy markup already has src, browser will load it (after patch).
      // Do NOT double-load.
      if (node.hasAttribute("src")) continue;

      const raw = node.getAttribute("data-bs-src");
      if (!raw) continue;

      const full = withBase(raw);

      await new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = full;
        s.defer = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error(`Bootstrap failed to load ${full}`));
        document.head.appendChild(s);
      });
    }
  }

  /* ------------------------------------------------------------
     6) Init
  ------------------------------------------------------------ */
  async function init() {
    try {
      patchDomUrls();
      await loadScriptsSequentially();

      // Signal
      document.dispatchEvent(new Event("bootstrap:ready"));

      // Console diagnostic
      console.info("[bootstrap] BASE=", BASE);
    } catch (err) {
      console.error("[bootstrap] error:", err);

      // Visible fail-fast (prevents silent white screen)
      if (document.body) {
        const pre = document.createElement("pre");
        pre.style.padding = "12px";
        pre.style.border = "1px solid #c00";
        pre.textContent = "BOOTSTRAP ERROR:\n" + String(err && err.message ? err.message : err);
        document.body.prepend(pre);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();