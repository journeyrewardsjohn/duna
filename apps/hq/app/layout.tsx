import "@fontsource-variable/archivo";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@duna/ui/styles.css";
import "./globals.css";

import { themeBootScript } from "@duna/ui/theme";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DunaAuthProvider } from "@/components/auth-provider";

export const metadata: Metadata = {
  title: {
    default: "Duna HQ",
    template: "%s · Duna HQ",
  },
  description: "The operating system for clubs, coaches, and facilities.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F5F1" },
    { media: "(prefers-color-scheme: dark)", color: "#141310" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      data-theme="light"
      data-theme-preference="system"
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body data-zone="editorial">
        <DunaAuthProvider>{children}</DunaAuthProvider>
      </body>
    </html>
  );
}
