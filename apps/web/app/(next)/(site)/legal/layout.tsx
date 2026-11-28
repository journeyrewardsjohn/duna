import "@/components/legal/legal.css";

import { Rise } from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { LegalScope } from "@/components/legal/legal-scope";

/**
 * The legal center inside the public site shell (which brings the header,
 * footer, skip link and page Cross). Content Rises once, on first paint, in
 * the legal center's own design-system scope (LegalScope).
 */
export default function LegalLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <LegalScope>
      <Rise from="bottom">{children}</Rise>
    </LegalScope>
  );
}
