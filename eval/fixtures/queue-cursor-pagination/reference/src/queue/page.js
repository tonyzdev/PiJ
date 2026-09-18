import { orderingKey } from '../models/ticket.js';
import { encodeCursor } from '../cursors/codec.js';
import { compareTickets } from './order.js';
export function buildPage(all, matching, query, scope) {
  const items = query.direction === 'before' ? matching.slice(-query.limit) : matching.slice(0, query.limit);
  if (items.length === 0) return { items, nextCursor: null, previousCursor: null };
  const first = items[0]; const last = items.at(-1);
  return {
    items,
    nextCursor: all.some((ticket) => compareTickets(ticket, last) > 0) ? encodeCursor(scope, orderingKey(last)) : null,
    previousCursor: all.some((ticket) => compareTickets(ticket, first) < 0) ? encodeCursor(scope, orderingKey(first)) : null,
  };
}
