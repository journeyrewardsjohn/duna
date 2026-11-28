// An address that matches no page in either root layout. Its own document,
// on the design system only (docs/design/hq-shell.md).
import "@duna/ui/tideline/styles.css";
import "./(next)/hq.css";

import { Button, EmptyState } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { hqThemeBootScript } from "@/components/shell/theme";
import { dunaFontClassName } from "./fonts";

export const metadata: Metadata = {
  title: "Page not found · Duna HQ",
};

export default function GlobalNotFound() {
  return (
    <html
      className={dunaFontClassName}
      data-theme="light"
      lang="en"
      suppressHydrationWarning
    >
      <body
        className="td td--ground"
        data-theme="light"
        data-zone="hq"
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: hqThemeBootScript }} />
        <main className="hqs-state hqs-state--page">
          <EmptyState
            actions={
              <Button href="/" variant="primary">
                Back to Duna HQ
              </Button>
            }
            description="The link may be old, the page may have moved, or it may belong to a club you are not signed in to."
            icon="search"
            title="We can't find that page"
          />
        </main>
      </body>
    </html>
  );
}
