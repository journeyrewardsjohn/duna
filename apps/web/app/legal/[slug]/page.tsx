import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import { legalPage, legalSlugs } from "@/components/legal/legal-library";
import { legalMetadata } from "@/components/legal/legal-metadata";

export function generateStaticParams() {
  return legalSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = legalPage(slug);
  return page
    ? legalMetadata(page)
    : { title: "Not found", robots: { index: false } };
}

export default async function LegalDocumentPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (slug === "legal-center") permanentRedirect("/legal");
  const page = legalPage(slug);
  if (!page) notFound();
  return <LegalDocumentView page={page} />;
}
