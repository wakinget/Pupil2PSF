/**
 * tools.js
 * ========
 * ToolRegistry and drawing tool implementations for Pupil2PSF.
 * Handles all tool lifecycle (init, update, finalize) and transmission helpers.
 */

// Minimum drag distance before treating as intentional shape creation
const DRAG_THRESHOLD = 5;

// -------------------- Transmission Helpers --------------------

/**
 * clamp0_100
 * ----------
 * Clamp a value to the range [0, 100].
 *
 * @param {number} x - Input value
 * @returns {number} Clamped value
 */
export function clamp0_100(x) {
  return Math.max(0, Math.min(100, x));
}

/**
 * transmissionToGray
 * ------------------
 * Convert transmission percentage (0-100) to RGB gray string.
 *
 * @param {number} t - Transmission percentage (0-100)
 * @returns {string} RGB color string like "rgb(128,128,128)"
 */
export function transmissionToGray(t) {
  const v = Math.round(clamp0_100(t) * 255 / 100);
  return `rgb(${v},${v},${v})`;
}

/**
 * applyTransmission
 * -----------------
 * Apply transmission value to a Fabric.js object (sets fill/stroke color).
 *
 * @param {fabric.Object} obj - Fabric object to modify
 * @param {number} t - Transmission percentage (0-100)
 * @param {object} context - Context object with pupilBackground
 * @returns {void}
 */
export function applyTransmission(obj, t, context = {}) {
  obj.transmission = clamp0_100(t);
  const gray = transmissionToGray(obj.transmission);

  const bgVal = (context.pupilBackground === 'black') ? 0 : 255;
  const v = Math.round(obj.transmission * 255 / 100);
  const nearBg = Math.abs(v - bgVal) <= 1;

  if (obj.type === 'line') {
    obj.set({ stroke: gray });
  } else {
    obj.set({ fill: gray });
    // Fix: Remove stroke/outline when object is indistinguishable from background.
    // This prevents invisible shapes from blocking interactions or appearing as artifacts.
    // Using obj.set({key: value}) syntax instead of obj.set(key, value) for Fabric.js compatibility.
    if ('stroke' in obj) {
      obj.set({ stroke: nearBg ? null : obj.stroke });
    }
    if ('strokeWidth' in obj) {
      obj.set({ strokeWidth: nearBg ? 0 : (obj.strokeWidth || 0) });
    }
  }
}

/**
 * readLegacyTransmission
 * ----------------------
 * Infer transmission percentage from legacy shape colors (for backwards compatibility).
 *
 * @param {fabric.Object} obj - Fabric object
 * @param {number} fallback - Default transmission if unable to infer (default 100)
 * @returns {number} Transmission percentage (0-100)
 */
export function readLegacyTransmission(obj, fallback = 100) {
  // Only for old shapes that don't have .transmission yet
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

/**
 * ensureTransmission
 * ------------------
 * Ensure a Fabric object has a transmission property (infer from legacy if needed).
 *
 * @param {fabric.Object} obj - Fabric object to check/update
 * @param {number} defaultTransmission - Default value if missing (default 100)
 * @param {object} context - Context object with pupilBackground
 * @returns {void}
 */
export function ensureTransmission(obj, defaultTransmission = 100, context = {}) {
  if (typeof obj.transmission !== 'number') {
    const t = readLegacyTransmission(obj, defaultTransmission);
    applyTransmission(obj, t, context);
  }
}

// -------------------- Line Tool Helpers --------------------

/**
 * clampToCanvas
 * -------------
 * Clamp coordinates to canvas boundaries.
 *
 * @param {fabric.Canvas} canvas - Fabric canvas instance
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {{x: number, y: number}} Clamped coordinates
 */
export function clampToCanvas(canvas, x, y) {
  const w = canvas.getWidth(), h = canvas.getHeight();
  return { x: Math.max(0, Math.min(w, x)), y: Math.max(0, Math.min(h, y)) };
}

/**
 * maybeSnapEndpoint
 * -----------------
 * Snap line endpoint to 0°, 45°, 90°, 135°, 180° if Shift is held.
 *
 * @param {fabric.Line} line - Line object
 * @param {string} which - Which endpoint ('p1' or 'p2')
 * @param {{x: number, y: number}} p - New endpoint position
 * @param {boolean} shift - Whether Shift key is held
 * @returns {{x: number, y: number}} Snapped or original position
 */
export function maybeSnapEndpoint(line, which, p, shift) {
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

/**
 * setupLineEndpointControls
 * --------------------------
 * Replace default Fabric.js controls with two circular endpoint handles for lines.
 *
 * @param {fabric.Line} line - Line object to configure
 * @param {Function} triggerAutoRender - Callback for auto-render (optional)
 * @param {object} renderContext - Context with autoUpdateEnabled, turboEnabled
 * @returns {void}
 */
export function setupLineEndpointControls(line, triggerAutoRender = null, renderContext = {}) {
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
      if (triggerAutoRender && renderContext.autoUpdateEnabled && renderContext.turboEnabled) {
        triggerAutoRender();
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

// -------------------- ToolRegistry --------------------

/**
 * ToolRegistry
 * ------------
 * Registry of drawing tools with their lifecycle methods (init, update, finalize).
 * Each tool creates and manages Fabric.js objects during drawing interactions.
 *
 * Tools:
 * - circle: Draw circles (click = default size, drag = custom radius)
 * - rect: Draw rectangles
 * - line: Draw lines with endpoint controls and shift-snapping
 * - point: Place single-pixel markers
 * - scribble: Free-draw brush (managed by Fabric's drawing mode)
 */
export const ToolRegistry = {
  circle: {
    optionsPanelId: null,
    init(start, context) {
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
        transmission: context.currentDefaults.transmission
      });
      applyTransmission(shape, shape.transmission, context);
      // Trigger auto-render if Turbo is on
      if (context.autoUpdateEnabled && context.turboEnabled && context.triggerAutoRender) {
        context.triggerAutoRender();
      }
      return shape;
    },
    update(shape, start, current) {
      const dx = current.x - start.x;
      const dy = current.y - start.y;
      const r = Math.sqrt(dx * dx + dy * dy) / 2;
      shape.set({ radius: Math.max(1, r) });
    },
    finalize(shape, start, context) {
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
          transmission: context.currentDefaults.transmission
        });
        applyTransmission(replacement, replacement.transmission, context);
        return replacement;
      }
      return shape;
    }
  },

  rect: {
    optionsPanelId: null,
    init(start, context) {
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
        transmission: context.currentDefaults.transmission
      });
      applyTransmission(shape, shape.transmission, context);
      // Trigger auto-render if Turbo is on
      if (context.autoUpdateEnabled && context.turboEnabled && context.triggerAutoRender) {
        context.triggerAutoRender();
      }
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
    finalize(shape, start, context) {
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
          transmission: context.currentDefaults.transmission
        });
        applyTransmission(replacement, replacement.transmission, context);
        return replacement;
      }
      return shape;
    }
  },

  line: {
    optionsPanelId: 'line-options',
    options: { strokeWidth: 5 },
    init(start, context) {
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
        transmission: context.currentDefaults.transmission
      });
      applyTransmission(shape, shape.transmission, context);
      setupLineEndpointControls(shape, context.triggerAutoRender, context);
      if (context.autoUpdateEnabled && context.turboEnabled && context.triggerAutoRender) {
        context.triggerAutoRender();
      }
      return shape;
    },
    update(shape, start, current) {
      shape.set({ x2: current.x, y2: current.y });
    },
    finalize(shape, start, context) {
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
          transmission: shape.transmission ?? context.currentDefaults.transmission
        });
        applyTransmission(replacement, replacement.transmission, context);
        setupLineEndpointControls(replacement, context.triggerAutoRender, context);
        return replacement;
      }

      setupLineEndpointControls(shape, context.triggerAutoRender, context);
      return shape;
    }
  },

  point: {
    optionsPanelId: null,
    init(start, context) {
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
        transmission: context.currentDefaults.transmission
      });
      applyTransmission(shape, shape.transmission, context);
      if (context.autoUpdateEnabled && context.triggerAutoRender) {
        context.triggerAutoRender();
      }
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