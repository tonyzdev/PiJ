import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runChecks } from '../acceptance-helpers.mjs';
const { createModerationQueue } = await import(pathToFileURL(join(process.argv[2], 'src/index.js')));
const nonce = randomUUID();
const context = { tenantId: `tenant-${nonce}` };
const identify = (id) => `${id}-${nonce}`;
const ids = (page) => page.items.map((row) => row.id);
function row(id, createdAt, priority, status = 'open', tenantId = context.tenantId) {
  return { id: identify(id), tenantId, createdAt, priority, status, title: `Ticket ${id}`, metadata: { labels: ['review'] } };
}
const rows = [
  row('c', '2026-07-21T09:00:00.000090Z', 3),
  row('b', '2026-07-21T09:00:00.000090Z', 9),
  row('e', '2026-07-21T08:59:59.999999Z', 0),
  row('a', '2026-07-21T09:00:00.000090Z', 9),
  row('d', '2026-07-21T09:00:00.000089Z', 9),
  row('z', '2026-07-21T09:00:00.000099Z', 1),
  row('closed', '2026-07-20T09:00:00.000000Z', 4, 'closed'),
  row('sleeping', '2026-07-21T09:00:00.000100Z', 4, 'snoozed'),
  row('foreign', '2026-07-22T09:00:00.000000Z', 9, 'open', 'another-tenant'),
];
const expected = ['z', 'a', 'b', 'c', 'd', 'e'].map(identify);
const simpleRows = Array.from({ length: 7 }, (_, index) => row(`simple-${index}`, `2026-07-${String(27 - index).padStart(2, '0')}T09:00:00.000000Z`, 1));
const token = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

const result = await runChecks({
  async 'compound-order-retains-microseconds-priority-and-ascii-id'() {
    const queue = createModerationQueue(rows);
    assert.deepEqual(ids(await queue.list(context, { limit: 50 })), expected);
    const tied = [row('lower', '2026-07-01T00:00:00.000001Z', 1), row('Zed', '2026-07-01T00:00:00.000001Z', 5), row('alpha', '2026-07-01T00:00:00.000001Z', 5)];
    assert.deepEqual(ids(await createModerationQueue(tied).list(context)), ['Zed', 'alpha', 'lower'].map(identify));
  },
  async 'forward-pages-cover-ties-without-gaps-or-duplicates'() {
    const queue = createModerationQueue(rows);
    const seen = []; let after;
    for (let pageNumber = 0; pageNumber < 4; pageNumber++) {
      const page = await queue.list(context, { limit: 2, after });
      seen.push(...ids(page));
      if (page.nextCursor === null) break;
      after = page.nextCursor;
    }
    assert.deepEqual(seen, expected);
    assert.equal(new Set(seen).size, seen.length);
  },
  async 'backward-chooses-nearest-rows-in-canonical-order'() {
    const queue = createModerationQueue(simpleRows);
    const first = await queue.list(context, { limit: 2 });
    const second = await queue.list(context, { limit: 2, after: first.nextCursor });
    const third = await queue.list(context, { limit: 2, after: second.nextCursor });
    const back = await queue.list(context, { limit: 2, before: third.previousCursor });
    assert.deepEqual(ids(back), ['simple-2', 'simple-3'].map(identify));
    const firstAgain = await queue.list(context, { limit: 2, before: back.previousCursor });
    assert.deepEqual(ids(firstAgain), ['simple-0', 'simple-1'].map(identify));
    assert.equal(firstAgain.previousCursor, null);
  },
  async 'cursors-exist-only-when-matching-rows-exist'() {
    const queue = createModerationQueue(simpleRows.slice(0, 6));
    const first = await queue.list(context, { limit: 2 });
    const second = await queue.list(context, { limit: 2, after: first.nextCursor });
    const third = await queue.list(context, { limit: 2, after: second.nextCursor });
    assert.equal(first.previousCursor, null); assert.equal(typeof first.nextCursor, 'string');
    assert.equal(typeof second.previousCursor, 'string'); assert.equal(typeof second.nextCursor, 'string');
    assert.equal(third.nextCursor, null); assert.equal(typeof third.previousCursor, 'string');
    const start = await queue.list(context, { limit: 10, before: second.previousCursor });
    assert.deepEqual(ids(start), ['simple-0', 'simple-1'].map(identify)); assert.equal(start.previousCursor, null);
    assert.equal(typeof start.nextCursor, 'string');
  },
  async 'cursor-scope-binds-tenant-and-entire-status-set'() {
    const queue = createModerationQueue(rows);
    const page = await queue.list(context, { limit: 1 });
    await assert.rejects(queue.list({ tenantId: 'another-tenant' }, { after: page.nextCursor }), { code: 'INVALID_CURSOR' });
    await assert.rejects(queue.list(context, { statuses: ['closed'], after: page.nextCursor }), { code: 'INVALID_CURSOR' });
    await assert.rejects(queue.list(context, { statuses: ['open', 'closed'], before: page.nextCursor }), { code: 'INVALID_CURSOR' });
  },
  async 'equivalent-filters-changing-limit-and-direction-reuse-cursors'() {
    const queue = createModerationQueue(rows);
    const first = await queue.list(context, { statuses: ['closed', 'open', 'closed'], limit: 1 });
    const second = await queue.list(context, { statuses: ['open', 'closed'], limit: 3, after: first.nextCursor });
    assert.deepEqual(ids(second), ['a', 'b', 'c'].map(identify));
    const beforeLast = await queue.list(context, { statuses: ['closed', 'open'], limit: 2, before: second.nextCursor });
    assert.deepEqual(ids(beforeLast), ['a', 'b'].map(identify));
    const afterFirst = await queue.list(context, { statuses: ['open', 'closed'], limit: 2, after: second.previousCursor });
    assert.deepEqual(ids(afterFirst), ['b', 'c'].map(identify));
  },
  async 'deleting-a-cursor-anchor-does-not-shift-continuation'() {
    const queue = createModerationQueue(rows);
    const first = await queue.list(context, { limit: 2 });
    assert.deepEqual(ids(first), ['z', 'a'].map(identify));
    queue.remove(identify('a'));
    const second = await queue.list(context, { limit: 2, after: first.nextCursor });
    assert.deepEqual(ids(second), ['b', 'c'].map(identify));
    queue.remove(identify('b'));
    const back = await queue.list(context, { limit: 2, before: second.previousCursor });
    assert.deepEqual(ids(back), ['z'].map(identify));
    assert.equal(back.previousCursor, null);
  },
  async 'malformed-unsupported-and-incorrectly-typed-cursors-reject'() {
    const queue = createModerationQueue(simpleRows);
    const first = await queue.list(context, { limit: 1 });
    const valid = JSON.parse(Buffer.from(first.nextCursor, 'base64url').toString('utf8'));
    const withoutId = structuredClone(valid); delete withoutId.key.id;
    const invalid = [
      '', '%%%not-a-token', 'e30', 123, {},
      token({ ...valid, version: 999 }),
      token({ ...valid, key: null }),
      token({ ...valid, key: { ...valid.key, priority: '9' } }),
      token({ ...valid, key: { ...valid.key, priority: 20 } }),
      token({ ...valid, key: { ...valid.key, createdAt: 'not-a-date' } }),
      token({ ...valid, key: { ...valid.key, createdAt: '2026-07-01T00:00:00.000Z' } }),
      token({ ...valid, key: { ...valid.key, id: [] } }),
      token(withoutId),
    ];
    for (const after of invalid) await assert.rejects(queue.list(context, { after }), { code: 'INVALID_CURSOR' });
  },
  async 'invalid-query-values-and-two-directions-reject'() {
    const queue = createModerationQueue(rows);
    for (const options of [
      { limit: 0 }, { limit: 51 }, { limit: 1.5 }, { limit: '2' },
      { statuses: [] }, { statuses: 'open' }, { statuses: ['deleted'] },
      { after: 'a', before: 'b' },
    ]) await assert.rejects(queue.list(context, options), { code: 'INVALID_QUERY' });
    await assert.rejects(queue.list({ tenantId: '' }), { code: 'INVALID_QUERY' });
  },
  async 'empty-pages-and-filters-have-no-navigation-cursors'() {
    const queue = createModerationQueue(rows.filter((ticket) => ticket.status === 'open'));
    assert.deepEqual(await queue.list(context, { statuses: ['closed'] }), { items: [], nextCursor: null, previousCursor: null });
    assert.deepEqual(await queue.list({ tenantId: 'missing' }), { items: [], nextCursor: null, previousCursor: null });
  },
  async 'seeded-corpus-walks-both-directions-with-varying-page-sizes'() {
    const ordered = [];
    // Construct the expected order independently: chronological groups, priority groups, ASCII IDs.
    for (const fraction of ['000203', '000202', '000201', '000200']) {
      for (const priority of [9, 5, 0]) {
        for (const suffix of ['A', 'Z', 'a']) ordered.push(row(`${fraction}-${priority}-${suffix}`, `2026-08-03T12:00:00.${fraction}Z`, priority));
      }
    }
    const shuffled = [...ordered.filter((_, i) => i % 2), ...ordered.filter((_, i) => i % 2 === 0)].reverse();
    const queue = createModerationQueue(shuffled);
    const seen = []; let after; let previous; let lastPageStart;
    for (let n = 0; n < 40; n++) {
      const page = await queue.list(context, { after, limit: [4, 7, 3][n % 3] });
      seen.push(...ids(page));
      if (page.nextCursor === null) { previous = page.previousCursor; lastPageStart = page.items[0]?.id; break; }
      after = page.nextCursor;
    }
    assert.deepEqual(seen, ordered.map((ticket) => ticket.id));
    let position = ordered.findIndex((ticket) => ticket.id === seen.at(-1));
    // Reverse independently from the last page's first boundary, checking the nearest predecessors.
    if (previous) {
      position = ordered.findIndex((ticket) => ticket.id === lastPageStart);
      while (previous) {
        const page = await queue.list(context, { before: previous, limit: 5 });
        const start = Math.max(0, position - 5);
        assert.deepEqual(ids(page), ordered.slice(start, position).map((ticket) => ticket.id));
        position = start; previous = page.previousCursor;
        assert.equal(previous === null, position === 0);
      }
    }
    assert.equal(position, 0);
  },
  async 'tenant-copy-summary-and-activity-behavior-stay-intact'() {
    const queue = createModerationQueue(rows);
    const page = await queue.list(context, { statuses: ['open', 'closed', 'snoozed'], limit: 50 });
    assert.equal(page.items.length, 8); assert(page.items.every((ticket) => ticket.tenantId === context.tenantId));
    page.items[0].metadata.labels.push('changed');
    const another = await queue.list(context, { statuses: ['open', 'closed', 'snoozed'], limit: 50 });
    assert(another.items.every((ticket) => ticket.metadata.labels.length === 1));
    assert.deepEqual(await queue.summary(context), { open: 6, closed: 1, snoozed: 1 });
    const activity = await queue.activity(context, { offset: 0, limit: 1 });
    assert.deepEqual(ids(activity), [identify('sleeping')]); assert.equal(activity.nextOffset, 1);
  },
});
console.log(JSON.stringify(result));
