# Document workspace client

This dependency-free ESM package powers full document tabs, preview cards, and search in a multi-account workspace. Run `npm test` on Node 22+.

```js
import { createWorkspaceClient } from './src/index.js';
const client = createWorkspaceClient({ transport, now: () => Date.now(), ttlMs: 1000 });
const context = { tenantId: 'acme', userId: 'user-7' };
const doc = await client.documents.get(context, 'doc-1', { locale: 'en', signal });
const card = await client.previews.get(context, 'doc-1', { locale: 'en' });
```

`transport.fetchDocument(request, { signal })` resolves a JSON-compatible document. The request has tenantId, userId, documentId and locale. A document has `{ id, title, body: { blocks: [{ text }] }, labels: [] }`; extra JSON fields must survive. The locale defaults to `en`. Context and IDs are nonempty strings. Preview cards expose `{ id, title, excerpt, labels }`, with excerpt from the first body block (up to 80 characters). The transport may throw synchronously, reject asynchronously, or ignore an abort signal.

`transport.searchDocuments({ tenantId, userId, query })` supports `client.search.find(context, query)`. Search owns a separate cache. `createHttpTransport(fetch, baseUrl)` is available for real deployments; tests can inject an in-memory transport. No network is necessary.
