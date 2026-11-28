// An address that matches no page in either root layout. Its own document,
// on the design system only (docs/design/web-shell.md).
import "@duna/ui/tideline/styles.css";
import "./(next)/site.css";

import type { Metadata } from "next";
import { siteBootScript } from "@/components/site/boot";
import { SiteShell } from "@/components/site/site-shell";
import { DunaAuthProvider } from "@/components/auth-provider";
import SiteNotFound from "./(next)/(site)/not-found";
import { dunaFontClassName } from "./fonts";

export const metadata: Metadata = {
  title: "Page not found · Duna",
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html
      className={dunaFontClassName}
      data-audience="play"
      data-theme="light"
      lang="en"
      suppressHydrationWarning
    >
      <body className="td site" data-theme="light" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: siteBootScript }} />
        <DunaAuthProvider>
          <SiteShell>
            <SiteNotFound />
          </SiteShell>
        </DunaAuthProvider>
      </body>
    </html>
  );
}
