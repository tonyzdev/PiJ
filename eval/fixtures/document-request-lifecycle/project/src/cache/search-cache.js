export function createSearchCache() {
  const values = new Map();
  return {
    read(key) { const value = values.get(key); return value === undefined ? undefined : structuredClone(value); },
    write(key, value) { values.set(key, structuredClone(value)); },
  };
}
