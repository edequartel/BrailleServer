play(lang, category, name) {
  if (!this.config) {
    logMessage("❌ ERROR: Sounds not loaded.");
    return;
  }

  const relativePath = this.config.languages[lang][category][name];
  const fullUrl = this.getUrl(relativePath);

  logMessage("▶️ Playing file: " + relativePath);
  logMessage("🌐 Full URL:     " + fullUrl);

  const sound = new Howl({
    src: [fullUrl],
    html5: true, // better for cross-domain streaming
    onload: () => {
      logMessage("✅ Audio loaded OK.");
    },
    onloaderror: (id, err) => {
      logMessage("❌ onloaderror: " + err);
      console.error("Howler onloaderror", id, err);
    },
    onplayerror: (id, err) => {
      logMessage("❌ onplayerror: " + err);
      console.error("Howler onplayerror", id, err);
    }
  });

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

  const sound = new Howl({
    src: [fullUrl],
    html5: true,
    onload: () => {
      logMessage("✅ Shared audio loaded OK.");
    },
    onloaderror: (id, err) => {
      logMessage("❌ Shared onloaderror: " + err);
      console.error("Howler shared onloaderror", id, err);
    },
    onplayerror: (id, err) => {
      logMessage("❌ Shared onplayerror: " + err);
      console.error("Howler shared onplayerror", id, err);
    }
  });

  sound.play();
}
