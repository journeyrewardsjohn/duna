export function getAskDunaInternalHref(
  href: string | undefined,
): string | null {
  if (
    !href?.startsWith("/") ||
    href.startsWith("//") ||
    href.includes("\\") ||
    /\s/.test(href)
  )
    return null;
  const origin = "https://duna.invalid";
  const url = new URL(href, origin);
  // Reject paths that normalize to a protocol-relative URL before Next resolves
  // them. External links keep Streamdown's existing confirmation behavior.
  if (url.origin !== origin || url.pathname.startsWith("//")) return null;
  return href;
}
