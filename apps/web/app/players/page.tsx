import type { Metadata } from "next";
import { AudienceHome } from "@/components/audience-home";

export const metadata: Metadata = {
  title: "Duna for Players — More play. More possibility.",
  description:
    "Find volleyball games, book sessions, build your Sand Rating, review video, and follow the pro tour with Duna.",
  alternates: {
    canonical: "/players",
    types: { "text/markdown": "/players.md" },
  },
  openGraph: {
    title: "Duna for Players — More play. More possibility.",
    description:
      "Find your next game, build your skills, and stay close to the sport.",
    url: "/players",
    images: ["/media/brand/duna-home-tournament-hero-v1.webp"],
  },
  twitter: {
    title: "Duna for Players — More play. More possibility.",
    description:
      "Find your next game, build your skills, and stay close to the sport.",
  },
};

export default function PlayersPage() {
  return <AudienceHome audience="players" />;
}
