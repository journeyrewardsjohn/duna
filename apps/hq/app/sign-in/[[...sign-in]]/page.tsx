import { SignIn } from "@clerk/nextjs";
import { resolveClerkCredentials } from "@duna/api/clerk-environment";
import { DunaMark } from "@duna/ui";
import Link from "next/link";

export default function SignInPage() {
  if (!resolveClerkCredentials()) {
    const playerAppUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "https://duna-web.vercel.app";
    return (
      <main className="auth-page">
        <section className="auth-setup-card">
          <DunaMark />
          <h1>Connect Clerk to Duna HQ.</h1>
          <p>
            Add the Clerk publishable and secret keys in Vercel to activate
            organization sign-in.
          </p>
          <Link href={playerAppUrl}>Open Duna</Link>
        </section>
      </main>
    );
  }
  return (
    <main className="auth-page">
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />
    </main>
  );
}
