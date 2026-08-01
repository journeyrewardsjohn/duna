import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";
import type { ReactNode } from "react";

export function DunaAuthProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  return isWorkOSAuthKitConfigured() ? (
    <AuthKitProvider>{children}</AuthKitProvider>
  ) : (
    children
  );
}
