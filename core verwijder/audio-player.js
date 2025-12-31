/* /core/audio-player.js
   Minimal audio utility for BrailleServer activities.

   Goals:
   - One place to play short UI sounds and item audio.
   - Supports:
       play(url, { interrupt, volume, rate })
       stop()
       preload(urls)
       setEnabled(true/false)
       setDefaultVolume(0..1)
   - Works without external libs (no Howler required).

   Usage:
     import { audioPlayer } from "../core/audio-player.js";

     audioPlayer.setDefaultVolume(0.9);
     await audioPlayer.preload(["/sounds/ui/success.mp3"]);
     await audioPlayer.play("/sounds/ui/intro.mp3", { interrupt: true });

   Notes:
   - Browsers may block autoplay until user interaction. In that case play() rejects.
   - For iOS Safari reliability, call audioPlayer.unlock() in a user gesture handler.
*/

export const audioPlayer = (() => {
  "use strict";

  let enabled = true;
  let defaultVolume = 1.0;
  let current = null;                 // currently playing HTMLAudioElement
  const cache = new Map();            // url -> HTMLAudioElement (preloaded instance)

  function clamp01(v) {
    const n = Number(v);
    if (Number.isNaN(n)) return 1.0;
    return Math.min(1, Math.max(0, n));
  }

  function isAbsoluteUrl(url) {
    return /^https?:\/\//i.test(url);
  }

  function normalizeUrl(url) {
    if (!url) return null;
    const u = String(url).trim();
    return u || null;
  }

  function makeAudio(url) {
    const a = new Audio(url);
    a.preload = "auto";
    a.crossOrigin = isAbsoluteUrl(url) ? "anonymous" : "";
    return a;
  }

  async function unlock() {
    // iOS requires audio to start from a user gesture; this creates a tiny silent play attempt.
    if (!enabled) return true;
    try {
      const a = new Audio();
      a.volume = 0;
      const p = a.play();
      if (p && typeof p.then === "function") await p;
      a.pause();
      return true;
    } catch {
      return false;
    }
  }

  async function preload(urls = []) {
    if (!enabled) return;

    const list = Array.isArray(urls) ? urls : [urls];
    for (const raw of list) {
      const url = normalizeUrl(raw);
      if (!url) continue;
      if (cache.has(url)) continue;

      const a = makeAudio(url);
      cache.set(url, a);

      // Trigger network fetch (best-effort)
      try {
        await new Promise((resolve) => {
          const done = () => resolve();
          a.addEventListener("canplaythrough", done, { once: true });
          a.addEventListener("error", done, { once: true });
          // setting src already schedules fetch; load() nudges some browsers
          a.load();
        });
      } catch {
        // ignore
      }
    }
  }

  function stop() {
    if (!current) return;
    try {
      current.pause();
      current.currentTime = 0;
    } catch {
      // ignore
    }
    current = null;
  }

  async function play(url, opts = {}) {
    if (!enabled) return false;

    const u = normalizeUrl(url);
    if (!u) return false;

    const interrupt = opts.interrupt !== false; // default true
    const volume = clamp01(opts.volume ?? defaultVolume);
    const rate = typeof opts.rate === "number" ? opts.rate : 1.0;

    if (interrupt) stop();

    // Use cached instance if available, else create a fresh one.
    // Note: reusing a single cached Audio element can be problematic if overlapping plays;
    // we stop() above by default. If interrupt:false, we create a fresh element always.
    let a = null;
    if (!interrupt) {
      a = makeAudio(u);
    } else {
      a = cache.get(u);
      if (!a) {
        a = makeAudio(u);
        cache.set(u, a);
      }
    }

    // Reset for replay
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      // ignore
    }

    a.volume = volume;
    a.playbackRate = rate;

    current = a;

    try {
      const p = a.play();
      if (p && typeof p.then === "function") await p;

      // Wait until finished (or error)
      await new Promise((resolve) => {
        const done = () => resolve();
        a.addEventListener("ended", done, { once: true });
        a.addEventListener("error", done, { once: true });
      });

      // If this was the "current" clip, clear it.
      if (current === a) current = null;
      return true;
    } catch (e) {
      console.warn("audioPlayer.play blocked/failed:", u, e);
      if (current === a) current = null;
      return false;
    }
  }

  function setEnabled(v) {
    enabled = !!v;
    if (!enabled) stop();
  }

  function setDefaultVolume(v) {
    defaultVolume = clamp01(v);
  }

  function isEnabled() {
    return enabled;
  }

  function getState() {
    return {
      enabled,
      defaultVolume,
      isPlaying: !!current
    };
  }

  return {
    play,
    stop,
    preload,
    unlock,
    setEnabled,
    setDefaultVolume,
    isEnabled,
    getState
  };
})();