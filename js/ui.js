/**
 * ui.js
 * =====
 * UI handlers, DOM wiring, colorbar rendering, and rasterization for Pupil2PSF.
 * Manages all user interactions and canvas rendering operations.
 */

import { snapToPow2 } from './fft.js';
import { applyTransmission, transmissionToGray, clamp0_100, ensureTransmission } from './tools.js';

// -------------------- Module State --------------------

let canvas = null;
let currentTool = 'circle';
let pupilBackground = 'black'; // default background color
let slider = null;            // global handle for the transmission slider
let isSyncingUI = false;
let currentDefaults = { transmission: 100 };
let autoUpdateEnabled = false;
let turboEnabled = false;
let lastRenderTime = 0;
const DEFAULT_AUTORENDER_INTERVAL = 50; // ms
let renderPending = false;
let lastRenderedResolution = 512;   // last N actually rendered
let lastPreviewResolution  = 512;   // last N we reacted to while dragging

// Callback reference to main's renderPSF function
let renderPSFCallback = null;

// -------------------- Initialization --------------------

/**
 * initializeUI
 * ------------
 * Wire up all UI event handlers and initialize state.
 * Must be called after canvas is created.
 *
 * @param {fabric.Canvas} fabricCanvas - The Fabric.js canvas instance
 * @param {object} toolRegistry - The ToolRegistry object
 * @param {object} callbacks - Callback functions {renderPSF, selectTool}
 * @returns {void}
 */
export function initializeUI(fabricCanvas, toolRegistry, callbacks = {}) {
  canvas = fabricCanvas;
  renderPSFCallback = callbacks.renderPSF;

  // Initialize pupil plane background
  canvas.setBackgroundColor(pupilBackground, canvas.renderAll.bind(canvas));

  // --- UI bindings ---
  document.getElementById('autoUpdateToggle')?.addEventListener('change', toggleAutoUpdate);
  document.getElementById('turboToggle')?.addEventListener('change', () => {
    turboEnabled = document.getElementById('turboToggle').checked;
  });

  // Re-render when the dropdowns change
  document.getElementById('psfScaling')?.addEventListener('change', () => {
    if (renderPSFCallback) renderPSFCallback();
  });
  document.getElementById('psfColormap')?.addEventListener('change', () => {
    if (renderPSFCallback) renderPSFCallback();
  });

  // Set initial UI state for toggles (hides/disables Turbo until Auto-update is on)
  toggleAutoUpdate();

  // Auto-update events
  canvas.on('object:modified', () => {
    if (autoUpdateEnabled && renderPSFCallback) renderPSFCallback();
  });
  // Turbo auto-update: trigger throttled renders during dragging
  canvas.on('object:moving', () => {
    if (autoUpdateEnabled && turboEnabled) triggerAutoRender();
  });
  canvas.on('object:scaling', () => {
    if (autoUpdateEnabled && turboEnabled) triggerAutoRender();
  });
  canvas.on('object:rotating', () => {
    if (autoUpdateEnabled && turboEnabled) triggerAutoRender();
  });

  canvas.on('path:created', () => {
    if (autoUpdateEnabled) {
      if (turboEnabled) {
        triggerAutoRender();
      } else {
        if (renderPSFCallback) renderPSFCallback();
      }
    }
  });

  canvas.on('selection:cleared', () => {
    isSyncingUI = true;
    slider.value = String(currentDefaults.transmission);
    isSyncingUI = false;
  });

  // Free draw defaults
  canvas.isDrawingMode = (currentTool === 'scribble');
  canvas.freeDrawingBrush.color = transmissionToGray(currentDefaults.transmission);
  canvas.freeDrawingBrush.width = 5;

  // Line width slider → ToolRegistry
  document.getElementById('lineWidthSlider')?.addEventListener('input', e => {
    toolRegistry.line.options.strokeWidth = parseInt(e.target.value, 10);
  });

  // Brush size slider → scribble brush
  document.getElementById('brushSizeSlider')?.addEventListener('input', e => {
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = parseInt(e.target.value, 10);
    }
  });

  // Transmission slider setup
  initializeTransmissionSlider();

  // Resolution slider setup
  initializeResolutionSlider();

  // Selection event handlers
  canvas.on('selection:created', updateSliderFromObject);
  canvas.on('selection:updated', updateSliderFromObject);
}

/**
 * initializeTransmissionSlider
 * ----------------------------
 * Set up transmission slider event handlers.
 *
 * @returns {void}
 */
function initializeTransmissionSlider() {
  slider = document.getElementById('transmissionSlider');
  if (!slider) return;

  // Initialize UI to the current default
  isSyncingUI = true;
  slider.value = String(currentDefaults.transmission);
  isSyncingUI = false;

  // Keep scribble brush in sync at startup
  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = transmissionToGray(currentDefaults.transmission);
  }

  // Live updates while dragging
  slider.addEventListener('input', () => {
    if (isSyncingUI) return;

    const val = clamp0_100(+slider.value || 0);
    const obj = canvas.getActiveObject();

    if (obj) {
      const targets = (obj.type === 'activeSelection' && obj._objects?.length)
        ? obj._objects
        : [obj];
      targets.forEach(o => applyTransmission(o, val, getContext()));
      canvas.requestRenderAll();
    } else {
      // No selection → update the default + brush color
      currentDefaults.transmission = val;
      if (canvas.isDrawingMode && canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = transmissionToGray(val);
      }
    }

    if (autoUpdateEnabled && turboEnabled) triggerAutoRender(); // throttled
  });

  // Commit a single render when Turbo is OFF and user releases
  slider.addEventListener('change', () => {
    if (autoUpdateEnabled && !turboEnabled && renderPSFCallback) renderPSFCallback();
  });
}

/**
 * initializeResolutionSlider
 * --------------------------
 * Set up resolution slider event handlers.
 *
 * @returns {void}
 */
function initializeResolutionSlider() {
  const resSlider = document.getElementById('resolutionSlider');
  if (!resSlider) return;

  // initialize
  lastRenderedResolution = getSliderSnapN();
  lastPreviewResolution  = lastRenderedResolution;
  setResolutionLabel(lastRenderedResolution);

  // Live while dragging (Turbo path) — only when snap N changes
  resSlider.addEventListener('input', () => {
    const N = getSliderSnapN();
    if (N !== lastPreviewResolution) {
      lastPreviewResolution = N;
      setResolutionLabel(N);
      if (autoUpdateEnabled && turboEnabled) {
        // throttled live rerender; renderPSF will read the current slider value
        triggerAutoRender();
      }
    } else {
      // label stays correct; no render because N didn't actually change
      setResolutionLabel(N);
    }
  });

  // On commit (mouse up / keyboard commit)
  resSlider.addEventListener('change', () => {
    const N = getSliderSnapN();
    setResolutionLabel(N);
    if (autoUpdateEnabled && N !== lastRenderedResolution && renderPSFCallback) {
      renderPSFCallback();
    }
  });
}

// -------------------- Tool Selection --------------------

/**
 * selectTool
 * ----------
 * Switch active drawing tool.
 *
 * @param {string} tool - Tool name ('circle', 'rect', 'line', 'scribble', 'point')
 * @param {object} toolRegistry - The ToolRegistry object
 * @returns {void}
 */
export function selectTool(tool, toolRegistry) {
  currentTool = tool;

  // Highlight active button
  document.querySelectorAll('#toolbar button').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tool-${tool}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Hide all option panels
  document.querySelectorAll('#tool-options .tool-options').forEach(div => div.classList.add('hidden'));

  // Show only relevant options
  const panelId = toolRegistry[tool]?.optionsPanelId;
  if (panelId) document.getElementById(panelId)?.classList.remove('hidden');

  // Update free draw mode
  canvas.isDrawingMode = (tool === 'scribble');

  if (canvas.isDrawingMode) {
    // make sure nothing is selected while drawing (prevents controls on top)
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    canvas.freeDrawingBrush.color = transmissionToGray(currentDefaults.transmission);
    canvas.freeDrawingBrush.width = parseInt(document.getElementById('brushSizeSlider').value, 10);
  }
}

/**
 * isScribblingNow
 * ---------------
 * Check if user is actively drawing with scribble brush.
 *
 * @returns {boolean}
 */
export function isScribblingNow() {
  return !!(canvas && canvas.isDrawingMode && canvas._isCurrentlyDrawing);
}

// -------------------- Canvas Operations --------------------

/**
 * invertCanvas
 * ------------
 * Toggle pupil background between black and white.
 *
 * @returns {void}
 */
export function invertCanvas() {
  pupilBackground = (pupilBackground === 'black') ? 'white' : 'black';
  canvas.setBackgroundColor(pupilBackground, canvas.renderAll.bind(canvas));

  // Make the default high-contrast against new background
  currentDefaults.transmission = (pupilBackground === 'black') ? 100 : 0;
  isSyncingUI = true;
  slider.value = String(currentDefaults.transmission);
  isSyncingUI = false;

  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = transmissionToGray(currentDefaults.transmission);
  }

  canvas.renderAll();
  if (autoUpdateEnabled && renderPSFCallback) renderPSFCallback();
}

/**
 * resetCanvas
 * -----------
 * Clear all objects from the canvas.
 *
 * @returns {void}
 */
export function resetCanvas() {
  canvas.clear();
  canvas.discardActiveObject();
  canvas.setBackgroundColor(pupilBackground, canvas.renderAll.bind(canvas));

  currentDefaults.transmission = (pupilBackground === 'black') ? 100 : 0;
  isSyncingUI = true;
  slider.value = String(currentDefaults.transmission);
  isSyncingUI = false;

  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = transmissionToGray(currentDefaults.transmission);
  }

  canvas.renderAll();
  if (autoUpdateEnabled && renderPSFCallback) renderPSFCallback();
}

// -------------------- Rasterization --------------------

/**
 * rasterizeCanvasToArray
 * ----------------------
 * Convert the Fabric canvas to a grayscale Float32Array for FFT processing.
 *
 * @param {number} size - Output grid size (NxN)
 * @param {boolean} includeDraft - Include live brush strokes (for turbo mode)
 * @returns {Float32Array} Grayscale array (length = size*size)
 */
export function rasterizeCanvasToArray(size = 512, includeDraft = false) {
  // ---- Hide active object's controls just for this snapshot ----
  const active = canvas.getActiveObject();
  const hadActive = !!active;
  let savedControls = null;
  if (hadActive) {
    savedControls = {
      hasBorders: active.hasBorders,
      hasControls: active.hasControls,
      borderColor: active.borderColor,
      cornerColor: active.cornerColor,
      transparentCorners: active.transparentCorners
    };
    active.set({
      hasBorders: false,
      hasControls: false,
      borderColor: 'rgba(0,0,0,0)',
      cornerColor: 'rgba(0,0,0,0)',
      transparentCorners: true
    });
  }

  // Ensure Fabric's lower layer is current
  canvas.renderAll();

  const hiddenCanvas = document.getElementById('hiddenRasterCanvas');
  const ctx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
  hiddenCanvas.width = size;
  hiddenCanvas.height = size;
  ctx.imageSmoothingEnabled = false;
  lastRenderedResolution = size;
  lastPreviewResolution  = size;     // keep preview in sync after a full render

  // Solid background
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = (pupilBackground === 'black') ? '#000' : '#fff';
  ctx.fillRect(0, 0, size, size);

  // Draw the object layer (lower canvas)
  ctx.drawImage(canvas.lowerCanvasEl, 0, 0, size, size);

  // Include the brush overlay ONLY while actually scribbling
  if (includeDraft && isScribblingNow()) {
    if (canvas.renderTop) canvas.renderTop(); // paint live brush into upperCanvasEl
    const topEl = canvas.upperCanvasEl || (canvas.contextTop && canvas.contextTop.canvas);
    if (topEl) ctx.drawImage(topEl, 0, 0, size, size);
  }

  // ---- Restore controls state (no re-render needed here) ----
  if (hadActive && savedControls) {
    active.set(savedControls);
  }

  // Read pixels -> grayscale
  const imageData = ctx.getImageData(0, 0, size, size).data;
  const grayArray = new Float32Array(size * size);
  for (let i = 0, j = 0; i < imageData.length; i += 4, j++) {
    grayArray[j] = imageData[i] / 255.0; // red channel
  }

  // Single-pixel override for 'point' tool
  canvas.getObjects().forEach(obj => {
    if (obj.customType === 'point') {
      const x = Math.round(obj.left);
      const y = Math.round(obj.top);
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const rgb = (obj.fill || 'rgb(255,255,255)').match(/\d+/g);
        const val = parseInt(rgb[0], 10) / 255.0;
        grayArray[y * size + x] = val;
      }
    }
  });

  // Snap tiny AA noise to background
  const bg = (pupilBackground === 'black') ? 0 : 1;
  const eps = 1.5 / 255;
  for (let i = 0; i < grayArray.length; i++) {
    if (Math.abs(grayArray[i] - bg) < eps) grayArray[i] = bg;
  }

  return grayArray;
}

// -------------------- PSF Display --------------------

/**
 * paintPSFToCanvas
 * ----------------
 * Draw RGBA pixel data to the PSF canvas with pixelated scaling.
 *
 * @param {Uint8ClampedArray} pixels - RGBA pixel data (length = N*N*4)
 * @param {number} N - Grid size (NxN)
 * @param {HTMLCanvasElement} psfCanvas - Target canvas element
 * @returns {void}
 */
export function paintPSFToCanvas(pixels, N, psfCanvas) {
  // 1) draw raw PSF (N×N) to an offscreen canvas
  const off = document.createElement('canvas');
  off.width = N;
  off.height = N;
  const octx = off.getContext('2d');
  octx.putImageData(new ImageData(pixels, N, N), 0, 0);

  // 2) scale to the visible canvas
  const ctx = psfCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;      // pixelated at low N
  ctx.clearRect(0, 0, psfCanvas.width, psfCanvas.height);
  ctx.drawImage(off, 0, 0, psfCanvas.width, psfCanvas.height);
}

/**
 * renderColorbar
 * --------------
 * Draw a colorbar with ticks and labels.
 *
 * @param {Uint8Array} lut - RGB lookup table (length = 256*3)
 * @param {HTMLCanvasElement} cbCanvas - Colorbar canvas element
 * @param {string} scaleMode - Scaling mode ('linear', 'sqrt', 'log', 'db')
 * @param {number} vmax - Maximum intensity value
 * @param {object} opts - Rendering options
 * @returns {void}
 */
export function renderColorbar(lut, cbCanvas, scaleMode, vmax, opts = {}) {
  const {
    barWidth = 24,
    ticks = 5,                 // fallback count
    tickLength = 6,
    labelPadding = 6,
    rightPadding = 6,
    font = '12px sans-serif',
    textColor = '#000',
    strokeColor = '#000',
    showBorder = false,
    autoGrow = true,
    syncCssSize = false,
    padTop = null,
    padBottom = null,
    customTicks = null         // { fracs:[0..1], labels:[string] }
  } = opts;

  // --- measure font to compute safe top/bottom padding ---
  let ctx = cbCanvas.getContext('2d');
  ctx.font = font;
  const eps = 1e-20;
  const m = ctx.measureText('0.00e+00');
  const lineH = Math.ceil((m.actualBoundingBoxAscent || 8) +
                          (m.actualBoundingBoxDescent || 3));
  const PAD_TOP = padTop ?? (Math.ceil(lineH / 2) + 2);
  const PAD_BOTTOM = padBottom ?? (Math.ceil(lineH / 2) + 2);

  const H = cbCanvas.height;
  const drawableH = Math.max(1, H - PAD_TOP - PAD_BOTTOM);

  // tick positions/labels
  let fracs, labels;
  if (customTicks && customTicks.fracs && customTicks.labels) {
    fracs  = customTicks.fracs;
    labels = customTicks.labels;
  } else {
    // default evenly spaced ticks
    fracs = Array.from({ length: ticks }, (_, i) => (ticks === 1 ? 0 : i / (ticks - 1)));
    const log10 = (x) => Math.log10(Math.max(x, eps));
    const formatLabel = (f) => {
      if (scaleMode === 'db')   return `${(-60 + f * 60).toFixed(0)} dB`;
      if (scaleMode === 'log')  return (Math.pow(10, f * log10(vmax))).toExponential(2);
      if (scaleMode === 'sqrt') return ((f * Math.sqrt(vmax)) ** 2).toExponential(2);
      return (f * vmax).toExponential(2); // linear
    };
    labels = fracs.map(formatLabel);
  }

  // label text + width we'll need on the right
  const log10 = (x) => Math.log10(Math.max(x, eps));
  const formatLabel = (f) => {
    if (scaleMode === 'db')   return `${(-60 + f * 60).toFixed(0)} dB`;
    if (scaleMode === 'log')  return (Math.pow(10, f * log10(vmax))).toExponential(2);
    if (scaleMode === 'sqrt') return ((f * Math.sqrt(vmax)) ** 2).toExponential(2);
    return (f * vmax).toExponential(2); // linear
  };
  const maxLabelW = Math.max(1, ...labels.map(t => ctx.measureText(t).width));

  const neededWidth = Math.ceil(barWidth + tickLength + labelPadding + maxLabelW + rightPadding);

  // grow intrinsic width if we need more space for labels
  if (autoGrow && cbCanvas.width < neededWidth) {
    cbCanvas.width = neededWidth;       // resets context state
    if (syncCssSize) cbCanvas.style.width = neededWidth + 'px';
  }

  // re-acquire context after a resize
  ctx = cbCanvas.getContext('2d');
  ctx.clearRect(0, 0, cbCanvas.width, H);
  ctx.imageSmoothingEnabled = false;
  ctx.font = font;

  // --- draw gradient bar in the padded area ---
  const off = document.createElement('canvas');
  off.width = 1;
  off.height = drawableH;
  const octx = off.getContext('2d');
  const img = octx.createImageData(1, drawableH);

  for (let i = 0; i < drawableH; i++) {
    const lutIdx = Math.round((i / (drawableH - 1)) * 255); // 0..255 bottom→top
    const src = 3 * lutIdx;
    const dst = 4 * (drawableH - 1 - i);                    // flip so 0 is bottom
    img.data[dst]     = lut[src];
    img.data[dst + 1] = lut[src + 1];
    img.data[dst + 2] = lut[src + 2];
    img.data[dst + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0, 1, drawableH, 0, PAD_TOP, barWidth, drawableH);

  if (showBorder) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, PAD_TOP + 0.5, barWidth - 1, drawableH - 1); // crisp 1px
  }

  // --- ticks + labels on the right ---
  ctx.fillStyle = textColor;
  ctx.strokeStyle = strokeColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const tickX0 = barWidth + 0.5;
  const tickX1 = barWidth + tickLength + 0.5;
  const labelX = barWidth + tickLength + labelPadding;

  const count = (customTicks && customTicks.fracs) ? customTicks.fracs.length : fracs.length;
  for (let i = 0; i < count; i++) {
    const f = fracs[i];
    const y = H - PAD_BOTTOM - f * drawableH;
    const yLine = Math.round(y) + 0.5;

    ctx.beginPath();
    ctx.moveTo(tickX0, yLine);
    ctx.lineTo(tickX1, yLine);
    ctx.stroke();

    ctx.fillText(labels[i], labelX, y);
  }
}

// -------------------- Auto-render & Throttling --------------------

/**
 * toggleAutoUpdate
 * ----------------
 * Toggle auto-update mode and manage Turbo visibility.
 *
 * @returns {void}
 */
export function toggleAutoUpdate() {
  const auto = document.getElementById('autoUpdateToggle');
  const btn  = document.getElementById('renderButton');
  const turboBox = document.getElementById('turboToggle');
  const turboWrap = document.getElementById('turboContainer');

  autoUpdateEnabled = !!auto?.checked;
  if (btn) btn.disabled = autoUpdateEnabled;

  if (autoUpdateEnabled) {
    // show + enable Turbo
    if (turboWrap) turboWrap.style.display = 'inline-flex';
    if (turboBox)  {
      turboBox.disabled = false;
      turboEnabled = !!turboBox.checked;
    }
    triggerAutoRender(0);
  } else {
    // hide + disable Turbo and reset its state
    if (turboWrap) turboWrap.style.display = 'none';
    if (turboBox) {
      turboBox.checked = false;
      turboBox.disabled = true;
    }
    turboEnabled = false;
  }
}

/**
 * triggerAutoRender
 * -----------------
 * Throttled auto-render trigger for live updates.
 *
 * @param {number} interval - Throttle interval in ms (default 50)
 * @returns {void}
 */
export function triggerAutoRender(interval = DEFAULT_AUTORENDER_INTERVAL) {
  if (!renderPSFCallback) return;

  const now = Date.now();
  if (now - lastRenderTime > interval) {
    renderPSFCallback();
    lastRenderTime = now;
    renderPending = false;
  } else if (!renderPending) {
    renderPending = true;
    setTimeout(() => {
      if (renderPSFCallback) renderPSFCallback();
      lastRenderTime = Date.now();
      renderPending = false;
    }, interval);
  }
}

// -------------------- Resolution Helpers --------------------

/**
 * getSliderSnapN
 * --------------
 * Get current resolution slider value snapped to power of 2.
 *
 * @returns {number} Snapped resolution (power of 2)
 */
export function getSliderSnapN() {
  const raw = parseInt(document.getElementById('resolutionSlider').value, 10) || 512;
  return snapToPow2(raw);
}

/**
 * setResolutionLabel
 * ------------------
 * Update resolution label display.
 *
 * @param {number} N - Resolution value
 * @returns {void}
 */
export function setResolutionLabel(N) {
  const el = document.getElementById('resolutionLabel');
  if (el) el.textContent = `${N} × ${N}`;
}

// -------------------- Selection & Transmission Sync --------------------

/**
 * updateSliderFromObject
 * ----------------------
 * Update transmission slider when an object is selected.
 *
 * @param {object} eOrObj - Fabric event or object
 * @returns {void}
 */
export function updateSliderFromObject(eOrObj) {
  const obj = eOrObj?.selected ? eOrObj.selected[0] : eOrObj;
  if (!obj) return;
  ensureTransmission(obj, currentDefaults.transmission, getContext());
  isSyncingUI = true;
  slider.value = String(clamp0_100(obj.transmission));
  isSyncingUI = false;
}

// -------------------- Keyboard Nudging --------------------

/**
 * nudgeSelection
 * --------------
 * Move selected object(s) by keyboard arrow keys.
 *
 * @param {number} dx - X offset
 * @param {number} dy - Y offset
 * @returns {void}
 */
export function nudgeSelection(dx, dy) {
  const sel = canvas.getActiveObject();
  if (!sel) return;

  const moveOne = (o) => {
    if (o.type === 'line') {
      o.set({
        x1: o.x1 + dx, y1: o.y1 + dy,
        x2: o.x2 + dx, y2: o.y2 + dy
      });
    } else {
      o.set({ left: (o.left || 0) + dx, top: (o.top || 0) + dy });
    }
    o.setCoords();
  };

  if (sel.type === 'activeSelection' && sel._objects?.length) {
    sel._objects.forEach(moveOne);
  } else {
    moveOne(sel);
  }

  canvas.requestRenderAll();
}

/**
 * isFormElement
 * -------------
 * Check if an element is an input/textarea/select (don't hijack arrow keys).
 *
 * @param {HTMLElement} el - Element to check
 * @returns {boolean}
 */
function isFormElement(el) {
  const tag = (el?.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * setupKeyboardHandlers
 * ---------------------
 * Wire up keyboard event listeners for delete and nudging.
 *
 * @returns {void}
 */
export function setupKeyboardHandlers() {
  document.addEventListener('keydown', (e) => {
    // Delete/backspace to delete
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const activeObject = canvas.getActiveObject();
      if (activeObject) {
        canvas.remove(activeObject);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        if (autoUpdateEnabled) triggerAutoRender();
        e.preventDefault();
      }
      return;
    }

    // Arrow key nudging
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrows.includes(e.key)) return;

    // Don't nudge while editing inputs/sliders/selects
    if (isFormElement(document.activeElement) || isFormElement(e.target)) return;

    const step = e.shiftKey ? 10 : 1;
    const dx = (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0);
    const dy = (e.key === 'ArrowUp'   ? -step : e.key === 'ArrowDown'  ? step : 0);

    nudgeSelection(dx, dy);
    e.preventDefault(); // stop page scroll

    if (autoUpdateEnabled && turboEnabled) {
      // live, throttled updates while holding the key
      triggerAutoRender();
    }
  });

  // Commit a single render when Turbo is off and the user lets go
  document.addEventListener('keyup', (e) => {
    const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrows.includes(e.key)) return;
    if (autoUpdateEnabled && !turboEnabled && renderPSFCallback) {
      renderPSFCallback();
    }
  });
}

// -------------------- Context Helper --------------------

/**
 * getContext
 * ----------
 * Get current UI context object (used by tools).
 *
 * @returns {object} Context with state and callbacks
 */
export function getContext() {
  return {
    canvas,
    currentTool,
    pupilBackground,
    currentDefaults,
    autoUpdateEnabled,
    turboEnabled,
    triggerAutoRender
  };
}

// -------------------- State Getters --------------------

export function getCanvas() { return canvas; }
export function getCurrentTool() { return currentTool; }
export function getPupilBackground() { return pupilBackground; }
export function getCurrentDefaults() { return currentDefaults; }
export function getAutoUpdateEnabled() { return autoUpdateEnabled; }
export function getTurboEnabled() { return turboEnabled; }
export function getLastRenderedResolution() { return lastRenderedResolution; }