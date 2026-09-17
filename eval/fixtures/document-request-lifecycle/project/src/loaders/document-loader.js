import { requestKey } from '../requests/identity.js';
import { createSharedRequest } from '../requests/shared-request.js';
import { createDocumentCache } from '../cache/document-cache.js';

export function createDocumentLoader({ transport, now, ttlMs }) {
  const cache = createDocumentCache({ now, ttlMs });
  const pending = new Map();
  return function load(request, signal) {
    const key = requestKey(request);
    const cached = cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    let flight = pending.get(key);
    if (!flight) {
      flight = createSharedRequest((upstreamSignal) => transport.fetchDocument(request, { signal: upstreamSignal }));
      pending.set(key, flight);
      flight.promise.then((value) => {
        cache.put(key, value);
        pending.delete(key);
      }, () => {});
    }
    return flight.subscribe(signal);
  };
}
