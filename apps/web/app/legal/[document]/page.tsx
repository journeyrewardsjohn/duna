import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/legal-document";
import { getLegalDocument, legalDocuments } from "@/lib/legal-documents";

export function generateStaticParams() {
  return legalDocuments.map((document) => ({ document: document.slug }));
}

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ document: string }>;
}): Promise<Metadata> {
  const { document: slug } = await params;
  const document = getLegalDocument(slug);
  if (!document) return { title: "Legal" };
  return {
    title: document.shortTitle,
    description: document.description,
  };
}

export default async function LegalDocumentPage({
  params,
}: {
  readonly params: Promise<{ document: string }>;
}) {
  const { document: slug } = await params;
  const document = getLegalDocument(slug);
  if (!document) notFound();
  return <LegalDocument document={document} />;
}
