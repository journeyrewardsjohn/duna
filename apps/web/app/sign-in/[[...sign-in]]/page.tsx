import { SignIn } from "@clerk/nextjs";
import { DunaMark } from "@duna/ui";
import Link from "next/link";

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
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
      <SignIn path="/sign-in" routing="path" signUpUrl="/sign-up" />
    </main>
  );
}
