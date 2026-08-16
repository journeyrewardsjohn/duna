import type { Metadata } from "next";
import { WatchMarketingPage } from "@/components/watch-marketing-page";

export const metadata: Metadata = {
  title: "Duna for Apple Watch — Score, save, and review every rally",
  description:
    "Keep score, check evidence-first Duna Vision framing, flag source-linked rally review cues, and save highlights with Duna for Apple Watch and a paired iPhone.",
  alternates: {
    canonical: "/apps/apple-watch",
    types: { "text/markdown": "/apps/apple-watch.md" },
  },
  openGraph: {
    title: "Your match. On your wrist.",
    description:
      "Score in motion, check a real-court camera setup, flag a source-linked Duna Vision rally, and save the moment worth seeing again with Duna for Apple Watch.",
    type: "website",
    url: "/apps/apple-watch",
  },
  twitter: {
    card: "summary_large_image",
    title: "Duna for Apple Watch",
    description:
      "Score in motion, check Duna Vision framing, flag review cues, and save highlights from your wrist.",
  },
};

export default function AppleWatchPage() {
  return <WatchMarketingPage />;
}
