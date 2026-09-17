import { STATUSES } from '../models/ticket.js';
export function createSummaryService(repository) {
  return async function summary(context) {
    const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
    for (const ticket of await repository.forTenant(context.tenantId)) counts[ticket.status]++;
    return counts;
  };
}
