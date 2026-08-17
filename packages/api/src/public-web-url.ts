const canonicalProductionOrigin = "https://duna.coach";

function configuredWebOrigin(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_DUNA_WEB_URL
  )?.trim();
}

/**
 * Resolves a public Duna link origin without leaking an internal deployment
 * hostname into emails, texts, or shareable invitations.
 */
export function canonicalPublicWebOrigin(configured?: string): string {
  const candidate = configured?.trim() || configuredWebOrigin();
  if (!candidate) {
    return process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : canonicalProductionOrigin;
  }

  try {
    const url = new URL(candidate);
    if (
      url.hostname === "duna-web.vercel.app" ||
      url.hostname.endsWith(".vercel.app")
    ) {
      return canonicalProductionOrigin;
    }
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : canonicalProductionOrigin;
  } catch {
    return canonicalProductionOrigin;
  }
}

export function canonicalPublicWebUrl(
  path: string,
  configured?: string,
): string {
  return new URL(path, `${canonicalPublicWebOrigin(configured)}/`).toString();
}
