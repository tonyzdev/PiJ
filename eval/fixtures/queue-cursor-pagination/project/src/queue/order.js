export function compareTickets(left, right) {
  const time = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (time !== 0) return time;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}
