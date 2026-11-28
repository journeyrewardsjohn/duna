/**
 * Preview builds only: one-shot parameters from a `duna-pro://dev/shell?…`
 * link, so a simulator without touch can open a sheet or a flow step for a
 * screenshot (M-R4). ProApp sets them only in preview mode; a screen takes
 * a parameter once. Live builds never set any.
 */
const params = new Map<string, string>();

export function setDevParams(query: URLSearchParams): void {
  params.clear();
  for (const [key, value] of query) params.set(key, value);
}

/** Reads and forgets one parameter. */
export function takeDevParam(key: string): string | undefined {
  const value = params.get(key);
  params.delete(key);
  return value;
}

/** Reads a parameter without forgetting it. */
export function peekDevParam(key: string): string | undefined {
  return params.get(key);
}
