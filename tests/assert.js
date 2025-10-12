/**
 * assert.js
 * =========
 * Lightweight assertion library for browser-based testing.
 * No dependencies, no build tools required.
 */

export class TestRunner {
  constructor() {
    this.tests = [];
    this.results = { passed: 0, failed: 0, total: 0 };
  }

  /**
   * Register a test
   * @param {string} name - Test name
   * @param {Function} fn - Test function (sync or async)
   */
  test(name, fn) {
    this.tests.push({ name, fn });
  }

  /**
   * Run all registered tests
   * @returns {Promise<object>} Test results summary
   */
  async run() {
    this.results = { passed: 0, failed: 0, total: this.tests.length };
    const startTime = performance.now();

    for (const { name, fn } of this.tests) {
      try {
        await fn();
        this.results.passed++;
        this.log('✓', name, 'pass');
      } catch (err) {
        this.results.failed++;
        this.log('✗', name, 'fail', err.message);
      }
    }

    const elapsed = (performance.now() - startTime).toFixed(2);
    this.logSummary(elapsed);
    return this.results;
  }

  log(icon, name, status, message = '') {
    const output = document.getElementById('test-output');
    if (output) {
      const div = document.createElement('div');
      div.className = `test-${status}`;
      div.textContent = `${icon} ${name}`;
      if (message) {
        const msg = document.createElement('div');
        msg.className = 'test-error';
        msg.textContent = `   ${message}`;
        div.appendChild(msg);
      }
      output.appendChild(div);
    }
    console.log(`${icon} ${name}`, message);
  }

  logSummary(elapsed) {
    const { passed, failed, total } = this.results;
    const summary = `\n${passed}/${total} tests passed (${failed} failed) in ${elapsed}ms`;
    const output = document.getElementById('test-output');
    if (output) {
      const div = document.createElement('div');
      div.className = failed > 0 ? 'test-summary-fail' : 'test-summary-pass';
      div.textContent = summary;
      output.appendChild(div);
    }
    console.log(summary);
  }
}

// -------------------- Assertion Functions --------------------

/**
 * assert
 * ------
 * Basic truthiness assertion.
 */
export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * assertEqual
 * -----------
 * Strict equality assertion.
 */
export function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${expected}, got ${actual}`
    );
  }
}

/**
 * assertClose
 * -----------
 * Floating-point equality with tolerance.
 */
export function assertClose(actual, expected, tolerance = 1e-6, message) {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(
      message || `Expected ${expected} ± ${tolerance}, got ${actual} (diff: ${diff})`
    );
  }
}

/**
 * assertArrayClose
 * ----------------
 * Element-wise floating-point equality for arrays.
 */
export function assertArrayClose(actual, expected, tolerance = 1e-6, message) {
  if (actual.length !== expected.length) {
    throw new Error(
      message || `Array length mismatch: expected ${expected.length}, got ${actual.length}`
    );
  }
  for (let i = 0; i < actual.length; i++) {
    const diff = Math.abs(actual[i] - expected[i]);
    if (diff > tolerance) {
      throw new Error(
        message || `Array element ${i}: expected ${expected[i]} ± ${tolerance}, got ${actual[i]} (diff: ${diff})`
      );
    }
  }
}

/**
 * assertNonNegative
 * -----------------
 * Assert all array elements are non-negative.
 */
export function assertNonNegative(arr, message) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < 0) {
      throw new Error(
        message || `Array element ${i} is negative: ${arr[i]}`
      );
    }
  }
}

/**
 * assertNoNaN
 * -----------
 * Assert no NaN values in array.
 */
export function assertNoNaN(arr, message) {
  for (let i = 0; i < arr.length; i++) {
    if (isNaN(arr[i])) {
      throw new Error(
        message || `Array element ${i} is NaN`
      );
    }
  }
}

/**
 * assertNoInf
 * -----------
 * Assert no Infinity values in array.
 */
export function assertNoInf(arr, message) {
  for (let i = 0; i < arr.length; i++) {
    if (!isFinite(arr[i])) {
      throw new Error(
        message || `Array element ${i} is not finite: ${arr[i]}`
      );
    }
  }
}

/**
 * assertThrows
 * ------------
 * Assert that a function throws an error.
 */
export function assertThrows(fn, expectedMessage, message) {
  try {
    fn();
    throw new Error(message || 'Expected function to throw, but it did not');
  } catch (err) {
    if (expectedMessage && !err.message.includes(expectedMessage)) {
      throw new Error(
        message || `Expected error message to include "${expectedMessage}", got "${err.message}"`
      );
    }
  }
}

/**
 * Utility: sum of array
 */
export function sum(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) total += arr[i];
  return total;
}

/**
 * Utility: sum of squares
 */
export function sumSquares(arr) {
  let total = 0;
  for (let i = 0; i < arr.length; i++) total += arr[i] * arr[i];
  return total;
}