import type { ReactNode } from "react";
import "@/components/people/people.css";

/** People's screens share one token-based sheet (design system only). */
export default function PeopleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
