import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runChecks, deferred, observe, ticks, aborted } from '../acceptance-helpers.mjs';
const { createWorkspaceClient, createHttpTransport } = await import(pathToFileURL(join(process.argv[2], 'src/index.js')));
const unique = randomUUID();
const context = { tenantId: `tenant-${unique}`, userId: `reader-${unique}` };
const id = `document-${unique}`;
const document = (title = 'Current') => ({ id, title, body: { blocks: [{ text: 'Nested content' }] }, labels: ['design'], extension: { list: [1, 2] } });

function transportQueue({ ignoreAbort = false } = {}) {
  const calls = [];
  const transport = { fetchDocument(request, { signal }) {
    const pending = deferred();
    const call = { request: structuredClone(request), signal, aborts: 0, ...pending };
    const onAbort = () => {
      call.aborts++;
      if (!ignoreAbort) { const error = new Error('Upstream cancelled'); error.name = 'AbortError'; pending.reject(error); }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    pending.promise.then(() => signal.removeEventListener('abort', onAbort), () => signal.removeEventListener('abort', onAbort));
    calls.push(call);
    return pending.promise;
  } };
  return { calls, transport };
}

const result = await runChecks({
  async 'document-and-preview-share-one-flight'() {
    const { calls, transport } = transportQueue();
    const client = createWorkspaceClient({ transport });
    const full = client.documents.get(context, id);
    const preview = client.previews.get(context, id);
    await ticks();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].request, { ...context, documentId: id, locale: 'en' });
    calls[0].resolve(document());
    assert.equal((await full).body.blocks[0].text, 'Nested content');
    assert.deepEqual(await preview, { id, title: 'Current', excerpt: 'Nested content', labels: ['design'] });
  },
  async 'scope-identity-and-collision-safe-cache'() {
    const requests = [
      [context, id, 'en'],
      [{ ...context, tenantId: `${context.tenantId}-other` }, id, 'en'],
      [{ ...context, userId: `${context.userId}-other` }, id, 'en'],
      [context, id, 'fr'],
      [{ tenantId: 'a:b', userId: unique }, 'c', 'en'],
      [{ tenantId: 'a', userId: unique }, 'b:c', 'en'],
    ];
    const { calls, transport } = transportQueue();
    const client = createWorkspaceClient({ transport });
    const pending = requests.map(([ctx, docId, locale]) => client.documents.get(ctx, docId, { locale }));
    await ticks();
    assert.equal(calls.length, requests.length);
    calls.forEach((call, index) => call.resolve(document(`scope-${index}-${unique}`)));
    assert.deepEqual((await Promise.all(pending)).map((value) => value.title), requests.map((_, index) => `scope-${index}-${unique}`));
    for (const [index, [ctx, docId, locale]] of requests.entries()) {
      assert.equal((await client.documents.get(ctx, docId, { locale })).title, `scope-${index}-${unique}`);
    }
    assert.equal(calls.length, requests.length);
  },
  async 'each-subscriber-cancels-independently'() {
    for (const cancelled of [0, 1]) {
      const { calls, transport } = transportQueue();
      const client = createWorkspaceClient({ transport });
      const controllers = [new AbortController(), new AbortController()];
      const pending = controllers.map((controller) => observe(client.documents.get(context, id, { signal: controller.signal })));
      await ticks();
      controllers[cancelled].abort();
      await aborted(pending[cancelled]);
      assert.equal(calls[0].signal.aborted, false);
      calls[0].resolve(document());
      assert.equal((await pending[1 - cancelled]).value.title, 'Current');
      assert.equal(calls[0].aborts, 0);
    }
  },
  async 'preaborted-cold-inflight-and-cached-reads'() {
    const { calls, transport } = transportQueue();
    const client = createWorkspaceClient({ transport });
    const controller = new AbortController(); controller.abort();
    await aborted(observe(client.documents.get(context, id, { signal: controller.signal })));
    await ticks(); assert.equal(calls.length, 0);
    const pending = client.documents.get(context, id);
    await ticks();
    await aborted(observe(client.documents.get(context, id, { signal: controller.signal })));
    assert.equal(calls[0].signal.aborted, false);
    calls[0].resolve(document()); await pending;
    await aborted(observe(client.documents.get(context, id, { signal: controller.signal })));
    assert.equal(calls.length, 1);
  },
  async 'all-cancelled-detach-and-old-success-cannot-own-new-flight'() {
    const { calls, transport } = transportQueue({ ignoreAbort: true });
    const client = createWorkspaceClient({ transport });
    const controllers = [new AbortController(), new AbortController()];
    const old = controllers.map((controller) => observe(client.documents.get(context, id, { signal: controller.signal })));
    await ticks();
    controllers[0].abort(); assert.equal(calls[0].signal.aborted, false);
    controllers[1].abort();
    await Promise.all(old.map(aborted));
    assert.equal(calls[0].aborts, 1);
    const fresh = client.documents.get(context, id);
    await ticks(); assert.equal(calls.length, 2);
    calls[0].resolve(document('abandoned')); await ticks();
    const joined = client.previews.get(context, id);
    await ticks(); assert.equal(calls.length, 2);
    calls[1].resolve(document('replacement'));
    assert.equal((await fresh).title, 'replacement');
    assert.equal((await joined).title, 'replacement');
    assert.equal((await client.documents.get(context, id)).title, 'replacement');
  },
  async 'old-failure-cannot-remove-replacement'() {
    const { calls, transport } = transportQueue({ ignoreAbort: true });
    const client = createWorkspaceClient({ transport });
    const controller = new AbortController();
    const old = observe(client.documents.get(context, id, { signal: controller.signal }));
    await ticks(); controller.abort(); await aborted(old);
    const fresh = client.documents.get(context, id); await ticks();
    assert.equal(calls.length, 2);
    calls[0].reject(new Error('late failure')); await ticks();
    const joined = client.documents.get(context, id); await ticks(); assert.equal(calls.length, 2);
    calls[1].resolve(document('fresh'));
    assert.equal((await fresh).title, 'fresh'); assert.equal((await joined).title, 'fresh');
  },
  async 'transport-rejection-and-synchronous-throw-are-retryable'() {
    for (const synchronous of [false, true]) {
      let calls = 0;
      const failure = new Error('service unavailable'); failure.status = 503;
      const client = createWorkspaceClient({ transport: { fetchDocument() {
        calls++;
        if (calls === 1) { if (synchronous) throw failure; return Promise.reject(failure); }
        return Promise.resolve(document('recovered'));
      } } });
      const first = observe(client.documents.get(context, id));
      const second = observe(client.previews.get(context, id));
      assert.equal((await first).error, failure); assert.equal((await second).error, failure);
      assert.equal((await client.documents.get(context, id)).title, 'recovered');
      assert.equal(calls, 2);
    }
  },
  async 'deep-copy-per-subscriber-and-cache-read'() {
    const { calls, transport } = transportQueue();
    const client = createWorkspaceClient({ transport });
    const first = client.documents.get(context, id); const second = client.documents.get(context, id);
    await ticks(); const upstream = document(); calls[0].resolve(upstream);
    const [a, b] = await Promise.all([first, second]);
    a.body.blocks[0].text = 'changed'; a.extension.list.push(3); a.labels.push('bad');
    assert.deepEqual(b, document());
    upstream.title = 'transport mutation';
    const cached = await client.documents.get(context, id);
    assert.deepEqual(cached, document());
    cached.body.blocks.push({ text: 'bad' });
    assert.deepEqual(await client.documents.get(context, id), document());
    assert.equal((await client.previews.get(context, id)).excerpt, 'Nested content');
    assert.equal(calls.length, 1);
  },
  async 'ttl-starts-at-completion-and-expires-at-exact-boundary'() {
    let time = 5;
    const { calls, transport } = transportQueue();
    const client = createWorkspaceClient({ transport, now: () => time, ttlMs: 100 });
    const pending = client.documents.get(context, id); await ticks();
    time = 70; calls[0].resolve(document()); await pending;
    time = 169; assert.equal((await client.documents.get(context, id)).title, 'Current'); assert.equal(calls.length, 1);
    time = 170; const expired = client.documents.get(context, id); await ticks(); assert.equal(calls.length, 2);
    calls[1].resolve(document('renewed')); assert.equal((await expired).title, 'renewed');
  },
  async 'subscriber-listeners-are-removed-on-success-error-and-abort'() {
    for (const outcome of ['success', 'error', 'abort']) {
      const { calls, transport } = transportQueue();
      const client = createWorkspaceClient({ transport });
      const controller = new AbortController(); const signal = controller.signal;
      const active = new Set();
      const add = signal.addEventListener.bind(signal); const remove = signal.removeEventListener.bind(signal);
      signal.addEventListener = (type, listener, options) => { if (type === 'abort') active.add(listener); return add(type, listener, options); };
      signal.removeEventListener = (type, listener, options) => { if (type === 'abort') active.delete(listener); return remove(type, listener, options); };
      const pending = observe(client.documents.get(context, id, { signal })); await ticks();
      if (outcome === 'success') calls[0].resolve(document());
      else if (outcome === 'error') calls[0].reject(new Error('failed'));
      else controller.abort();
      await pending; await ticks(); assert.equal(active.size, 0);
    }
  },
  async 'search-and-http-contract-remain-intact'() {
    let count = 0;
    const client = createWorkspaceClient({ transport: { async searchDocuments(request) { count++; return [{ id: request.query, owner: request.userId }]; } } });
    const first = await client.search.find(context, '  needle  '); first[0].owner = 'changed';
    assert.equal((await client.search.find(context, 'needle'))[0].owner, context.userId); assert.equal(count, 1);
    const sent = [];
    const http = createHttpTransport(async (url, options) => { sent.push({ url, options }); return { ok: true, json: async () => document() }; }, 'https://example.invalid');
    const signal = new AbortController().signal;
    await http.fetchDocument({ ...context, documentId: 'one/two', locale: 'zh-CN' }, { signal });
    assert.equal(sent[0].url.pathname, '/documents/one%2Ftwo');
    assert.equal(sent[0].url.searchParams.get('locale'), 'zh-CN');
    assert.equal(sent[0].options.signal, signal);
    assert.deepEqual(sent[0].options.headers, { 'x-tenant-id': context.tenantId, 'x-user-id': context.userId });
  },
});
console.log(JSON.stringify(result));
