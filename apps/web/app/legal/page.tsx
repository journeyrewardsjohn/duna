import type { Metadata } from "next";
import { LegalHub } from "@/components/legal/legal-hub";

const description =
  "Every Duna agreement and policy in one place: terms for players and families, the Duna HQ Terms for clubs, privacy, cookies, bookings and refunds, payouts, fees and Duna Premium.";

export const metadata: Metadata = {
  title: "Legal center",
  description,
  alternates: { canonical: "/legal" },
  openGraph: {
    title: "Duna Legal Center",
    description,
    url: "/legal",
    type: "website",
  },
};

export default function LegalCenterPage() {
  return (
    <LegalHub lead="Every agreement and policy for Duna, grouped by who it is for. Each one starts with a plain-language summary; the full text is what applies." />
  );
}
