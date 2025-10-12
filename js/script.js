const DRAG_THRESHOLD = 5;

const ToolRegistry = {
  circle: {
    optionsPanelId: null,
    init(start) {
      const shape = new fabric.Circle({
        left: start.x,
        top: start.y,
        radius: 1,
        stroke: null,
        strokeWidth: 0,
        objectCaching: false,
        shadow: null,
        originX: 'center',
        originY: 'center',
        transmission: currentDefaults.transmission
      });
      applyTransmission(shape, shape.transmission);
      // 🔥 Trigger auto-render if Turbo is on
      if (autoUpdateEnabled && turboEnabled) triggerAutoRender();
      return shape;
    },
    update(shape, start, current) {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const r = Math.sqrt(dx * dx + dy * dy) / 2;
      shape.set({ radius: Math.max(1, r) });
    },
    finalize(shape, start) {
      if (shape.radius < DRAG_THRESHOLD) {
        const replacement = new fabric.Circle({
          left: start.x,
          top: start.y,
          radius: 25,
          stroke: null,
          strokeWidth: 0,
          objectCaching: false,
          shadow: null,
          originX: 'center',
          originY: 'center',
          transmission: currentDefaults.transmission
        });
        applyTransmission(replacement, replacement.transmission);
        return replacement;
      }
      return shape;
    }
  },

  rect: {
    optionsPanelId: null,
    init(start) {
      const shape = new fabric.Rect({
        left: start.x,
        top: start.y,
        width: 1,
        height: 1,
        stroke: null,
        strokeWidth: 0,
        objectCaching: false,
        shadow: null,
        originX: 'left',
        originY: 'top',
        transmission: currentDefaults.transmission
      });
      applyTransmission(shape, shape.transmission);
      // 🔥 Trigger auto-render if Turbo is on
      if (autoUpdateEnabled && turboEnabled) triggerAutoRender();
      return shape;
    },
    update(shape, start, current) {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      shape.set({
        width: Math.abs(dx),
        height: Math.abs(dy),
        left: dx < 0 ? current.x : start.x,
        top: dy < 0 ? current.y : start.y
      });
    },
    finalize(shape, start) {
      if (shape.width < DRAG_THRESHOLD && shape.height < DRAG_THRESHOLD) {
        const replacement = new fabric.Rect({
          left: start.x - 25,
          top: start.y - 25,
          width: 50,
          height: 50,
          stroke: null,
          strokeWidth: 0,
          objectCaching: false,
          shadow: null,
          transmission: currentDefaults.transmission
        });
        applyTransmission(replacement, replacement.transmission);
        return replacement;
      }
      return shape;
    }
  },

  line: {
    optionsPanelId: 'line-options',
    options: { strokeWidth: 5 },
    init(start) {
      const shape = new fabric.Line([start.x, start.y, start.x, start.y], {
        strokeWidth: this.options.strokeWidth,
        originX: 'center',
        originY: 'center',
        objectCaching: false,
        hasBorders: false,          // hide bbox
        hasControls: true,
        perPixelTargetFind: true,
        strokeLineCap: 'round',
        strokeUniform: true,
        transmission: currentDefaults.transmission
      });
      applyTransmission(shape, shape.transmission);
      setupLineEndpointControls(shape);
      if (autoUpdateEnabled && turboEnabled) triggerAutoRender();
      return shape;
    },
    update(shape, start, current) {
      shape.set({ x2: current.x, y2: current.y });
    },
    finalize(shape, start) {
      const dx = shape.x2 - shape.x1;
      const dy = shape.y2 - shape.y1;
      const length = Math.sqrt(dx * dx + dy * dy);

      if (length < DRAG_THRESHOLD) {
        const replacement = new fabric.Line([start.x - 100, start.y, start.x + 100, start.y], {
          strokeWidth: this.options.strokeWidth,
          objectCaching: false,
          hasBorders: false,
          hasControls: true,
          perPixelTargetFind: true,
          strokeLineCap: 'round',
          strokeUniform: true,
          transmission: shape.transmission ?? currentDefaults.transmission
        });
        applyTransmission(replacement, replacement.transmission);
        setupLineEndpointControls(replacement);
        return replacement;
      }

      setupLineEndpointControls(shape);
      return shape;
    }
  },

  point: {
    optionsPanelId: null,
    init(start) {
      const shape = new fabric.Circle({
        left: start.x,
        top: start.y,
        radius: 3, // visible marker
        originX: 'center',
        originY: 'center',
        selectable: true,
        hasControls: false,
        lockScalingX: true,
        lockScalingY: true,
        customType: 'point',
        transmission: currentDefaults.transmission
      });
      applyTransmission(shape, shape.transmission);
      if (autoUpdateEnabled) triggerAutoRender();
      return shape;
    },
    update(shape, start, current) {
      shape.set({ left: current.x, top: current.y });
    },
    finalize(shape) {
      shape.setCoords();
      return shape;
    }
  },

  scribble: {
    optionsPanelId: 'scribble-options'
  }
};





let canvas;
let currentTool = 'circle';
let pupilBackground = 'black'; // default background color
let slider;            // global handle for the transmission slider
let isSyncingUI = false;
let currentDefaults = { transmission: 100 };
let autoUpdateEnabled = false;
let turboEnabled = false;
let lastRenderTime = 0;
const DEFAULT_AUTORENDER_INTERVAL = 50; // ms
let renderPending = false;
let lastRenderedResolution = 512;   // last N actually rendered
let lastPreviewResolution  = 512;   // last N we reacted to while dragging

// Peak-normalized log uses a floor of 1e-6 (≈ −60 dB)
const LOG_FLOOR = 1e-6;



window.onload = function () {
  canvas = new fabric.Canvas('pupilCanvas', { willReadFrequently: true });
  canvas.selection = false;

  // Initialize pupil plane background
  canvas.setBackgroundColor(pupilBackground, canvas.renderAll.bind(canvas));

  // --- UI bindings ---
  document.getElementById('autoUpdateToggle')?.addEventListener('change', toggleAutoUpdate);
  document.getElementById('turboToggle')?.addEventListener('change', () => {
    turboEnabled = document.getElementById('turboToggle').checked;
  });

  // Re-render when the dropdowns change
  document.getElementById('psfScaling')?.addEventListener('change', renderPSF);
  document.getElementById('psfColormap')?.addEventListener('change', renderPSF);

  // Set initial UI state for toggles (hides/disables Turbo until Auto-update is on)
  toggleAutoUpdate();


  // Auto-update events
  canvas.on('object:modified', () => {
    if (autoUpdateEnabled) renderPSF();
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
        renderPSF();
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
    ToolRegistry.line.options.strokeWidth = parseInt(e.target.value, 10);
  });

  // Brush size slider → scribble brush
  document.getElementById('brushSizeSlider')?.addEventListener('input', e => {
    if (canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.width = parseInt(e.target.value, 10);
    }
  });

  // Shape draw logic
  let dragStart = null;
  let dragShape = null;

  canvas.on('mouse:down', function (opt) {
    if (canvas.isDrawingMode || opt.target) return;
    dragStart = canvas.getPointer(opt.e);
    const tool = ToolRegistry[currentTool];
    if (tool?.init) {
      dragShape = tool.init(dragStart);
      canvas.add(dragShape);
    }
  });

  canvas.on('mouse:move', function (opt) {
    // --- Shape drawing case ---
    if (!canvas.isDrawingMode && dragShape) {
      const pointer = canvas.getPointer(opt.e);
      const tool = ToolRegistry[currentTool];
      if (tool?.update) {
        tool.update(dragShape, dragStart, pointer);
        canvas.requestRenderAll();
      }

      // 👇 Turbo update while dragging new shapes
      if (autoUpdateEnabled && turboEnabled) {
        triggerAutoRender();
      }
  }

    // --- Scribble Turbo mode ---
    if (canvas.isDrawingMode && autoUpdateEnabled && turboEnabled) {
      // Optionally tighten interval here if you want scribble smoother
      triggerAutoRender();
    }
  });


  canvas.on('mouse:up', function () {
    if (!dragShape) return;
    const tool = ToolRegistry[currentTool];
    if (tool?.finalize) {
      const finalized = tool.finalize(dragShape, dragStart);
      if (finalized !== dragShape) {
        canvas.remove(dragShape);
        canvas.add(finalized);
      }
      finalized.setCoords();
    }
    dragShape = null;
    dragStart = null;

    // 🔥 Auto render new object
    if (autoUpdateEnabled) {
      if (turboEnabled) {
        triggerAutoRender();
      } else {
        renderPSF();
      }
    }
  });

  // Transmission slider updates
  slider = document.getElementById('transmissionSlider');
  if (slider) {
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
        targets.forEach(o => applyTransmission(o, val));
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
      if (autoUpdateEnabled && !turboEnabled) renderPSF();
    });
  }

  // Resolution label
  const resSlider = document.getElementById('resolutionSlider');
  if (resSlider) {
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
      if (autoUpdateEnabled && N !== lastRenderedResolution) {
        renderPSF();
      }
    });
  }


  canvas.on('selection:created', updateSliderFromObject);
  canvas.on('selection:updated', updateSliderFromObject);
};

// --- Keyboard nudging -------------------------------------------------
function nudgeSelection(dx, dy) {
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

// Guard: don’t hijack arrows while typing/using sliders
function isFormElement(el) {
  const tag = (el?.tagName || '').toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

document.addEventListener('keydown', (e) => {
  // Delete/backspace to delete (unchanged)
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

  // Don’t nudge while editing inputs/sliders/selects
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
  if (autoUpdateEnabled && !turboEnabled) {
    renderPSF();
  }
});



// TOOL SELECTION
function selectTool(tool) {
  currentTool = tool;

  // Highlight active button
  document.querySelectorAll('#toolbar button').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`tool-${tool}`);
  if (activeBtn) activeBtn.classList.add('active');

  // Hide all option panels
  document.querySelectorAll('#tool-options .tool-options').forEach(div => div.classList.add('hidden'));

  // Show only relevant options
  const panelId = ToolRegistry[tool]?.optionsPanelId;
  if (panelId) document.getElementById(panelId)?.classList.remove('hidden');

  // Update free draw mode
  canvas.isDrawingMode = (tool === 'scribble');

  if (canvas.isDrawingMode) {
    // 🚫 make sure nothing is selected while drawing (prevents controls on top)
    canvas.discardActiveObject();
    canvas.requestRenderAll();

    canvas.freeDrawingBrush.color = transmissionToGray(currentDefaults.transmission);
    canvas.freeDrawingBrush.width = parseInt(document.getElementById('brushSizeSlider').value, 10);
  }
}

function isScribblingNow() {
  // true only while the brush is actually drawing a path
  return !!(canvas && canvas.isDrawingMode && canvas._isCurrentlyDrawing);
}

// Keep endpoint drags inside the canvas (optional but friendly)
function clampToCanvas(canvas, x, y) {
  const w = canvas.getWidth(), h = canvas.getHeight();
  return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
}

// Shift-snapping: 0°, 45°, 90°, 135°, 180° around the fixed endpoint
function maybeSnapEndpoint(line, which, p, shift) {
  if (!shift) return p;
  const fx = (which === 'p1') ? line.x2 : line.x1;
  const fy = (which === 'p1') ? line.y2 : line.y1;
  let dx = p.x - fx, dy = p.y - fy;

  const targets = [0, 45, 90, 135, 180].map(d => d * Math.PI / 180);
  const ang = Math.atan2(dy, dx);
  const snap = targets.reduce((best, a) =>
    Math.abs(ang - a) < Math.abs(ang - best) ? a : best, targets[0]);

  const r = Math.hypot(dx, dy);
  return { x: fx + r * Math.cos(snap), y: fy + r * Math.sin(snap) };
}

// Replace default controls with two circular endpoint handles
function setupLineEndpointControls(line) {
  const mkHandle = (which) => new fabric.Control({
    render: (ctx, left, top) => {
      ctx.beginPath();
      ctx.arc(left, top, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.fill(); ctx.stroke();
    },

    positionHandler: (_dim, finalMatrix, obj) => {
      const cx = (obj.x1 + obj.x2) / 2;
      const cy = (obj.y1 + obj.y2) / 2;
      const ex = (which === 'p1' ? obj.x1 : obj.x2) - cx;
      const ey = (which === 'p1' ? obj.y1 : obj.y2) - cy;
      return fabric.util.transformPoint(new fabric.Point(ex, ey), finalMatrix);
    },

    actionName: `drag-${which}`,
    actionHandler: (eventData, transform) => {
      const t = transform.target;

      // v4 => eventData.e is the native event
      // v5 => eventData IS the native event
      const evt = (eventData && (eventData.e || eventData)) || null;

      // Use the normalized event for both pointer + modifiers
      const pointer = t.canvas.getPointer(evt, true);
      const isShift = !!(evt && evt.shiftKey);

      const snapped = maybeSnapEndpoint(t, which, pointer, isShift);
      const { x, y } = clampToCanvas(t.canvas, snapped.x, snapped.y);

      if (which === 'p1') t.set({ x1: x, y1: y });
      else                t.set({ x2: x, y2: y });

      t.setCoords();
      t.canvas.requestRenderAll();
      if (typeof autoUpdateEnabled !== 'undefined' && autoUpdateEnabled && turboEnabled) {
        triggerAutoRender?.();
      }
      return true; // tell Fabric we handled it
    },

    cursorStyle: 'grab',
    cursorDownStyle: 'grabbing',
  });

  line.set({
    hasBorders: false,
    hasControls: true,
    perPixelTargetFind: true,
    controls: { p1: mkHandle('p1'), p2: mkHandle('p2') },
  });
}

function transmissionToGray(t) {
  const v = Math.round(clamp0_100(t) * 255 / 100);
  return `rgb(${v},${v},${v})`;
}

function applyTransmission(obj, t) {
  obj.transmission = clamp0_100(t);
  const gray = transmissionToGray(obj.transmission);

  const bgVal = (pupilBackground === 'black') ? 0 : 255;
  const v = Math.round(obj.transmission * 255 / 100);
  const nearBg = Math.abs(v - bgVal) <= 1;

  if (obj.type === 'line') {
    obj.set({ stroke: gray });
  } else {
    obj.set({ fill: gray });
    // remove outlines if indistinguishable from BG
    if ('stroke' in obj) obj.set('stroke', nearBg ? null : obj.stroke);
    if ('strokeWidth' in obj) obj.set('strokeWidth', nearBg ? 0 : (obj.strokeWidth || 0));
  }
}

function ensureTransmission(obj) {
  if (typeof obj.transmission !== 'number') {
    const t = readLegacyTransmission(obj, currentDefaults.transmission);
    applyTransmission(obj, t);
  }
}

function updateSliderFromObject(eOrObj) {
  const obj = eOrObj?.selected ? eOrObj.selected[0] : eOrObj;
  if (!obj) return;
  ensureTransmission(obj);        // normalize legacy shapes
  isSyncingUI = true;
  slider.value = String(clamp0_100(obj.transmission));
  isSyncingUI = false;
}


function readLegacyTransmission(obj, fallback = 100) {
  // Only for old shapes that don’t have .transmission yet
  const color = (typeof obj.stroke === 'string') ? obj.stroke :
                (typeof obj.fill === 'string')   ? obj.fill   : null;
  if (!color) return fallback;

  // Support rgb/rgba()
  const m = color.match(/^rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) {
    const r = +m[1], g = +m[2], b = +m[3];
    if (r === g && g === b) return Math.round((r / 255) * 100); // grayscale → 0–100
    return fallback;
  }

  // Support #RRGGBB / #RGB
  if (color[0] === '#') {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length >= 6) {
      const r = parseInt(hex.slice(0,2), 16);
      const g = parseInt(hex.slice(2,4), 16);
      const b = parseInt(hex.slice(4,6), 16);
      if (r === g && g === b) return Math.round((r / 255) * 100);
    }
  }
  return fallback;
}

function clamp0_100(x) { return Math.max(0, Math.min(100, x)); }




function updateSelectedObjectColor() {
  const obj = canvas.getActiveObject();
  if (!obj) return;
  const val = clamp0_100(+document.getElementById('transmissionSlider').value || 0);

  const applyOne = (o) => applyTransmission(o, val);
  if (obj.type === 'activeSelection' && obj._objects) obj._objects.forEach(applyOne);
  else applyOne(obj);

  obj.dirty = true;
  canvas.requestRenderAll();
}



// Snap any positive integer to nearest power of two within [16, 2048]
function snapToPow2(n, min = 16, max = 2048) {
  n = Math.max(min, Math.min(max, n|0));
  const p = 1 << Math.round(Math.log2(n));
  return Math.max(min, Math.min(max, p));
}

// RESOLUTION SLIDER
function getSliderSnapN() {
  const raw = parseInt(document.getElementById('resolutionSlider').value, 10) || 512;
  return snapToPow2(raw);
}
function setResolutionLabel(N) {
  const el = document.getElementById('resolutionLabel');
  if (el) el.textContent = `${N} × ${N}`;
}


function invertCanvas() {
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
  if (autoUpdateEnabled) renderPSF();
}

function resetCanvas() {
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
  if (autoUpdateEnabled) renderPSF();
}


function rasterizeCanvasToArray(size = 512, includeDraft = false) {
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

  // Ensure Fabric’s lower layer is current
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

  // // (optional) your debug/audit calls here
  // debugShowResidualMask(grayArray, size);

  return grayArray;
}



function debugShowResidualMask(grayArray, size, opts = {}) {
  const bg = (pupilBackground === 'black') ? 0 : 1;
  const thresh = (opts.thresh != null) ? opts.thresh : (2/255);  // 2 DN
  const mount = document.querySelector('#psf-panel .psf-row') || document.body;

  // create or reuse a dedicated canvas
  let c = document.getElementById('residualMask');
  if (!c) {
    c = document.createElement('canvas');
    c.id = 'residualMask';
    c.width = size; c.height = size;
    // make it small and obviously “debug”
    c.style.cssText = `
      width:128px; height:128px; margin-left:8px;
      image-rendering: pixelated; border:1px dashed #f00;
    `;
    mount.appendChild(c);
  } else {
    // keep the intrinsic buffer matched to current size
    c.width = size; c.height = size;
  }

  // build red overlay where |v-bg| > thresh
  const vis = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size*size; i++) {
    const on = Math.abs(grayArray[i] - bg) > thresh;
    const p = 4*i;
    vis[p]   = on ? 255 : 0;  // R
    vis[p+1] = 0;
    vis[p+2] = 0;
    vis[p+3] = on ? 255 : 0;  // A
  }
  c.getContext('2d').putImageData(new ImageData(vis, size, size), 0, 0);
}





function paintPSFToCanvas(pixels, N, psfCanvas) {
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



// -------------------- FFT helpers --------------------

// Pack two real arrays (Re, Im) into a single interleaved complex buffer:
//   [Re0, Im0, Re1, Im1, ...]
function interleaveComplex(real, imag) {
  const n = real.length;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const j = 2 * i;
    out[j]     = real[i];
    out[j + 1] = imag[i];
  }
  return out;
}

// Split an interleaved complex buffer back to {real, imag} (for readability).
function deinterleaveComplex(c) {
  const n = c.length / 2;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const j = 2 * i;
    real[i] = c[j];
    imag[i] = c[j + 1];
  }
  return { real, imag };
}

// Compute |F|^2 from an interleaved complex spectrum.
// Returns { intensity, max } for later tone mapping.
function magnitudeSquaredInterleaved(c) {
  const n = c.length / 2;
  const out = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const re = c[2 * i], im = c[2 * i + 1];
    const mag2 = re * re + im * im;
    out[i] = mag2;
    if (mag2 > max) max = mag2;
  }
  return { intensity: out, max };
}

/**
 * magnitudeSquared
 * ----------------
 * Compute intensity = |Re + i·Im|² = Re² + Im²
 * from separate real and imaginary arrays.
 *
 * Parameters
 * ----------
 * real : Float32Array | ArrayLike<number>
 *   Real part of complex data (length N).
 * imag : Float32Array | ArrayLike<number>
 *   Imag part of complex data (same length as real).
 *
 * Returns
 * -------
 * { intensity: Float32Array, max: number }
 *   intensity : Float32Array of |F|² values
 *   max       : maximum intensity (for normalization / scaling)
 */
function magnitudeSquared(real, imag) {
  if (real.length !== imag.length) {
    throw new Error("magnitudeSquared: real and imag arrays must have the same length");
  }
  const n = real.length;
  const intensity = new Float32Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) {
    const mag2 = real[i] * real[i] + imag[i] * imag[i];
    intensity[i] = mag2;
    if (mag2 > max) max = mag2;
  }
  return { intensity, max };
}


// Cache FFT "plans" by size so we don't recreate them every render.
const _fftPlanCache = {};
function getFFTPlan(N) {
  const FFTCtor = (window.FFT && window.FFT.FFT) || window.FFT;
  if (!_fftPlanCache[N]) {
    _fftPlanCache[N] = {
      row: new FFTCtor(N),
      col: new FFTCtor(N),
      // scratch buffers reused each call to avoid GC churn:
      rowIn: (new FFTCtor(N)).createComplexArray(),
      rowOut: (new FFTCtor(N)).createComplexArray(),
      colIn: (new FFTCtor(N)).createComplexArray(),
      colOut: (new FFTCtor(N)).createComplexArray(),
    };
  }
  return _fftPlanCache[N];
}


// ---------- 2D FFT using fft.js (complex input) ----------
// Inputs:
//   real, imag: Float32Array (length = size*size)
//   size:       transform size per dimension (NxN)
// Output: { real: Float32Array, imag: Float32Array }
//  Notes: Now with unitary/energy normalization.
//         After the two forward passes, we scale the complex spectrum by 1/N, so
//         sum(|F|^2) == sum(|x|^2) (2D Parseval under this convention).
function fft2(real, imag, size) {
  const total = size * size;
  const spec = new Float32Array(total * 2); // interleaved spectrum

  const { row, col, rowIn, rowOut, colIn, colOut } = getFFTPlan(size);

  // ---- Row-wise complex FFTs ----
  for (let y = 0; y < size; y++) {
    const base = y * size;
    for (let x = 0; x < size; x++) {
      const idx = base + x, j = 2 * x;
      rowIn[j]     = real[idx];
      rowIn[j + 1] = imag[idx];
    }
    row.transform(rowOut, rowIn);
    for (let x = 0; x < size; x++) {
      const outIdx = 2 * (base + x), j = 2 * x;
      spec[outIdx]     = rowOut[j];
      spec[outIdx + 1] = rowOut[j + 1];
    }
  }

  // ---- Column-wise complex FFTs ----
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const src = 2 * (y * size + x), j = 2 * y;
      colIn[j]     = spec[src];
      colIn[j + 1] = spec[src + 1];
    }
    col.transform(colOut, colIn);
    for (let y = 0; y < size; y++) {
      const dst = 2 * (y * size + x), j = 2 * y;
      spec[dst]     = colOut[j];
      spec[dst + 1] = colOut[j + 1];
    }
  }

  // ---- Energy/Unitary normalization (amplitude ÷ N -> intensity ÷ N^2) ----
  const ampScale = 1 / size;
  for (let i = 0; i < spec.length; i++) spec[i] *= ampScale;

  return deinterleaveComplex(spec); // { real: Float32Array, imag: Float32Array }
}





/**
 * fftshift2D
 * -----------
 * Reorders a 2D array so that the zero-frequency (DC) component moves
 * from the top-left corner to the center of the array.
 *
 * Parameters
 * ----------
 * input : Float32Array | ArrayLike<number>
 *   Flattened 2D array of length size*size (row-major order).
 * size : number
 *   Width/height (N) of the square array.
 *
 * Returns
 * -------
 * Float32Array
 *   A new array with elements shifted so that DC is centered.
 *
 * Notes
 * -----
 * - Complexity: O(N^2). Allocates a new buffer; `input` is not mutated.
 * - Works for even and odd N. For FFT outputs you’ll typically use even N.
 * - If you have interleaved complex data, call this on each plane
 *   separately (real and imag) or on the derived intensity image.
 */
function fftshift2D(input, size) {
  const expected = size * size;
  if (input.length !== expected) {
    throw new Error(`fftshift2D: expected length ${expected}, got ${input.length}`);
  }

  const out = new Float32Array(expected);
  const half = size >> 1; // integer N/2

  for (let y = 0; y < size; y++) {
    const srcRowStart = y * size;
    const sy = (y + half) % size;      // destination row index after vertical shift
    const dstRowStart = sy * size;

    for (let x = 0; x < size; x++) {
      const sx = (x + half) % size;    // destination column index after horizontal shift
      out[dstRowStart + sx] = input[srcRowStart + x];
    }
  }

  return out;
}




// ---------- renderPSF: rasterize -> 2D FFT -> |F|^2 -> shift -> draw ----------
function renderPSF() {
  // Resolution (snap to power-of-two if you have snapToPow2)
  const raw = parseInt(document.getElementById('resolutionSlider').value, 10) || 512;
  const size = typeof snapToPow2 === 'function' ? snapToPow2(raw) : raw;

  // ✅ Always include the top (draft) layer when in free-draw + Turbo
  const includeDraft = !!(autoUpdateEnabled && turboEnabled && isScribblingNow());

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

  // Choose clipP differently for each scaling
  // This determines the vmax value relative to the peak intensity in our colorscale
  let clipP;
  if (scaleMode === 'db' || scaleMode === 'log') {
    clipP = 100.0;   // normalize to true peak
  } else {
    // clipP = 99.0;    // ignore extreme outliers for linear/sqrt
    clipP = 100.0;   // normalize to true peak

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


function renderColorbar(lut, cbCanvas, scaleMode, vmax, opts = {}) {
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
    customTicks = null         // NEW: { fracs:[0..1], labels:[string] }
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

  // label text + width we’ll need on the right
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

function buildColorbarTicks(mode, vmax, opts = {}) {
  if (mode === 'db') {
    // Fixed −60..0 dB ticks to match the mapping
    const dBs = [-60, -45, -30, -15, 0];
    const fracs = dBs.map(db => (db + 60) / 60);  // 0..1
    const labels = dBs.map(db => `${db} dB`);
    return { fracs, labels };
  }

  if (mode === 'log') {
    const floor = opts.logFloor ?? LOG_FLOOR; // 1e-6 by default
    const kMin = Math.ceil(Math.log10(floor)); // e.g., -6
    const kMax = 0;
    const span = kMax - kMin || 1;
    const ks = [];
    for (let k = kMax; k >= kMin; k--) ks.push(k); // [0, -1, -2, ...]
    const fracs  = ks.map(k => (k - kMin) / span);   // 0..1 (floor→0, peak→1)
    const labels = ks.map(k => `10^${k}`);           // "10^0", "10^-1", ...
    return { fracs, labels };
  }

  // Linear / Sqrt: let the colorbar auto-generate
  return null;
}




function toggleAutoUpdate() {
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



function triggerAutoRender(interval = DEFAULT_AUTORENDER_INTERVAL) {
  const now = Date.now();
  if (now - lastRenderTime > interval) {
    renderPSF();
    lastRenderTime = now;
    renderPending = false;
  } else if (!renderPending) {
    renderPending = true;
    setTimeout(() => {
      renderPSF();
      lastRenderTime = Date.now();
      renderPending = false;
    }, interval);
  }
}




// ---------- Scaling + Colormap helpers ----------

function updatePSFScaling() {
  // Just trigger a re-render with the new scaling
  renderPSF();
}

// Quick approximate percentile (auto-limit). You can change clipP later.
function approxPercentile(arr, p = 99.9, stride = 8) {
  const samples = [];
  for (let i = 0; i < arr.length; i += stride) samples.push(arr[i]);
  samples.sort((a, b) => a - b);
  const idx = Math.min(samples.length - 1, Math.floor((p / 100) * (samples.length - 1)));
  return samples[idx];
}

// Build a simple colormap LUT (0..255 -> RGB). Start with grayscale.
// Add more cases later (viridis, magma, etc.) as needed.
function getColormapLUT(name = 'gray', n = 256) {
  const lut = new Uint8Array(n * 3);
  if (name === 'gray') {
    for (let i = 0; i < n; i++) {
      lut[3*i] = lut[3*i + 1] = lut[3*i + 2] = i; // 0..255
    }
    return lut;
  }
  if (name === 'hot') {
    // Simple “hot” style: black -> red -> yellow -> white
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const r = Math.min(255, Math.floor(255 * t * 3));
      const g = Math.min(255, Math.floor(255 * Math.max(0, (t - 1/3) * 3)));
      const b = Math.min(255, Math.floor(255 * Math.max(0, (t - 2/3) * 3)));
      lut[3*i] = r; lut[3*i + 1] = g; lut[3*i + 2] = b;
    }
    return lut;
  }
  // Fallback to gray
  for (let i = 0; i < n; i++) {
    lut[3*i] = lut[3*i + 1] = lut[3*i + 2] = i;
  }
  return lut;
}

// Map intensity -> RGBA via selected scale + colormap, with auto upper limit.
function applyToneAndColormap(intensity, N, mode = 'linear', cmap = 'gray', clipP = 99.9) {
  const eps = 1e-20;
  const vmax = Math.max(approxPercentile(intensity, clipP), eps);
  const lut = getColormapLUT(cmap, 256);
  const out = new Uint8ClampedArray(N * N * 4);

  // Precompute denominators per mode
  const denomLinear = vmax;
  const denomSqrt   = Math.sqrt(vmax);

  for (let i = 0; i < intensity.length; i++) {
    let v = intensity[i];
    let t; // normalized 0..1 after tone map

    if (mode === 'sqrt') {
      t = Math.sqrt(v) / (denomSqrt || eps);
    } else if (mode === 'log') {
      // Peak-normalized: v_norm = v / vmax. Clamp to floor then map to [0,1]
      // t = (log10(v_norm) - log10(LOG_FLOOR)) / (0 - log10(LOG_FLOOR))
      const vNorm = v / (vmax || eps);
      const vClamped = Math.max(LOG_FLOOR, vNorm);
      const L = -Math.log10(LOG_FLOOR);     // e.g., 6 for 1e-6
      t = (Math.log10(vClamped) + L) / L;   // 0 at floor, 1 at peak
    } else if (mode === 'db') {
      // dB relative to vmax, floor at -60 dB
      const db = 10 * Math.log10((v + eps) / vmax);
      const dbClamped = Math.max(-60, Math.min(0, db));
      t = (dbClamped + 60) / 60; // 0..1
    } else {
      // linear
      t = v / (denomLinear || eps);
    }

    t = Math.max(0, Math.min(1, t));
    const li = (t * 255) | 0;     // 0..255
    const ci = 3 * li;            // RGB index
    const p  = 4 * i;             // RGBA index

    out[p]     = lut[ci];
    out[p + 1] = lut[ci + 1];
    out[p + 2] = lut[ci + 2];
    out[p + 3] = 255;
  }

  // return both pixels and vmax for use in colorbar labeling
  return { pixels: out, vmax };
}



