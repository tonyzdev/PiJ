import { abortError } from '../errors.js';

export function createSharedRequest(start, onEmpty) {
  const controller = new AbortController();
  const subscribers = new Set();
  let settled = false;
  let abandoned = false;
  const promise = Promise.resolve().then(() => start(controller.signal));
  // Keep one upstream observer; each subscriber has a separate cancellation lifetime.
  promise.then((value) => settle(undefined, value), (error) => settle(error));

  function settle(error, value) {
    settled = true;
    for (const subscriber of [...subscribers]) {
      subscriber.cleanup();
      if (error !== undefined) subscriber.reject(error);
      else subscriber.resolve(structuredClone(value));
    }
  }

  return {
    promise,
    get active() { return !abandoned; },
    subscribe(signal) {
      if (signal?.aborted) return Promise.reject(abortError());
      return new Promise((resolve, reject) => {
        const subscriber = { resolve, reject, cleanup() {
          subscribers.delete(subscriber);
          signal?.removeEventListener('abort', cancel);
        } };
        function cancel() {
          subscriber.cleanup();
          reject(abortError());
          if (!settled && subscribers.size === 0) {
            abandoned = true;
            onEmpty();
            controller.abort();
          }
        }
        subscribers.add(subscriber);
        signal?.addEventListener('abort', cancel, { once: true });
      });
    },
  };
}
