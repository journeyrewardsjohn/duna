export function resolveDiscoveryMediaUrl(
  value: string | undefined,
  webBaseUrl: string,
): string | undefined {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  if (/^(?:https?:|data:|file:|content:|asset:)/i.test(candidate)) {
    return candidate;
  }
  if (candidate.startsWith("//")) return `https:${candidate}`;
  const base = webBaseUrl.replace(/\/+$/, "");
  return `${base}/${candidate.replace(/^\/+/, "")}`;
}
