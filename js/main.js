/**
 * main.js
 * =======
 * Application bootstrap and PSF rendering orchestration for Pupil2PSF.
 * Wires together fft.js, tools.js, and ui.js modules.
 */

import { fft2, fftshift2D, magnitudeSquared, applyToneAndColormap,
         getColormapLUT, buildColorbarTicks, LOG_FLOOR } from './fft.js';
import { ToolRegistry, applyTransmission, transmissionToGray } from './tools.js';
import { initializeUI, selectTool, renderColorbar, paintPSFToCanvas,
         rasterizeCanvasToArray, triggerAutoRender, invertCanvas, resetCanvas,
         getSliderSnapN, isScribblingNow, setupKeyboardHandlers,
         getContext, getCanvas, getAutoUpdateEnabled, getTurboEnabled } from './ui.js';

// -------------------- Application Bootstrap --------------------

let canvas = null;

/**
 * Application entry point
 */
window.onload = function () {
  canvas = new fabric.Canvas('pupilCanvas', { willReadFrequently: true });
  canvas.selection = false;

  // Initialize UI with callbacks
  initializeUI(canvas, ToolRegistry, {
    renderPSF: renderPSF,
    selectTool: (tool) => selectTool(tool, ToolRegistry)
  });

  // Set up mouse event handlers for shape drawing
  setupMouseHandlers();

  // Set up keyboard handlers
  setupKeyboardHandlers();

  // Select initial tool
  selectTool('circle', ToolRegistry);
};

// -------------------- Mouse Event Handlers --------------------

/**
 * setupMouseHandlers
 * ------------------
 * Wire up mouse events for drawing shapes with tools.
 *
 * @returns {void}
 */
function setupMouseHandlers() {
  let dragStart = null;
  let dragShape = null;

  canvas.on('mouse:down', function (opt) {
    if (canvas.isDrawingMode || opt.target) return;
    dragStart = canvas.getPointer(opt.e);
    const currentTool = getContext().currentTool;
    const tool = ToolRegistry[currentTool];
    if (tool?.init) {
      dragShape = tool.init(dragStart, getContext());
      canvas.add(dragShape);
    }
  });

  canvas.on('mouse:move', function (opt) {
    // --- Shape drawing case ---
    if (!canvas.isDrawingMode && dragShape) {
      const pointer = canvas.getPointer(opt.e);
      const currentTool = getContext().currentTool;
      const tool = ToolRegistry[currentTool];
      if (tool?.update) {
        tool.update(dragShape, dragStart, pointer);
        canvas.requestRenderAll();
      }

      // Turbo update while dragging new shapes
      if (getAutoUpdateEnabled() && getTurboEnabled()) {
        triggerAutoRender();
      }
    }

    // --- Scribble Turbo mode ---
    if (canvas.isDrawingMode && getAutoUpdateEnabled() && getTurboEnabled()) {
      triggerAutoRender();
    }
  });

  canvas.on('mouse:up', function () {
    if (!dragShape) return;
    const currentTool = getContext().currentTool;
    const tool = ToolRegistry[currentTool];
    if (tool?.finalize) {
      const finalized = tool.finalize(dragShape, dragStart, getContext());
      if (finalized !== dragShape) {
        canvas.remove(dragShape);
        canvas.add(finalized);
      }
      finalized.setCoords();
    }
    dragShape = null;
    dragStart = null;

    // Auto render new object
    if (getAutoUpdateEnabled()) {
      if (getTurboEnabled()) {
        triggerAutoRender();
      } else {
        renderPSF();
      }
    }
  });
}

// -------------------- PSF Rendering --------------------

/**
 * renderPSF
 * ---------
 * Main PSF rendering function: rasterize -> FFT -> tone map -> display.
 * This is the orchestrator that calls functions from all three modules.
 *
 * @returns {void}
 */
function renderPSF() {
  // Resolution (snap to power-of-two)
  const size = getSliderSnapN();

  // Always include the top (draft) layer when in free-draw + Turbo
  const includeDraft = !!(getAutoUpdateEnabled() && getTurboEnabled() && isScribblingNow());

  // Rasterize pupil to array (real), set imaginary part = 0
  const real = rasterizeCanvasToArray(size, includeDraft);
  const imag = new Float32Array(size * size);

  // Forward FFT (normalized inside fft2)
  const { real: F_re, imag: F_im } = fft2(real, imag, size);

  // Intensity = |F|^2
  const { intensity } = magnitudeSquared(F_re, F_im);

  // Shift DC to center
  const shifted = fftshift2D(intensity, size);

  // --- UI settings ---
  const scaleMode = document.getElementById('psfScaling')?.value || 'linear';
  const cmapSel = document.getElementById('psfColormap');
  const cmapName = (cmapSel && cmapSel.value) || 'gray';

  // Choose clipP for each scaling mode
  let clipP;
  if (scaleMode === 'db' || scaleMode === 'log') {
    clipP = 100.0;   // normalize to true peak
  } else {
    clipP = 100.0;   // normalize to true peak (can adjust to 99.0 for outlier clipping)
  }

  // Tone-map + colormap
  const { pixels, vmax } = applyToneAndColormap(shifted, size, scaleMode, cmapName, clipP);

  // Render PSF
  const psfCanvas = document.getElementById('psfCanvas');
  paintPSFToCanvas(pixels, size, psfCanvas);

  // --- Update colorbar legend ---
  const lut = getColormapLUT(cmapName, 256);
  const customTicks = buildColorbarTicks(scaleMode, vmax, { logFloor: LOG_FLOOR });
  renderColorbar(lut, document.getElementById('colorbarCanvas'), scaleMode, vmax, {
    barWidth: 26,
    ticks: 5,
    tickLength: 6,
    labelPadding: 6,
    font: '12px sans-serif',
    textColor: '#000',
    strokeColor: '#000',
    showBorder: false,
    autoGrow: true,
    syncCssSize: true,
    customTicks
  });
}

// -------------------- Global Exposure (for inline onclick handlers) --------------------

// Expose functions needed by inline onclick handlers in index.html
window.selectTool = (tool) => selectTool(tool, ToolRegistry);
window.renderPSF = renderPSF;
window.invertCanvas = invertCanvas;
window.resetCanvas = resetCanvas;