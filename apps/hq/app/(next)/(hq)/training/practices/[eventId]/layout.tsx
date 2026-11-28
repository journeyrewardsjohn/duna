import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The title lives on the layout: a confirmed change refreshes the page, and
 * a page title would be re-resolved (and briefly absent) on each refresh.
 */
export const metadata: Metadata = { title: "Practice" };

export default function PracticeLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
