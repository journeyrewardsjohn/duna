import type { ReactNode } from "react";
import "@/components/money/money.css";

/** Money's screens share one token-based sheet (design system only). */
export default function MoneyLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
