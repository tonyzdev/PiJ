import { normalizeQuery } from './query.js';
import { compareTickets } from './order.js';
import { beyondBoundary } from './boundary.js';
import { buildPage } from './page.js';
import { cursorScope } from '../cursors/scope.js';
import { decodeCursor } from '../cursors/codec.js';
export function createQueueService(repository) {
  return async function list(context, options) {
    const query = normalizeQuery(context, options);
    const scope = cursorScope(query);
    const boundary = query.cursor === null ? null : decodeCursor(query.cursor, scope);
    const all = (await repository.forTenant(query.tenantId)).filter((ticket) => query.statuses.includes(ticket.status)).sort(compareTickets);
    const matching = boundary ? all.filter((ticket) => beyondBoundary(ticket, boundary, query.direction)) : all;
    return buildPage(all, matching, query, scope);
  };
}
