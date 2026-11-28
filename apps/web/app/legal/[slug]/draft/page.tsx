import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LegalDocumentView } from "@/components/legal/legal-document-view";
import {
  legalDraftPage,
  legalDraftSlugs,
  legalPage,
} from "@/components/legal/legal-library";
import { legalMetadata } from "@/components/legal/legal-metadata";

/** The 1.0 revision of a document whose earlier version is still in effect. */
export function generateStaticParams() {
  return legalDraftSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = legalDraftPage(slug);
  return page
    ? legalMetadata(page)
    : { title: "Not found", robots: { index: false } };
}

export default async function LegalDraftPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = legalDraftPage(slug);
  if (!page) {
    // No separate draft: the document's own address shows what there is.
    if (legalPage(slug)) redirect(`/legal/${slug}`);
    notFound();
  }
  return <LegalDocumentView page={page} />;
}
