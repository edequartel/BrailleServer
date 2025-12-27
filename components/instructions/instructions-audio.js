/* File: /js/instructions-click-list.js */
/* global Howl */

(() => {
  // Auto-detect base path:
  // - GitHub Pages: https://edequartel.github.io/BrailleServer/  => BASE="/BrailleServer"
  // - Local/other hosting at domain root                        => BASE=""
  const BASE = (location.hostname === "edequartel.github.io") ? "/BrailleServer" : "";

  const JSON_URL   = `${BASE}/config/instructions.json`;
  const AUDIO_BASE = `${BASE}/audio/`;

  const ul = document.getElementById("list");

  let currentIndex = -1;
  let currentHowl = null;
  let liEls = [];

  function logWarn(msg, data) {
    console.warn(`[InstructionsAudio] ${msg}`, data || "");
  }

  function logError(msg, data) {
    console.error(`[InstructionsAudio] ${msg}`, data || "");
  }

  function normalizePath(base, file) {
    return String(base).replace(/\/+$/, "") + "/" + String(file || "").replace(/^\/+/, "");
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

    const src = normalizePath(AUDIO_BASE, audioFile);
    logWarn(`Trying audio path: ${src}`);

    const howl = new Howl({
      src: [src],
      html5: true
    });

    currentIndex = index;
    currentHowl = howl;

    setItemState(index, "Stop", true, false);

    howl.on("end", () => {
      if (currentIndex === index) stopCurrent();
    });

    howl.on("loaderror", (id, err) => {
      logError(`Audio file NOT FOUND: ${src}`, err);
      if (currentIndex === index) {
        stopCurrent();
        setItemState(index, `Missing: ${src}`, false, true);
      }
    });

    howl.on("playerror", (id, err) => {
      logError(`Audio play error: ${src}`, err);
      if (currentIndex === index) {
        stopCurrent();
        setItemState(index, `Error: ${src}`, false, true);
      }
    });

    howl.play();
  }

  async function init() {
    const res = await fetch(JSON_URL, { cache: "no-store" });
    if (!res.ok) {
      logError(`Failed to fetch ${JSON_URL} (HTTP ${res.status})`);
      throw new Error("JSON fetch failed");
    }

    const data = await res.json();
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

      const filename = document.createElement("span");
      filename.className = "filename";
      filename.textContent = item.audio || "(no audio)";
      filename.style.opacity = "0.7";
      filename.style.fontSize = "0.85rem";

      const path = document.createElement("span");
      path.className = "path";
      path.textContent = item.audio ? normalizePath(AUDIO_BASE, item.audio) : "";
      path.style.fontSize = "0.75rem";
      path.style.opacity = "0.6";

      left.appendChild(title);
      left.appendChild(filename);
      left.appendChild(path);

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