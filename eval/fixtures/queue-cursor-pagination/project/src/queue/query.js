import { STATUSES } from '../models/ticket.js';
import { QueryError } from '../errors.js';
export function normalizeQuery(context, options = {}) {
  const limit = options.limit ?? 10;
  const statuses = options.statuses ?? ['open'];
  if (typeof context?.tenantId !== 'string' || !context.tenantId) throw new QueryError('Tenant is required');
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new QueryError('Invalid limit');
  if (!Array.isArray(statuses) || statuses.length === 0 || statuses.some((status) => !STATUSES.includes(status))) throw new QueryError('Invalid statuses');
  if (options.after != null && options.before != null) throw new QueryError('Choose one cursor direction');
  return {
    tenantId: context.tenantId,
    statuses: [...new Set(statuses)].sort(),
    limit,
    cursor: options.after ?? options.before ?? null,
    direction: options.before != null ? 'before' : 'after',
  };
}
