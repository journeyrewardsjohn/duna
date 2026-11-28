import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClubFeaturePage } from "@/components/club-feature-page";
import { clubFeatures, findClubFeature } from "@/lib/club-features";

interface ClubFeatureRouteProps {
  readonly params: Promise<{ readonly slug: string[] }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return clubFeatures.map((feature) => ({ slug: feature.key.split("/") }));
}

export async function generateMetadata({
  params,
}: ClubFeatureRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = findClubFeature(slug);
  if (!feature) return {};
  return {
    title: `${feature.navLabel} for volleyball clubs`,
    description: feature.summary,
    alternates: {
      canonical: feature.href,
      types: { "text/markdown": `${feature.href}.md` },
    },
    openGraph: {
      title: feature.title,
      description: feature.summary,
      images: [feature.image],
      type: "website",
      url: feature.href,
    },
  };
}

export default async function ClubFeatureRoute({
  params,
}: ClubFeatureRouteProps) {
  const { slug } = await params;
  const feature = findClubFeature(slug);
  if (!feature) notFound();

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: feature.title,
    description: feature.summary,
    url: `https://duna.coach${feature.href}`,
    isPartOf: {
      "@type": "WebPage",
      name: "Duna HQ features",
      url: "https://duna.coach/run-your-club/features",
    },
    about: feature.capabilities.map((capability) => ({
      "@type": "Thing",
      name: capability.title,
      description: capability.description,
    })),
  };

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
        type="application/ld+json"
      />
      <ClubFeaturePage feature={feature} />
    </>
  );
}
