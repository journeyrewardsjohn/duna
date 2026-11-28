import {
  DocumentProse,
  DocumentSectionList,
  Icon,
  SectionHeading,
} from "@duna/ui/tideline";
import Link from "next/link";
import { absolutePublicUrl } from "@/lib/pro-seo";
import { LegalBlocks, LegalInlines } from "./legal-blocks";
import {
  formatLegalDate,
  legalNeighbours,
  type LegalPage,
} from "./legal-library";
import { DraftNotice, LegalStatusChip, RevisionNotice } from "./legal-status";

function DateLine({ page }: { readonly page: LegalPage }) {
  if (page.status === "in-effect" && page.effectiveDate) {
    return (
      <>
        <dt>Effective</dt>
        <dd>
          <time dateTime={page.effectiveDate}>
            {formatLegalDate(page.effectiveDate)}
          </time>
        </dd>
      </>
    );
  }
  return (
    <>
      {page.lastUpdated ? (
        <>
          <dt>Last updated</dt>
          <dd>
            <time dateTime={page.lastUpdated}>
              {formatLegalDate(page.lastUpdated)}
            </time>
          </dd>
        </>
      ) : null}
      <dt>Effective</dt>
      <dd>
        {page.effectiveDatePending ? (
          <mark className="lc-tbc" data-kind="field">
            <span className="lc-tbc__tag">To be confirmed</span>{" "}
            <span className="lc-tbc__value">{page.effectiveDatePending}</span>
          </mark>
        ) : (
          "Not yet in effect"
        )}
      </dd>
    </>
  );
}

/** One legal document: header, status, summary, section list and text. */
export function LegalDocumentView({ page }: { readonly page: LegalPage }) {
  const isDraftRoute = page.path.endsWith("/draft");
  const neighbours = isDraftRoute ? {} : legalNeighbours(page.slug);
  const sections = page.sections.map((section) => ({
    id: section.id,
    title: section.title,
    ...(section.subsections.length
      ? {
          children: section.subsections.map((sub) => ({
            id: sub.id,
            title: sub.title,
          })),
        }
      : {}),
  }));
  const address = absolutePublicUrl(page.path).replace(/^https?:\/\//, "");

  return (
    <main className="lc-main lc-doc" id="legal-content" tabIndex={-1}>
      <header className="lc-doc__header">
        <nav aria-label="Breadcrumb" className="lc-crumbs">
          <ol>
            <li>
              <Link href="/legal">Legal center</Link>
            </li>
            {page.group ? <li>{page.group.title}</li> : null}
            {isDraftRoute && page.inEffectPath ? (
              <li>
                <Link href={page.inEffectPath}>Version in effect</Link>
              </li>
            ) : null}
          </ol>
        </nav>
        <h1 className="td-display lc-doc__title" id="legal-title">
          {page.title}
        </h1>
        {page.audience ? (
          <p className="lc-doc__audience">
            <span className="lc-doc__audience-label">Applies to</span>{" "}
            {page.audience}
          </p>
        ) : null}
        <dl className="lc-meta">
          <dt className="td-sr">Status</dt>
          <dd>
            <LegalStatusChip status={page.status} />
          </dd>
          <dt>Version</dt>
          <dd className="td-num">{page.version}</dd>
          <DateLine page={page} />
        </dl>
        <p className="lc-print-only lc-print-address">{address}</p>
        {page.status === "draft" ? (
          <DraftNotice
            {...(page.inEffectPath ? { inEffectPath: page.inEffectPath } : {})}
          />
        ) : page.draftPath ? (
          <RevisionNotice draftPath={page.draftPath} />
        ) : null}
        {page.summary ? (
          <section aria-labelledby="legal-summary" className="lc-summary">
            <h2 className="lc-summary__title" id="legal-summary">
              {page.summary.label}
            </h2>
            {page.summary.caveat ? (
              <p className="lc-summary__caveat">{page.summary.caveat}</p>
            ) : null}
            <div className="lc-summary__body">
              <LegalBlocks blocks={page.summary.blocks} />
            </div>
          </section>
        ) : null}
      </header>

      <aside className="lc-doc__toc">
        <DocumentSectionList
          label={`Sections of the ${page.title}`}
          sections={sections}
        />
      </aside>

      <article aria-labelledby="legal-title" className="lc-doc__body">
        <DocumentProse>
          <LegalBlocks blocks={page.preamble} />
          {page.sections.map((section) => (
            <section aria-labelledby={section.id} key={section.id}>
              <SectionHeading id={section.id} title={section.title}>
                <LegalInlines nodes={section.children} />
              </SectionHeading>
              <LegalBlocks blocks={section.blocks} />
            </section>
          ))}
        </DocumentProse>

        <footer className="lc-doc__footer">
          {neighbours.previous || neighbours.next ? (
            <nav
              aria-label={`More ${page.group?.title.toLowerCase() ?? "documents"}`}
              className="lc-pager"
            >
              {neighbours.previous ? (
                <Link
                  className="lc-pager__link"
                  data-direction="previous"
                  href={neighbours.previous.href}
                >
                  <span className="lc-pager__label">
                    <Icon name="chevron-left" size="inline" /> Previous
                  </span>
                  <span className="lc-pager__title">
                    {neighbours.previous.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {neighbours.next ? (
                <Link
                  className="lc-pager__link"
                  data-direction="next"
                  href={neighbours.next.href}
                >
                  <span className="lc-pager__label">
                    Next <Icon name="chevron-right" size="inline" />
                  </span>
                  <span className="lc-pager__title">
                    {neighbours.next.title}
                  </span>
                </Link>
              ) : null}
            </nav>
          ) : null}
          <p className="lc-doc__contact">
            Questions about this document? Write to{" "}
            <a href="mailto:legal@duna.coach">legal@duna.coach</a>.{" "}
            <Link href="/legal">All legal documents</Link>
          </p>
        </footer>
      </article>
    </main>
  );
}
