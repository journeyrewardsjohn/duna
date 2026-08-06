import { Badge } from "@duna/ui";
import Link from "next/link";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  type LegalDocument as LegalDocumentModel,
} from "@/lib/legal-documents";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

function sectionId(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function LegalDocument({
  document,
}: {
  readonly document: LegalDocumentModel;
}) {
  return (
    <main className="legal-page" data-zone="editorial">
      <SiteHeader />
      <header className="legal-hero">
        <div>
          <Badge>Version {LEGAL_VERSION}</Badge>
          <h1>{document.title}</h1>
          <p>{document.description}</p>
        </div>
        <dl>
          <div>
            <dt>Effective</dt>
            <dd>{LEGAL_EFFECTIVE_DATE}</dd>
          </div>
          <div>
            <dt>Applies to</dt>
            <dd>{document.audience}</dd>
          </div>
          <div>
            <dt>Entity</dt>
            <dd>Beach Elite LLC d/b/a Duna</dd>
          </div>
        </dl>
      </header>

      <div className="legal-layout">
        <aside>
          <strong>In this agreement</strong>
          <nav aria-label={`${document.shortTitle} sections`}>
            {document.sections.map((section) => (
              <a href={`#${sectionId(section.title)}`} key={section.title}>
                {section.title}
              </a>
            ))}
          </nav>
          <Link href="/legal">All legal documents</Link>
        </aside>
        <article className="legal-body">
          <div className="legal-summary">
            <strong>Readable by design</strong>
            <p>
              Headings help you navigate, but every section is part of the
              agreement. Contact{" "}
              <a href="mailto:legal@duna.coach">legal@duna.coach</a> with
              questions.
            </p>
          </div>
          {document.sections.map((section) => (
            <section id={sectionId(section.title)} key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets && (
                <ul>
                  {section.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}
