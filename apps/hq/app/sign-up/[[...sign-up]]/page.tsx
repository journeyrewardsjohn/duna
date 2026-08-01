import { SignUp } from "@clerk/nextjs";
import { resolveClerkCredentials } from "@duna/api/clerk-environment";

export default function SignUpPage() {
  if (!resolveClerkCredentials()) return null;
  return (
    <main className="auth-page">
      <SignUp path="/sign-up" routing="path" signInUrl="/sign-in" />
    </main>
  );
}
