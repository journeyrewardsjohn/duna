import type { Metadata } from "next";
import { TrainingOSPage } from "@/components/training-os-page";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export const metadata: Metadata = {
  title: "Training OS — Program, practice, and drill planning for beach volleyball coaches",
  description:
    "Plan programs, build practices, and create drills with natural-language prompts. Duna Training OS turns your coaching brief into structured sessions with contact estimates, animations, and a drill marketplace.",
  alternates: {
    canonical: "/run-your-club/training",
    types: { "text/markdown": "/run-your-club/training.md" },
  },
  openGraph: {
    title: "Training OS — Duna for coaches",
    description:
      "Turn your coaching brief into structured programs, daily practices, and animated drills. Share privately or publish to the marketplace.",
    images: ["/media/brand/duna-training-os-hero-v1.webp"],
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
        "Duna Training OS helps coaches plan programs, build practices, and create drills with natural-language prompts.",
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
        "Natural-language drill creation",
        "Season and program planning",
        "Practice plan builder with parallel court support",
        "Contact and jump estimates per drill",
        "Court animation and visualization",
        "Drill marketplace with organization licenses",
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
