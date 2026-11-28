import type { ReactNode } from "react";
import "@/components/training/training-area.css";

/** Training's screens share one token-based sheet (design system only). */
export default function TrainingLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
