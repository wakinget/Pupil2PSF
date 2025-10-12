# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pupil2PSF is a web-based interactive visualizer for designing aperture masks and computing their Point Spread Functions (PSF) in real-time. Users draw custom aperture patterns on a canvas, and the application computes the PSF via 2D Fourier transform.

**Technology Stack:**
- Pure frontend (HTML5, CSS, JavaScript) - no build process required
- Fabric.js (v5.5.2) for interactive canvas drawing
- fft.js (v4.0.4) for 2D Fast Fourier Transforms
- Served via CDN dependencies

## Architecture

### Core Components

**Tool Registry System** (`ToolRegistry` object in js/script.js)
- Registry pattern for drawing tools (circle, rect, line, scribble, point)
- Each tool implements: `init()`, `update()`, `finalize()` lifecycle methods
- Tools support context-sensitive options panels
- Transmission-based grayscale drawing (0-100% maps to grayscale values)

**Canvas System**
- Main canvas: Fabric.js canvas for interactive drawing (default 512×512)
- Hidden raster canvas: Used for high-resolution rasterization before FFT
- PSF canvas: Displays computed PSF
- Colorbar canvas: Shows intensity scale with custom tick formatting

**FFT Pipeline** (renderPSF function)
1. Rasterize Fabric.js objects to grayscale array
2. Convert to complex array (real + imaginary components)
3. Compute 2D FFT via row-wise then column-wise 1D FFTs
4. Calculate intensity (magnitude squared)
5. Apply fftshift to center DC component
6. Apply tone mapping (linear/sqrt/log/dB scaling)
7. Apply colormap (grayscale/hot)
8. Render to canvas

**Auto-Update System**
- Standard mode: Render after object modifications complete
- Turbo mode: Throttled live updates during dragging/drawing (50ms interval)
- State management via `autoUpdateEnabled` and `turboEnabled` flags

### Key Data Flow

```
User Drawing → Fabric.js Objects → Rasterization (grayscale array) →
2D FFT → Magnitude Squared → fftshift → Tone Mapping → Colormap → Display
```

### Transmission Model

Objects store a `transmission` property (0-100) representing aperture transmission:
- 100 = fully transmissive (white on black background, black on white background)
- 0 = fully opaque (black on black background, white on white background)
- Gray values represent partial transmission
- Legacy objects without `.transmission` have it inferred from fill/stroke colors

## Development

### Running the Application

Open `index.html` directly in a web browser. No build step, server, or package installation required.

### File Structure

- `index.html` - Main HTML with inline CDN imports and CommonJS shim for fft.js
- `js/script.js` - All application logic (~1465 lines)
- `css/style.css` - Layout and styling
- `libs/` - Empty (dependencies loaded via CDN)

### Key Functions

**Tool Management**
- `selectTool(toolName)` - Switch active drawing tool
- `applyTransmission(obj, t)` - Set object's grayscale value from transmission %
- `setupLineEndpointControls(line)` - Custom Fabric.js controls for line endpoints

**FFT & Rendering**
- `rasterizeCanvasToArray(size, includeDraft)` - Convert Fabric canvas to Float32Array
- `fft2(real, imag, size)` - 2D FFT with unitary normalization (1/N scaling)
- `fftshift2D(input, size)` - Center zero-frequency component
- `renderPSF()` - Main render pipeline
- `triggerAutoRender(interval)` - Throttled render for auto-update mode

**Scaling & Colormap**
- `applyToneAndColormap(intensity, N, mode, cmap, clipP)` - Map intensity to RGBA
- `getColormapLUT(name, n)` - Generate colormap lookup table
- `renderColorbar(lut, canvas, scaleMode, vmax, opts)` - Draw colorbar with custom ticks

**Canvas Operations**
- `invertCanvas()` - Toggle black/white background
- `resetCanvas()` - Clear all objects
- `nudgeSelection(dx, dy)` - Move selected objects via arrow keys

### Resolution Handling

Resolution slider snaps to powers of 2 (16, 32, 64, 128, 256, 512, 1024, 2048) via `snapToPow2()`. FFT plan cache (`_fftPlanCache`) stores reusable FFT objects per resolution to avoid reallocation.

### Turbo Mode Rendering

When turbo mode is active, renders are throttled to 50ms intervals during:
- Object dragging (`object:moving`, `object:scaling`, `object:rotating`)
- Shape creation (`mouse:move` during drag)
- Free drawing (scribble tool)
- Keyboard nudging
- Transmission slider adjustment

A single "commit" render occurs when the action completes if turbo is off.

### Known Patterns

**Line Tool Specifics**
- Custom endpoint controls replace standard Fabric.js scaling controls
- Shift-key snapping to 0°, 45°, 90°, 135°, 180° angles
- Coordinates stored as `x1, y1, x2, y2` instead of `left, top, width, height`

**Point Tool**
- Renders as small 3px radius circle on canvas
- Overrides single pixel in rasterized array for precise PSF features
- Uses `customType: 'point'` flag for special handling

**Free Draw (Scribble)**
- Uses Fabric.js drawing mode (`canvas.isDrawingMode`)
- Brush color synced to current transmission value
- During turbo mode, includes in-progress brush strokes via `includeDraft` flag

### Debugging

Commented-out debug function `debugShowResidualMask()` can visualize anti-aliasing artifacts or background noise in the rasterized array.

## Common Tasks

### Adding a New Scaling Mode

1. Add option to `#psfScaling` select in index.html
2. Add case in `applyToneAndColormap()` for new tone mapping math
3. Add case in `buildColorbarTicks()` for appropriate tick labels
4. Update format logic in `renderColorbar()` if needed

### Adding a New Colormap

1. Add option to `#psfColormap` select in index.html
2. Implement colormap in `getColormapLUT()` as RGB lookup table (256 entries × 3 channels)

### Adding a New Drawing Tool

1. Add button to toolbar in index.html with `onclick="selectTool('newtool')"`
2. Add entry to `ToolRegistry` with `init()`, `update()`, `finalize()` methods
3. If tool needs options, create option panel HTML and set `optionsPanelId`
4. Update `selectTool()` if tool requires special canvas mode (like scribble uses `isDrawingMode`)
