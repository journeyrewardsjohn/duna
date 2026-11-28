// The design system and HQ's own token-based sheet, nothing else: no legacy
// sheet is ever imported under app/(next) (docs/plan/legacy-styles.md;
// scripts/design-contracts/hq.ts enforces it).
import "@duna/ui/tideline/styles.css";
import "./hq.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DunaAuthProvider } from "@/components/auth-provider";
import { hqThemeBootScript } from "@/components/shell/theme";
import { dunaFontClassName } from "../fonts";

export const metadata: Metadata = {
  title: {
    default: "Duna HQ",
    template: "%s · Duna HQ",
  },
  description: "Run your club: the day, the people, the money.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0E1A22" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * The root layout of every rebuilt HQ screen (route group `(next)`). Its
 * document is separate from `(legacy)`'s, so it ships only the design
 * system's CSS. The body is the design-system scope: class `td`, the HQ zone,
 * and the theme, which the boot script sets before the first paint.
 */
export default function NextRootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      className={dunaFontClassName}
      data-theme="light"
      data-theme-preference="system"
      lang="en"
      suppressHydrationWarning
    >
      <body
        className="td"
        data-theme="light"
        data-zone="hq"
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: hqThemeBootScript }} />
        <DunaAuthProvider>{children}</DunaAuthProvider>
      </body>
    </html>
  );
}
