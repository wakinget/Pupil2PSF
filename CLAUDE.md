# CLAUDE.md
<!--
CLAUDE_META:
  coding_style = "clear, documented, and instructive"
  verbosity = "medium"
  confirmation_required = true
  optimization_priority = "accuracy_over_speed"
  use_comments = true
  commit_policy:
    create_commit_messages: true
    commit_scope: "module-level"
    commit_format: "[CLAUDE] {summary}"
-->

This file is the **project brain** for Pupil2PSF. It guides both humans and Claude Code on goals, conventions, testing, and collaboration. It also clarifies **how to talk to Claude** based on the latest docs: **prefer natural language**, avoid referencing non-existent slash commands, and assume **Sonnet** model usage only.

---

## 🌠 Project Purpose & Vision

**Pupil2PSF** is an interactive, browser‑based tool for *teaching and exploring diffraction/Fourier optics*. Users draw pupil masks on a canvas and see the **Point Spread Function (PSF)** update in real time. We value **accessibility, clarity, correctness, and pedagogy** over micro‑optimizations.

**Primary audiences**
- Learners encountering PSFs for the first time
- Researchers prototyping aperture ideas quickly
- Instructors demonstrating Fourier optics concepts live

---

## 🗣️ How to Interact with Claude (per new docs)

- **Primary interface: natural language.** Ask for plans, edits, and explanations in plain English.
- **Avoid assuming slash commands.** Your local Claude Code version may not expose many built-ins. Do **not** rely on commands such as `/describe`, `/refactor`, or `/apply`.
- If you want to see what slash commands *are* available in your install, run **`/help`** (if present). Otherwise, stick to natural language.
- **Model selection:** this project assumes **Sonnet-only** access. Do **not** request model switches.
- **Suggested prompt style (examples):**
  - “Please draft a step‑by‑step plan to split `js/script.js` into `fft.js`, `ui.js`, `tools.js`, and `main.js` as described in CLAUDE.md.”
  - “Implement the approved plan now, creating those files and updating `index.html` for ES modules. Keep diffs minimal and commit‑ready.”
  - “Explain what changed and why. List any risks and how to test quickly.”

> Claude should **first produce a clear plan**, then implement. It must keep diffs small, readable, and aligned with this file’s conventions.

---

## 🎯 Current Focus & Milestones

**M1 — Code Modularization (current)**  
Refactor the monolithic `js/script.js` into small ES modules with clear boundaries and JSDoc comments.

**M2 — Educational UX & Visual Polish (next)**  
Improve approachability and teaching value via contextual **tooltips**, a **preset apertures** menu, and an **in‑app credits footer**. Refresh the UI styling (colors/typography/spacing/icons) for a friendly, modern look.

**M3 — Docs & Hosting (then)**  
Add a crisp **README.md**; host on **GitHub Pages**; sanity‑test in Chrome/Firefox/Safari/Edge.

### ✅ Acceptance Criteria

**M1 (Modularization)**
- `js/fft.js` – 2D FFT, fftshift, tone mapping helpers (pure functions, unit‑style sanity checks)
- `js/tools.js` – ToolRegistry + tool implementations (circle/rect/line/scribble/point)
- `js/ui.js` – DOM wiring, controls, colorbar rendering, event throttling
- `js/main.js` – App bootstrap and high‑level coordination
- ES6 imports used; `index.html` updated accordingly
- Each major function has a brief JSDoc header
- No file exceeds ~400–500 lines

**M2 (Educational UX & Polish)**
- Hover **tooltips** for major controls (explain “transmission”, “scaling”, “colormap”)
- **Preset apertures** menu (Airy disk, central obscuration, double slit, hex grid)
- **Credits footer** (attribution + repo link; collapsible on mobile)
- Updated **color palette & typography** (accessible contrast)
- Keyboard help overlay (shortcut hints) or a compact “Help” panel
- Basic **a11y** checks: focus outlines visible; controls keyboard‑reachable

**M3 (Docs & Hosting)**
- A friendly **README.md** with: purpose, features, 1‑minute quick‑start, screenshots/GIF, Pages URL
- Pages enabled; site loads without console errors in the 4 evergreen browsers

> **Note on exports:** Image/CSV export is *intentionally deferred*. Re‑evaluate after M2 based on user feedback.

---

## 🌍 Hosting Plan (GitHub Pages)

This app is a fully static site (HTML/CSS/JS + CDN dependencies), ideal for **GitHub Pages**.

**Deployment target**  
`https://<username>.github.io/Pupil2PSF/`

**Pre‑host checklist**
- [ ] All resource paths are **relative** (e.g., `./js/main.js`, `./css/style.css`)
- [ ] `index.html` lives at the repo root
- [ ] No local file references or build steps required
- [ ] A concise **README.md** exists (project goal, quick start, screenshots/GIF, Pages link)

**Enabling Pages**
1. Repo → **Settings → Pages**
2. **Build and deployment**: *Deploy from a branch*
3. **Branch**: `main` & **Folder**: `/ (root)`
4. Save; verify live URL after publish

---

## 🧱 Architecture Summary

**Canvas & Rendering**
- Fabric.js canvas (interactive drawing) → hidden raster canvas → FFT → PSF canvas + colorbar
- Auto‑update modes: standard (on commit), turbo (throttled during interactions)
- Transmission is a first‑class property (0–100%), inferred for legacy objects

**Key pipeline**
```
User Drawing → Fabric Objects → Rasterization (Float32, grayscale)
→ 2D FFT → |F|^2 → fftshift → tone mapping → colormap → Display
```

---

## 📁 File & Naming Conventions

**Directory layout (target post‑M1)**
```
Pupil2PSF/
├─ index.html                 # Entry point (root for GitHub Pages)
├─ css/
│  └─ style.css               # Layout + theming
├─ js/
│  ├─ main.js                 # App bootstrap / wiring
│  ├─ ui.js                   # UI handlers, colorbar, event control
│  ├─ tools.js                # ToolRegistry + tools
│  └─ fft.js                  # FFT, fftshift, tone/tick helpers
├─ tests/                     # Lightweight browser tests (no build)
│  ├─ runner.html
│  ├─ assert.js
│  ├─ fft.spec.js
│  └─ scenarios.spec.js
├─ assets/                    # Icons, sample aperture JSON, images (optional)
├─ CLAUDE.md                  # Project brain (this file)
└─ README.md                  # Public-facing doc for GitHub
```

**Naming**
- Files: `lower-kebab-case.ext` (except `main.js`, *de facto* entry name)
- Variables: `camelCase`; constants: `ALL_CAPS`; classes: `PascalCase`
- HTML ids: `kebab-case`; CSS classes: `kebab-case`
- Functions: action‑oriented (`renderPSF`, `applyToneMap`, `rasterizeCanvasToArray`)

**Formatting**
- 2‑space indent; keep semicolons consistent
- Single quotes for JS strings; double quotes for HTML attributes
- End file with newline
- Line endings: **LF** preferred. Include `.gitattributes` (see below).

**Comments (JSDoc)**
```js
/**
 * renderPSF: compute and draw the PSF from the current raster.
 * @param {Float32Array} real
 * @param {Float32Array} imag
 * @param {number} size
 * @returns {void}
 */
```

**Paths**
- Use **relative** paths in HTML/JS (`./js/main.js`), never absolute OS paths

---

## 🧩 AI Behavioral Directives (for Claude)

When planning or editing:
1. **Preserve readability** and pedagogy; explain nontrivial steps briefly in comments.
2. **Honor modular boundaries**; do not re‑monolithize.
3. **Avoid adding build tools or frameworks** unless explicitly requested.
4. **Prefer standard Web APIs and CDN libs** we already use.
5. **First: produce a concise plan** for multi‑file changes; **then** implement.
6. **Keep diffs minimal and commit‑ready**; group related changes logically.
7. **Ask for confirmation** when behavior changes might affect rendering output.
8. **Respect accessibility** (contrast, keyboard navigation, aria labels where appropriate).
9. **Accompany core logic changes with tests** in `tests/` when feasible.

---

## 👥 Collaboration Guidelines (human + Claude)

- Keep **this file** up‑to‑date (focus, milestones, conventions).  
- Prefer natural-language requests; avoid assuming slash commands exist.  
- Favor small, reviewable PRs.  
- Before merges, test in Chrome + Firefox at minimum (512 & 1024 grids).

### 🪶 Git & Commit Policy

- Claude should always produce **commit-ready diffs**, but **not auto-commit** or push.  
- Humans review and commit changes manually using the Git tab or CLI.  
- Commit messages should be concise (≤ 80 chars) and descriptive.  
- Logical grouping guidelines:  
  - One commit per feature or bug fix.  
  - Separate cosmetic (UI/text) changes from logic changes.  
- Example messages:  
  - `Refactor: split script.js into fft/ui/tools modules`  
  - `Feature: add tooltip support to scaling slider`  
  - `Docs: update CLAUDE.md testing philosophy section`

**Claude Commit Directives (hint)**  
```yaml
commit_policy:
  create_commit_messages: true
  commit_scope: "module-level"
  commit_format: "[CLAUDE] {summary}"
```

---

## ✅ Testing Philosophy & Strategy

**Goals**
- **Correctness** of math (FFT, fftshift, tone mapping)
- **Stability** across browsers
- **Pedagogical integrity** (outputs align with expected qualitative optics)
- **Performance** remains interactive at target sizes

**Testing tiers** (lightweight, no build tools required)
1. **Smoke Tests (Runner Page)**  
   - `tests/runner.html` loads ES modules and runs assertions; on‑screen pass/fail.
2. **Numeric Invariants (Unit‑style)**  
   - **Energy/Parseval** (unitary FFT): `sum(|F|^2) ≈ sum(input^2)` within tolerance.  
   - **Non‑negativity**: Intensity map ≥ 0; NaN/Inf disallowed.  
   - **Monotonic tone mapping**: Order of pixel intensities preserved after tone map.  
   - **fftshift center**: For uniform pupil, peak near `[N/2, N/2]`.
3. **Scenario Checks (Qualitative → Quantified)**  
   - **Point pupil** → near-uniform PSF (low variance).  
   - **Double slit** → clear fringes (1D FFT of PSF line has off-zero peak).  
   - **Circular pupil** → radial symmetry (low angular variance).
4. **Performance Budgets** (reference machine)  
   - 512 px: median render < **50 ms**; 1024 px: < **150 ms**; 2048 px: < **500 ms** (on release).  
5. **Cross‑Browser Matrix**  
   - Chrome/Firefox/Safari/Edge: no console errors; sums within tolerance.
6. **Accessibility Quick Checks**  
   - Keyboard focus order reaches all controls; visible focus; colorbar labels readable.

**Determinism**
- Provide a `TEST_MODE` flag to disable throttling and random brush variance.
- If randomness is needed, seed via a fixed PRNG.

**Minimal test harness structure**
```
tests/
├─ runner.html
├─ assert.js
├─ fft.spec.js
└─ scenarios.spec.js
```

---

## 🎨 Visual Polish Guidelines (M2 inputs)

- **Typography**: clear sans‑serif (system stack or Inter). 14–16px base; 20–24px section titles.  
- **Spacing**: generous padding around canvases; 8px grid for controls; group related controls in cards.  
- **Color**: neutral UI (grays); accent color for active tool; ensure WCAG AA contrast.  
- **Icons**: lightweight SVGs for tools; keep labels visible for clarity.  
- **Colorbar**: crisp ticks; readable numeric labels; responsive width on small screens.

---

## 📄 Repo Hygiene

**`.gitignore` (static web)**
```
.DS_Store
Thumbs.db
desktop.ini
.idea/
.vscode/
*.log
*.tmp
node_modules/
dist/
build/
__pycache__/
.venv/
venv/
```

**`.gitattributes` (normalize to LF)**
```
* text eol=lf
```

After adding `.gitattributes`, run once:
```
git add --renormalize .
git commit -m "Normalize line endings to LF"
```

---

## 🗺️ Roadmap & Backlog

- **M1**: Modularization (fft/ui/tools/main) + JSDoc + imports (🚧)
- **M2**: Tooltips · Preset apertures · Credits footer · Visual theme polish · Keyboard help (⏳)
- **M3**: README.md · GitHub Pages hosting · Cross‑browser sanity pass (⏳)

**Later (evaluate post‑M2)**
- Optional export (PNG/CSV) of PSF and pupil raster
- Web Worker offload for heavy FFTs (performance)
- GPU/WebGL path (exploration)
- Undo/redo stack
- “About PSF” mini‑guide with diagrams

---

## 💬 License & Attribution

If open‑sourcing, MIT license is recommended for educational reuse.  
Please attribute external libraries in the credits footer and README:
- **Fabric.js** — https://fabricjs.com/
- **fft.js (indutny)** — https://github.com/indutny/fft.js

---

## 🔎 Appendix: Quick Module Notes (post‑M1 targets)

- `fft.js` — `fft2(real, imag, N)`, `fftshift2D(array, N)`, tone map & tick helpers  
- `tools.js` — `ToolRegistry`, `applyTransmission(obj, t)`, tool lifecycles, preset builders  
- `ui.js` — `selectTool(name)`, event wiring, auto‑render throttle, colorbar/legend renderers  
- `main.js` — boot sequence, canvas setup, wiring modules together
