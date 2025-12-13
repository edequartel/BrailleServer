// /js/instructionplayer.js
// Audio-only instruction player with path logging

class InstructionPlayer {
  constructor(config, { log } = {}) {
    this.config = config;

    // support both casings, but keep lowercase in json
    this.audiobase = config.audiobase || config.audioBase || "";
    this.snippets = config.snippets || {};
    this.varaudiomap = config.varaudiomap || config.varAudioMap || {};

    this.log = typeof log === "function" ? log : (() => {});
  }

  async runInstructionById(id, context = {}) {
    const instr = (this.config.instructions || []).find(i => i.id === id);
    if (!instr) throw new Error(`Instruction not found: ${id}`);
    await this.runInstruction(instr, context);
  }

  async runInstruction(instr, context = {}) {
    const vars = { ...(instr.vars || {}) };

    const env = {
      context,
      vars,
      includes: (haystack, needle) =>
        typeof haystack === "string" && typeof needle === "string"
          ? haystack.includes(needle)
          : false
    };

    await this._runSteps(instr.script || [], env);
  }

  async _runSteps(steps, env) {
    for (const step of steps) {
      await this._runStep(step, env);
    }
  }

  async _runStep(step, env) {
    const t = step.type;

    if (t === "audio") {
      const file = this.snippets[step.name];
      if (!file) throw new Error(`Unknown snippet: ${step.name}`);
      await this._play(this.audiobase + file);
      return;
    }

    if (t === "audiovar") {
      const token = env.vars[step.var];
      const file = this.varaudiomap[token];
      if (!file) throw new Error(`No audio for token ${token}`);
      await this._play(this.audiobase + file);
      return;
    }

    if (t === "set") {
      env.vars[step.var] = this._evalExpr(step.expr, env);
      return;
    }

    if (t === "choice") {
      const ok = Boolean(this._evalExpr(step.expr, env));
      const branch = ok ? (step.then || []) : (step.else || []);
      await this._runSteps(branch, env);
      return;
    }

    if (t === "pause") {
      await new Promise(r => setTimeout(r, step.ms || 0));
      return;
    }

    throw new Error(`Unknown step type: ${t}`);
  }

  _evalExpr(expr, env) {
    if (!expr) return undefined;
    const display = env.context.display ?? "";
    const vars = env.vars;
    const includes = env.includes;
    // trusted json only
    // eslint-disable-next-line no-new-func
    return new Function("display", "vars", "includes", `return (${expr});`)(
      display, vars, includes
    );
  }

  _play(path) {
    const resolvedUrl = new URL(path, window.location.href).href;
    this.log("AUDIO PLAY", { path, resolvedUrl });

    return new Promise((resolve, reject) => {
      if (typeof Howl === "undefined") {
        reject(new Error("Howler.js not loaded"));
        return;
      }

      const sound = new Howl({
        src: [path],
        html5: true,
        onend: resolve,
        onloaderror: (_, err) => {
          this.log("AUDIO LOAD ERROR", { path, resolvedUrl, err });
          reject(err);
        },
        onplayerror: (_, err) => {
          this.log("AUDIO PLAY ERROR", { path, resolvedUrl, err });
          reject(err);
        }
      });

      sound.play();
    });
  }
}

window.InstructionPlayer = InstructionPlayer;