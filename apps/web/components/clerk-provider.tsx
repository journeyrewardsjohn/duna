import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function DunaClerkProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  return process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
    <ClerkProvider>{children}</ClerkProvider>
  ) : (
    children
  );
}
