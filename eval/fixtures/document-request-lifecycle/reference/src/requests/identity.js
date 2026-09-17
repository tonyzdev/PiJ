export function requestKey(request) {
  return JSON.stringify([request.tenantId, request.userId, request.documentId, request.locale]);
}
