import { orderingKey } from '../models/ticket.js';
import { encodeCursor } from '../cursors/codec.js';
export function buildPage(all, matching, query, scope) {
  const items = matching.slice(0, query.limit);
  if (items.length === 0) return { items, nextCursor: null, previousCursor: null };
  return {
    items,
    nextCursor: items.length === query.limit ? encodeCursor(scope, orderingKey(items.at(-1))) : null,
    previousCursor: query.cursor ? encodeCursor(scope, orderingKey(items[0])) : null,
  };
}
