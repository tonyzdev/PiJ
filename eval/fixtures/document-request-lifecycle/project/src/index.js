import { createDocumentLoader } from './loaders/document-loader.js';
import { createDocumentService } from './documents/service.js';
import { createPreviewService } from './previews/service.js';
import { createSearchLoader } from './loaders/search-loader.js';
import { createSearchService } from './search/service.js';
export { createHttpTransport } from './http/document-transport.js';

export function createWorkspaceClient({ transport, now = Date.now, ttlMs = 1000 }) {
  const load = createDocumentLoader({ transport, now, ttlMs });
  return {
    documents: createDocumentService(load),
    previews: createPreviewService(load),
    search: createSearchService(createSearchLoader(transport)),
  };
}
