import type { Metadata } from "next";
import { TrainingOSPage } from "@/components/training-os-page";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export const metadata: Metadata = {
  title:
    "Training: drill, practice, and program planning for volleyball coaches",
  description:
    "Describe a drill in plain language and Duna returns a structured plan you can correct. Build the session around it, then set the season it belongs to.",
  alternates: {
    canonical: "/run-your-club/training",
    types: { "text/markdown": "/run-your-club/training.md" },
  },
  openGraph: {
    title: "Training planning in Duna HQ",
    description:
      "Drill, practice, program. The plan is ready before the whistle.",
    images: ["/media/brand/duna-club-hero-v1.webp"],
    type: "website",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://duna.coach/run-your-club/training#webpage",
      url: "https://duna.coach/run-your-club/training",
      name: "Training: drill, practice, and program planning",
      description:
        "How coaches plan training in Duna HQ: a drill described in plain language, a practice the coach assembles, and a season program with drafted phases.",
      inLanguage: "en-US",
      isPartOf: { "@id": "https://duna.coach/run-your-club#webpage" },
      encoding: {
        "@type": "MediaObject",
        encodingFormat: "text/markdown",
        contentUrl: "https://duna.coach/run-your-club/training.md",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://duna.coach/run-your-club/training#software",
      name: "Duna HQ training planning",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Sports coaching and training planning",
      operatingSystem: "Web",
      url: DUNA_HQ_URL,
      featureList: [
        "Drill creation from a plain-language description, reviewed by the coach before saving",
        "Coach-assembled practice plans with parallel court blocks",
        "Season programs with drafted training phases and milestone-aware load",
      ],
    },
  ],
};

export default function TrainingOSRoute() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
        type="application/ld+json"
      />
      <TrainingOSPage hqHref={DUNA_HQ_URL} />
    </>
  );
}
