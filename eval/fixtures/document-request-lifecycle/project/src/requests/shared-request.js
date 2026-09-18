import { abortError } from '../errors.js';

export function createSharedRequest(start) {
  const controller = new AbortController();
  const promise = Promise.resolve().then(() => start(controller.signal));
  return {
    promise,
    subscribe(signal) {
      if (signal?.aborted) { controller.abort(); return Promise.reject(abortError()); }
      if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });
      return promise;
    },
  };
}
