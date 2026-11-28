import type { ReactNode } from "react";
// Money's sheet styles the refund panel the Payments tab shares with Money.
import "@/components/money/money.css";
import "@/components/people/people.css";

/** People's screens share one token-based sheet (design system only). */
export default function PeopleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
