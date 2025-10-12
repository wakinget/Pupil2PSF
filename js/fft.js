/**
 * fft.js
 * ======
 * Pure FFT, fftshift, and tone mapping helpers for Pupil2PSF.
 * All functions are stateless and side-effect-free.
 */

// Peak-normalized log uses a floor of 1e-6 (≈ −60 dB)
export const LOG_FLOOR = 1e-6;

// -------------------- FFT Helpers --------------------

/**
 * interleaveComplex
 * -----------------
 * Pack two real arrays (Re, Im) into a single interleaved complex buffer:
 *   [Re0, Im0, Re1, Im1, ...]
 *
 * @param {Float32Array} real - Real part
 * @param {Float32Array} imag - Imaginary part
 * @returns {Float32Array} Interleaved complex array
 */
export function interleaveComplex(real, imag) {
  const n = real.length;
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const j = 2 * i;
    out[j]     = real[i];
    out[j + 1] = imag[i];
  }
  return out;
}

/**
 * deinterleaveComplex
 * -------------------
 * Split an interleaved complex buffer back to {real, imag}.
 *
 * @param {Float32Array} c - Interleaved complex array
 * @returns {{real: Float32Array, imag: Float32Array}}
 */
export function deinterleaveComplex(c) {
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

/**
 * magnitudeSquaredInterleaved
 * ----------------------------
 * Compute |F|^2 from an interleaved complex spectrum.
 *
 * @param {Float32Array} c - Interleaved complex array [Re0, Im0, Re1, Im1, ...]
 * @returns {{intensity: Float32Array, max: number}}
 */
export function magnitudeSquaredInterleaved(c) {
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
 * @param {Float32Array} real - Real part of complex data (length N)
 * @param {Float32Array} imag - Imag part of complex data (same length as real)
 * @returns {{intensity: Float32Array, max: number}}
 */
export function magnitudeSquared(real, imag) {
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

/**
 * getFFTPlan
 * ----------
 * Retrieve or create a cached FFT plan for a given size.
 * Internal helper for fft2.
 *
 * @param {number} N - Transform size
 * @returns {object} Plan object with row/col FFT instances and scratch buffers
 */
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

/**
 * fft2
 * ----
 * 2D FFT using fft.js (complex input).
 * Applies unitary/energy normalization: amplitude ÷ N → intensity ÷ N².
 * After the two forward passes, we scale the complex spectrum by 1/N, so
 * sum(|F|²) ≈ sum(|x|²) (2D Parseval under this convention).
 *
 * @param {Float32Array} real - Real part (length = size*size)
 * @param {Float32Array} imag - Imaginary part (length = size*size)
 * @param {number} size - Transform size per dimension (NxN)
 * @returns {{real: Float32Array, imag: Float32Array}}
 */
export function fft2(real, imag, size) {
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

  return deinterleaveComplex(spec);
}

/**
 * fftshift2D
 * ----------
 * Reorders a 2D array so that the zero-frequency (DC) component moves
 * from the top-left corner to the center of the array.
 *
 * @param {Float32Array} input - Flattened 2D array of length size*size (row-major)
 * @param {number} size - Width/height (N) of the square array
 * @returns {Float32Array} A new array with elements shifted so DC is centered
 */
export function fftshift2D(input, size) {
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

// -------------------- Tone Mapping & Colormap Helpers --------------------

/**
 * snapToPow2
 * ----------
 * Snap any positive integer to nearest power of two within [min, max].
 *
 * @param {number} n - Input value
 * @param {number} min - Minimum power of 2 (default 16)
 * @param {number} max - Maximum power of 2 (default 2048)
 * @returns {number} Snapped power-of-2 value
 */
export function snapToPow2(n, min = 16, max = 2048) {
  n = Math.max(min, Math.min(max, n|0));
  const p = 1 << Math.round(Math.log2(n));
  return Math.max(min, Math.min(max, p));
}

/**
 * approxPercentile
 * ----------------
 * Quick approximate percentile (auto-limit) via sampling.
 *
 * @param {Float32Array} arr - Input array
 * @param {number} p - Percentile (0-100, default 99.9)
 * @param {number} stride - Sampling stride (default 8)
 * @returns {number} Approximate percentile value
 */
export function approxPercentile(arr, p = 99.9, stride = 8) {
  const samples = [];
  for (let i = 0; i < arr.length; i += stride) samples.push(arr[i]);
  samples.sort((a, b) => a - b);
  const idx = Math.min(samples.length - 1, Math.floor((p / 100) * (samples.length - 1)));
  return samples[idx];
}

/**
 * getColormapLUT
 * --------------
 * Build a simple colormap LUT (0..255 -> RGB).
 *
 * @param {string} name - Colormap name ('gray', 'hot')
 * @param {number} n - Number of entries (default 256)
 * @returns {Uint8Array} RGB lookup table (length = n*3)
 */
export function getColormapLUT(name = 'gray', n = 256) {
  const lut = new Uint8Array(n * 3);
  if (name === 'gray') {
    for (let i = 0; i < n; i++) {
      lut[3*i] = lut[3*i + 1] = lut[3*i + 2] = i; // 0..255
    }
    return lut;
  }
  if (name === 'hot') {
    // Simple "hot" style: black -> red -> yellow -> white
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

/**
 * applyToneAndColormap
 * --------------------
 * Map intensity -> RGBA via selected scale + colormap, with auto upper limit.
 *
 * @param {Float32Array} intensity - Input intensity array
 * @param {number} N - Grid size (NxN)
 * @param {string} mode - Scaling mode ('linear', 'sqrt', 'log', 'db')
 * @param {string} cmap - Colormap name ('gray', 'hot')
 * @param {number} clipP - Percentile for vmax clipping (default 99.9)
 * @returns {{pixels: Uint8ClampedArray, vmax: number}}
 */
export function applyToneAndColormap(intensity, N, mode = 'linear', cmap = 'gray', clipP = 99.9) {
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

/**
 * buildColorbarTicks
 * ------------------
 * Generate custom tick positions and labels for the colorbar.
 *
 * @param {string} mode - Scaling mode ('linear', 'sqrt', 'log', 'db')
 * @param {number} vmax - Maximum intensity value
 * @param {object} opts - Options object (logFloor)
 * @returns {{fracs: number[], labels: string[]} | null}
 */
export function buildColorbarTicks(mode, vmax, opts = {}) {
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