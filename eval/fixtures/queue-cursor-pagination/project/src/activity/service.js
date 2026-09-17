import { QueryError } from '../errors.js';
import { offsetPage } from './offset-page.js';
export function createActivityService(repository) {
  return async function activity(context, { offset = 0, limit = 20 } = {}) {
    if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1) throw new QueryError('Invalid activity page');
    const rows = (await repository.forTenant(context.tenantId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return offsetPage(rows, offset, limit);
  };
}
