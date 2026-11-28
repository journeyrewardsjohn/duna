import type { ReactNode } from "react";
import { HqShell } from "@/components/shell/hq-shell";

// The shell reads the session and the person's sidebar choice per request.
export const dynamic = "force-dynamic";

/** Every rebuilt operator screen renders inside the HQ shell. */
export default function HqShellLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <HqShell>{children}</HqShell>;
}
