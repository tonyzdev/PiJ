import { requestKey } from '../requests/identity.js';
import { createSharedRequest } from '../requests/shared-request.js';
import { createDocumentCache } from '../cache/document-cache.js';
import { abortError } from '../errors.js';

export function createDocumentLoader({ transport, now, ttlMs }) {
  const cache = createDocumentCache({ now, ttlMs });
  const pending = new Map();
  return function load(request, signal) {
    if (signal?.aborted) return Promise.reject(abortError());
    const key = requestKey(request);
    const cached = cache.get(key);
    if (cached !== undefined) return Promise.resolve(cached);
    let flight = pending.get(key);
    if (!flight) {
      const removeOwnedFlight = () => { if (pending.get(key) === flight) pending.delete(key); };
      flight = createSharedRequest((upstreamSignal) => transport.fetchDocument(request, { signal: upstreamSignal }), removeOwnedFlight);
      pending.set(key, flight);
      flight.promise.then((value) => {
        if (pending.get(key) === flight && flight.active) {
          cache.put(key, value);
          pending.delete(key);
        }
      }, removeOwnedFlight);
    }
    return flight.subscribe(signal);
  };
}
