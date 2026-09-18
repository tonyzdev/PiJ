import assert from 'node:assert/strict';
import test from 'node:test';
import { createModerationQueue } from '../src/index.js';
const context = { tenantId: 'demo' };
const tickets = [
  { id: 'recent', tenantId: 'demo', createdAt: '2026-06-02T12:00:00.000000Z', priority: 1, status: 'open', title: 'Recent' },
  { id: 'older', tenantId: 'demo', createdAt: '2026-06-01T12:00:00.000000Z', priority: 1, status: 'open', title: 'Older' },
  { id: 'archived', tenantId: 'demo', createdAt: '2026-05-01T12:00:00.000000Z', priority: 1, status: 'closed', title: 'Closed' },
];

test('lists default open queue and advances a simple cursor', async () => {
  const queue = createModerationQueue(tickets);
  const first = await queue.list(context, { limit: 1 });
  assert.deepEqual(first.items.map((row) => row.id), ['recent']);
  assert.equal(first.previousCursor, null);
  const second = await queue.list(context, { after: first.nextCursor, limit: 2 });
  assert.deepEqual(second.items.map((row) => row.id), ['older']);
  assert.equal(second.nextCursor, null);
});

test('summary, activity and query validation remain available', async () => {
  const queue = createModerationQueue(tickets);
  assert.deepEqual(await queue.summary(context), { open: 2, closed: 1, snoozed: 0 });
  assert.deepEqual((await queue.activity(context, { limit: 1 })).items.map((row) => row.id), ['recent']);
  await assert.rejects(queue.list(context, { limit: 0 }), { code: 'INVALID_QUERY' });
});
