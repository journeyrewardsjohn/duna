import type { Metadata } from "next";
import { TrainingOSPage } from "@/components/training-os-page";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export const metadata: Metadata = {
  title:
    "Training OS — Program, practice, and drill planning for beach volleyball coaches",
  description:
    "Describe a drill in plain language and Duna returns a structured, animated plan you can edit. Stack drills into practices, phase a season around your tournament calendar, and run it courtside in Duna HQ.",
  alternates: {
    canonical: "/run-your-club/training",
    types: { "text/markdown": "/run-your-club/training.md" },
  },
  openGraph: {
    title: "Training OS — Duna for coaches",
    description:
      "Drill planning, practice planning, and season programs for beach volleyball coaches, with contact estimates and a drill marketplace.",
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
      name: "Training OS — Program, practice, and drill planning",
      description:
        "Duna Training OS covers drill creation from a plain-language description, practice assembly, season program planning, courtside execution, and drill sharing for beach volleyball coaches.",
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
      name: "Duna Training OS",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Sports coaching and training management",
      operatingSystem: "Web",
      url: DUNA_HQ_URL,
      featureList: [
        "Drill creation from a plain-language description, reviewed by the coach before saving",
        "Season program planning with training phases and milestone-aware load",
        "Practice plan builder with parallel court support",
        "Planning estimates for contacts and jumps per drill and per practice",
        "Court animation and visualization",
        "Courtside Coach Mode with segment timer and post-practice debrief",
        "Printable practice run sheet",
        "Drill marketplace with per-organization licenses",
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
