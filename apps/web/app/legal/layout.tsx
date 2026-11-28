import "@duna/ui/tideline/styles.css";
import "@duna/ui/tideline/legacy-bridge.css";
import "@/components/legal/legal.css";

import { Rise } from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { LegalScope } from "@/components/legal/legal-scope";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

/**
 * The legal center: the public header and footer around a Tideline scope.
 * The skip link is the first thing a keyboard reaches. Content Rises once,
 * on first paint; moving between documents Crosses (LegalScope).
 */
export default function LegalLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <>
      <a className="lc-skip" href="#legal-content">
        Skip to the document
      </a>
      <SiteHeader />
      <LegalScope>
        <Rise from="bottom">{children}</Rise>
      </LegalScope>
      <SiteFooter />
    </>
  );
}
