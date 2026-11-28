import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/components/schedule/schedule.css";

/** Also set here so the title holds while a filter change re-renders the page. */
export const metadata: Metadata = { title: "Schedule" };

/** Schedule's screens share one token-based sheet (design system only). */
export default function ScheduleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
