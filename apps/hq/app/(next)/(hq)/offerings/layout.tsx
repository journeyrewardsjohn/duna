import type { ReactNode } from "react";
import "@/components/participation/participation.css";
import "@/components/offerings/offerings.css";

/** Offerings' screens share two token-based sheets (design system only). */
export default function OfferingsLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return children;
}
