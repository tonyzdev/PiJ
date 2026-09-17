import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorkspaceClient, createHttpTransport } from '../src/index.js';
const context = { tenantId: 'demo', userId: 'viewer' };
const doc = { id: 'guide', title: 'Guide', body: { blocks: [{ text: 'Getting started' }] }, labels: ['docs'] };

test('document tabs and preview cards render a document', async () => {
  let calls = 0;
  const client = createWorkspaceClient({ transport: { async fetchDocument() { calls++; return doc; } } });
  assert.equal((await client.documents.get(context, 'guide')).title, 'Guide');
  assert.deepEqual(await client.previews.get(context, 'guide'), { id: 'guide', title: 'Guide', excerpt: 'Getting started', labels: ['docs'] });
  assert.equal(calls, 1);
});

test('search trims the query and copies cached results', async () => {
  const client = createWorkspaceClient({ transport: { async searchDocuments(request) { return [{ id: request.query }]; } } });
  const first = await client.search.find(context, ' guide ');
  first[0].id = 'changed';
  assert.deepEqual(await client.search.find(context, 'guide'), [{ id: 'guide' }]);
});

test('HTTP document transport preserves errors', async () => {
  const transport = createHttpTransport(async () => ({ ok: false, status: 403 }), 'https://example.invalid');
  await assert.rejects(transport.fetchDocument({ ...context, documentId: 'guide', locale: 'en' }, {}), { status: 403 });
});
