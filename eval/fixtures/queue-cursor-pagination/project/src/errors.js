export class QueryError extends Error {
  constructor(message) { super(message); this.name = 'QueryError'; this.code = 'INVALID_QUERY'; }
}
export class CursorError extends Error {
  constructor(message) { super(message); this.name = 'CursorError'; this.code = 'INVALID_CURSOR'; }
}
