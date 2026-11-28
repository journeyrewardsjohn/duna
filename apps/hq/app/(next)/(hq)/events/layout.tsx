import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@/components/events/events.css";

/** The title lives on the layout; an open event's pages set their own. */
export const metadata: Metadata = { title: "Events" };

/** Events' screens share one token-based sheet (design system only). */
export default function EventsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
