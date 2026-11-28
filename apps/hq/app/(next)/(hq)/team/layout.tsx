import type { ReactNode } from "react";
import "@/components/team/team.css";

/** Team's screens share one token-based sheet (design system only). */
export default function TeamLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
