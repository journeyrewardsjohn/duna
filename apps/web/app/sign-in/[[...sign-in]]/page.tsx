import { SignIn } from "@clerk/nextjs";
import { resolveClerkCredentials } from "@duna/api/clerk-environment";
import { DunaMark } from "@duna/ui";
import Link from "next/link";

export default async function SignInPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ redirect_url?: string }>;
}) {
  const query = await searchParams;
  const redirectUrl =
    query.redirect_url?.startsWith("/") && !query.redirect_url.startsWith("//")
      ? query.redirect_url
      : undefined;
  if (!resolveClerkCredentials()) {
    return (
      <main className="auth-page">
        <section className="auth-setup-card">
          <DunaMark />
          <h1>Sign-in is being connected.</h1>
          <p>Add Clerk keys to activate Duna accounts.</p>
          <Link href="/">Return home</Link>
        </section>
      </main>
    );
  }
  return (
    <main className="auth-page">
      <SignIn
        forceRedirectUrl={redirectUrl}
        path="/sign-in"
        routing="path"
        signUpUrl={
          redirectUrl
            ? `/sign-up?redirect_url=${encodeURIComponent(redirectUrl)}`
            : "/sign-up"
        }
      />
    </main>
  );
}
