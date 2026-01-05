// js/sounds.js
// Requires Howler.js to be loaded before this script.

const Sounds = {
  _config: null,
  _cache: {},
  _ready: false,
  _loading: null,
  _logFn: null,

  async init(configUrl = "config/sounds.json", logFn = null) {
    if (this._loading) return this._loading;

    this._logFn = typeof logFn === "function" ? logFn : null;

    this._loading = (async () => {
      this._log("🔊 Sounds.init → loading config:", configUrl);

      const res = await fetch(configUrl);
      if (!res.ok) {
        throw new Error(`Failed to load sounds config: ${res.status} ${res.statusText}`);
      }

      this._config = await res.json();
      this._ready = true;

      this._log("✅ sounds.json loaded");
      this._log("   baseUrl =", this._config.baseUrl);
      this._log("   defaultExtension =", this._config.defaultExtension);
    })();

    return this._loading;
  },

  _log(...args) {
    if (this._logFn) this._logFn(args.map(a => String(a)).join(" "));
    else console.log("[Sounds]", ...args);
  },

  /**
   * Build full URL for any category:
   *   letters | words | ui | stories
   */
  _buildUrl(lang, category, key) {
    if (!this._config) throw new Error("Sounds not initialized.");

    const cfg = this._config;
    const baseUrl = (cfg.baseUrl || "").replace(/\/+$/, "");
    const ext = cfg.defaultExtension || ".mp3";

    const langCfg = cfg.languages?.[lang];
    if (!langCfg) throw new Error(`Unknown language '${lang}'`);

    let folderPath = "";

    switch (category) {
      case "letters":       folderPath = langCfg.lettersPath;      break;
      case "words":         folderPath = langCfg.wordsPath;        break;
      case "ui":            folderPath = langCfg.uiPath;           break;
      case "stories":       folderPath = langCfg.stories;          break;
      case "instructions":  folderPath = langCfg.instructionsPath || langCfg.instructions; break;
      case "feedback":      folderPath = langCfg.feedbackPath;     break;
      default:
        throw new Error(`Unknown category '${category}'`);
    }

    if (!folderPath) {
      throw new Error(
        `No path configured for lang='${lang}', category='${category}'`
      );
    }

    folderPath = folderPath.replace(/\\/g, "/");
    if (!folderPath.startsWith("/")) folderPath = "/" + folderPath;

    const fileName = String(key).toLowerCase();

    return `${baseUrl}${folderPath}/${fileName}${ext}`;
  },

  _buildSharedUrl(key) {
    if (!this._config) throw new Error("Sounds not initialized.");

    const cfg = this._config;
    const baseUrl = (cfg.baseUrl || "").replace(/\/+$/, "");
    const ext = cfg.defaultExtension || ".mp3";

    let sharedPath = cfg.shared?.basePath || "/sounds/shared";
    sharedPath = sharedPath.replace(/\\/g, "/");
    if (!sharedPath.startsWith("/")) sharedPath = "/" + sharedPath;

    const fileName = String(key).toLowerCase();
    return `${baseUrl}${sharedPath}/${fileName}${ext}`;
  },

  _getHowl(fullUrl) {
    if (this._cache[fullUrl]) return this._cache[fullUrl];

    this._log("🎧 Creating Howl for", fullUrl);

    const howl = new Howl({
      src: [fullUrl],
      html5: true,
      onload: () => this._log("   ▶ loaded:", fullUrl),
      onloaderror: (id, err) => this._log("   ❌ loaderror:", fullUrl, err),
      onplayerror: (id, err) => this._log("   ❌ playerror:", fullUrl, err)
    });

    this._cache[fullUrl] = howl;
    return howl;
  },

  play(lang, category, key) {
    if (!this._ready) {
      this._log("⚠ Sounds.play called before init() finished.");
      return;
    }

    try {
      const url = this._buildUrl(lang, category, key);
      const howl = this._getHowl(url);
      this._log(`▶ play: lang=${lang}, cat=${category}, key=${key} → ${url}`);
      howl.play();
    } catch (e) {
      this._log("❌ play error:", e);
    }
  },

  // Convenience helpers
  playLetter(lang, letter) {
    this.play(lang, "letters", letter);
  },

  playWord(lang, wordKey) {
    this.play(lang, "words", wordKey);
  },

  playUI(lang, uiKey) {
    this.play(lang, "ui", uiKey);
  },

  /**
   * NEW → Play long audio stories / texts
   * Example:
   *   Sounds.playStory("nl", "hoofdstuk1");
   */
  playStory(lang, storyKey) {
    this.play(lang, "stories", storyKey);
  },

  playShared(key) {
    if (!this._ready) {
      this._log("⚠ Sounds.playShared called before init()");
      return;
    }

    try {
      const url = this._buildSharedUrl(key);
      const howl = this._getHowl(url);
      this._log(`▶ playShared: key=${key} → ${url}`);
      howl.play();
    } catch (e) {
      this._log("❌ playShared error:", e);
    }
  }
};

if (typeof window !== "undefined") {
  window.Sounds = Sounds;
}
