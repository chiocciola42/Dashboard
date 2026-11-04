// Client-side fetch with a bounded wait: every request aborts after `timeoutMs`
// (default 30s) so a stalled connection can never leave the UI waiting forever.
// An abort surfaces as a rejected promise, handled by the callers' catch blocks
// like any other network error. A caller-supplied `signal` is still honoured.
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const UPLOAD_FETCH_TIMEOUT_MS = 120_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return fetch(input, { ...init, signal });
}
