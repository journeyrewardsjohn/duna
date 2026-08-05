import "@fontsource/archivo/500.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
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
  themeColor: "#f8f7f3",
  width: "device-width",
  initialScale: 1,
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
