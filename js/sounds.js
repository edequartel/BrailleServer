let Sounds = {
  config: null,

  async loadConfig() {
    const jsonPath = "config/sounds.json";
    logMessage("📄 Loading config from: " + jsonPath);
	
	
	    // Detect the root URL where index.html is running
    const rootPath = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, "/");

    logMessage("🌐 Root path: " + rootPath);
    logMessage("📄 Loading config from: " + jsonPath);
    logMessage("➡️ Full request URL: " + rootPath + jsonPath);
	

    try {
      const response = await fetch(jsonPath);

      logMessage("↩️ Response status: " + response.status + " " + response.statusText);

      if (!response.ok) {
        logMessage("❌ ERROR: Could not load sounds.json from " + response.url);
        return;
      }

      this.config = await response.json();
      logMessage("✅ sounds.json loaded successfully.");
      logMessage("🔗 baseUrl: " + this.config.baseUrl);

    } catch (error) {
      logMessage("❌ ERROR reading sounds.json: " + error);
    }
  },

  getUrl(path) {
    return this.config.baseUrl + path;
  },

  play(lang, category, name) {
    if (!this.config) {
      logMessage("❌ ERROR: Sounds not loaded.");
      return;
    }

    const relativePath = this.config.languages[lang][category][name];
    const fullUrl = this.getUrl(relativePath);

    logMessage("▶️ Playing file: " + relativePath);
    logMessage("🌐 Full URL:     " + fullUrl);

    const sound = new Howl({ src: [fullUrl] });
    sound.play();
  },

  playShared(name) {
    if (!this.config) {
      logMessage("❌ ERROR: Sounds not loaded.");
      return;
    }

    const relativePath = this.config.shared[name];
    const fullUrl = this.getUrl(relativePath);

    logMessage("▶️ Playing shared: " + relativePath);
    logMessage("🌐 Full URL:       " + fullUrl);

    const sound = new Howl({ src: [fullUrl] });
    sound.play();
  }
};

(async () => {
  await Sounds.loadConfig();
})();
