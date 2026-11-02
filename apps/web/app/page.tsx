import type { Metadata } from "next";
import { AudienceHome } from "@/components/audience-home";

export const metadata: Metadata = {
  title: "Duna for Clubs — Your club. All together.",
  description:
    "Run your volleyball club with Duna. Bring court bookings, programs, memberships, payments, players, and coaching together in one place.",
  alternates: { canonical: "/", types: { "text/markdown": "/index.md" } },
  openGraph: {
    title: "Duna for Clubs — Your club. All together.",
    description:
      "Bookings, programs, payments, and people. One place to run your volleyball club.",
    url: "/",
    images: ["/media/brand/duna-club-hero-v1.webp"],
  },
  twitter: {
    title: "Duna for Clubs — Your club. All together.",
    description:
      "Bookings, programs, payments, and people. One place to run your volleyball club.",
  },
};

export default function HomePage() {
  return <AudienceHome audience="clubs" />;
}
