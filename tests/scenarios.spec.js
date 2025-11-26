/**
 * scenarios.spec.js
 * =================
 * High-level integration tests for Pupil2PSF.
 * Tests the full pipeline: canvas setup → drawing → FFT → PSF output.
 */

import { TestRunner, assert, assertNonNegative, assertNoNaN, assertNoInf,
         sum, sumSquares } from './assert.js';
import { fft2, fftshift2D, magnitudeSquared, applyToneAndColormap } from '../js/fft.js';
import { ToolRegistry, applyTransmission } from '../js/tools.js';

const runner = new TestRunner();

// -------------------- Test Canvas Setup --------------------

/**
 * Create a minimal Fabric canvas for testing
 */
function createTestCanvas(size = 512) {
  // Create a canvas element
  const canvasEl = document.createElement('canvas');
  canvasEl.id = 'test-canvas';
  canvasEl.width = size;
  canvasEl.height = size;
  canvasEl.style.display = 'none'; // hide from view
  document.body.appendChild(canvasEl);

  // Create Fabric canvas
  const canvas = new fabric.Canvas('test-canvas', { willReadFrequently: true });
  canvas.setBackgroundColor('black', canvas.renderAll.bind(canvas));

  return { canvas, canvasEl };
}

/**
 * Cleanup test canvas
 */
function destroyTestCanvas(canvas, canvasEl) {
  if (canvas) {
    canvas.dispose();
  }
  if (canvasEl && canvasEl.parentNode) {
    canvasEl.parentNode.removeChild(canvasEl);
  }
}

/**
 * Rasterize test canvas to grayscale array (simplified version of ui.js function)
 */
function rasterizeTestCanvas(canvas, size = 512) {
  const hiddenCanvas = document.createElement('canvas');
  const ctx = hiddenCanvas.getContext('2d', { willReadFrequently: true });
  hiddenCanvas.width = size;
  hiddenCanvas.height = size;
  ctx.imageSmoothingEnabled = false;

  // Solid background
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#000'; // black background
  ctx.fillRect(0, 0, size, size);

  // Draw the canvas
  canvas.renderAll();
  ctx.drawImage(canvas.lowerCanvasEl, 0, 0, size, size);

  // Read pixels -> grayscale
  const imageData = ctx.getImageData(0, 0, size, size).data;
  const grayArray = new Float32Array(size * size);
  for (let i = 0, j = 0; i < imageData.length; i += 4, j++) {
    grayArray[j] = imageData[i] / 255.0; // red channel
  }

  // Single-pixel override for 'point' tool
  // Matches production behavior in ui.js:392-403 where point objects (radius-3 circles
  // for visibility) are rasterized as single pixels to produce uniform PSF.
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

  return grayArray;
}

// -------------------- Integration Tests --------------------

runner.test('Integration: Create empty canvas and rasterize', () => {
  const { canvas, canvasEl } = createTestCanvas(64);

  try {
    const raster = rasterizeTestCanvas(canvas, 64);

    assert(raster.length === 64 * 64, `Expected ${64*64} pixels, got ${raster.length}`);
    assertNoNaN(raster, 'Raster contains NaN');
    assertNoInf(raster, 'Raster contains Inf');

    // Empty black canvas should be all zeros
    const nonZero = Array.from(raster).filter(v => v > 0.01).length;
    assert(nonZero === 0, `Expected all black pixels, found ${nonZero} non-zero pixels`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Draw white circle and verify raster', () => {
  const { canvas, canvasEl } = createTestCanvas(128);

  try {
    const context = {
      currentDefaults: { transmission: 100 },
      pupilBackground: 'black',
      autoUpdateEnabled: false,
      turboEnabled: false
    };

    // Create a white circle at center
    const circle = ToolRegistry.circle.init({ x: 64, y: 64 }, context);
    circle.radius = 20;
    applyTransmission(circle, 100, context); // white
    canvas.add(circle);
    canvas.renderAll();

    const raster = rasterizeTestCanvas(canvas, 128);

    assertNoNaN(raster, 'Raster contains NaN');
    assertNoInf(raster, 'Raster contains Inf');

    // Should have some white pixels
    const whitePixels = Array.from(raster).filter(v => v > 0.9).length;
    assert(whitePixels > 100, `Expected >100 white pixels, found ${whitePixels}`);

    // Most pixels should still be black (background)
    const blackPixels = Array.from(raster).filter(v => v < 0.1).length;
    assert(blackPixels > 128*128 - 2000, `Expected mostly black background, found ${blackPixels} black pixels`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Full pipeline - circle → FFT → PSF', () => {
  const { canvas, canvasEl } = createTestCanvas(128);
  const N = 128;

  try {
    const context = {
      currentDefaults: { transmission: 100 },
      pupilBackground: 'black',
      autoUpdateEnabled: false,
      turboEnabled: false
    };

    // Create a white circle
    const circle = ToolRegistry.circle.init({ x: 64, y: 64 }, context);
    circle.radius = 15;
    applyTransmission(circle, 100, context);
    canvas.add(circle);

    // Rasterize
    const real = rasterizeTestCanvas(canvas, N);
    const imag = new Float32Array(N * N);

    // Check input energy
    const inputEnergy = sumSquares(real);
    assert(inputEnergy > 0, 'Input energy should be > 0');

    // Forward FFT
    const { real: F_re, imag: F_im } = fft2(real, imag, N);

    assertNoNaN(F_re, 'FFT real part contains NaN');
    assertNoNaN(F_im, 'FFT imag part contains NaN');
    assertNoInf(F_re, 'FFT real part contains Inf');
    assertNoInf(F_im, 'FFT imag part contains Inf');

    // Compute intensity
    const { intensity } = magnitudeSquared(F_re, F_im);

    assertNonNegative(intensity, 'Intensity contains negative values');
    assertNoNaN(intensity, 'Intensity contains NaN');
    assertNoInf(intensity, 'Intensity contains Inf');

    // Check output energy (Parseval)
    const outputEnergy = sum(intensity);
    const energyRatio = outputEnergy / inputEnergy;
    assert(energyRatio > 0.9 && energyRatio < 1.1,
      `Parseval violated: input=${inputEnergy.toFixed(6)}, output=${outputEnergy.toFixed(6)}, ratio=${energyRatio.toFixed(6)}`);

    // Shift DC to center
    const shifted = fftshift2D(intensity, N);

    assertNoNaN(shifted, 'Shifted intensity contains NaN');
    assertNoInf(shifted, 'Shifted intensity contains Inf');

    // Check that DC peak is near center
    const center = Math.floor(N / 2);
    const centerIdx = center * N + center;
    const maxVal = Math.max(...shifted);
    const centerVal = shifted[centerIdx];

    assert(centerVal > maxVal * 0.5,
      `DC peak not near center: center=${centerVal.toFixed(6)}, max=${maxVal.toFixed(6)}`);

    console.log(`✓ Full pipeline test passed: input energy=${inputEnergy.toFixed(6)}, output energy=${outputEnergy.toFixed(6)}`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Multiple shapes - circle + rect', () => {
  const { canvas, canvasEl } = createTestCanvas(128);
  const N = 128;

  try {
    const context = {
      currentDefaults: { transmission: 100 },
      pupilBackground: 'black',
      autoUpdateEnabled: false,
      turboEnabled: false
    };

    // Create a circle
    const circle = ToolRegistry.circle.init({ x: 40, y: 64 }, context);
    circle.radius = 15;
    applyTransmission(circle, 100, context);
    canvas.add(circle);

    // Create a rect
    const rect = ToolRegistry.rect.init({ x: 70, y: 50 }, context);
    rect.width = 30;
    rect.height = 30;
    applyTransmission(rect, 100, context);
    canvas.add(rect);

    // Rasterize and FFT
    const real = rasterizeTestCanvas(canvas, N);
    const imag = new Float32Array(N * N);

    const { real: F_re, imag: F_im } = fft2(real, imag, N);
    const { intensity } = magnitudeSquared(F_re, F_im);

    assertNonNegative(intensity, 'Intensity contains negative values');
    assertNoNaN(intensity, 'Intensity contains NaN');

    // Verify non-empty PSF
    const nonZero = Array.from(intensity).filter(v => v > 1e-10).length;
    assert(nonZero > N * N / 2, `Expected significant PSF energy, found ${nonZero} non-zero pixels`);

    console.log(`✓ Multiple shapes test passed: ${nonZero} non-zero PSF pixels`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Tone mapping produces valid RGBA', () => {
  const { canvas, canvasEl } = createTestCanvas(64);
  const N = 64;

  try {
    const context = {
      currentDefaults: { transmission: 100 },
      pupilBackground: 'black'
    };

    // Create a small circle
    const circle = ToolRegistry.circle.init({ x: 32, y: 32 }, context);
    circle.radius = 10;
    applyTransmission(circle, 100, context);
    canvas.add(circle);

    // Full pipeline
    const real = rasterizeTestCanvas(canvas, N);
    const imag = new Float32Array(N * N);
    const { real: F_re, imag: F_im } = fft2(real, imag, N);
    const { intensity } = magnitudeSquared(F_re, F_im);
    const shifted = fftshift2D(intensity, N);

    // Apply tone mapping (linear + gray)
    const { pixels, vmax } = applyToneAndColormap(shifted, N, 'linear', 'gray', 100);

    // Check RGBA properties
    assert(pixels.length === N * N * 4, `Expected ${N*N*4} RGBA values, got ${pixels.length}`);

    // Check all pixels are in valid range
    for (let i = 0; i < pixels.length; i++) {
      assert(pixels[i] >= 0 && pixels[i] <= 255,
        `Pixel ${i} out of range [0,255]: ${pixels[i]}`);
    }

    // Check alpha channel is always 255
    for (let i = 3; i < pixels.length; i += 4) {
      assert(pixels[i] === 255, `Alpha channel at pixel ${i/4} is ${pixels[i]}, expected 255`);
    }

    // Check vmax is positive
    assert(vmax > 0, `vmax should be > 0, got ${vmax}`);

    console.log(`✓ Tone mapping test passed: vmax=${vmax.toExponential(2)}`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Variable transmission values', () => {
  const { canvas, canvasEl } = createTestCanvas(128);
  const N = 128;

  try {
    const context = {
      currentDefaults: { transmission: 50 },
      pupilBackground: 'black'
    };

    // Create shapes with different transmissions
    const circle1 = ToolRegistry.circle.init({ x: 40, y: 64 }, context);
    circle1.radius = 15;
    applyTransmission(circle1, 100, context); // fully transmissive
    canvas.add(circle1);

    const circle2 = ToolRegistry.circle.init({ x: 88, y: 64 }, context);
    circle2.radius = 15;
    applyTransmission(circle2, 50, context); // half transmissive
    canvas.add(circle2);

    // Rasterize
    const raster = rasterizeTestCanvas(canvas, N);

    // Check we have different grayscale values
    const values = new Set();
    for (let i = 0; i < raster.length; i++) {
      if (raster[i] > 0.01) { // ignore background
        values.add(Math.round(raster[i] * 100)); // round to 1% precision
      }
    }

    assert(values.size >= 2, `Expected at least 2 distinct transmission values, found ${values.size}`);

    // Verify FFT works with variable transmission
    const imag = new Float32Array(N * N);
    const { real: F_re, imag: F_im } = fft2(raster, imag, N);
    const { intensity } = magnitudeSquared(F_re, F_im);

    assertNonNegative(intensity, 'Intensity contains negative values');
    assertNoNaN(intensity, 'Intensity contains NaN');

    console.log(`✓ Variable transmission test passed: ${values.size} distinct values`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Point tool creates single-pixel marker', () => {
  const { canvas, canvasEl } = createTestCanvas(64);
  const N = 64;

  try {
    const context = {
      currentDefaults: { transmission: 100 },
      pupilBackground: 'black'
    };

    // Create a point at center
    const point = ToolRegistry.point.init({ x: 32, y: 32 }, context);
    canvas.add(point);

    // Rasterize
    const raster = rasterizeTestCanvas(canvas, N);

    // With single-pixel override, the point should be rasterized as exactly 1 pixel
    // (even though it appears as radius-3 circle on the pupil canvas for visibility)
    const brightPixels = Array.from(raster).filter(v => v > 0.8).length;
    assert(brightPixels >= 1 && brightPixels <= 1,
      `Expected exactly 1 bright pixel for point marker, found ${brightPixels}`);

    // FFT of point source should produce relatively uniform PSF
    const imag = new Float32Array(N * N);
    const { real: F_re, imag: F_im } = fft2(raster, imag, N);
    const { intensity } = magnitudeSquared(F_re, F_im);

    const mean = sum(intensity) / intensity.length;
    const variance = intensity.reduce((acc, v) => acc + (v - mean) ** 2, 0) / intensity.length;
    const stddev = Math.sqrt(variance);
    const cv = stddev / mean; // coefficient of variation

    // Point source should have relatively low variation (but not zero due to finite size)
    assert(cv < 2.0, `Point source PSF should be relatively uniform, CV=${cv.toFixed(2)}`);

    console.log(`✓ Point tool test passed: ${brightPixels} bright pixels, PSF CV=${cv.toFixed(3)}`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Line tool creates directional pattern', () => {
  const { canvas, canvasEl } = createTestCanvas(128);
  const N = 128;

  try {
    const context = {
      currentDefaults: { transmission: 100 },
      pupilBackground: 'black'
    };

    // Create a horizontal line
    const line = ToolRegistry.line.init({ x: 20, y: 64 }, context);
    line.x2 = 108;
    line.y2 = 64;
    applyTransmission(line, 100, context);
    canvas.add(line);

    // Rasterize and FFT
    const real = rasterizeTestCanvas(canvas, N);
    const imag = new Float32Array(N * N);
    const { real: F_re, imag: F_im } = fft2(real, imag, N);
    const { intensity } = magnitudeSquared(F_re, F_im);
    const shifted = fftshift2D(intensity, N);

    assertNonNegative(intensity, 'Intensity contains negative values');
    assertNoNaN(intensity, 'Intensity contains NaN');

    // Horizontal line should produce vertical pattern in PSF
    // Sum energy over central ±5 columns (line has width, pattern spreads)
    const center = Math.floor(N / 2);
    let centralEnergy = 0;
    for (let y = 0; y < N; y++) {
      for (let dx = -5; dx <= 5; dx++) {
        const x = center + dx;
        if (x >= 0 && x < N) {
          centralEnergy += shifted[y * N + x];
        }
      }
    }

    const totalEnergy = sum(shifted);
    const centralRatio = centralEnergy / totalEnergy;

    assert(centralRatio > 0.05,
      `Expected significant energy in central ±5 columns, got ratio=${centralRatio.toFixed(3)}`);

    console.log(`✓ Line tool test passed: central ±5 column energy ratio=${centralRatio.toFixed(3)}`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Different scaling modes produce valid output', () => {
  const { canvas, canvasEl } = createTestCanvas(64);
  const N = 64;

  try {
    const context = {
      currentDefaults: { transmission: 100 },
      pupilBackground: 'black'
    };

    // Create a circle
    const circle = ToolRegistry.circle.init({ x: 32, y: 32 }, context);
    circle.radius = 10;
    applyTransmission(circle, 100, context);
    canvas.add(circle);

    // Full pipeline
    const real = rasterizeTestCanvas(canvas, N);
    const imag = new Float32Array(N * N);
    const { real: F_re, imag: F_im } = fft2(real, imag, N);
    const { intensity } = magnitudeSquared(F_re, F_im);
    const shifted = fftshift2D(intensity, N);

    // Test all scaling modes
    const modes = ['linear', 'sqrt', 'log', 'db'];
    for (const mode of modes) {
      const { pixels, vmax } = applyToneAndColormap(shifted, N, mode, 'gray', 100);

      assert(pixels.length === N * N * 4, `${mode}: incorrect pixel count`);
      assert(vmax > 0, `${mode}: vmax should be > 0`);

      // Check all pixels are valid
      for (let i = 0; i < pixels.length; i++) {
        assert(pixels[i] >= 0 && pixels[i] <= 255,
          `${mode}: pixel ${i} out of range: ${pixels[i]}`);
      }

      console.log(`  ✓ ${mode} mode: vmax=${vmax.toExponential(2)}`);
    }
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

runner.test('Integration: Empty canvas produces uniform PSF', () => {
  const { canvas, canvasEl } = createTestCanvas(64);
  const N = 64;

  try {
    // Empty black canvas
    const real = rasterizeTestCanvas(canvas, N);
    const imag = new Float32Array(N * N);

    const { real: F_re, imag: F_im } = fft2(real, imag, N);
    const { intensity } = magnitudeSquared(F_re, F_im);

    // Empty canvas → zero energy
    const totalEnergy = sum(intensity);
    assert(totalEnergy < 1e-6, `Empty canvas should have near-zero energy, got ${totalEnergy}`);

    // All intensity values should be near zero
    const maxIntensity = Math.max(...intensity);
    assert(maxIntensity < 1e-6, `Empty canvas max intensity should be near zero, got ${maxIntensity}`);

    console.log(`✓ Empty canvas test passed: energy=${totalEnergy.toExponential(3)}`);
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

// -------------------- Diagnostic Tests --------------------

runner.test('Diagnostic: Fabric.js canvas rendering', () => {
  const { canvas, canvasEl } = createTestCanvas(64);

  try {
    const context = {
      currentDefaults: { transmission: 100 },
      pupilBackground: 'black'
    };

    // Add a white circle
    const circle = ToolRegistry.circle.init({ x: 32, y: 32 }, context);
    circle.radius = 10;
    canvas.add(circle);
    canvas.renderAll();

    // Check canvas element has content
    const ctx = canvasEl.getContext('2d');
    const imageData = ctx.getImageData(0, 0, 64, 64);
    const hasNonBlack = Array.from(imageData.data).some(v => v > 0);

    assert(hasNonBlack, 'Canvas should have non-black pixels after adding shape');

    console.log('✓ Fabric.js rendering is working correctly');
  } finally {
    destroyTestCanvas(canvas, canvasEl);
  }
});

// -------------------- Run Tests --------------------

export async function runScenariosTests() {
  console.log('=== Running Scenario Integration Tests ===\n');
  return await runner.run();
}