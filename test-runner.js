/**
 * Zero-dependency test runner for tests.html.
 * No Node/npm involved — open tests.html directly in a browser to run.
 */
const TestRunner = (() => {
  const results = [];
  let currentSuite = "";

  function describe(name, fn) {
    currentSuite = name;
    fn();
  }

  function it(name, fn) {
    try {
      fn();
      results.push({ suite: currentSuite, name, pass: true });
    } catch (err) {
      results.push({ suite: currentSuite, name, pass: false, error: err.message });
    }
  }

  async function itAsync(name, fn) {
    try {
      await fn();
      results.push({ suite: currentSuite, name, pass: true });
    } catch (err) {
      results.push({ suite: currentSuite, name, pass: false, error: err.message });
    }
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message || "Assertion failed");
  }

  function assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(message || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assertClose(actual, expected, epsilon, message) {
    epsilon = epsilon === undefined ? 1 : epsilon;
    if (Math.abs(actual - expected) > epsilon) {
      throw new Error(message || `Expected ~${expected} (+/-${epsilon}), got ${actual}`);
    }
  }

  function assertNoThrow(fn, message) {
    try {
      fn();
    } catch (err) {
      throw new Error(message || `Expected no throw, but got: ${err.message}`);
    }
  }

  function render(containerId) {
    const container = document.getElementById(containerId);
    const passCount = results.filter(r => r.pass).length;
    const failCount = results.length - passCount;

    let html = `<div class="summary ${failCount === 0 ? "all-pass" : "has-fail"}">
      ${passCount} passed, ${failCount} failed, ${results.length} total
    </div>`;

    let lastSuite = null;
    results.forEach(r => {
      if (r.suite !== lastSuite) {
        html += `<h2>${r.suite}</h2>`;
        lastSuite = r.suite;
      }
      html += `<div class="test-result ${r.pass ? "pass" : "fail"}">
        <span class="icon">${r.pass ? "✓" : "✗"}</span> ${r.name}
        ${r.pass ? "" : `<div class="error">${r.error}</div>`}
      </div>`;
    });

    container.innerHTML = html;

    console.log(`${passCount}/${results.length} tests passed`);
    if (failCount > 0) {
      console.error(`${failCount} test(s) failed:`, results.filter(r => !r.pass));
    }
  }

  return { describe, it, itAsync, assert, assertEqual, assertClose, assertNoThrow, results, render };
})();
