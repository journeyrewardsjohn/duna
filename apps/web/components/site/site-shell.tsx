import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import { SiteTransition } from "./site-transition";
import { ThumbBar } from "./thumb-bar";

/**
 * The public site's frame: skip link, header (banner), the page (which
 * renders its own `<main id="main">`), footer (contentinfo) and the phone
 * thumb bar. Every page in `app/(next)/(site)` gets it from the group layout.
 */
export function SiteShell({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <a className="site-skip" href="#main">
        Skip to content
      </a>
      <SiteHeader authConfigured={isWorkOSAuthKitConfigured()} />
      <SiteTransition>{children}</SiteTransition>
      <SiteFooter />
      <ThumbBar />
    </>
  );
}
