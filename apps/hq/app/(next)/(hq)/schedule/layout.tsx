import type { ReactNode } from "react";
import "@/components/schedule/schedule.css";

/** Schedule's screens share one token-based sheet (design system only). */
export default function ScheduleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
