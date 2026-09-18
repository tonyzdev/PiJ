export function createSearchService(find) {
  return { find(context, query) {
    if (typeof query !== 'string') throw new TypeError('Query must be a string');
    return find({ tenantId: context.tenantId, userId: context.userId, query: query.trim() });
  } };
}
