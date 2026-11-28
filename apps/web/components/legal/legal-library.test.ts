import { describe, expect, it } from "vitest";
import {
  legalDraftPage,
  legalHub,
  legalIndex,
  legalIndexablePaths,
  legalNeighbours,
  legalPage,
  legalPlaceholderReport,
  legalSearchEntries,
  legalSlugs,
  parseLegalIndex,
} from "./legal-library";

describe("the legal index", () => {
  it("gives every entry a status and a known group", () => {
    const index = legalIndex();
    expect(index.documents.length).toBeGreaterThan(10);
    for (const entry of index.documents) {
      expect(["draft", "in-effect"]).toContain(entry.status);
    }
  });

  it("rejects a missing or unknown status, an unknown group and duplicates", () => {
    const base = {
      version: "1",
      lastUpdated: "2026-11-27",
      groups: [{ id: "players", title: "Players", order: 1 }],
    };
    const doc = {
      slug: "terms",
      file: "terms.md",
      title: "Terms",
      group: "players",
      order: 1,
      description: "x",
      status: "draft",
    };
    expect(() => parseLegalIndex({ ...base, documents: [doc] })).not.toThrow();
    expect(() =>
      parseLegalIndex({ ...base, documents: [{ ...doc, status: undefined }] }),
    ).toThrow(/needs a status/);
    expect(() =>
      parseLegalIndex({ ...base, documents: [{ ...doc, status: "final" }] }),
    ).toThrow(/needs a status/);
    expect(() =>
      parseLegalIndex({ ...base, documents: [{ ...doc, group: "nobody" }] }),
    ).toThrow(/unknown group/);
    expect(() => parseLegalIndex({ ...base, documents: [doc, doc] })).toThrow(
      /listed twice/,
    );
    expect(() =>
      parseLegalIndex({ ...base, documents: [{ ...doc, slug: "../x" }] }),
    ).toThrow(/plain slug/);
  });

  it("lists every indexed document on the hub exactly once", () => {
    const hubSlugs = legalHub().flatMap((group) =>
      group.rows.map((row) => row.slug),
    );
    const indexed = legalIndex()
      .documents.filter((entry) => entry.group !== null)
      .map((entry) => entry.slug);
    expect(new Set(hubSlugs).size).toBe(hubSlugs.length);
    for (const slug of indexed) expect(hubSlugs).toContain(slug);
    expect(hubSlugs).toContain("eula");
    expect(legalSlugs().sort()).toEqual([...hubSlugs].sort());
  });
});

describe("pages", () => {
  it("keeps a published document in effect while its revision is a draft", () => {
    const terms = legalPage("terms");
    expect(terms?.source).toBe("published");
    expect(terms?.status).toBe("in-effect");
    expect(terms?.draftPath).toBe("/legal/terms/draft");
    const draft = legalDraftPage("terms");
    expect(draft?.status).toBe("draft");
    expect(draft?.inEffectPath).toBe("/legal/terms");
    expect(draft?.sections.length).toBeGreaterThan(10);
  });

  it("serves a draft with no published version at its own address", () => {
    const cookies = legalPage("cookies");
    expect(cookies?.source).toBe("markdown");
    expect(cookies?.status).toBe("draft");
    expect(legalDraftPage("cookies")).toBeUndefined();
    expect(cookies?.summary?.label).toBe("The short version");
  });

  it("has no page for an unknown slug or the hub's own entry", () => {
    expect(legalPage("nope")).toBeUndefined();
    expect(legalPage("legal-center")).toBeUndefined();
  });

  it("gives every page unique section ids", () => {
    for (const slug of legalSlugs()) {
      for (const page of [legalPage(slug), legalDraftPage(slug)]) {
        if (!page) continue;
        const ids = page.sections.flatMap((section) => [
          section.id,
          ...section.subsections.map((sub) => sub.id),
        ]);
        expect(new Set(ids).size, page.path).toBe(ids.length);
        expect(ids.length, page.path).toBeGreaterThan(0);
      }
    }
  });

  it("links neighbours within a group only", () => {
    const { previous, next } = legalNeighbours("guardians-and-youth");
    expect(previous?.slug).toBe("terms");
    expect(next?.slug).toBe("fees-and-premium");
    expect(legalNeighbours("terms").previous).toBeUndefined();
  });
});

describe("in-effect documents", () => {
  it("never have a placeholder and always have an effective date", () => {
    for (const { slug, status, placeholders } of legalPlaceholderReport()) {
      if (status !== "in-effect") continue;
      expect(
        placeholders,
        `${slug} is in effect but still has placeholders`,
      ).toEqual([]);
      expect(
        legalPage(slug)?.effectiveDate,
        `${slug} needs an effectiveDate`,
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("are the only documents search engines may index", () => {
    const paths = legalIndexablePaths();
    expect(paths).toContain("/legal");
    for (const path of paths.slice(1)) {
      const slug = path.split("/")[2] ?? "";
      expect(legalPage(slug)?.status).toBe("in-effect");
    }
    expect(paths).not.toContain("/legal/cookies");
  });
});

describe("search", () => {
  it("finds document titles and section headings", () => {
    const entries = legalSearchEntries();
    expect(
      entries.some(
        (entry) => entry.kind === "document" && entry.title === "Cookie Policy",
      ),
    ).toBe(true);
    const heading = entries.find(
      (entry) =>
        entry.kind === "heading" &&
        entry.haystack.includes("what we do not use"),
    );
    expect(heading?.href).toBe("/legal/cookies#4-what-we-do-not-use");
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
  });
});

describe("placeholders in the drafts", () => {
  it("are all found, so the page can mark each one", () => {
    const report = legalPlaceholderReport();
    const terms = report.find((doc) => doc.slug === "terms");
    expect(terms?.placeholders.map((item) => item.value)).toEqual(
      expect.arrayContaining([
        "Duna mailing address",
        "State of governing law",
        "County, State",
      ]),
    );
    // Every draft still carries "[to be set when approved]" as its date.
    expect(
      report.every((doc) =>
        doc.placeholders.some((item) => item.kind === "frontmatter"),
      ),
    ).toBe(true);
  });
});
