import { BrandedAuthEntry } from "@/components/branded-auth-entry";

function safeReturnTo(value?: string): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/app";
}

export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  return <BrandedAuthEntry mode="sign-in" returnTo={safeReturnTo(returnTo)} />;
}
