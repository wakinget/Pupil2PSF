/**
 * tools.spec.js
 * =============
 * Test suite for tools.js: transmission helpers and ToolRegistry validation.
 */

import { TestRunner, assert, assertEqual, assertClose, assertThrows } from './assert.js';
import { ToolRegistry, applyTransmission, transmissionToGray, clamp0_100,
         ensureTransmission, readLegacyTransmission } from '../js/tools.js';

const runner = new TestRunner();

// -------------------- Mock Fabric Objects --------------------

/**
 * Create a minimal mock Fabric object for testing
 */
function createMockFabricObject(type = 'rect', initialProps = {}) {
  return {
    type,
    transmission: undefined,
    fill: undefined,
    stroke: undefined,
    strokeWidth: undefined,
    ...initialProps,
    set(props) {
      Object.assign(this, props);
    }
  };
}

// -------------------- Transmission Helper Tests --------------------

runner.test('clamp0_100: clamps values correctly', () => {
  assertEqual(clamp0_100(-10), 0);
  assertEqual(clamp0_100(0), 0);
  assertEqual(clamp0_100(50), 50);
  assertEqual(clamp0_100(100), 100);
  assertEqual(clamp0_100(150), 100);
});

runner.test('transmissionToGray: converts transmission to RGB', () => {
  assertEqual(transmissionToGray(0), 'rgb(0,0,0)');
  assertEqual(transmissionToGray(100), 'rgb(255,255,255)');
  assertEqual(transmissionToGray(50), 'rgb(128,128,128)'); // 50% = 127.5 rounded to 128
});

runner.test('transmissionToGray: clamps out-of-range values', () => {
  assertEqual(transmissionToGray(-10), 'rgb(0,0,0)');
  assertEqual(transmissionToGray(150), 'rgb(255,255,255)');
});

runner.test('applyTransmission: sets transmission property', () => {
  const obj = createMockFabricObject('rect');
  applyTransmission(obj, 75);
  assertEqual(obj.transmission, 75);
});

runner.test('applyTransmission: sets fill for non-line objects', () => {
  const obj = createMockFabricObject('rect');
  applyTransmission(obj, 50);
  assertEqual(obj.fill, 'rgb(128,128,128)');
});

runner.test('applyTransmission: sets stroke for line objects', () => {
  const obj = createMockFabricObject('line');
  applyTransmission(obj, 75);
  assertEqual(obj.stroke, 'rgb(191,191,191)'); // 75% = 191.25 rounded
});

runner.test('applyTransmission: removes stroke when near background (black)', () => {
  const obj = createMockFabricObject('rect', { stroke: '#333', strokeWidth: 2 });
  const context = { pupilBackground: 'black' };
  applyTransmission(obj, 0.5, context); // very close to black (0)
  assertEqual(obj.stroke, null);
  assertEqual(obj.strokeWidth, 0);
});

runner.test('applyTransmission: removes stroke when near background (white)', () => {
  const obj = createMockFabricObject('rect', { stroke: '#333', strokeWidth: 2 });
  const context = { pupilBackground: 'white' };
  applyTransmission(obj, 99.9, context); // very close to white (255)
  assertEqual(obj.stroke, null);
  assertEqual(obj.strokeWidth, 0);
});

runner.test('readLegacyTransmission: infers from RGB color', () => {
  const obj = createMockFabricObject('rect', { fill: 'rgb(128, 128, 128)' });
  const t = readLegacyTransmission(obj);
  assertClose(t, 50, 1); // 128/255 ≈ 50%
});

runner.test('readLegacyTransmission: infers from hex color', () => {
  const obj = createMockFabricObject('rect', { fill: '#808080' }); // 128 in hex
  const t = readLegacyTransmission(obj);
  assertClose(t, 50, 1);
});

runner.test('readLegacyTransmission: returns fallback for non-grayscale', () => {
  const obj = createMockFabricObject('rect', { fill: 'rgb(255, 0, 0)' }); // red
  const t = readLegacyTransmission(obj, 100);
  assertEqual(t, 100);
});

runner.test('readLegacyTransmission: prefers stroke for line objects', () => {
  const obj = createMockFabricObject('line', { stroke: 'rgb(64, 64, 64)' });
  const t = readLegacyTransmission(obj);
  assertClose(t, 25, 1); // 64/255 ≈ 25%
});

runner.test('ensureTransmission: sets transmission if missing', () => {
  const obj = createMockFabricObject('rect', { fill: 'rgb(128, 128, 128)' });
  ensureTransmission(obj, 100);
  assertClose(obj.transmission, 50, 1); // inferred from fill
});

runner.test('ensureTransmission: does not override existing transmission', () => {
  const obj = createMockFabricObject('rect', { transmission: 75 });
  ensureTransmission(obj, 100);
  assertEqual(obj.transmission, 75); // unchanged
});

// -------------------- ToolRegistry Structure Tests --------------------

runner.test('ToolRegistry: has all 5 tools defined', () => {
  const tools = ['circle', 'rect', 'line', 'point', 'scribble'];
  tools.forEach(tool => {
    assert(tool in ToolRegistry, `Tool '${tool}' not found in ToolRegistry`);
  });
});

runner.test('ToolRegistry: circle has init/update/finalize', () => {
  assert(typeof ToolRegistry.circle.init === 'function', 'circle.init is not a function');
  assert(typeof ToolRegistry.circle.update === 'function', 'circle.update is not a function');
  assert(typeof ToolRegistry.circle.finalize === 'function', 'circle.finalize is not a function');
});

runner.test('ToolRegistry: rect has init/update/finalize', () => {
  assert(typeof ToolRegistry.rect.init === 'function', 'rect.init is not a function');
  assert(typeof ToolRegistry.rect.update === 'function', 'rect.update is not a function');
  assert(typeof ToolRegistry.rect.finalize === 'function', 'rect.finalize is not a function');
});

runner.test('ToolRegistry: line has init/update/finalize', () => {
  assert(typeof ToolRegistry.line.init === 'function', 'line.init is not a function');
  assert(typeof ToolRegistry.line.update === 'function', 'line.update is not a function');
  assert(typeof ToolRegistry.line.finalize === 'function', 'line.finalize is not a function');
});

runner.test('ToolRegistry: point has init/update/finalize', () => {
  assert(typeof ToolRegistry.point.init === 'function', 'point.init is not a function');
  assert(typeof ToolRegistry.point.update === 'function', 'point.update is not a function');
  assert(typeof ToolRegistry.point.finalize === 'function', 'point.finalize is not a function');
});

runner.test('ToolRegistry: scribble has optionsPanelId', () => {
  assertEqual(ToolRegistry.scribble.optionsPanelId, 'scribble-options');
});

runner.test('ToolRegistry: line has strokeWidth option', () => {
  assert(typeof ToolRegistry.line.options === 'object', 'line.options is not an object');
  assert(typeof ToolRegistry.line.options.strokeWidth === 'number', 'line.options.strokeWidth is not a number');
});

// -------------------- Tool Lifecycle Tests (with Mock Fabric) --------------------

// Note: These tests require Fabric.js to be loaded. If Fabric is not available,
// they will be skipped automatically.

const fabricAvailable = typeof window !== 'undefined' && typeof window.fabric !== 'undefined';

if (fabricAvailable) {
  runner.test('circle.init: creates a Fabric.Circle with transmission', () => {
    const start = { x: 100, y: 100 };
    const context = { currentDefaults: { transmission: 80 } };
    const shape = ToolRegistry.circle.init(start, context);

    assert(shape instanceof fabric.Circle, 'Should create a Fabric.Circle');
    assertEqual(shape.transmission, 80);
    assertEqual(shape.left, 100);
    assertEqual(shape.top, 100);
  });

  runner.test('circle.update: adjusts radius based on drag distance', () => {
    const start = { x: 100, y: 100 };
    const context = { currentDefaults: { transmission: 100 } };
    const shape = ToolRegistry.circle.init(start, context);

    ToolRegistry.circle.update(shape, start, { x: 200, y: 100 });
    assertClose(shape.radius, 50, 1); // distance = 100, radius = 50
  });

  runner.test('circle.finalize: creates default circle if drag too small', () => {
    const start = { x: 100, y: 100 };
    const context = { currentDefaults: { transmission: 100 } };
    const shape = ToolRegistry.circle.init(start, context);
    shape.radius = 2; // below DRAG_THRESHOLD

    const finalized = ToolRegistry.circle.finalize(shape, start, context);
    assert(finalized !== shape, 'Should return replacement circle');
    assertEqual(finalized.radius, 25); // default radius
  });

  runner.test('rect.init: creates a Fabric.Rect with transmission', () => {
    const start = { x: 50, y: 50 };
    const context = { currentDefaults: { transmission: 60 } };
    const shape = ToolRegistry.rect.init(start, context);

    assert(shape instanceof fabric.Rect, 'Should create a Fabric.Rect');
    assertEqual(shape.transmission, 60);
    assertEqual(shape.left, 50);
    assertEqual(shape.top, 50);
  });

  runner.test('rect.update: adjusts width/height based on drag', () => {
    const start = { x: 50, y: 50 };
    const context = { currentDefaults: { transmission: 100 } };
    const shape = ToolRegistry.rect.init(start, context);

    ToolRegistry.rect.update(shape, start, { x: 150, y: 100 });
    assertEqual(shape.width, 100);
    assertEqual(shape.height, 50);
  });

  runner.test('rect.finalize: creates default rect if drag too small', () => {
    const start = { x: 50, y: 50 };
    const context = { currentDefaults: { transmission: 100 } };
    const shape = ToolRegistry.rect.init(start, context);
    shape.width = 2;
    shape.height = 2; // below DRAG_THRESHOLD

    const finalized = ToolRegistry.rect.finalize(shape, start, context);
    assert(finalized !== shape, 'Should return replacement rect');
    assertEqual(finalized.width, 50); // default size
    assertEqual(finalized.height, 50);
  });

  runner.test('line.init: creates a Fabric.Line with transmission', () => {
    const start = { x: 10, y: 20 };
    const context = { currentDefaults: { transmission: 90 } };
    const shape = ToolRegistry.line.init(start, context);

    assert(shape instanceof fabric.Line, 'Should create a Fabric.Line');
    assertEqual(shape.transmission, 90);
    assertEqual(shape.x1, 10);
    assertEqual(shape.y1, 20);
  });

  runner.test('line.update: adjusts endpoint during drag', () => {
    const start = { x: 10, y: 20 };
    const context = { currentDefaults: { transmission: 100 } };
    const shape = ToolRegistry.line.init(start, context);

    ToolRegistry.line.update(shape, start, { x: 100, y: 50 });
    assertEqual(shape.x2, 100);
    assertEqual(shape.y2, 50);
  });

  runner.test('point.init: creates a small Fabric.Circle marker', () => {
    const start = { x: 200, y: 150 };
    const context = { currentDefaults: { transmission: 100 } };
    const shape = ToolRegistry.point.init(start, context);

    assert(shape instanceof fabric.Circle, 'Should create a Fabric.Circle');
    assertEqual(shape.radius, 3); // small marker
    assertEqual(shape.customType, 'point');
    assertEqual(shape.transmission, 100);
  });

  runner.test('point.update: moves marker to new position', () => {
    const start = { x: 200, y: 150 };
    const context = { currentDefaults: { transmission: 100 } };
    const shape = ToolRegistry.point.init(start, context);

    ToolRegistry.point.update(shape, start, { x: 250, y: 175 });
    assertEqual(shape.left, 250);
    assertEqual(shape.top, 175);
  });

} else {
  runner.test('Fabric.js lifecycle tests: SKIPPED (Fabric.js not loaded)', () => {
    console.warn('Fabric.js not available - skipping tool lifecycle tests');
    assert(true); // auto-pass
  });
}

// -------------------- Transmission Rasterization Validation --------------------

runner.test('transmissionToGray produces monotonic values', () => {
  const values = [0, 25, 50, 75, 100];
  const grays = values.map(transmissionToGray);

  // Extract numeric RGB values
  const nums = grays.map(g => parseInt(g.match(/\d+/)[0]));

  // Check monotonicity
  for (let i = 1; i < nums.length; i++) {
    assert(nums[i] > nums[i-1],
      `Monotonicity violated: ${values[i-1]}% -> ${nums[i-1]}, ${values[i]}% -> ${nums[i]}`);
  }
});

runner.test('applyTransmission clamps transmission to [0, 100]', () => {
  const obj1 = createMockFabricObject('rect');
  applyTransmission(obj1, -50);
  assertEqual(obj1.transmission, 0);

  const obj2 = createMockFabricObject('rect');
  applyTransmission(obj2, 200);
  assertEqual(obj2.transmission, 100);
});

runner.test('readLegacyTransmission handles shorthand hex (#RGB)', () => {
  const obj = createMockFabricObject('rect', { fill: '#888' }); // expands to #888888
  const t = readLegacyTransmission(obj);
  assertClose(t, 53, 2); // 136/255 ≈ 53%
});

runner.test('readLegacyTransmission handles rgba() with alpha', () => {
  const obj = createMockFabricObject('rect', { fill: 'rgba(128, 128, 128, 0.5)' });
  const t = readLegacyTransmission(obj);
  assertClose(t, 50, 1); // ignores alpha
});

// -------------------- Run Tests --------------------

export async function runToolsTests() {
  console.log('=== Running Tools Tests ===\n');
  return await runner.run();
}