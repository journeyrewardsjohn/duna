"use client";

import { PageTransition } from "@duna/ui/tideline";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The page content Crosses in when the route changes (the kit's CSS Cross:
 * it never holds input, and under reduced motion it is a 200 ms fade). The
 * first page of a visit is still.
 */
export function SiteTransition({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  return (
    <PageTransition className="site-page" routeKey={pathname}>
      {children}
    </PageTransition>
  );
}
