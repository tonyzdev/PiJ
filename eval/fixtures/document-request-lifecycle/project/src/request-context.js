export function documentRequest(context, documentId, locale = 'en') {
  const request = { tenantId: context?.tenantId, userId: context?.userId, documentId, locale };
  for (const [name, value] of Object.entries(request)) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`Missing ${name}`);
  }
  return request;
}
