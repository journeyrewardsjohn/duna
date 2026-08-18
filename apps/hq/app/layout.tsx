import "@duna/ui/styles.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import "./design-v3.css";

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
    { media: "(prefers-color-scheme: light)", color: "#F5F7FA" },
    { media: "(prefers-color-scheme: dark)", color: "#111820" },
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
        <link href="https://api.fontshare.com" rel="preconnect" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@1,2&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body data-zone="operator">
        <DunaAuthProvider>{children}</DunaAuthProvider>
      </body>
    </html>
  );
}
