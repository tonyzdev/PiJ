import { CursorError } from '../errors.js';
export function encodeCursor(scope, key) {
  return Buffer.from(JSON.stringify({ version: 1, scope, key })).toString('base64url');
}
export function decodeCursor(token, scope) {
  try {
    if (typeof token !== 'string' || token.length === 0 || token.length > 16384 || !/^[A-Za-z0-9_-]+$/.test(token)) throw new Error();
    const bytes = Buffer.from(token, 'base64url');
    if (bytes.toString('base64url') !== token) throw new Error();
    const payload = JSON.parse(bytes.toString('utf8'));
    if (payload?.version !== 1 || payload.scope !== scope) throw new Error();
    const key = payload.key;
    if (!key || typeof key !== 'object' || Array.isArray(key)) throw new Error();
    if (typeof key.id !== 'string' || key.id.length === 0 || /[^\x00-\x7f]/.test(key.id)) throw new Error();
    if (!Number.isInteger(key.priority) || key.priority < 0 || key.priority > 9) throw new Error();
    if (typeof key.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(key.createdAt)) throw new Error();
    if (new Date(key.createdAt).toISOString() !== `${key.createdAt.slice(0, 23)}Z`) throw new Error();
    return { createdAt: key.createdAt, priority: key.priority, id: key.id };
  } catch { throw new CursorError('Invalid cursor'); }
}
