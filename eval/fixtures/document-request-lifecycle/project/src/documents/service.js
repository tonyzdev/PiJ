import { documentRequest } from '../request-context.js';
export function createDocumentService(load) {
  return { get(context, id, options = {}) {
    return load(documentRequest(context, id, options.locale), options.signal);
  } };
}
