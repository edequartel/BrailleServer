// /js/instructionplayer.js
// Audio-only instruction player with unwrapped logging (HTML can toggle logging)

class InstructionPlayer {
  constructor(config, { log } = {}) {
    this.config = config || {};

    // Support both casings; prefer lowercase in JSON
    this.audiobase = this.config.audiobase || this.config.audioBase || "";
    this.snippets = this.config.snippets || {};
    this.varaudiomap = this.config.varaudiomap || this.config.varAudioMap || {};

    // log(msg) => unwrapped string logging
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
          : false,
      instruction: instr
    };

    // Log which instruction starts
    this.log(`INSTRUCTION START`);
    this.log(`  id: ${instr.id}`);
    if (instr.title) this.log(`  title: ${instr.title}`);

    await this._runSteps(instr.script || [], env);

    this.log(`INSTRUCTION END`);
    this.log(`  id: ${instr.id}`);
  }

  async _runSteps(steps, env) {
    for (let i = 0; i < steps.length; i++) {
      await this._runStep(steps[i], env, i);
    }
  }

  async _runStep(step, env, stepIndex) {
    if (!step || typeof step !== "object") throw new Error("Invalid step");

    // Normalize step type to lowercase
    const t = String(step.type || "").trim().toLowerCase();

    if (t === "audio") {
      const name = step.name;
      const file = this.snippets[name];
      if (!file) throw new Error(`Unknown snippet: ${name}`);

      this.log(`STEP ${stepIndex}: AUDIO`);
      this.log(`  snippet: ${name}`);
      this.log(`  file: ${file}`);

      await this._play(this.audiobase + file);
      return;
    }

    if (t === "audiovar") {
      const varName = step.var;
      const token = env.vars[varName];
      const file = this.varaudiomap[token];
      if (!file) throw new Error(`No audio for token ${token} (var ${varName})`);

      this.log(`STEP ${stepIndex}: AUDIOVAR`);
      this.log(`  var: ${varName}`);
      this.log(`  token: ${token}`);
      this.log(`  file: ${file}`);

      await this._play(this.audiobase + file);
      return;
    }

    if (t === "set") {
      const varName = step.var;
      const expr = step.expr;

      const value = this._evalExpr(expr, env);
      env.vars[varName] = value;

      this.log(`STEP ${stepIndex}: SET`);
      this.log(`  var: ${varName}`);
      this.log(`  expr: ${expr}`);
      this.log(`  value: ${value}`);

      return;
    }

    if (t === "choice") {
      const expr = step.expr;
      const ok = Boolean(this._evalExpr(expr, env));

      this.log(`STEP ${stepIndex}: CHOICE`);
      this.log(`  expr: ${expr}`);
      this.log(`  result: ${ok}`);

      const branch = ok ? (step.then || []) : (step.else || []);
      await this._runSteps(branch, env);
      return;
    }

    if (t === "pause") {
      const ms = Number(step.ms ?? 0);

      this.log(`STEP ${stepIndex}: PAUSE`);
      this.log(`  ms: ${ms}`);

      await new Promise(r => setTimeout(r, ms));
      return;
    }

    throw new Error(`Unknown step type: ${step.type}`);
  }

  _evalExpr(expr, env) {
    if (!expr) return undefined;

    const display = env.context.display ?? "";
    const vars = env.vars;
    const includes = env.includes;

    // Trusted JSON only
    // eslint-disable-next-line no-new-func
    const fn = new Function("display", "vars", "includes", `return (${expr});`);
    return fn(display, vars, includes);
  }

  _play(path) {
    const resolvedUrl = new URL(path, window.location.href).href;

    this.log(`AUDIO PLAY`);
    this.log(`  path: ${path}`);
    this.log(`  resolved: ${resolvedUrl}`);

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
          this.log(`AUDIO LOAD ERROR`);
          this.log(`  path: ${path}`);
          this.log(`  resolved: ${resolvedUrl}`);
          this.log(`  error: ${err}`);
          reject(err);
        },
        onplayerror: (_, err) => {
          this.log(`AUDIO PLAY ERROR`);
          this.log(`  path: ${path}`);
          this.log(`  resolved: ${resolvedUrl}`);
          this.log(`  error: ${err}`);
          reject(err);
        }
      });

      sound.play();
    });
  }
}

window.InstructionPlayer = InstructionPlayer;