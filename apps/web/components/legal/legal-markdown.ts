/**
 * The Markdown the legal drafts in `apps/web/content/legal/*.md` use, parsed
 * at build time into a small document model the legal center renders.
 *
 * It is deliberately narrow (front matter, `#`/`##`/`###` headings,
 * paragraphs, `-` and `1.` lists, pipe tables, block quotes, bold, italic,
 * code, links and autolinks) and it never emits HTML, so nothing in a draft
 * can inject markup. The one legal-specific rule: a bracketed field that is
 * not a link (`[Duna mailing address]`, `[Counsel: …]`), and the words TODO
 * and TBD, become `placeholder` nodes. The page marks each one "to be
 * confirmed", so an unfinished field never reads as final text.
 */

export type PlaceholderKind = "field" | "note" | "todo";

export type LegalInline =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "strong"; readonly children: readonly LegalInline[] }
  | { readonly type: "emphasis"; readonly children: readonly LegalInline[] }
  | { readonly type: "code"; readonly value: string }
  | {
      readonly type: "link";
      readonly href: string;
      readonly external: boolean;
      readonly children: readonly LegalInline[];
    }
  | {
      readonly type: "placeholder";
      readonly kind: PlaceholderKind;
      readonly value: string;
    };

export type LegalBlock =
  | { readonly type: "paragraph"; readonly children: readonly LegalInline[] }
  | {
      readonly type: "list";
      readonly ordered: boolean;
      readonly items: readonly (readonly LegalInline[])[];
    }
  | {
      readonly type: "table";
      readonly label: string;
      readonly head: readonly (readonly LegalInline[])[];
      readonly rows: readonly (readonly (readonly LegalInline[])[])[];
    }
  | {
      readonly type: "subheading";
      readonly id: string;
      readonly title: string;
      readonly children: readonly LegalInline[];
    }
  /** A drafting note to the owner or counsel; never part of the legal text. */
  | { readonly type: "review-note"; readonly children: readonly LegalBlock[] }
  | { readonly type: "quote"; readonly children: readonly LegalBlock[] };

export interface LegalSummary {
  readonly label: string;
  /** "This summary does not replace the terms below", when the draft says so. */
  readonly caveat?: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalSection {
  readonly id: string;
  readonly title: string;
  readonly children: readonly LegalInline[];
  readonly blocks: readonly LegalBlock[];
  /** `###` headings inside the section, for the section list. */
  readonly subsections: readonly {
    readonly id: string;
    readonly title: string;
  }[];
}

export interface ParsedLegalMarkdown {
  readonly frontmatter: Readonly<Record<string, string>>;
  readonly title: string;
  readonly summary?: LegalSummary;
  /** Blocks between the title and the first section. */
  readonly preamble: readonly LegalBlock[];
  readonly sections: readonly LegalSection[];
  /** True when the draft carries its own "Draft … Not in effect" banner. */
  readonly hasDraftBanner: boolean;
}

/* ------------------------------------------------------------------------ */
/* Front matter                                                             */
/* ------------------------------------------------------------------------ */

export function parseFrontmatter(raw: string): {
  readonly data: Readonly<Record<string, string>>;
  readonly body: string;
} {
  const text = raw.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: text };
  const data: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const pair = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/);
    if (!pair) continue;
    let value = (pair[2] ?? "").trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1).replaceAll('\\"', '"');
    }
    data[pair[1] ?? ""] = value;
  }
  return { data, body: text.slice(match[0].length) };
}

/* ------------------------------------------------------------------------ */
/* Inline                                                                   */
/* ------------------------------------------------------------------------ */

const notePrefix = /^(?:counsel|owner|engineering gap|note)\b/i;

export function placeholderKind(value: string): PlaceholderKind {
  if (/^(?:TODO|TBD)$/.test(value)) return "todo";
  // "[Counsel: …]", "[Owner: …]" and any bracket that explains itself
  // ("[Confirm legal entity name: …]") are notes; the rest are fields.
  return notePrefix.test(value.trim()) || /:\s/.test(value) ? "note" : "field";
}

function safeHref(value: string): { href: string; external: boolean } | null {
  const href = value.trim();
  if (/^\/(?!\/)/.test(href) || href.startsWith("#")) {
    return { href, external: false };
  }
  if (/^mailto:[^\s]+$/i.test(href)) return { href, external: false };
  try {
    const url = new URL(href);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return { href: url.toString(), external: true };
    }
  } catch {
    return null;
  }
  return null;
}

/** Closing `]` for the `[` at `start`, allowing nested brackets. */
function closingBracket(value: string, start: number): number {
  let depth = 0;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "[") depth += 1;
    if (char === "]") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

const emailPattern =
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const todoPattern = /\b(?:TODO|TBD)\b/g;

/** Turns bare emails into mail links and TODO / TBD into placeholders. */
function decorateText(value: string): LegalInline[] {
  const out: LegalInline[] = [];
  const pattern = new RegExp(
    `${emailPattern.source}|${todoPattern.source}`,
    "g",
  );
  let last = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    let token = match[0];
    // A sentence-ending period is not part of an address.
    while (token.endsWith(".")) token = token.slice(0, -1);
    if (index > last)
      out.push({ type: "text", value: value.slice(last, index) });
    if (token === "TODO" || token === "TBD") {
      out.push({ type: "placeholder", kind: "todo", value: token });
    } else {
      out.push({
        type: "link",
        href: `mailto:${token}`,
        external: false,
        children: [{ type: "text", value: token }],
      });
    }
    last = index + token.length;
  }
  if (last < value.length) out.push({ type: "text", value: value.slice(last) });
  return out;
}

export function parseInline(value: string): LegalInline[] {
  const nodes: LegalInline[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    nodes.push(...decorateText(buffer));
    buffer = "";
  };

  for (let index = 0; index < value.length;) {
    const char = value[index];

    if (char === "\\" && index + 1 < value.length) {
      buffer += value[index + 1];
      index += 2;
      continue;
    }

    if (char === "`") {
      const end = value.indexOf("`", index + 1);
      if (end > index + 1) {
        flush();
        nodes.push({ type: "code", value: value.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }

    if (char === "<") {
      const auto = value
        .slice(index)
        .match(/^<((?:https?:\/\/|mailto:)[^>\s]+)>/i);
      const safe = auto ? safeHref(auto[1] ?? "") : null;
      if (auto && safe) {
        flush();
        const label = (auto[1] ?? "").replace(/^mailto:/i, "");
        nodes.push({
          type: "link",
          ...safe,
          children: [{ type: "text", value: label }],
        });
        index += auto[0].length;
        continue;
      }
    }

    if (char === "[") {
      const end = closingBracket(value, index);
      if (end > index) {
        const inner = value.slice(index + 1, end);
        if (value[end + 1] === "(") {
          const close = value.indexOf(")", end + 2);
          const target =
            close > end + 1 ? safeHref(value.slice(end + 2, close)) : null;
          if (target) {
            flush();
            nodes.push({
              type: "link",
              ...target,
              children: parseInline(inner),
            });
            index = close + 1;
            continue;
          }
        } else if (inner.trim()) {
          flush();
          const text = inner
            .replace(/\\(.)/g, "$1")
            .replace(/\s+/g, " ")
            .trim();
          nodes.push({
            type: "placeholder",
            kind: placeholderKind(text),
            value: text,
          });
          index = end + 1;
          continue;
        }
      }
    }

    if (char === "*" || char === "_") {
      const doubled = value[index + 1] === char;
      const delimiter = doubled ? `${char}${char}` : char;
      const previous = value[index - 1] ?? " ";
      const next = value[index + delimiter.length] ?? " ";
      // Intra-word underscores stay literal (snake_case, file names).
      const opens =
        !/\s/.test(next) && (char === "*" || !/[A-Za-z0-9]/.test(previous));
      const end = opens
        ? value.indexOf(delimiter, index + delimiter.length)
        : -1;
      if (end > index + delimiter.length) {
        flush();
        const children = parseInline(
          value.slice(index + delimiter.length, end),
        );
        nodes.push(
          doubled
            ? { type: "strong", children }
            : { type: "emphasis", children },
        );
        index = end + delimiter.length;
        continue;
      }
    }

    buffer += char;
    index += 1;
  }
  flush();
  return nodes;
}

export function inlineText(nodes: readonly LegalInline[]): string {
  return nodes
    .map((node) => {
      switch (node.type) {
        case "text":
        case "code":
        case "placeholder":
          return node.value;
        default:
          return inlineText(node.children);
      }
    })
    .join("");
}

/* ------------------------------------------------------------------------ */
/* Blocks                                                                   */
/* ------------------------------------------------------------------------ */

/** The same ids the published legal pages already used, so old links still land. */
export function slugifyHeading(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "section"
  );
}

const listItem = /^(?:[-+*]|\d+[.)])\s+/;

function isBlockStart(line: string) {
  return (
    /^#{1,6}\s+/.test(line) ||
    /^>/.test(line) ||
    /^\|/.test(line) ||
    listItem.test(line) ||
    /^([-*_])(?:\s*\1){2,}\s*$/.test(line)
  );
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index];
    if (char === "\\" && row[index + 1] === "|") {
      cell += "|";
      index += 1;
      continue;
    }
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function isTableDivider(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line.trim());
}

interface BlockContext {
  readonly ids: Map<string, number>;
}

function uniqueId(context: BlockContext, text: string) {
  const base = slugifyHeading(text);
  const seen = context.ids.get(base) ?? 0;
  context.ids.set(base, seen + 1);
  return seen === 0 ? base : `${base}-${seen + 1}`;
}

/** Parses block-level Markdown (no `#`/`##`; those split sections first). */
function parseBlocks(
  lines: readonly string[],
  context: BlockContext,
): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let index = 0;
  let lastBoldLabel: string | undefined;

  while (index < lines.length) {
    const line = (lines[index] ?? "").trim();
    if (!line) {
      index += 1;
      continue;
    }

    const heading = line.match(/^#{3,6}\s+(.+)$/);
    if (heading) {
      const children = parseInline(heading[1] ?? "");
      const title = inlineText(children);
      blocks.push({
        type: "subheading",
        id: uniqueId(context, title),
        title,
        children,
      });
      lastBoldLabel = undefined;
      index += 1;
      continue;
    }

    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      index += 1;
      continue;
    }

    if (line.startsWith(">")) {
      const inner: string[] = [];
      while (
        index < lines.length &&
        (lines[index] ?? "").trim().startsWith(">")
      ) {
        inner.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      const children = parseBlocks(inner, context);
      const text = inner.join(" ");
      blocks.push(
        /counsel|owner|not part of the published/i.test(text)
          ? { type: "review-note", children }
          : { type: "quote", children },
      );
      lastBoldLabel = undefined;
      continue;
    }

    if (line.startsWith("|") && isTableDivider(lines[index + 1] ?? "")) {
      const head = splitRow(line).map(parseInline);
      index += 2;
      const rows: LegalInline[][][] = [];
      while (
        index < lines.length &&
        (lines[index] ?? "").trim().startsWith("|")
      ) {
        rows.push(splitRow(lines[index] ?? "").map(parseInline));
        index += 1;
      }
      blocks.push({
        type: "table",
        label: lastBoldLabel ?? head.map(inlineText).join(", "),
        head,
        rows,
      });
      lastBoldLabel = undefined;
      continue;
    }

    if (listItem.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line);
      const items: LegalInline[][] = [];
      while (index < lines.length) {
        const current = (lines[index] ?? "").trim();
        if (!current) {
          // A blank line ends the list unless the next line is another item.
          const next = (lines[index + 1] ?? "").trim();
          if (listItem.test(next) && /^\d+[.)]\s+/.test(next) === ordered) {
            index += 1;
            continue;
          }
          break;
        }
        if (listItem.test(current)) {
          if (/^\d+[.)]\s+/.test(current) !== ordered) break;
          items.push([...parseInline(current.replace(listItem, ""))]);
          index += 1;
          continue;
        }
        if (isBlockStart(current)) break;
        // A continuation line belongs to the previous item.
        const last = items.pop() ?? [];
        items.push([
          ...last,
          { type: "text", value: " " },
          ...parseInline(current),
        ]);
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      lastBoldLabel = undefined;
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = (lines[index] ?? "").trim();
      if (!current || (paragraph.length > 0 && isBlockStart(current))) break;
      paragraph.push(current);
      index += 1;
    }
    const children = parseInline(paragraph.join(" "));
    // "**Label.**" or "6.2 **Label.**" just before a table names it.
    const last = children.at(-1);
    const lead =
      children.length === 2 && children[0]?.type === "text"
        ? children[0].value
        : "";
    lastBoldLabel =
      last?.type === "strong" &&
      (children.length === 1 || /^\s*[\dA-Z.]+\s*$/.test(lead))
        ? inlineText(last.children).replace(/[.:]$/, "")
        : undefined;
    blocks.push({ type: "paragraph", children });
  }
  return blocks;
}

const summaryLabel = /^\*\*(The short version)\*\*\s*(?:\(([^)]*)\))?\s*$/i;
const draftBanner = /^\*\*Draft\b[^*]*not in effect\.?\*\*\s*/i;

function sentence(value: string) {
  const text = value.trim();
  if (!text) return text;
  const capital = text[0]?.toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

export function parseLegalMarkdown(raw: string): ParsedLegalMarkdown {
  const { data, body } = parseFrontmatter(raw);
  const lines = body.split("\n");
  const context: BlockContext = { ids: new Map() };

  let title = data.title ?? "";
  let summary: LegalSummary | undefined;
  let hasDraftBanner = false;
  const preambleLines: string[] = [];
  const reviewNotes: LegalBlock[] = [];
  const sections: {
    title: string;
    children: LegalInline[];
    id: string;
    lines: string[];
  }[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const h1 = trimmed.match(/^#\s+(.+)$/);
    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h1) {
      title = inlineText(parseInline(h1[1] ?? ""));
      index += 1;
      continue;
    }
    if (h2) {
      const children = parseInline(h2[1] ?? "");
      const text = inlineText(children);
      sections.push({
        title: text,
        children,
        id: uniqueId(context, text),
        lines: [],
      });
      index += 1;
      continue;
    }
    if (sections.length === 0 && trimmed.startsWith(">")) {
      // The banner and the summary live in block quotes before section one.
      const quote: string[] = [];
      while (
        index < lines.length &&
        (lines[index] ?? "").trim().startsWith(">")
      ) {
        quote.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      const first = (quote[0] ?? "").trim();
      const banner = first.match(draftBanner);
      if (banner) {
        // The status comes from the index; any words after the banner are a
        // note to reviewers and read as one.
        hasDraftBanner = true;
        const rest = [first.slice(banner[0].length), ...quote.slice(1)]
          .join("\n")
          .trim();
        if (rest) {
          reviewNotes.push({
            type: "review-note",
            children: parseBlocks(rest.split("\n"), context),
          });
        }
        continue;
      }
      const label = first.match(summaryLabel);
      if (label && !summary) {
        summary = {
          label: label[1] ?? "The short version",
          ...(label[2] ? { caveat: sentence(label[2]) } : {}),
          blocks: parseBlocks(quote.slice(1), context),
        };
        continue;
      }
      preambleLines.push(...quote.map((q) => `> ${q}`), "");
      continue;
    }
    (sections.at(-1)?.lines ?? preambleLines).push(line);
    index += 1;
  }

  return {
    frontmatter: data,
    title,
    ...(summary ? { summary } : {}),
    preamble: [...reviewNotes, ...parseBlocks(preambleLines, context)],
    sections: sections.map((section) => {
      const blocks = parseBlocks(section.lines, context);
      return {
        id: section.id,
        title: section.title,
        children: section.children,
        blocks,
        subsections: blocks.flatMap((block) =>
          block.type === "subheading"
            ? [{ id: block.id, title: block.title }]
            : [],
        ),
      };
    }),
    hasDraftBanner,
  };
}

/* ------------------------------------------------------------------------ */
/* Placeholders                                                             */
/* ------------------------------------------------------------------------ */

export interface LegalPlaceholder {
  readonly kind: PlaceholderKind | "review-note" | "frontmatter";
  readonly value: string;
  /** Where it is: "Front matter", "Summary", "Introduction" or a section title. */
  readonly location: string;
}

function inlinePlaceholders(
  nodes: readonly LegalInline[],
): { kind: PlaceholderKind; value: string }[] {
  return nodes.flatMap((node) => {
    switch (node.type) {
      case "placeholder":
        return [{ kind: node.kind, value: node.value }];
      case "strong":
      case "emphasis":
      case "link":
        return inlinePlaceholders(node.children);
      default:
        return [];
    }
  });
}

function blockPlaceholders(
  blocks: readonly LegalBlock[],
  location: string,
): LegalPlaceholder[] {
  return blocks.flatMap((block): LegalPlaceholder[] => {
    switch (block.type) {
      case "paragraph":
      case "subheading":
        return inlinePlaceholders(block.children).map((p) => ({
          ...p,
          location,
        }));
      case "list":
        return block.items.flatMap((item) =>
          inlinePlaceholders(item).map((p) => ({ ...p, location })),
        );
      case "table":
        return [...block.head, ...block.rows.flat()].flatMap((cell) =>
          inlinePlaceholders(cell).map((p) => ({ ...p, location })),
        );
      case "review-note": {
        const text = block.children
          .map((child) =>
            child.type === "paragraph" ? inlineText(child.children) : "",
          )
          .join(" ")
          .trim();
        return [
          {
            kind: "review-note",
            value: text.length > 140 ? `${text.slice(0, 137)}…` : text,
            location,
          },
        ];
      }
      case "quote":
        return blockPlaceholders(block.children, location);
    }
  });
}

/**
 * Every unresolved field in a parsed draft: bracketed fields, drafting notes,
 * TODO / TBD, front-matter values that are still bracketed, and review-note
 * block quotes. An in-effect document must have none.
 */
export function scanPlaceholders(doc: ParsedLegalMarkdown): LegalPlaceholder[] {
  const found: LegalPlaceholder[] = [];
  for (const [key, value] of Object.entries(doc.frontmatter)) {
    if (/\[[^\]]+\]|\bTODO\b|\bTBD\b/.test(value)) {
      found.push({
        kind: "frontmatter",
        value: `${key}: ${value}`,
        location: "Front matter",
      });
    }
  }
  if (doc.summary)
    found.push(...blockPlaceholders(doc.summary.blocks, "Summary"));
  found.push(...blockPlaceholders(doc.preamble, "Introduction"));
  for (const section of doc.sections) {
    found.push(
      ...inlinePlaceholders(section.children).map((p) => ({
        ...p,
        location: section.title,
      })),
      ...blockPlaceholders(section.blocks, section.title),
    );
  }
  return found;
}

/** A bracketed front-matter value ("[to be set when approved]") is a placeholder. */
export function frontmatterPlaceholder(
  value: string | undefined,
): string | undefined {
  const match = value?.match(/^\[([^\]]+)\]$/);
  return match?.[1];
}
