export function beyondBoundary(ticket, key, direction) {
  return direction === 'before' ? ticket.createdAt > key.createdAt : ticket.createdAt < key.createdAt;
}
