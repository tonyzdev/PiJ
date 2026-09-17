export function compareTickets(left, right) {
  if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? -1 : 1;
  if (left.priority !== right.priority) return right.priority - left.priority;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
