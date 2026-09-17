import assert from 'node:assert/strict';
import timers from 'node:timers';

// Capture real, referenced timers before importing any candidate module.
const { setTimeout: realSetTimeout, clearTimeout: realClearTimeout } = timers;

export async function runChecks(cases) {
  const checks = {};
  const failures = [];
  for (const [name, check] of Object.entries(cases)) {
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(check),
        new Promise((_, reject) => { timer = realSetTimeout(() => reject(new Error('behavior did not settle within 180ms')), 180); }),
      ]);
      checks[name] = true;
    } catch (error) {
      checks[name] = false;
      failures.push(`${name}: ${String(error?.message ?? error).slice(0, 700)}`);
    } finally { realClearTimeout(timer); }
  }
  return { passed: Object.values(checks).every(Boolean), checks, ...(failures.length ? { details: failures.join('\n') } : {}) };
}

export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export const observe = (promise) => promise.then((value) => ({ value }), (error) => ({ error }));
export async function ticks() { for (let n = 0; n < 12; n++) await Promise.resolve(); }
export async function aborted(outcome) { assert.equal((await outcome).error?.name, 'AbortError'); }
