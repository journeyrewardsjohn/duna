export type CatalogPurchaseAuthContext = {
  readonly productTitle: string;
  readonly organizationName: string;
};

function safeContextLabel(
  value: string | readonly string[] | undefined,
  maximumLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value?.replaceAll(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maximumLength);
}

export function catalogPurchaseAuthContext(input: {
  readonly product?: string | readonly string[];
  readonly organization?: string | readonly string[];
}): CatalogPurchaseAuthContext | undefined {
  const productTitle = safeContextLabel(input.product, 120);
  const organizationName = safeContextLabel(input.organization, 100);
  return productTitle && organizationName
    ? { productTitle, organizationName }
    : undefined;
}

export function catalogAuthenticationHref(input: {
  readonly mode?: "sign-in" | "sign-up";
  readonly returnTo: string;
  readonly productTitle: string;
  readonly organizationName: string;
}): string {
  const returnTo =
    input.returnTo.startsWith("/") && !input.returnTo.startsWith("//")
      ? input.returnTo
      : "/app";
  const context = catalogPurchaseAuthContext({
    product: input.productTitle,
    organization: input.organizationName,
  });
  const search = new URLSearchParams({ returnTo });
  if (context) {
    search.set("product", context.productTitle);
    search.set("organization", context.organizationName);
  }
  return `/${input.mode ?? "sign-in"}?${search.toString()}`;
}
