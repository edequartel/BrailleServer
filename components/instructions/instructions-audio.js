/* File: /js/instructions-click-list.js */
/* global Howl */

(() => {
  // Auto-detect base path:
  // - GitHub Pages: https://edequartel.github.io/BrailleServer/  => BASE="/BrailleServer"
  // - Local/other hosting at domain root                        => BASE=""
  const BASE = (location.hostname === "edequartel.github.io") ? "/BrailleServer" : "";

  const JSON_URL = `${BASE}/config/instructions.json`;
  const SOUNDS_URL = `${BASE}/config/sounds.json`;

  const ul = document.getElementById("list");
  const playLogEl = document.getElementById("play-log");
  const langPillEl = document.getElementById("lang-pill");

  let currentIndex = -1;
  let currentHowl = null;
  let liEls = [];
  let audioBase = "";
  let defaultExt = ".mp3";

  function logWarn(msg, data) {
    console.warn(`[InstructionsAudio] ${msg}`, data || "");
    if (playLogEl) playLogEl.textContent = msg;
  }

  function logError(msg, data) {
    console.error(`[InstructionsAudio] ${msg}`, data || "");
    if (playLogEl) playLogEl.textContent = msg;
  }

  function normalizePath(base, file) {
    return String(base).replace(/\/+$/, "") + "/" + String(file || "").replace(/^\/+/, "");
  }

  function normalizeLang(tag) {
    const t = String(tag || "").trim().toLowerCase();
    const base = t.split("-")[0];
    return (base === "nl" || base === "en") ? base : "nl";
  }

  function resolveLang() {
    if (window.SettingsStore && typeof window.SettingsStore.load === "function") {
      return normalizeLang(window.SettingsStore.load().lang);
    }

    const rawSettings = localStorage.getItem("localstorage.json");
    if (rawSettings) {
      try {
        const parsed = JSON.parse(rawSettings);
        if (parsed && parsed.lang) return normalizeLang(parsed.lang);
      } catch {}
    }

    const stored = localStorage.getItem("bs_lang");
    if (stored) return normalizeLang(stored);

    const htmlLang = document.documentElement.getAttribute("lang");
    if (htmlLang) return normalizeLang(htmlLang);

    return "nl";
  }

  function getInstructionsPath(cfg, lang) {
    const langs = cfg?.languages || {};
    const langCfg = langs[lang] || langs.nl || langs.en || Object.values(langs)[0];
    return langCfg?.instructionsPath || langCfg?.instructions || "";
  }

  function buildAudioBase(cfg, lang) {
    const baseUrl = String(cfg?.baseUrl || "").replace(/\/+$/, "");
    const instrPath = getInstructionsPath(cfg, lang);
    if (!instrPath) throw new Error("No instructions path in sounds.json");
    const normalizedPath = instrPath.startsWith("/") ? instrPath : `/${instrPath}`;
    return `${baseUrl}${normalizedPath}`;
  }

  function ensureExtension(fileName) {
    const name = String(fileName || "");
    if (!name) return name;
    if (/\.[a-z0-9]+$/i.test(name)) return name;
    return name + defaultExt;
  }

  function buildAudioUrl(audioFile) {
    if (/^https?:\/\//i.test(audioFile)) return audioFile;
    return normalizePath(audioBase, ensureExtension(audioFile));
  }

  function setItemState(index, stateText, isPlaying = false, isError = false) {
    const li = liEls[index];
    if (!li) return;

    const state = li.querySelector(".state");
    const pathEl = li.querySelector(".path");

    li.classList.toggle("playing", isPlaying);
    li.classList.toggle("error", isError);

    state.textContent = stateText;

    if (pathEl) {
      pathEl.style.color = isError ? "#ff6b6b" : "";
    }
  }

  function stopCurrent() {
    if (currentHowl) {
      try { currentHowl.stop(); } catch {}
      currentHowl = null;
    }
    if (currentIndex >= 0) setItemState(currentIndex, "Play", false, false);
    currentIndex = -1;
  }

  function playIndex(index, item) {
    if (!item || !("audio" in item)) {
      logWarn("Missing 'audio' field in JSON item", item);
      setItemState(index, "No audio", false, true);
      return;
    }

    const audioFile = String(item.audio || "").trim();
    if (!audioFile) {
      logWarn("Empty audio filename", item);
      setItemState(index, "No audio", false, true);
      return;
    }

    const src = buildAudioUrl(audioFile);
    logWarn(`Trying audio path: ${src}`);

    const howl = new Howl({
      src: [src],
      html5: true
    });

    currentIndex = index;
    currentHowl = howl;

    setItemState(index, "Stop", true, false);
    if (playLogEl) playLogEl.textContent = `Playing: ${src}`;

    howl.on("end", () => {
      if (currentIndex === index) stopCurrent();
    });

    // CHANGE: do NOT show the path in the "Missing" state text
    howl.on("loaderror", (id, err) => {
      logError(`Audio file NOT FOUND: ${src}`, err);
      if (currentIndex === index) {
        stopCurrent();
        setItemState(index, "Missing file", false, true);
      }
    });

    // CHANGE: do NOT show the path in the "Error" state text
    howl.on("playerror", (id, err) => {
      logError(`Audio play error: ${src}`, err);
      if (currentIndex === index) {
        stopCurrent();
        setItemState(index, "Play error", false, true);
      }
    });

    howl.play();
  }

  async function init() {
    const [soundsRes, instrRes] = await Promise.all([
      fetch(SOUNDS_URL, { cache: "no-store" }),
      fetch(JSON_URL, { cache: "no-store" })
    ]);

    if (!soundsRes.ok) {
      logError(`Failed to fetch ${SOUNDS_URL} (HTTP ${soundsRes.status})`);
      throw new Error("sounds.json fetch failed");
    }

    const soundsCfg = await soundsRes.json();
    const lang = resolveLang();
    defaultExt = String(soundsCfg?.defaultExtension || ".mp3");
    audioBase = buildAudioBase(soundsCfg, lang);
    if (langPillEl) langPillEl.textContent = String(lang).toUpperCase();

    if (!instrRes.ok) {
      logError(`Failed to fetch ${JSON_URL} (HTTP ${instrRes.status})`);
      throw new Error("instructions.json fetch failed");
    }

    const data = await instrRes.json();
    if (!Array.isArray(data)) {
      logError("instructions.json is not an array", data);
      throw new Error("Invalid JSON");
    }

    ul.innerHTML = "";
    liEls = [];

    data.forEach((item, index) => {
      const li = document.createElement("li");

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.flexDirection = "column";
      left.style.gap = "0.25rem";

      const title = document.createElement("span");
      title.className = "title";
      title.textContent = item.title || `Item ${index + 1}`;

      left.appendChild(title);

      const state = document.createElement("span");
      state.className = "state";
      state.textContent = "Play";

      li.appendChild(left);
      li.appendChild(state);

      li.addEventListener("click", () => {
        if (currentIndex === index && currentHowl) {
          stopCurrent();
          return;
        }
        stopCurrent();
        playIndex(index, item);
      });

      ul.appendChild(li);
      liEls.push(li);
    });
  }

  init().catch(err => {
    logError("Initialization failed", err);
    ul.innerHTML = `
      <li style="border:1px solid #ff6b6b; padding:0.8rem; border-radius:12px;">
        Failed to load instructions list
      </li>`;
  });
})();
