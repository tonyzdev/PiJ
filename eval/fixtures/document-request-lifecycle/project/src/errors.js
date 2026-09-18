export function abortError() {
  const error = new Error('Document request was cancelled');
  error.name = 'AbortError';
  return error;
}
