import { ArrowRight, FileCheck2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  legalDocuments,
} from "@/lib/legal-documents";

export const metadata = {
  title: "Legal center",
  description:
    "Duna terms, privacy, mobile software license, and organization agreements.",
};

export default function LegalCenterPage() {
  return (
    <main className="legal-page" data-zone="editorial">
      <SiteHeader />
      <header className="legal-center-hero">
        <span className="page-eyebrow">Trust + accountability</span>
        <h1>Clear rules for every side of Duna.</h1>
        <p>
          Consumer, mobile, privacy, and organization agreements built around
          real bookings, sports data, families, payments, credits, and club
          operations.
        </p>
        <div>
          <span>Version {LEGAL_VERSION}</span>
          <span>Effective {LEGAL_EFFECTIVE_DATE}</span>
        </div>
      </header>
      <section className="legal-card-grid">
        {legalDocuments.map((document) => (
          <Link href={`/legal/${document.slug}`} key={document.slug}>
            {document.slug === "privacy" ? (
              <ShieldCheck aria-hidden size={24} />
            ) : (
              <FileCheck2 aria-hidden size={24} />
            )}
            <span>{document.audience}</span>
            <h2>{document.shortTitle}</h2>
            <p>{document.description}</p>
            <strong>
              Read document <ArrowRight aria-hidden size={16} />
            </strong>
          </Link>
        ))}
      </section>
      <section className="legal-contact">
        <span className="page-eyebrow">Questions or rights requests</span>
        <h2>Talk to the right team.</h2>
        <div>
          <a href="mailto:legal@duna.coach">legal@duna.coach</a>
          <a href="mailto:privacy@duna.coach">privacy@duna.coach</a>
          <a href="mailto:support@duna.coach">support@duna.coach</a>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
