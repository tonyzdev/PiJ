export function requestKey(request) {
  return `${request.tenantId}:${request.documentId}`;
}
