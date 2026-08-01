import "@fontsource/archivo/500.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@fontsource/instrument-sans/400.css";
import "@fontsource/instrument-sans/500.css";
import "@fontsource/instrument-sans/600.css";
import "@fontsource/instrument-sans/700.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@duna/ui/styles.css";
import "./globals.css";

import { themeBootScript } from "@duna/ui/theme";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DunaAuthProvider } from "@/components/auth-provider";

function resolveMetadataBase() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const candidates = [
    configuredUrl,
    vercelUrl ? `https://${vercelUrl}` : undefined,
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      return new URL(candidate);
    } catch {
      // Ignore malformed deployment configuration and use the local fallback.
    }
  }

  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  title: {
    default: "Duna — The operating system for sand",
    template: "%s · Duna",
  },
  description:
    "Find your game, know your level, and run everything that happens on sand.",
  applicationName: "Duna",
  metadataBase: resolveMetadataBase(),
  openGraph: {
    title: "Duna — The operating system for sand",
    description:
      "A player network and complete operating system for beach volleyball.",
    type: "website",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#f8f7f3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html data-theme="light" lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <DunaAuthProvider>{children}</DunaAuthProvider>
      </body>
    </html>
  );
}
