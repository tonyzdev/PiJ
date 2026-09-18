export function cursorScope(query) {
  return JSON.stringify([query.tenantId, query.statuses]);
}
