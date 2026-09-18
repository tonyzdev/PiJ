export const STATUSES = ['open', 'closed', 'snoozed'];
export function copyTicket(ticket) { return structuredClone(ticket); }
export function orderingKey(ticket) {
  return { createdAt: ticket.createdAt, priority: ticket.priority, id: ticket.id };
}
