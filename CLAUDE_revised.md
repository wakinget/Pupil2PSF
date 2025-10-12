# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and human collaborators when working with code in this repository.

---

## 🌠 Project Overview

**Pupil2PSF** is an interactive web-based tool for **teaching and exploring diffraction and Fourier optics**.  
Users can design custom pupil masks directly on a 2D canvas and visualize the corresponding **Point Spread Function (PSF)** in real-time.

### ✨ Educational Goal

Pupil2PSF is intended as an **accessible, browser-based laboratory** for:
- Understanding the relationship between aperture geometry and PSF structure.
- Exploring optical design concepts such as obscurations, interference, and spatial filtering.
- Providing a self-contained environment for students or researchers without requiring local installations.

### 🌍 Hosting Vision

Because this app is fully client-side (HTML + JS + CDN dependencies), it can be hosted almost anywhere:
- **Short-term:** Run locally by opening `index.html`.
- **Medium-term:** Deploy via **GitHub Pages** (no server required).
- **Long-term:** Integrate with a personal or institutional website for broader educational use.

---

## 🧱 Technology Stack

- **Frontend:** Pure HTML5, CSS, and JavaScript (no build process)
- **Canvas Engine:** [Fabric.js](https://fabricjs.com/) v5.5.2
- **FFT Engine:** [fft.js](https://github.com/indutny/fft.js) v4.0.4
- **Dependencies:** Loaded via CDN (no npm or bundler required)
- **Browser Compatibility:** Chrome, Firefox, Edge, Safari (latest versions)

---

## ⚙️ Architecture Overview

### Core Components

**Tool Registry System** (`ToolRegistry` in `js/script.js`)
- Modular registry pattern for drawing tools (`circle`, `rect`, `line`, `scribble`, `point`).
- Each tool implements lifecycle methods: `init()`, `update()`, `finalize()`.
- Supports custom options panels for tool-specific controls.
- Transmission-based grayscale drawing (0–100% → grayscale intensity).

**Canvas System**
- **Main Canvas:** Fabric.js drawing area (default 512×512).
- **Hidden Raster Canvas:** Converts Fabric objects to arrays for FFT processing.
- **PSF Canvas:** Displays intensity results from 2D FFT.
- **Colorbar Canvas:** Renders intensity scales with custom tick formatting.

**FFT Pipeline** (`renderPSF()`)
1. Rasterize Fabric objects to a grayscale Float32Array.
2. Construct complex-valued array (real + imaginary).
3. Compute 2D FFT using row/column 1D transforms.
4. Calculate magnitude squared intensity.
5. Apply `fftshift` to center DC component.
6. Perform tone mapping (linear / sqrt / log / dB).
7. Apply colormap (grayscale / hot).
8. Render to canvas.

**Auto-Update System**
- **Standard mode:** Renders after object modifications.
- **Turbo mode:** Throttled live updates during drawing (50 ms interval).

---

## 🔄 Data Flow

```
User Drawing → Fabric.js Objects → Rasterization (Grayscale Array) →
2D FFT → Intensity → FFT Shift → Tone Mapping → Colormap → Display
```

---

## 🧮 Transmission Model

Each object stores a `transmission` property (0–100):
- **100%** = Fully transmissive
- **0%** = Fully opaque  
Gray values represent partial transmission.

Legacy shapes without `.transmission` infer it from fill/stroke color.

---

## 🧩 Development Workflow

### Running the App
Open `index.html` directly in your browser — no server or build step required.

### Recommended Directory Structure

```
Pupil2PSF/
├── index.html
├── js/
│   └── script.js
├── css/
│   └── style.css
├── libs/
│   └── (optional future local dependencies)
├── CLAUDE.md
└── README.md
```

### Version Control Setup

To initialize Git and sync with GitHub:

```bash
git init
git add .
git commit -m "Initial commit of Pupil2PSF"
git branch -M main
git remote add origin https://github.com/<username>/Pupil2PSF.git
git push -u origin main
```

Once committed, PyCharm and Claude Code can both track edits to `CLAUDE.md` and `script.js`.

---

## 🚀 Roadmap

### Phase 1 — Foundation (current)
- ✅ Real-time FFT rendering and canvas tools
- ✅ Grayscale transmission model
- ✅ Turbo mode throttling
- ⚙️ Basic UI and colorbar rendering

### Phase 2 — Educational Extensions
- Add example apertures (e.g., circular pupil, hexagonal array, central obstruction)
- Add on-screen help: “What is a PSF?” and “Why does this pattern appear?”
- Add export buttons: **Save PNG**, **Save PSF Data (CSV)**

### Phase 3 — UX & Performance
- Introduce undo/redo stack
- Optimize rasterization (consider Web Workers)
- Add GPU-based FFT (optional enhancement)

### Phase 4 — Hosting & Outreach
- Host via GitHub Pages (`https://username.github.io/Pupil2PSF`)
- Write short documentation site with learning examples
- Optionally embed in a personal or institutional website

---

## 🧠 Guidelines for Future Development

| Category | Convention |
|-----------|-------------|
| **Language** | JavaScript (ES6 preferred) |
| **Style** | Consistent semicolon usage, camelCase, 2-space indent |
| **Comments** | Use JSDoc-style headers for major functions |
| **Testing** | Add simple validation utilities comparing FFT output to NumPy (future feature) |
| **Performance** | Cache FFT plans per resolution; throttle re-renders |
| **Accessibility** | Add keyboard shortcuts and tooltips for educational clarity |

---

## 📚 Common Tasks

### Add a New Colormap
1. Add option in `#psfColormap` (`index.html`).
2. Implement LUT in `getColormapLUT(name, n)`.
3. Add label logic to `renderColorbar()`.

### Add a New Scaling Mode
1. Update `#psfScaling` dropdown.
2. Add tone mapping logic to `applyToneAndColormap()`.
3. Update `buildColorbarTicks()`.

### Add a New Drawing Tool
1. Add toolbar button in `index.html`.
2. Add entry in `ToolRegistry`.
3. Define `init()`, `update()`, and `finalize()`.
4. Add options panel if needed.

---

## 🧩 Debugging Tools

Use or expand the existing `debugShowResidualMask()` utility to visualize rasterization artifacts or aliasing errors.

---

## 📘 Collaboration with Claude Code

Claude Code can assist with:
- Refactoring monolithic scripts into modules.
- Creating educational examples and tooltips.
- Generating docstrings and type annotations.
- Drafting GitHub issues or pull request summaries.
- Auto-updating this file when new tools or modes are added.

Example prompt:
```
claude /plan modularize FFT functions from script.js
claude /summarize CLAUDE.md
```

---

## 💬 License & Attribution

This project is open for educational use and may be released under an **MIT License** once version-controlled.

Copyright © 2025
