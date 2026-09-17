import { documentRequest } from '../request-context.js';
import { previewOf } from '../model/document.js';
export function createPreviewService(load) {
  return { async get(context, id, options = {}) {
    return previewOf(await load(documentRequest(context, id, options.locale), options.signal));
  } };
}
