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

This file provides guidance to Claude Code (claude.ai/code) **and** human collaborators for working in this repository. It acts as a living project manager, technical spec, **testing philosophy**, and behavior contract for AI-assisted edits.

---

## 🌠 Project Purpose & Vision

**Pupil2PSF** is an interactive, browser‑based tool for *teaching and exploring diffraction/Fourier optics*. Users draw pupil masks on a canvas and see the **Point Spread Function (PSF)** update in real time. We value **accessibility, clarity, correctness, and pedagogy** over micro‑optimizations.

**Primary audiences**
- Learners encountering PSFs for the first time
- Researchers prototyping aperture ideas quickly
- Instructors demonstrating Fourier optics concepts live

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

> Optional later: Map a custom domain by adding a CNAME in DNS to `yourusername.github.io` and setting the same in **Settings → Pages**.

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

## 🧱 Architecture Summary

**Canvas & Rendering**
- Fabric.js canvas (interactive drawing) → hidden raster canvas → FFT → PSF canvas + colorbar
- Auto‑update modes: standard (on commit), turbo (throttled during interactions)
- Transmission is a first‑class property (0–100%), inferred for legacy objects

**Key pipelines**
```
User Drawing → Fabric Objects → Rasterization (Float32, grayscale)
→ 2D FFT → |F|^2 → fftshift → tone mapping → colormap → Display
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
   - Verifies app boot, renders a small (64–128 px) PSF without exceptions.
2. **Numeric Invariants (Unit‑style)**  
   - **Energy/Parseval** (unitary FFT):  
     `sum(intensity) ≈ sum(input^2)` within `1e-6 * sum(input^2)` tolerance.  
   - **Non‑negativity**: Intensity map ≥ 0; NaN/Inf disallowed.  
   - **Monotonic tone mapping**: Order of pixel intensities preserved after tone map.  
   - **fftshift center**: For uniform pupil, peak near `[N/2, N/2]`.
3. **Scenario Checks (Qualitative → Quantified)**  
   - **Point pupil** → nearly uniform PSF (low variance across field).  
   - **Two‑point/line pupil** → fringes detectable: 1D FFT of PSF line has a strong off‑zero peak.  
   - **Circular pupil** → radial symmetry: angular variance of radial profile below threshold.
4. **Performance Budgets (reference machine)**  
   - 512 px: median render < **50 ms**; 1024 px: < **150 ms**; 2048 px: < **500 ms** (on release).  
   - Collect with `performance.now()`; print simple report in the runner.
5. **Cross‑Browser Matrix**  
   - Chrome/Firefox/Safari/Edge: numeric sums within small relative tolerance (e.g., 1e‑5); no console errors.
6. **Accessibility Quick Checks**  
   - Keyboard focus order reaches all controls; visible focus; colorbar labels readable (contrast ≥ AA).

**Determinism**
- Provide a `TEST_MODE` flag to disable throttling and random brush variance.
- If randomness is needed, seed via a fixed PRNG (e.g., `mulberry32(seed)`).

**Minimal test harness structure**
```
tests/
├─ runner.html      # loads modules, prints results
├─ assert.js        # tiny helpers: assert(), approxEqual()
├─ fft.spec.js      # energy, non-negativity, fftshift, tone map
└─ scenarios.spec.js# point, double-slit, circle symmetry checks
```

**Example: `tests/assert.js`**
```js
export function assert(cond, msg) {
  if (!cond) throw new Error(msg || "Assertion failed");
}
export function approxEqual(a, b, rel = 1e-6, abs = 1e-12) {
  const diff = Math.abs(a - b);
  return diff <= Math.max(abs, rel * Math.max(1, Math.abs(a), Math.abs(b)));
}
```

**Example: Energy invariant (unitary FFT)**
```js
import { fft2 } from "../js/fft.js";
import { assert, approxEqual } from "./assert.js";

export function testEnergyUnitary(real, imag, N) {
  // input power
  let Ein = 0;
  for (let i = 0; i < real.length; i++) Ein += real[i] * real[i] + imag[i] * imag[i];

  // FFT (unitary) then intensity
  const { real: Fr, imag: Fi } = fft2(real, imag, N);
  let Eout = 0;
  for (let i = 0; i < Fr.length; i++) Eout += Fr[i] * Fr[i] + Fi[i] * Fi[i];

  assert(approxEqual(Ein, Eout, 1e-6), `Energy mismatch: in=${Ein}, out=${Eout}`);
}
```

**How to run**
- Open `tests/runner.html` in any browser; view pass/fail summary and console output.
- Keep tests < 1s total so they’re easy to run often.

**Claude directives for testing**
- When editing `fft.js` or tone mapping: **add or update relevant tests** in `tests/`.
- Keep tests **framework‑free** (browser‑native) unless explicitly asked to add Jest/Vitest.
- Prioritize invariants over pixel‑perfect comparisons to avoid false failures.

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
5. **Generate a plan** (`/plan`) before multi‑file refactors; then apply focused diffs.
6. **Keep diffs minimal and commit‑ready**; group related changes logically.
7. **Ask for confirmation** when behavior changes might affect rendering output.
8. **Respect accessibility** (contrast, keyboard navigation, aria labels where appropriate).
9. **Accompany core logic changes with tests** in `tests/` when feasible.

---

## 👥 Collaboration Guidelines (human + Claude)

- Keep **this file** up‑to‑date (focus, milestones, conventions).  
- Use `/describe` to summarize modules; `/plan` for refactors; `/refactor` for agreed edits.  
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

## 🧪 Verification & Manual QA (quick checks)

- **Numerical sanity**: single point (uniform PSF); filled circle (qualitative Airy falloff).
- **Performance sanity**: 512px live < ~50 ms; 1024px acceptable in turbo; 2048px acceptable post‑interaction.
- **Cross‑browser**: No console errors; energy invariant holds within tolerance.
- **A11y**: Tab order reaches all controls; focus ring visible; colorbar text readable.

---

## 🧰 Common Tasks (recipes)

### Add a Tooltip (educational hint)
1. Add `title` attribute to control, or a custom tooltip component in `ui.js`.
2. Keep copy simple: 1–2 sentences, no jargon, link to “Help” panel for more.

### Add a Preset Aperture
1. Implement a builder in `tools.js` (e.g., `makeCentralObscuration({R, r})`).
2. Register preset in a menu list (`ui.js`), including a short description.
3. Call builder, add shapes to Fabric canvas, then trigger render.

### Add a Credits Footer
- Minimal HTML snippet inside `index.html` footer region:
```html
<footer class="credits">
  Pupil2PSF · © 2025 · <a href="https://github.com/<username>/Pupil2PSF" target="_blank" rel="noopener">GitHub</a>
  · Built with <a href="https://fabricjs.com/" target="_blank" rel="noopener">Fabric.js</a> and
  <a href="https://github.com/indutny/fft.js" target="_blank" rel="noopener">fft.js</a>.
</footer>
```
- Add small, muted styling in `style.css`; ensure good contrast and mobile wrapping.

### Prepare README.md (before hosting)
- **What**: one‑paragraph description + screenshot/GIF
- **Why**: educational goals and demo scenarios
- **How**: open `index.html` locally or visit GitHub Pages URL
- **Credits**: Fabric.js, fft.js, author(s)
- **License**: MIT (if chosen)

---

## 🎨 Visual Polish Guidelines (M2 inputs)

- **Typography**: a clear sans‑serif (e.g., Inter, system stack). Use 14–16px base, 20–24px for section titles.  
- **Spacing**: generous padding around canvases; 8px grid for controls; group related controls in cards.  
- **Color**: neutral UI (grays); accent color for active tool; ensure WCAG AA contrast for text (≥ 4.5:1).  
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

- `fft.js` — `fft2(real, imag, N)`, `fftshift2D(array, N)`, `applyToneMap(intensity, mode, clipP)`, `buildColorbarTicks(mode, vmax)`  
- `tools.js` — `ToolRegistry`, `applyTransmission(obj, t)`, tool lifecycles (`init/update/finalize`), preset builders  
- `ui.js` — `selectTool(name)`, event wiring, auto‑render throttle, colorbar/legend renderers  
- `main.js` — boot sequence, canvas setup, wiring modules together

---
