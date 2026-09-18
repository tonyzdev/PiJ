import { compareTickets } from './order.js';
export function beyondBoundary(ticket, key, direction) {
  const comparison = compareTickets(ticket, key);
  return direction === 'before' ? comparison < 0 : comparison > 0;
}
