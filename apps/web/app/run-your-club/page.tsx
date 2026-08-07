import { formatMoney, ORGANIZATION_PLANS } from "@duna/core";
import type { Metadata } from "next";
import { RunYourBusinessPage } from "@/components/run-your-business-page";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export const metadata: Metadata = {
  title: "Duna for clubs and coaches",
  description:
    "Run a coaching business or a growing beach volleyball club with scheduling, courts, staff, parents, memberships, payments, marketing, video, and reporting in Duna HQ.",
  alternates: {
    canonical: "/run-your-club",
    types: { "text/markdown": "/run-your-club.md" },
  },
  openGraph: {
    title: "Run your coaching business or club on Duna",
    description:
      "One operating system for independent coaches, growing clubs, facilities, and multi-venue networks.",
    images: ["/media/brand/duna-club-hero-v1.webp"],
    type: "website",
  },
};

const plans = Object.values(ORGANIZATION_PLANS).map((plan) => ({
  id: plan.id,
  name: plan.name,
  productName: plan.productName,
  tagline: plan.tagline,
  monthlyPrice: formatMoney(plan.monthlyPriceMinor, "USD"),
  annualPrice: formatMoney(plan.annualPriceMinor, "USD"),
  organizationFeePercent: plan.defaultCommissionBps / 100,
  monthlyUploadHours: plan.monthlyUploadSeconds / 60 / 60,
  monthlyLiveHours: plan.monthlyLiveSeconds / 60 / 60,
  features: plan.features,
}));

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://duna.coach/run-your-club#webpage",
      url: "https://duna.coach/run-your-club",
      name: "Duna for clubs and coaches",
      description:
        "Duna HQ is an operating system for independent coaches, clubs, facilities, and multi-venue beach volleyball organizations.",
      inLanguage: "en-US",
      isPartOf: { "@id": "https://duna.coach/#website" },
      mainEntity: { "@id": "https://duna.coach/run-your-club#software" },
      encoding: {
        "@type": "MediaObject",
        encodingFormat: "text/markdown",
        contentUrl: "https://duna.coach/run-your-club.md",
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://duna.coach/run-your-club#software",
      name: "Duna HQ",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web, iOS, Android",
      url: DUNA_HQ_URL,
      audience: [
        { "@type": "Audience", audienceType: "Independent coaches" },
        { "@type": "Audience", audienceType: "Sports club operators" },
      ],
      offers: Object.values(ORGANIZATION_PLANS).map((plan) => ({
        "@type": "Offer",
        name: plan.productName,
        price: (plan.monthlyPriceMinor / 100).toFixed(2),
        priceCurrency: "USD",
        url: DUNA_HQ_URL,
      })),
    },
  ],
};

export default function RunYourClubPage() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
        type="application/ld+json"
      />
      <RunYourBusinessPage hqHref={DUNA_HQ_URL} plans={plans} />
    </>
  );
}
