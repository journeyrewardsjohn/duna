import {
  formatMoney,
  ORGANIZATION_PLANS,
  ORGANIZATION_VIDEO_ADD_ONS,
  ORGANIZATION_VIDEO_RATES,
} from "@duna/core";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import type { Metadata } from "next";
import { RunYourBusinessPage } from "@/components/run-your-business-page";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export const metadata: Metadata = {
  title: "Duna for clubs and coaches",
  description:
    "Run an indoor, beach, or combined volleyball organization with every Duna HQ feature for $0 per month, then pay only when you transact or use more video.",
  alternates: {
    canonical: "/run-your-club",
    types: { "text/markdown": "/run-your-club.md" },
  },
  openGraph: {
    title: "Run your entire volleyball organization for $0 per month",
    description:
      "Every Duna HQ feature for indoor and beach clubs, with transparent transaction fees and flexible video usage.",
    images: ["/media/brand/duna-club-hero-v1.webp"],
    type: "website",
  },
};

function signupHref(planId: string, interval: "month" | "year"): string {
  const returnTo = `/onboarding?plan=${planId}&interval=${interval}&source=run-your-club`;
  return `${DUNA_HQ_URL}/sign-up?returnTo=${encodeURIComponent(returnTo)}`;
}

const plans = Object.values(ORGANIZATION_PLANS).map((plan) => ({
  id: plan.id,
  name: plan.name,
  productName: plan.productName,
  tagline: plan.tagline,
  monthlyPrice: formatMoney(plan.monthlyPriceMinor, "USD"),
  annualPrice: formatMoney(plan.annualPriceMinor, "USD"),
  monthlyPriceMinor: plan.monthlyPriceMinor,
  annualPriceMinor: plan.annualPriceMinor,
  organizationFeePercent: plan.defaultCommissionBps / 100,
  monthlyUploadHours: plan.monthlyUploadSeconds / 60 / 60,
  monthlyLiveHours: plan.monthlyLiveSeconds / 60 / 60,
  features: plan.features,
  monthlySignupHref: signupHref(plan.id, "month"),
  annualSignupHref: signupHref(plan.id, "year"),
}));

const videoPricing = {
  uploadHourly: formatMoney(
    ORGANIZATION_VIDEO_RATES.upload.customerPriceMinor,
    "USD",
  ),
  liveHourly: formatMoney(
    ORGANIZATION_VIDEO_RATES.live.customerPriceMinor,
    "USD",
  ),
  uploadPack: formatMoney(
    ORGANIZATION_VIDEO_ADD_ONS.upload.monthlyPriceMinor,
    "USD",
  ),
  livePack: formatMoney(
    ORGANIZATION_VIDEO_ADD_ONS.live.monthlyPriceMinor,
    "USD",
  ),
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": "https://duna.coach/run-your-club#webpage",
      url: "https://duna.coach/run-your-club",
      name: "Duna for clubs and coaches",
      description:
        "Duna HQ is the operating system for indoor, beach, and combined volleyball organizations.",
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
        url: signupHref(plan.id, "month"),
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
      <RunYourBusinessPage
        authConfigured={isWorkOSAuthKitConfigured()}
        hqHref={signupHref("coach", "month")}
        plans={plans}
        videoPricing={videoPricing}
      />
    </>
  );
}
