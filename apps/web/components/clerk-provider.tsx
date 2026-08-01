import { ClerkProvider } from "@clerk/nextjs";
import { resolveClerkCredentials } from "@duna/api/clerk-environment";
import type { ReactNode } from "react";

export function DunaClerkProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const credentials = resolveClerkCredentials();
  return credentials ? (
    <ClerkProvider publishableKey={credentials.publishableKey}>
      {children}
    </ClerkProvider>
  ) : (
    children
  );
}
