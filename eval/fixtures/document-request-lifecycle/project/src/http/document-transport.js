export function createHttpTransport(fetch, baseUrl) {
  async function read(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) { const error = new Error(`HTTP ${response.status}`); error.status = response.status; throw error; }
    return response.json();
  }
  return {
    fetchDocument(request, { signal }) {
      const url = new URL(`/documents/${encodeURIComponent(request.documentId)}`, baseUrl);
      url.searchParams.set('locale', request.locale);
      return read(url, { signal, headers: { 'x-tenant-id': request.tenantId, 'x-user-id': request.userId } });
    },
    searchDocuments(request) {
      const url = new URL('/documents', baseUrl);
      url.searchParams.set('q', request.query);
      return read(url, { headers: { 'x-tenant-id': request.tenantId, 'x-user-id': request.userId } });
    },
  };
}
