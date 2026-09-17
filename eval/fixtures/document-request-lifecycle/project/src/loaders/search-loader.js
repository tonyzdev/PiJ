import { createSearchCache } from '../cache/search-cache.js';
export function createSearchLoader(transport) {
  const cache = createSearchCache();
  return async function find(request) {
    const key = JSON.stringify([request.tenantId, request.userId, request.query]);
    const hit = cache.read(key);
    if (hit !== undefined) return hit;
    const result = await transport.searchDocuments(request);
    cache.write(key, result);
    return structuredClone(result);
  };
}
