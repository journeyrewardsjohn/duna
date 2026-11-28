import { searchDemo } from "@duna/core/demo/search";
import {
  searchDocumentKinds,
  searchDocumentVisibilities,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { participationDemo } from "@duna/core/demo/participation";
import { SEARCH_RATE_LIMITS } from "../services/search";
import {
  searchAvailabilityStateSchema,
  searchDocumentSchema,
  searchResultsSchema,
  searchSessionSchema,
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

describe("search routers in demo mode (B10)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = (ipAddress = "203.0.113.1") =>
    createCaller(createApiContext({ actor: createDemoActor(), ipAddress }));
  const anonymous = (ipAddress = "203.0.113.2") =>
    createCaller(createApiContext({ useDemoActor: false, ipAddress }));

  it("runs the search engine over the demo fixtures", async () => {
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
    expect(none.facets).toEqual({ kinds: [], tags: [] });
    const suggestions = await api.public.search.suggest({ text: "man" });
    expect(suggestionsSchemaSafe(suggestions)).toBe(true);
    expect(suggestions.places.map((place) => place.label)).toEqual([
      expect.stringContaining("Manhattan Beach"),
    ]);
  });

  it("returns members-only rows to player.search only, hidden rows never", async () => {
    const publicIds = (
      await anonymous().public.search.query({ limit: 100 })
    ).items.map((item) => item.id);
    const playerIds = (
      await caller().player.search.query({ limit: 100 })
    ).items.map((item) => item.id);
    const members = searchDemo.documents.filter(
      (d) => d.visibility === "members",
    );
    const hidden = searchDemo.documents.filter(
      (d) => d.visibility === "hidden",
    );
    for (const document of members) {
      expect(publicIds).not.toContain(document.id);
      expect(playerIds).toContain(document.id);
    }
    for (const document of hidden) {
      expect(publicIds).not.toContain(document.id);
      expect(playerIds).not.toContain(document.id);
    }
  });

  it("pages with a cursor without repeats", async () => {
    const api = anonymous("203.0.113.3");
    const first = await api.public.search.query({ limit: 3 });
    expect(first.nextCursor).toBeDefined();
    const second = await api.public.search.query({
      limit: 3,
      cursor: first.nextCursor,
    });
    const seen = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(seen).size).toBe(seen.length);
    await expect(
      api.public.search.query({
        limit: 3,
        text: "pier",
        cursor: first.nextCursor,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("reads one session by id, and says not found for anything else", async () => {
    const api = anonymous("203.0.113.4");
    for (const quote of participationDemo.quotes) {
      const session = await api.public.search.session({ id: quote.subjectId });
      expect(searchSessionSchema.safeParse(session).success).toBe(true);
      expect(session.participation.copy.status).toBe(quote.copy.status);
    }
    await expect(
      api.public.search.session({ id: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects bad input with BAD_REQUEST", async () => {
    await expect(
      anonymous("203.0.113.5").public.search.query({
        limit: 10,
        when: { from: "2026-01-01", to: "2027-06-01" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("limits each address and says when to retry", async () => {
    const api = anonymous("198.51.100.77");
    for (let index = 0; index < SEARCH_RATE_LIMITS.query.capacity; index += 1) {
      await api.public.search.query({ limit: 1 });
    }
    const error = await api.public.search
      .query({ limit: 1 })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(
      (error as { cause?: { retryAfterSeconds?: number } }).cause,
    ).toMatchObject({ retryAfterSeconds: expect.any(Number) });
    // Another address is not affected.
    await expect(
      anonymous("198.51.100.78").public.search.query({ limit: 1 }),
    ).resolves.toBeDefined();
  });
});

function suggestionsSchemaSafe(value: unknown) {
  return searchSuggestionsSchema.safeParse(value).success;
}
