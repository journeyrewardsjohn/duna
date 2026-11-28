import type { Metadata } from "next";
import type { LegalPage } from "./legal-library";

/** Drafts are never indexed; documents in effect are, with a canonical URL. */
export function legalMetadata(page: LegalPage): Metadata {
  const draft = page.status === "draft";
  const title = draft ? `${page.title} (draft)` : page.title;
  return {
    title,
    description: page.description,
    alternates: { canonical: page.path },
    robots: draft
      ? { index: false, follow: true }
      : { index: true, follow: true },
    openGraph: {
      title,
      description: page.description,
      url: page.path,
      type: "article",
      ...(page.effectiveDate && !draft
        ? { publishedTime: page.effectiveDate }
        : {}),
      ...(page.lastUpdated ? { modifiedTime: page.lastUpdated } : {}),
    },
  };
}
