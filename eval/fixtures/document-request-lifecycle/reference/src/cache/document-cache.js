export function createDocumentCache({ now, ttlMs }) {
  const entries = new Map();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expiresAt) { entries.delete(key); return undefined; }
      return structuredClone(entry.value);
    },
    put(key, value) { entries.set(key, { value: structuredClone(value), expiresAt: now() + ttlMs }); },
  };
}
