import { BrandedAuthEntry } from "@/components/branded-auth-entry";
import { catalogPurchaseAuthContext } from "@/lib/catalog-auth";

function safeReturnTo(value?: string | readonly string[]): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/app";
}

export default async function SignUpPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly returnTo?: string | readonly string[];
    readonly product?: string | readonly string[];
    readonly organization?: string | readonly string[];
  }>;
}) {
  const { returnTo, product, organization } = await searchParams;
  return (
    <BrandedAuthEntry
      mode="sign-up"
      purchaseContext={catalogPurchaseAuthContext({ product, organization })}
      returnTo={safeReturnTo(returnTo)}
    />
  );
}
