// The design system and the site's own token-based sheet, nothing else: no
// legacy sheet is ever imported under app/(next) (docs/plan/legacy-styles.md;
// scripts/design-contracts/public.ts enforces it).
import "@duna/ui/tideline/styles.css";
import "./site.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DunaAuthProvider } from "@/components/auth-provider";
import { siteBootScript } from "@/components/site/boot";
import { publicSiteOrigin } from "@/lib/pro-seo";
import { dunaFontClassName } from "../fonts";

export const metadata: Metadata = {
  title: {
    default: "Duna · Beach and indoor volleyball near you",
    template: "%s · Duna",
  },
  description:
    "Find a game tonight, keep score on your phone and get your Sand Rating. Clubs and coaches run their whole week on Duna.",
  applicationName: "Duna",
  category: "sports",
  metadataBase: new URL(publicSiteOrigin()),
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F2EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1A22" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * The root layout of every rebuilt public page (route group `(next)`). Its
 * document is separate from `(legacy)`'s, so it ships only the design
 * system's CSS. The body is the design-system scope (`td`); the boot script,
 * its first child, sets the theme and the audience before the first paint.
 */
export default function NextRootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      className={dunaFontClassName}
      data-audience="play"
      data-theme="light"
      data-theme-preference="system"
      lang="en"
      suppressHydrationWarning
    >
      <body className="td site" data-theme="light" suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: siteBootScript }} />
        <DunaAuthProvider>{children}</DunaAuthProvider>
      </body>
    </html>
  );
}
