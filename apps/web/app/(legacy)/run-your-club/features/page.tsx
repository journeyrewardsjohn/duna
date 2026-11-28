import type { Metadata } from "next";
import { ClubFeaturesHub } from "@/components/club-feature-page";

export const metadata: Metadata = {
  title: "Duna HQ features for clubs and coaches",
  description:
    "Explore products, people, teams, events, leagues, venues, training, money, marketing, messaging, safety, video, and Duna Pro tools in one connected club operating system.",
  alternates: {
    canonical: "/run-your-club/features",
    types: { "text/markdown": "/run-your-club/features.md" },
  },
  openGraph: {
    title: "The whole club. One connected operating story.",
    description:
      "Build what you sell, run the day, know your people, and grow with control through Duna HQ.",
    images: ["/media/brand/duna-club-hero-v1.webp"],
    type: "website",
    url: "/run-your-club/features",
  },
};

export default function ClubFeaturesPage() {
  return <ClubFeaturesHub />;
}
