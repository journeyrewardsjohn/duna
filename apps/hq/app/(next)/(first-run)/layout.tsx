import { Toaster } from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { FirstRunFrame } from "@/components/setup/first-run-frame";
import "@/components/setup/setup.css";

/**
 * The first run's own frame (no sidebar): a person may have no club yet, and
 * a club's first minutes are one focused conversation. Design system only.
 */
export default function FirstRunLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <FirstRunFrame>
      {children}
      <Toaster />
    </FirstRunFrame>
  );
}
