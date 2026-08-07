import type { Metadata } from "next";
import { WatchMarketingPage } from "@/components/watch-marketing-page";

export const metadata: Metadata = {
  title: "Duna for Apple Watch — Score every rally from your wrist",
  description:
    "Keep score, sync every rally with Duna Vision, save highlights, and check the live camera view with Duna for Apple Watch.",
  alternates: {
    canonical: "/apps/apple-watch",
    types: { "text/markdown": "/apps/apple-watch.md" },
  },
  openGraph: {
    title: "Your match. On your wrist.",
    description:
      "Score in motion, sync with Duna Vision, and save the rally worth seeing again with Duna for Apple Watch.",
    type: "website",
    url: "/apps/apple-watch",
  },
  twitter: {
    card: "summary_large_image",
    title: "Duna for Apple Watch",
    description:
      "Score in motion, sync with Duna Vision, and save highlights from your wrist.",
  },
};

export default function AppleWatchPage() {
  return <WatchMarketingPage />;
}
