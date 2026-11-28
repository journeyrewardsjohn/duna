import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/components/participation/participation.css";
import "@/components/schedule/schedule.css";

/**
 * The title lives on the layout only: a filter change re-renders the page,
 * and a page title would be re-resolved (and briefly absent) on each one.
 */
export const metadata: Metadata = { title: "Schedule" };

/** Schedule's screens share one token-based sheet (design system only). */
export default function ScheduleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
