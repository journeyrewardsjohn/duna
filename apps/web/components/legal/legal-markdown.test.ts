import { describe, expect, it } from "vitest";
import {
  inlineText,
  parseFrontmatter,
  parseInline,
  parseLegalMarkdown,
  placeholderKind,
  scanPlaceholders,
  slugifyHeading,
} from "./legal-markdown";

const sample = `---
title: "Sample Terms"
slug: "sample"
version: "1.0-draft"
effectiveDate: "[to be set when approved]"
lastUpdated: "2026-11-27"
---

# Sample Terms

> **Draft for attorney review. Not in effect.**

> **The short version** (this summary does not replace the terms below)
>
> - You see the price before you pay.
> - Write to legal@duna.coach.

## 1. About these terms

1.1 These Terms are with Beach Elite LLC. [Confirm legal entity name: Beach Elite LLC is the name used today.] Our address is [Duna mailing address].

1.2 See the [Privacy Policy](/legal/privacy) and <https://stripe.com/privacy>. Fees above $[amount] apply. TODO later.

- one item
  that continues
- [Cookie Policy](/legal/cookies)

> **Counsel to choose Alternative A or Alternative B.** No arbitration today.

### Alternative A: arbitration

**Strictly necessary cookies.**

| Name | Purpose |
| --- | --- |
| \`wos-session\` | Keeps you signed in |
| \`a|b\` | Pipe in code |

## 1. About these terms
Duplicate heading.
`;

describe("parseFrontmatter", () => {
  it("reads quoted values and leaves the body", () => {
    const { data, body } = parseFrontmatter(sample);
    expect(data.title).toBe("Sample Terms");
    expect(data.effectiveDate).toBe("[to be set when approved]");
    expect(body.startsWith("\n# Sample Terms")).toBe(true);
  });

  it("returns the whole text when there is no front matter", () => {
    expect(parseFrontmatter("# Hi").body).toBe("# Hi");
  });
});

describe("parseInline", () => {
  it("keeps relative, external and mail links and nothing else", () => {
    const nodes = parseInline(
      "[A](/legal/a) [B](https://example.com/x) [C](javascript:alert(1)) <mailto:x@y.co>",
    );
    const links = nodes.filter((node) => node.type === "link");
    expect(links.map((link) => link.type === "link" && link.href)).toEqual([
      "/legal/a",
      "https://example.com/x",
      "mailto:x@y.co",
    ]);
    // The unsafe link stays inert text.
    expect(inlineText(nodes)).toContain("[C](javascript:alert(1))");
  });

  it("turns bracketed fields, TODO and TBD into placeholders", () => {
    const nodes = parseInline(
      "Address: [Duna mailing address]. Fee $[amount]. TBD.",
    );
    expect(
      nodes
        .filter((node) => node.type === "placeholder")
        .map((node) => node.type === "placeholder" && node.value),
    ).toEqual(["Duna mailing address", "amount", "TBD"]);
  });

  it("parses bold, italic and code, and leaves snake_case alone", () => {
    const nodes = parseInline(
      "**Bold** and *it* and `wos-session` and duna_ai_key",
    );
    expect(nodes[0]).toMatchObject({ type: "strong" });
    expect(nodes.some((node) => node.type === "emphasis")).toBe(true);
    expect(
      nodes.some(
        (node) => node.type === "code" && node.value === "wos-session",
      ),
    ).toBe(true);
    expect(inlineText(nodes)).toContain("duna_ai_key");
  });

  it("links bare email addresses without the sentence's full stop", () => {
    const nodes = parseInline("Email legal@duna.coach.");
    expect(nodes[1]).toMatchObject({
      type: "link",
      href: "mailto:legal@duna.coach",
    });
    expect(inlineText(nodes)).toBe("Email legal@duna.coach.");
  });
});

describe("placeholderKind", () => {
  it("separates drafting notes from fields", () => {
    expect(placeholderKind("Counsel: confirm")).toBe("note");
    expect(placeholderKind("Engineering gap: not built")).toBe("note");
    expect(placeholderKind("Duna mailing address")).toBe("field");
    expect(placeholderKind("TODO")).toBe("todo");
  });
});

describe("parseLegalMarkdown", () => {
  const doc = parseLegalMarkdown(sample);

  it("finds the title, the draft banner and the summary", () => {
    expect(doc.title).toBe("Sample Terms");
    expect(doc.hasDraftBanner).toBe(true);
    expect(doc.summary?.label).toBe("The short version");
    expect(doc.summary?.caveat).toBe(
      "This summary does not replace the terms below.",
    );
    expect(doc.summary?.blocks[0]).toMatchObject({ type: "list" });
  });

  it("splits sections with unique, stable ids", () => {
    expect(doc.sections.map((section) => section.id)).toEqual([
      "1-about-these-terms",
      "1-about-these-terms-2",
    ]);
    expect(doc.sections[0]?.subsections).toEqual([
      { id: "alternative-a-arbitration", title: "Alternative A: arbitration" },
    ]);
  });

  it("parses lists with continuation lines, review notes and tables", () => {
    const blocks = doc.sections[0]?.blocks ?? [];
    const list = blocks.find((block) => block.type === "list");
    expect(list?.type === "list" && inlineText(list.items[0] ?? [])).toBe(
      "one item that continues",
    );
    expect(blocks.some((block) => block.type === "review-note")).toBe(true);
    const table = blocks.find((block) => block.type === "table");
    expect(table?.type === "table" && table.label).toBe(
      "Strictly necessary cookies",
    );
    expect(table?.type === "table" && table.rows.length).toBe(2);
    expect(
      table?.type === "table" && inlineText(table.rows[1]?.[0] ?? []),
    ).toBe("a|b");
  });

  it("matches the ids the published pages already used", () => {
    expect(
      slugifyHeading("14. Suspension, termination, and account deletion"),
    ).toBe("14-suspension-termination-and-account-deletion");
  });
});

describe("scanPlaceholders", () => {
  it("lists every unresolved field with where it is", () => {
    const found = scanPlaceholders(parseLegalMarkdown(sample));
    expect(found.map((item) => [item.kind, item.value, item.location])).toEqual(
      [
        [
          "frontmatter",
          "effectiveDate: [to be set when approved]",
          "Front matter",
        ],
        [
          "note",
          "Confirm legal entity name: Beach Elite LLC is the name used today.",
          "1. About these terms",
        ],
        ["field", "Duna mailing address", "1. About these terms"],
        ["field", "amount", "1. About these terms"],
        ["todo", "TODO", "1. About these terms"],
        [
          "review-note",
          "Counsel to choose Alternative A or Alternative B. No arbitration today.",
          "1. About these terms",
        ],
      ],
    );
  });

  it("finds nothing in finished text", () => {
    expect(
      scanPlaceholders(parseLegalMarkdown("# Done\n\n## 1. One\n\nAll set.")),
    ).toEqual([]);
  });
});

describe("the draft banner", () => {
  it("is dropped, and words after it become a review note", () => {
    const doc = parseLegalMarkdown(
      "# T\n\n> **Draft for attorney review. Not in effect.** Providers are named here on purpose.\n\n## 1. One\n\nText.",
    );
    expect(doc.hasDraftBanner).toBe(true);
    expect(doc.preamble).toEqual([
      {
        type: "review-note",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", value: "Providers are named here on purpose." },
            ],
          },
        ],
      },
    ]);
  });
});
