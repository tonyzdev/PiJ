import { CursorError } from '../errors.js';
export function encodeCursor(scope, key) {
  return Buffer.from(JSON.stringify({ version: 1, scope, key })).toString('base64url');
}
export function decodeCursor(token, scope) {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (payload.scope !== scope || !payload.key) throw new Error('Cursor scope changed');
    return payload.key;
  } catch { throw new CursorError('Invalid cursor'); }
}
