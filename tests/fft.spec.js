/**
 * fft.spec.js
 * ===========
 * Test suite for FFT functions: Parseval's theorem, fftshift, non-negativity.
 */

import { TestRunner, assert, assertEqual, assertClose, assertArrayClose,
         assertNonNegative, assertNoNaN, assertNoInf, assertThrows,
         sum, sumSquares } from './assert.js';
import { fft2, fftshift2D, magnitudeSquared, magnitudeSquaredInterleaved,
         interleaveComplex, deinterleaveComplex, snapToPow2,
         approxPercentile, getColormapLUT, applyToneAndColormap } from '../js/fft.js';

const runner = new TestRunner();

// -------------------- Utility Helpers --------------------

/**
 * Create a uniform 2D array (all ones)
 */
function uniformArray(N) {
  const arr = new Float32Array(N * N);
  arr.fill(1.0);
  return arr;
}

/**
 * Create a point source (delta function at center)
 */
function pointSource(N) {
  const arr = new Float32Array(N * N);
  const center = Math.floor(N / 2);
  arr[center * N + center] = 1.0;
  return arr;
}

/**
 * Create a vertical slit (column at center)
 */
function verticalSlit(N, width = 1) {
  const arr = new Float32Array(N * N);
  const centerX = Math.floor(N / 2);
  for (let y = 0; y < N; y++) {
    for (let dx = -Math.floor(width/2); dx <= Math.floor(width/2); dx++) {
      arr[y * N + (centerX + dx)] = 1.0;
    }
  }
  return arr;
}

// -------------------- Basic Function Tests --------------------

runner.test('snapToPow2: snap to nearest power of 2', () => {
  assertEqual(snapToPow2(10), 8);
  assertEqual(snapToPow2(100), 128);
  assertEqual(snapToPow2(512), 512);
  assertEqual(snapToPow2(1000), 1024);
  assertEqual(snapToPow2(3000), 2048); // capped at max
  assertEqual(snapToPow2(10, 16, 2048), 16); // capped at min
});

runner.test('interleaveComplex: pack real/imag correctly', () => {
  const real = new Float32Array([1, 2, 3]);
  const imag = new Float32Array([4, 5, 6]);
  const interleaved = interleaveComplex(real, imag);
  assertArrayClose(interleaved, [1, 4, 2, 5, 3, 6]);
});

runner.test('deinterleaveComplex: unpack real/imag correctly', () => {
  const interleaved = new Float32Array([1, 4, 2, 5, 3, 6]);
  const { real, imag } = deinterleaveComplex(interleaved);
  assertArrayClose(real, [1, 2, 3]);
  assertArrayClose(imag, [4, 5, 6]);
});

runner.test('magnitudeSquared: compute |z|^2 correctly', () => {
  const real = new Float32Array([3, 0, 4]);
  const imag = new Float32Array([4, 5, 0]);
  const { intensity, max } = magnitudeSquared(real, imag);
  assertArrayClose(intensity, [25, 25, 16]); // 3²+4²=25, 0²+5²=25, 4²+0²=16
  assertEqual(max, 25);
});

runner.test('magnitudeSquared: throw on length mismatch', () => {
  const real = new Float32Array([1, 2]);
  const imag = new Float32Array([3]);
  assertThrows(() => magnitudeSquared(real, imag), 'same length');
});

runner.test('magnitudeSquaredInterleaved: compute |z|^2 from interleaved', () => {
  const interleaved = new Float32Array([3, 4, 0, 5]); // (3+4i), (0+5i)
  const { intensity, max } = magnitudeSquaredInterleaved(interleaved);
  assertArrayClose(intensity, [25, 25]);
  assertEqual(max, 25);
});

// -------------------- fftshift2D Tests --------------------

runner.test('fftshift2D: center DC for even N', () => {
  const N = 4;
  const input = new Float32Array([
    1, 2, 3, 4,
    5, 6, 7, 8,
    9, 10, 11, 12,
    13, 14, 15, 16
  ]);
  const shifted = fftshift2D(input, N);
  // Expected: quadrants swapped (bottom-right -> top-left, etc.)
  const expected = new Float32Array([
    11, 12,  9, 10,
    15, 16, 13, 14,
     3,  4,  1,  2,
     7,  8,  5,  6
  ]);
  assertArrayClose(shifted, expected);
});

runner.test('fftshift2D: center DC for odd N', () => {
  const N = 3;
  const input = new Float32Array([
    1, 2, 3,
    4, 5, 6,
    7, 8, 9
  ]);
  const shifted = fftshift2D(input, N);
  const expected = new Float32Array([
    5, 6, 4,
    8, 9, 7,
    2, 3, 1
  ]);
  assertArrayClose(shifted, expected);
});

runner.test('fftshift2D: throw on wrong array length', () => {
  assertThrows(() => fftshift2D(new Float32Array(10), 4), 'expected length');
});

// -------------------- FFT Correctness Tests --------------------

runner.test('fft2: Parseval theorem (energy conservation) - uniform', () => {
  const N = 16;
  const real = uniformArray(N);
  const imag = new Float32Array(N * N); // all zeros

  const inputEnergy = sumSquares(real) + sumSquares(imag);

  const { real: F_re, imag: F_im } = fft2(real, imag, N);
  const { intensity } = magnitudeSquared(F_re, F_im);
  const outputEnergy = sum(intensity);

  // With unitary normalization: sum(|F|²) ≈ sum(|x|²)
  assertClose(outputEnergy, inputEnergy, 1e-4,
    `Parseval failed: input=${inputEnergy.toFixed(6)}, output=${outputEnergy.toFixed(6)}`);
});

runner.test('fft2: Parseval theorem (energy conservation) - point source', () => {
  const N = 16;
  const real = pointSource(N);
  const imag = new Float32Array(N * N);

  const inputEnergy = sumSquares(real);

  const { real: F_re, imag: F_im } = fft2(real, imag, N);
  const { intensity } = magnitudeSquared(F_re, F_im);
  const outputEnergy = sum(intensity);

  assertClose(outputEnergy, inputEnergy, 1e-4,
    `Parseval failed for point source: input=${inputEnergy.toFixed(6)}, output=${outputEnergy.toFixed(6)}`);
});

runner.test('fft2: Parseval theorem (energy conservation) - vertical slit', () => {
  const N = 32;
  const real = verticalSlit(N, 3);
  const imag = new Float32Array(N * N);

  const inputEnergy = sumSquares(real);

  const { real: F_re, imag: F_im } = fft2(real, imag, N);
  const { intensity } = magnitudeSquared(F_re, F_im);
  const outputEnergy = sum(intensity);

  assertClose(outputEnergy, inputEnergy, 1e-3,
    `Parseval failed for slit: input=${inputEnergy.toFixed(6)}, output=${outputEnergy.toFixed(6)}`);
});

runner.test('fft2: non-negativity of intensity', () => {
  const N = 16;
  const real = uniformArray(N);
  const imag = new Float32Array(N * N);

  const { real: F_re, imag: F_im } = fft2(real, imag, N);
  const { intensity } = magnitudeSquared(F_re, F_im);

  assertNonNegative(intensity, 'Intensity array contains negative values');
});

runner.test('fft2: no NaN or Inf in output', () => {
  const N = 16;
  const real = uniformArray(N);
  const imag = new Float32Array(N * N);

  const { real: F_re, imag: F_im } = fft2(real, imag, N);

  assertNoNaN(F_re, 'Real part contains NaN');
  assertNoNaN(F_im, 'Imag part contains NaN');
  assertNoInf(F_re, 'Real part contains Inf');
  assertNoInf(F_im, 'Imag part contains Inf');
});

runner.test('fft2: DC peak near center after fftshift (uniform input)', () => {
  const N = 16;
  const real = uniformArray(N);
  const imag = new Float32Array(N * N);

  const { real: F_re, imag: F_im } = fft2(real, imag, N);
  const { intensity } = magnitudeSquared(F_re, F_im);
  const shifted = fftshift2D(intensity, N);

  // For uniform input, DC (at center) should be maximum
  const center = Math.floor(N / 2);
  const centerIdx = center * N + center;
  const maxVal = Math.max(...shifted);

  assertClose(shifted[centerIdx], maxVal, 1e-4,
    `DC peak not at center: center=${shifted[centerIdx]}, max=${maxVal}`);
});

// -------------------- Tone Mapping Tests --------------------

runner.test('applyToneAndColormap: non-negative pixels', () => {
  const N = 16;
  const intensity = new Float32Array(N * N).fill(1.0);
  const { pixels } = applyToneAndColormap(intensity, N, 'linear', 'gray', 100);

  for (let i = 0; i < pixels.length; i++) {
    assert(pixels[i] >= 0 && pixels[i] <= 255,
      `Pixel ${i} out of range: ${pixels[i]}`);
  }
});

runner.test('applyToneAndColormap: alpha channel is 255', () => {
  const N = 4;
  const intensity = new Float32Array(N * N).fill(0.5);
  const { pixels } = applyToneAndColormap(intensity, N, 'linear', 'gray', 100);

  for (let i = 3; i < pixels.length; i += 4) {
    assertEqual(pixels[i], 255, `Alpha channel at ${i} is not 255`);
  }
});

runner.test('applyToneAndColormap: monotonic tone mapping (linear)', () => {
  const N = 4;
  const intensity = new Float32Array([0, 0.25, 0.5, 1.0, 0.75, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const { pixels } = applyToneAndColormap(intensity, N, 'linear', 'gray', 100);

  // Extract grayscale values (R channel)
  const values = [];
  for (let i = 0; i < intensity.length; i++) {
    values.push(pixels[i * 4]);
  }

  // Check that mapping preserves order for first 5 values
  assert(values[0] < values[1], 'Monotonicity violated: 0 < 0.25');
  assert(values[1] < values[2], 'Monotonicity violated: 0.25 < 0.5');
  assert(values[2] < values[4], 'Monotonicity violated: 0.5 < 0.75');
  assert(values[4] < values[3], 'Monotonicity violated: 0.75 < 1.0');
});

runner.test('getColormapLUT: gray produces grayscale', () => {
  const lut = getColormapLUT('gray', 256);
  assertEqual(lut.length, 768); // 256 * 3

  // Check a few values: gray[i] should be (i, i, i)
  for (let i = 0; i < 256; i += 64) {
    assertEqual(lut[3*i], i);
    assertEqual(lut[3*i + 1], i);
    assertEqual(lut[3*i + 2], i);
  }
});

runner.test('getColormapLUT: hot produces warm colors', () => {
  const lut = getColormapLUT('hot', 256);
  assertEqual(lut.length, 768);

  // Black at start
  assertEqual(lut[0], 0);
  assertEqual(lut[1], 0);
  assertEqual(lut[2], 0);

  // White at end
  assert(lut[3*255] > 200, 'Hot colormap should be bright at end');
});

runner.test('approxPercentile: compute percentile correctly', () => {
  const arr = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const p50 = approxPercentile(arr, 50, 1); // median
  assertClose(p50, 5.5, 1.0, 'Median should be ~5.5'); // rough check

  const p100 = approxPercentile(arr, 100, 1); // max
  assertEqual(p100, 10);
});

// -------------------- Run Tests --------------------

export async function runFFTTests() {
  console.log('=== Running FFT Tests ===\n');
  return await runner.run();
}