import type { ReactNode } from "react";
import "@/components/inbox/inbox.css";

/** Inbox's screens share one token-based sheet (design system only). */
export default function InboxLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
