import type { ReactNode } from "react";
import "@/components/setup/setup.css";

/** Club setup's screens share one token-based sheet (design system only). */
export default function SetupLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
