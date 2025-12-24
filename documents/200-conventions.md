# CONVENTIONS.md

This repository is organized around a layered architecture:

- **Pages**: entry points (documents)
- **Domain components**: learning features (word trainer, games, story players)
- **Infrastructure components**: generic utilities (braille monitor, logging, TTS)
- **Data/config**: JSON-driven content

The goal is: **consistency, reuse, and maintainability** across many activities and devices.

—

## 1. Naming and casing

### 1.1 Folders and files
- Use **kebab-case** for all folders and files.
  - ✅ `word-trainer/word-trainer.js`
  - ✅ `braille-monitor/braille-monitor.css`
  - ❌ `BrailleMonitor.css`
  - ❌ `wordTrainer.js`

### 1.2 JavaScript naming
- **Classes**: `PascalCase`
  - ✅ `class WordTrainer {}`
- **Functions / variables / instances**: `camelCase`
  - ✅ `const wordTrainer = new WordTrainer(...)`
- **Constants**: `UPPER_SNAKE_CASE`
  - ✅ `const DEFAULT_TIMEOUT_MS = 1500`

### 1.3 IDs
- IDs used in JSON and routing should be **kebab-case**
  - ✅ `letter-sound-match`
  - ✅ `story-player-001`

—

## 2. Layering and dependency rules

### 2.1 Layers
- **Pages**: glue layer
- **Domain components**: learning logic, activity orchestration
- **Infrastructure components**: generic services and device-related UI
- **Data/config**: JSON content, schemas, and static assets

### 2.2 Dependency direction (mandatory)
Dependencies must go **down**, never up:

Pages
  ↓
Domain components
  ↓
Infrastructure components

Rules:
- Infrastructure components **must never** import or depend on domain components.
- Domain components **may** depend on infrastructure components.
- Pages may wire anything together but should contain minimal logic.

—

## 3. Folder structure conventions

Recommended structure:

/pages/                  Page entry points (.html)
/js/
  /pages/                Page controllers (glue)
/components/
  /infra/                Infrastructure components
  /domain/               Domain components
/config/                 JSON configuration and content

—

## 4. Pages

### 4.1 Purpose
A page is a document entry point. A page should do only:
1. Provide mount points (`<div id=“...”></div>`)
2. Include component CSS/JS files
3. Load a single page controller script

### 4.2 Page rules
- Avoid inline JavaScript.
- Avoid inline CSS (except trivial resets if needed).
- Do not fetch JSON or talk to BrailleBridge from the HTML file itself.
- Keep page markup minimal.

—

## 5. Page controllers (`/js/pages/*`)

### 5.1 Purpose
Page controllers are responsible for:
- loading JSON/config
- choosing which domain component to mount
- wiring domain components to infrastructure components
- high-level flow (routing, next/prev, session state)

### 5.2 Rules
- One controller per page.
- Controllers should not contain large UI templates (UI belongs in components).
- Controllers should rely on shared service clients (e.g., BrailleBridge client).

—

## 6. Components (general rules)

### 6.1 Components do not have HTML files (default)
- Components should generate their own DOM in JavaScript.
- Pages provide only a container element.

Allowed exceptions:
- `demo.html` in a component folder for isolated testing only.

### 6.2 Component contract (required)
Each component folder should contain:
- `<name>.js`
- `<name>.css` (if styling is needed)
- `README.md` describing:
  - mount container requirements
  - init/constructor usage
  - public API
  - required data shape

—

## 7. Infrastructure components (`/components/infra/*`)

### 7.1 Definition
Infrastructure components are generic utilities such as:
- braille monitor display mirror
- event logging UI
- feedback badge
- audio/TTS wrappers (ElevenLabs)
- intro player (audio/text)

### 7.2 Rules
- No domain knowledge (no “word”, “exercise”, “correct answer” concepts).
- Reusable across pages and trainers.
- Provide small, stable public APIs.

—

## 8. Domain components (`/components/domain/*`)

### 8.1 Definition
Domain components implement learning features, such as:
- word trainer
- letter games
- story players
- quizzes

### 8.2 Rules
- May orchestrate multiple activities.
- May call infrastructure components.
- Must not directly embed page-specific assumptions.

—

## 9. Word Trainer + Activities model

### 9.1 Word Trainer role
`word-trainer` is a **domain orchestrator**:
- loads/receives word data (from controller)
- selects activities
- manages flow (intro → activity → success/fail → next)

### 9.2 Activities inside Word Trainer
Activities are **plug-in modules** used by `word-trainer`, e.g.:
- game-match
- story-player
- spelling-check

Rules:
- Activities do not control global navigation.
- Activities do not talk directly to raw BrailleBridge endpoints.
- Activities run inside a provided container and use provided services.

Recommended location:
- `/components/domain/word-trainer/activities/*`

—

## 10. BrailleBridge integration

### 10.1 Central client (mandatory)
All access to BrailleBridge must go through **one module**:

/js/braille-bridge-client.js

This module owns:
- WebSocket connection + key event normalization
- REST calls (`/braille`, `/clear`, etc.)
- reconnect behavior
- logging options

Rules:
- Pages/components must not use raw `fetch(“http://localhost:...”)` directly.
- Pages/components must not open their own WebSocket connections.

—

## 11. JSON/data conventions

### 11.1 JSON is the source of truth
Content should be editable without changing code.

Rules:
- Keep JSON schemas stable.
- Avoid hidden required fields.
- Prefer explicit fields over positional arrays unless clearly documented.

### 11.2 IDs and filenames
- IDs: kebab-case
- Audio/story filenames: consistent conventions (e.g., `word-000.mp3`)

—

## 12. Logging and debugging

- Prefer a consistent logging utility rather than ad-hoc `console.log`.
- For BrailleBridge issues, log:
  - connection status
  - last key event
  - last REST call + response code

—

## 13. Accessibility and resilience

- Components must degrade gracefully if:
  - no BrailleBridge is running
  - audio cannot be played
  - JSON fails to load

- Failures should be visible in:
  - event log component (if present)
  - console (always)

—

## 14. Quick checklist

Before merging changes:
- [ ] Naming is kebab-case for files/folders
- [ ] No raw BrailleBridge calls outside `braille-bridge-client.js`
- [ ] Page HTML has no logic
- [ ] Components have README.md contract
- [ ] Domain components do not depend on infra components inversely
- [ ] Paths work on case-sensitive hosting (GitHub Pages / Linux)

—