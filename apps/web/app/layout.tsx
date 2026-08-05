import "@fontsource/archivo/500.css";
import "@fontsource/archivo/700.css";
import "@fontsource/archivo/800.css";
import "@duna/ui/styles.css";
import "./globals.css";

import { themeBootScript } from "@duna/ui/theme";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DunaAuthProvider } from "@/components/auth-provider";
import {
  absolutePublicUrl,
  publicSiteOrigin,
  serializeJsonLd,
} from "@/lib/pro-seo";

export const metadata: Metadata = {
  title: {
    default: "Duna — The operating system for sand",
    template: "%s · Duna",
  },
  description:
    "Find your game, know your level, and run everything that happens on sand.",
  applicationName: "Duna",
  category: "sports",
  keywords: [
    "beach volleyball",
    "professional beach volleyball",
    "Beach Pro Tour",
    "AVP League",
    "beach volleyball scores",
    "SandRating",
  ],
  metadataBase: new URL(publicSiteOrigin()),
  openGraph: {
    title: "Duna — The operating system for sand",
    description:
      "A player network and complete operating system for beach volleyball.",
    type: "website",
    url: "/",
    siteName: "Duna",
  },
  twitter: {
    card: "summary",
    title: "Duna — The operating system for sand",
    description:
      "Beach volleyball events, players, scores, ratings, and club operations.",
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
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${absolutePublicUrl("/")}#organization`,
        name: "Duna",
        legalName: "Beach Elite LLC",
        url: absolutePublicUrl("/"),
        description:
          "Duna connects beach volleyball players, professional events, scores, ratings, and sand-sport operations.",
      },
      {
        "@type": "WebSite",
        "@id": `${absolutePublicUrl("/")}#website`,
        url: absolutePublicUrl("/"),
        name: "Duna",
        description:
          "The player network and operating system for beach volleyball.",
        publisher: { "@id": `${absolutePublicUrl("/")}#organization` },
        inLanguage: "en-US",
      },
    ],
  };
  return (
    <html data-theme="light" lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
          type="application/ld+json"
        />
        <DunaAuthProvider>{children}</DunaAuthProvider>
      </body>
    </html>
  );
}
