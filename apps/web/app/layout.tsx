import "@duna/ui/styles.css";
import "flag-icons/css/flag-icons.min.css";
import "mapbox-gl/dist/mapbox-gl.css";
import "./globals.css";
import "./design-v3.css";
import "./design-v4.css";

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
    "Sand Rating",
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FCFCFF" },
    { media: "(prefers-color-scheme: dark)", color: "#101824" },
  ],
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
    <html
      data-scroll-behavior="smooth"
      data-theme="light"
      data-theme-preference="system"
      lang="en"
      suppressHydrationWarning
    >
      <head>
        <link href="https://api.fontshare.com" rel="preconnect" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,900&display=swap"
          rel="stylesheet"
        />
        <link href="https://fonts.googleapis.com" rel="preconnect" />
        <link href="https://fonts.gstatic.com" rel="preconnect" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
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
