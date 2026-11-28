"use client";

import { PageTransition } from "@duna/ui/tideline";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The page content Crosses in when the route changes (the kit's CSS Cross:
 * it never holds input, and under reduced motion it is a 200 ms fade). The
 * first page of a visit is still. The Cross travels sideways, so the stage
 * clips that travel: a sliding page must never widen the document (and flash a
 * horizontal scrollbar) while it arrives. `clip` on the x axis only, so
 * sticky stages and focus rings inside the page are untouched.
 */
export function SiteTransition({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="site-stage">
      <PageTransition className="site-page" routeKey={pathname}>
        {children}
      </PageTransition>
    </div>
  );
}
