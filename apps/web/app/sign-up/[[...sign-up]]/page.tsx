import { SignUp } from "@clerk/nextjs";

export default async function SignUpPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ redirect_url?: string }>;
}) {
  const query = await searchParams;
  const redirectUrl =
    query.redirect_url?.startsWith("/") && !query.redirect_url.startsWith("//")
      ? query.redirect_url
      : undefined;
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return null;
  return (
    <main className="auth-page">
      <SignUp
        forceRedirectUrl={redirectUrl}
        path="/sign-up"
        routing="path"
        signInUrl={
          redirectUrl
            ? `/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`
            : "/sign-in"
        }
      />
    </main>
  );
}
