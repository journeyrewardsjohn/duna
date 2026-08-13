export type DunaMemberCredential = {
  readonly version: 1;
  readonly token: string;
};

const prefix = "duna:member:v1";
const tokenPattern = /^[a-zA-Z0-9_-]{32,96}$/;

export function encodeDunaMemberCredential(tokenValue: string): string {
  const token = tokenValue.trim();
  if (!tokenPattern.test(token)) {
    throw new Error("Duna membership credential token is invalid.");
  }
  return `${prefix}:${token}`;
}

export function parseDunaMemberCredential(
  value: string,
): DunaMemberCredential | undefined {
  const normalized = value.trim();
  const match = /^duna:member:v1:([a-zA-Z0-9_-]{32,96})$/.exec(normalized);
  return match?.[1] ? { version: 1, token: match[1] } : undefined;
}

export function normalizeDunaMemberId(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return /^[0-9A-Z]{6}$/.test(normalized) ? normalized : undefined;
}
