/**
 * The legal center's content, read at build time (server only).
 *
 * Two sources:
 *  - the 1.0 drafts in `apps/web/content/legal/*.md`, listed in `index.json`,
 *    each with a `status` ("draft" | "in-effect");
 *  - the documents published before the legal center (`lib/legal-documents.ts`,
 *    version 2026-08-04): Terms, Privacy, HQ Terms and the Mobile App License.
 *
 * A published document stays at its address while its 1.0 revision is a
 * draft (HQ onboarding records acceptance against it), and the draft is
 * offered at `/legal/<slug>/draft`. Setting the index entry's status to
 * "in-effect" is the whole switch: the Markdown then serves at
 * `/legal/<slug>`, is indexable and joins the sitemap. `legal-library.test.ts`
 * refuses an in-effect document that still has a placeholder.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_VERSION,
  legalDocuments as publishedDocuments,
  type LegalDocument as PublishedDocument,
} from "../../lib/legal-documents";
import {
  frontmatterPlaceholder,
  inlineText,
  parseInline,
  parseLegalMarkdown,
  scanPlaceholders,
  slugifyHeading,
  type LegalBlock,
  type LegalPlaceholder,
  type LegalSection,
  type LegalSummary,
} from "./legal-markdown";

export type LegalStatus = "draft" | "in-effect";
export const LEGAL_STATUSES: readonly LegalStatus[] = ["draft", "in-effect"];

export interface LegalIndexGroup {
  readonly id: string;
  readonly title: string;
  readonly order: number;
}

export interface LegalIndexEntry {
  readonly slug: string;
  readonly file: string;
  readonly title: string;
  readonly group: string | null;
  readonly order: number;
  readonly description: string;
  readonly status: LegalStatus;
}

export interface LegalIndex {
  readonly version: string;
  readonly lastUpdated: string;
  readonly groups: readonly LegalIndexGroup[];
  readonly documents: readonly LegalIndexEntry[];
}

/** One rendered legal page. */
export interface LegalPage {
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  readonly description: string;
  readonly audience: string;
  readonly group: LegalIndexGroup | null;
  readonly status: LegalStatus;
  readonly source: "markdown" | "published";
  readonly version: string;
  /** ISO date, when known. */
  readonly lastUpdated?: string;
  /** ISO date, or undefined while it is still to be set. */
  readonly effectiveDate?: string;
  /** The front matter's placeholder text while the date is not set. */
  readonly effectiveDatePending?: string;
  readonly summary?: LegalSummary;
  readonly preamble: readonly LegalBlock[];
  readonly sections: readonly LegalSection[];
  readonly placeholders: readonly LegalPlaceholder[];
  /** On a published page: where its revision in review lives. */
  readonly draftPath?: string;
  /** On a draft of a published document: the version in effect today. */
  readonly inEffectPath?: string;
}

export interface LegalHubRow {
  readonly slug: string;
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly status: LegalStatus;
  readonly version: string;
  readonly dateLabel: string;
  readonly dateTime?: string;
  readonly draftHref?: string;
}

export interface LegalHubGroup extends LegalIndexGroup {
  readonly rows: readonly LegalHubRow[];
}

export interface LegalSearchEntry {
  readonly id: string;
  readonly kind: "document" | "heading";
  readonly title: string;
  readonly documentTitle: string;
  readonly href: string;
  readonly status: LegalStatus;
  /** Lower-cased text the search matches against. */
  readonly haystack: string;
}

/* ------------------------------------------------------------------------ */
/* Reading                                                                  */
/* ------------------------------------------------------------------------ */

function contentDirectory() {
  const candidates = [
    join(process.cwd(), "content", "legal"),
    join(process.cwd(), "apps", "web", "content", "legal"),
  ];
  const found = candidates.find((path) => existsSync(join(path, "index.json")));
  if (!found) throw new Error("The legal content folder was not found.");
  return found;
}

function readContent(file: string) {
  if (!/^[a-z0-9-]+\.(?:md|json)$/.test(file)) {
    throw new Error(`Refusing to read legal content file "${file}".`);
  }
  return readFileSync(join(contentDirectory(), file), "utf8");
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Validates and returns `index.json`. Throws at build time on a bad entry. */
export function parseLegalIndex(raw: unknown): LegalIndex {
  const value = raw as Partial<LegalIndex> | null;
  if (
    !value ||
    !Array.isArray(value.documents) ||
    !Array.isArray(value.groups)
  ) {
    throw new Error("index.json must list groups and documents.");
  }
  const groups = new Set(value.groups.map((group) => group.id));
  const slugs = new Set<string>();
  for (const entry of value.documents) {
    if (!/^[a-z0-9-]+$/.test(entry.slug)) {
      throw new Error(
        `Legal document slug "${entry.slug}" is not a plain slug.`,
      );
    }
    if (slugs.has(entry.slug))
      throw new Error(`Legal document "${entry.slug}" is listed twice.`);
    slugs.add(entry.slug);
    if (!LEGAL_STATUSES.includes(entry.status)) {
      throw new Error(
        `Legal document "${entry.slug}" needs a status of "draft" or "in-effect" (found ${JSON.stringify(entry.status)}).`,
      );
    }
    if (entry.group !== null && !groups.has(entry.group)) {
      throw new Error(
        `Legal document "${entry.slug}" names unknown group "${entry.group}".`,
      );
    }
  }
  return value as LegalIndex;
}

let indexCache: LegalIndex | undefined;
export function legalIndex(): LegalIndex {
  indexCache ??= parseLegalIndex(JSON.parse(readContent("index.json")));
  return indexCache;
}

const pageCache = new Map<string, LegalPage | undefined>();

/** A published document that predates the legal center, as a page. */
function publishedPage(
  document: PublishedDocument,
  group: LegalIndexGroup | null,
): LegalPage {
  const ids = new Map<string, number>();
  const sections: LegalSection[] = document.sections.map((section) => {
    const base = slugifyHeading(section.title);
    const seen = ids.get(base) ?? 0;
    ids.set(base, seen + 1);
    const blocks: LegalBlock[] = [
      ...section.paragraphs.map((paragraph): LegalBlock => ({
        type: "paragraph",
        children: parseInline(paragraph),
      })),
      ...(section.bullets?.length
        ? [
            {
              type: "list",
              ordered: false,
              items: section.bullets.map((bullet) => parseInline(bullet)),
            } satisfies LegalBlock,
          ]
        : []),
    ];
    return {
      id: seen === 0 ? base : `${base}-${seen + 1}`,
      title: section.title,
      children: [{ type: "text", value: section.title }],
      blocks,
      subsections: [],
    };
  });
  return {
    slug: document.slug,
    path: `/legal/${document.slug}`,
    title: document.title,
    description: document.description,
    audience: document.audience,
    group,
    status: "in-effect",
    source: "published",
    version: LEGAL_VERSION,
    effectiveDate: LEGAL_VERSION,
    preamble: [],
    sections,
    placeholders: [],
  };
}

function markdownPage(entry: LegalIndexEntry, path: string): LegalPage {
  const parsed = parseLegalMarkdown(readContent(entry.file));
  const front = parsed.frontmatter;
  const group =
    legalIndex().groups.find((candidate) => candidate.id === entry.group) ??
    null;
  const pending = frontmatterPlaceholder(front.effectiveDate);
  const effective =
    front.effectiveDate && isoDate.test(front.effectiveDate)
      ? front.effectiveDate
      : undefined;
  return {
    slug: entry.slug,
    path,
    title: parsed.title || entry.title,
    description: front.summary || entry.description,
    audience: front.audience ?? "",
    group,
    status: entry.status,
    source: "markdown",
    version: front.version || legalIndex().version,
    ...(front.lastUpdated && isoDate.test(front.lastUpdated)
      ? { lastUpdated: front.lastUpdated }
      : {}),
    ...(effective ? { effectiveDate: effective } : {}),
    ...(pending ? { effectiveDatePending: pending } : {}),
    ...(parsed.summary ? { summary: parsed.summary } : {}),
    preamble: parsed.preamble,
    sections: parsed.sections,
    placeholders: scanPlaceholders(parsed),
  };
}

function publishedFor(slug: string) {
  return publishedDocuments.find((document) => document.slug === slug);
}

/** Slugs with a page of their own (the hub's own entry has none). */
export function legalSlugs(): string[] {
  const indexed = legalIndex()
    .documents.filter((entry) => entry.group !== null)
    .map((entry) => entry.slug);
  const publishedOnly = publishedDocuments
    .map((document) => document.slug)
    .filter((slug) => !indexed.includes(slug));
  return [...indexed, ...publishedOnly];
}

/** The page at `/legal/<slug>`: what is in effect, or the draft when nothing is. */
export function legalPage(slug: string): LegalPage | undefined {
  const key = `page:${slug}`;
  if (pageCache.has(key)) return pageCache.get(key);
  const entry = legalIndex().documents.find(
    (candidate) => candidate.slug === slug,
  );
  const published = publishedFor(slug);
  let page: LegalPage | undefined;
  if (
    entry &&
    entry.group !== null &&
    (entry.status === "in-effect" || !published)
  ) {
    page = markdownPage(entry, `/legal/${slug}`);
  } else if (published) {
    const group =
      legalIndex().groups.find(
        (candidate) => candidate.id === (entry?.group ?? "players"),
      ) ?? null;
    page = {
      ...publishedPage(published, group),
      ...(entry && entry.status === "draft"
        ? { draftPath: `/legal/${slug}/draft` }
        : {}),
    };
  }
  pageCache.set(key, page);
  return page;
}

/** The draft at `/legal/<slug>/draft`, only while a published version is in effect. */
export function legalDraftPage(slug: string): LegalPage | undefined {
  const key = `draft:${slug}`;
  if (pageCache.has(key)) return pageCache.get(key);
  const entry = legalIndex().documents.find(
    (candidate) => candidate.slug === slug,
  );
  const page =
    entry &&
    entry.group !== null &&
    entry.status === "draft" &&
    publishedFor(slug)
      ? {
          ...markdownPage(entry, `/legal/${slug}/draft`),
          inEffectPath: `/legal/${slug}`,
        }
      : undefined;
  pageCache.set(key, page);
  return page;
}

export function legalDraftSlugs(): string[] {
  return legalSlugs().filter((slug) => legalDraftPage(slug) !== undefined);
}

/* ------------------------------------------------------------------------ */
/* Hub, neighbours, search, sitemap                                         */
/* ------------------------------------------------------------------------ */

export function formatLegalDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function rowFor(page: LegalPage, description: string): LegalHubRow {
  const inEffect = page.status === "in-effect";
  const iso = inEffect ? page.effectiveDate : page.lastUpdated;
  return {
    slug: page.slug,
    href: page.path,
    title: page.title,
    description,
    status: page.status,
    version: page.version,
    dateLabel: iso
      ? `${inEffect ? "In effect since" : "Updated"} ${formatLegalDate(iso)}`
      : inEffect
        ? `In effect since ${LEGAL_EFFECTIVE_DATE}`
        : "Not yet in effect",
    ...(iso ? { dateTime: iso } : {}),
    ...(page.draftPath ? { draftHref: page.draftPath } : {}),
  };
}

/** Every document, grouped and ordered as the index lists them. */
export function legalHub(): LegalHubGroup[] {
  const index = legalIndex();
  return [...index.groups]
    .sort((a, b) => a.order - b.order)
    .map((group) => {
      const entries = index.documents
        .filter((entry) => entry.group === group.id)
        .sort((a, b) => a.order - b.order)
        .map((entry) => {
          const page = legalPage(entry.slug);
          return page ? rowFor(page, entry.description) : undefined;
        })
        .filter((row): row is LegalHubRow => row !== undefined);
      // Published documents the index does not list (the Mobile App License)
      // join the players' group after the indexed ones.
      const extra =
        group.id === "players"
          ? legalSlugs()
              .filter(
                (slug) => !index.documents.some((entry) => entry.slug === slug),
              )
              .map((slug) => legalPage(slug))
              .filter((page): page is LegalPage => page !== undefined)
              .map((page) => rowFor(page, page.description))
          : [];
      return { ...group, rows: [...entries, ...extra] };
    })
    .filter((group) => group.rows.length > 0);
}

/** Previous and next document in the same group, in hub order. */
export function legalNeighbours(slug: string): {
  readonly previous?: LegalHubRow;
  readonly next?: LegalHubRow;
} {
  for (const group of legalHub()) {
    const position = group.rows.findIndex((row) => row.slug === slug);
    if (position < 0) continue;
    const previous = group.rows[position - 1];
    const next = group.rows[position + 1];
    return { ...(previous ? { previous } : {}), ...(next ? { next } : {}) };
  }
  return {};
}

function headingEntries(page: LegalPage): LegalSearchEntry[] {
  const label = page.path.endsWith("/draft")
    ? `${page.title} (draft)`
    : page.title;
  return page.sections.flatMap((section) => [
    {
      id: `${page.path}#${section.id}`,
      kind: "heading" as const,
      title: section.title,
      documentTitle: label,
      href: `${page.path}#${section.id}`,
      status: page.status,
      haystack: `${section.title} ${page.title}`.toLowerCase(),
    },
    ...section.subsections.map((sub) => ({
      id: `${page.path}#${sub.id}`,
      kind: "heading" as const,
      title: sub.title,
      documentTitle: label,
      href: `${page.path}#${sub.id}`,
      status: page.status,
      haystack: `${sub.title} ${section.title} ${page.title}`.toLowerCase(),
    })),
  ]);
}

/** Titles, summaries and headings of every page, for the hub's search. */
export function legalSearchEntries(): LegalSearchEntry[] {
  const rows = legalHub().flatMap((group) => group.rows);
  const documents: LegalSearchEntry[] = rows.map((row) => ({
    id: row.href,
    kind: "document",
    title: row.title,
    documentTitle: row.title,
    href: row.href,
    status: row.status,
    haystack: `${row.title} ${row.description}`.toLowerCase(),
  }));
  const headings = rows.flatMap((row) => {
    const page = legalPage(row.slug);
    const draft = legalDraftPage(row.slug);
    return [
      ...(page ? headingEntries(page) : []),
      ...(draft ? headingEntries(draft) : []),
    ];
  });
  return [...documents, ...headings];
}

/** Paths a search engine may index: the hub and what is in effect. */
export function legalIndexablePaths(): string[] {
  return [
    "/legal",
    ...legalSlugs()
      .map((slug) => legalPage(slug))
      .filter((page): page is LegalPage => page?.status === "in-effect")
      .map((page) => page.path),
  ];
}

/** Every placeholder still in the 1.0 Markdown, by document, in index order. */
export function legalPlaceholderReport(): {
  readonly slug: string;
  readonly title: string;
  readonly status: LegalStatus;
  readonly placeholders: readonly LegalPlaceholder[];
}[] {
  return legalIndex().documents.map((entry) => {
    const page = markdownPage(entry, `/legal/${entry.slug}`);
    return {
      slug: entry.slug,
      title: page.title,
      status: entry.status,
      placeholders: page.placeholders,
    };
  });
}

/** Plain text of a page's summary, for metadata. */
export function legalSummaryText(page: LegalPage): string {
  const first = page.summary?.blocks.find(
    (block) => block.type === "paragraph",
  );
  return first?.type === "paragraph"
    ? inlineText(first.children)
    : page.description;
}
