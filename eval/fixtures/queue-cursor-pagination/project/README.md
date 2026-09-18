# Moderation queue

A dependency-free ESM domain package used by moderation tables and activity dashboards. Node 22+, `npm test`.

```js
import { createModerationQueue } from './src/index.js';
const queue = createModerationQueue(tickets);
const first = await queue.list({ tenantId: 'acme' }, { statuses: ['open'], limit: 20 });
const second = await queue.list({ tenantId: 'acme' }, { after: first.nextCursor, limit: 20 });
```

Input tickets have `{ id, tenantId, createdAt, priority, status, title }` plus optional JSON fields. createdAt uses UTC ISO with six fractional digits, IDs are unique ASCII strings, priority is an integer 0..9, and status is open, closed or snoozed. Constructor input is a trusted snapshot; query and cursor input is untrusted. list returns `{ items, nextCursor, previousCursor }`. Rows are copied when crossing the repository boundary. `queue.remove(id)` removes a ticket, including a cursor's anchor.

`queue.activity(context, { offset?, limit? })` is the older chronological feed. Its offset protocol remains intentionally distinct. `queue.summary(context)` returns status counts for a tenant. These consumers share the repository but not the queue's cursor semantics. The cursor codec currently uses base64url JSON for local portability; clients must treat tokens as opaque.
