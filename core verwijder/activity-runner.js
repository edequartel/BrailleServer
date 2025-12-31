/* /core/activity-runner.js
   Generic Activity Runner for BrailleServer (browser) + BrailleBridge (localhost)
   - Loads /activities/<activityId>/activity.json
   - Renders a minimal UI
   - Plays intro audio
   - Sends braille text via BrailleBridge HTTP API
   - Listens to key events via BrailleBridge WebSocket
   - Runs a simple "select correct answer" flow:
       - Items list (strings or objects)
       - Target chosen per round
       - User navigates with left/right keys
       - Confirms with enter
   IMPORTANT:
   - You must map your device key names in KEYMAP below (once).
   - This file is designed to be reused by all activities.
*/

(() => {
  "use strict";

  // -----------------------------
  // Config (adjust once)
  // -----------------------------
  const BRAILLE_HTTP_BASE = "http://localhost:5000"; // change if your bridge uses another port
  const BRAILLE_WS_URL = "ws://localhost:5000/ws";   // change if needed

  // If your bridge endpoint differs, adjust these:
  const ENDPOINTS = {
    brailleWrite: "/braille", // POST { text: "..." } or { value: "..." } depending on your backend
    brailleClear: "/clear"    // POST or GET (we try POST then GET)
  };

  // Map incoming key events to semantic actions used by the runner.
  // Update these strings to match your BrailleBridge websocket payload.
  const KEYMAP = {
    // navigation
    prev: new Set(["Left", "ArrowLeft", "NAV_LEFT", "ThumbLeft", "L"]),
    next: new Set(["Right", "ArrowRight", "NAV_RIGHT", "ThumbRight", "R"]),

    // actions
    confirm: new Set(["Enter", "OK", "Confirm", "Select", "Dot8", "SPACE"]),
    repeat: new Set(["Repeat", "RPT", "Dot7"]),
    quit: new Set(["Escape", "Esc", "Back", "Cancel"])
  };

  // -----------------------------
  // Utilities
  // -----------------------------
  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function joinUrl(a, b) {
    if (!a.endsWith("/") && !b.startsWith("/")) return a + "/" + b;
    if (a.endsWith("/") && b.startsWith("/")) return a + b.slice(1);
    return a + b;
  }

  function el(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    return n;
  }

  function safeJsonParse(s) {
    try { return JSON.parse(s); } catch { return null; }
  }

  function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // -----------------------------
  // BrailleBridge Client (minimal)
  // -----------------------------
  async function brailleWrite(text) {
    if (!text) return;
    const url = joinUrl(BRAILLE_HTTP_BASE, ENDPOINTS.brailleWrite);

    // Try common payloads; your backend may accept one of these.
    const payloads = [
      { text },
      { value: text },
      { message: text }
    ];

    let lastErr = null;
    for (const body of payloads) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (res.ok) return true;
        lastErr = new Error(`HTTP ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
    }
    console.warn("brailleWrite failed:", lastErr);
    return false;
  }

  async function brailleClear() {
    const url = joinUrl(BRAILLE_HTTP_BASE, ENDPOINTS.brailleClear);
    // try POST then GET
    try {
      let res = await fetch(url, { method: "POST" });
      if (res.ok) return true;
      res = await fetch(url, { method: "GET" });
      if (res.ok) return true;
    } catch (e) {
      console.warn("brailleClear failed:", e);
    }
    return false;
  }

  function connectBrailleWS(onKey) {
    let ws = null;
    let closedByUs = false;

    function open() {
      try {
        ws = new WebSocket(BRAILLE_WS_URL);
      } catch (e) {
        console.warn("WS create failed:", e);
        return;
      }

      ws.addEventListener("open", () => {
        console.info("Braille WS connected");
      });

      ws.addEventListener("message", (ev) => {
        // Expect either:
        //  - JSON { type:"key", key:"Left", ... }
        //  - JSON { key:"Left" }
        //  - string "Left"
        const data = typeof ev.data === "string" ? ev.data : "";
        const obj = safeJsonParse(data);

        const key =
          (obj && (obj.key || obj.code || obj.name || obj.value)) ||
          (typeof data === "string" ? data.trim() : "");

        if (!key) return;
        onKey(String(key));
      });

      ws.addEventListener("close", () => {
        console.warn("Braille WS closed");
        ws = null;
        if (!closedByUs) setTimeout(open, 1200);
      });

      ws.addEventListener("error", () => {
        // close triggers reconnect
        try { ws && ws.close(); } catch {}
      });
    }

    open();

    return () => {
      closedByUs = true;
      try { ws && ws.close(); } catch {}
    };
  }

  // -----------------------------
  // Audio (minimal, optional)
  // -----------------------------
  async function playAudio(url) {
    if (!url) return;
    try {
      const a = new Audio(url);
      a.preload = "auto";
      await a.play();
    } catch (e) {
      console.warn("Audio play failed:", url, e);
    }
  }

  // -----------------------------
  // Activity loading
  // -----------------------------
  async function loadActivity(activityId) {
    const base = `/activities/${activityId}/`;
    const jsonUrl = joinUrl(base, "activity.json");
    const res = await fetch(jsonUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Cannot load ${jsonUrl} (HTTP ${res.status})`);
    const activity = await res.json();
    activity.__basePath = base;
    return activity;
  }

  function normalizeItems(activity) {
    const items = Array.isArray(activity.items) ? activity.items : [];
    return items.map((it) => {
      if (typeof it === "string") {
        return { id: it, label: it, braille: it, audio: null };
      }
      return {
        id: it.id ?? it.label ?? "item",
        label: it.label ?? it.id ?? "item",
        braille: it.braille ?? it.label ?? it.id ?? "",
        audio: it.audio ?? null
      };
    });
  }

  function resolveUrl(activity, maybeRelative) {
    if (!maybeRelative) return null;
    // absolute
    if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
    // relative to activity folder
    return joinUrl(activity.__basePath, maybeRelative);
  }

  // -----------------------------
  // Runner state machine
  // -----------------------------
  function createRunner(activity) {
    const items = normalizeItems(activity);

    const texts = {
      intro: activity?.braille?.introText ?? activity?.title ?? "Start",
      success: activity?.braille?.successText ?? "Goed gedaan",
      fail: activity?.braille?.failText ?? "Probeer opnieuw"
    };

    const audio = {
      intro: resolveUrl(activity, activity?.audio?.intro ?? null),
      success: resolveUrl(activity, activity?.audio?.success ?? null),
      fail: resolveUrl(activity, activity?.audio?.fail ?? null),
      item: (item) => resolveUrl(activity, item.audio)
    };

    const state = {
      round: 0,
      currentIndex: 0,
      targetId: null,
      running: false
    };

    function chooseNewTarget() {
      const target = pickRandom(items);
      state.targetId = target?.id ?? null;
    }

    function currentItem() {
      return items[state.currentIndex] ?? null