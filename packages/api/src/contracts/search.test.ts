import { searchDemo } from "@duna/core/demo/search";
import {
  searchDocumentKinds,
  searchDocumentVisibilities,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  searchAvailabilityStateSchema,
  searchDocumentSchema,
  searchResultsSchema,
  searchSuggestionsSchema,
} from "./search";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("search contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    for (const document of searchDemo.documents)
      searchDocumentSchema.parse(document);
    searchResultsSchema.parse(searchDemo.results);
    searchResultsSchema.parse(searchDemo.emptyResults);
    searchSuggestionsSchema.parse(searchDemo.suggestions);
  });

  it("covers every kind, visibility and availability state", () => {
    expectCoverage(
      searchDocumentKinds,
      searchDemo.documents.map((d) => d.kind),
    );
    expectCoverage(
      searchDocumentVisibilities,
      searchDemo.documents.map((d) => d.visibility),
    );
    expectCoverage(
      searchAvailabilityStateSchema.options,
      searchDemo.results.items.map((r) => r.availability.state),
    );
  });

  it("never returns a hidden or members-only row from the public results", () => {
    const publicIds = new Set(
      searchDemo.documents
        .filter((d) => d.visibility === "public")
        .map((d) => d.id),
    );
    for (const item of searchDemo.results.items)
      expect(publicIds.has(item.id)).toBe(true);
  });
});

describe("search routers in demo mode and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("serves fixtures in demo mode", async () => {
    const api = caller();
    const results = await api.public.search.query({
      limit: 25,
      what: { kinds: ["event", "lesson"] },
    });
    expect(results.items.map((i) => i.kind).sort()).toEqual([
      "event",
      "lesson",
    ]);
    const none = await api.player.search.query({ limit: 25, text: "zzzz" });
    expect(none.items).toHaveLength(0);
    await expect(
      api.public.search.suggest({ text: "man" }),
    ).resolves.toBeDefined();
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .public.search.query({ limit: 25 })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
