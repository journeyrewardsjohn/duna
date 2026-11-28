import type { ReactNode } from "react";
import { SiteShell } from "@/components/site/site-shell";

/** Every public page on the design system: the site shell around the page. */
export default function SiteLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <SiteShell>{children}</SiteShell>;
}
