/**
 * Router seam: search (owner: B10). Where / when / what search over
 * `search_documents`. Shapes are frozen in ../contracts/search.ts (W3-0).
 * Reads go to the replica through `getReadOnlyDatabase()`.
 *
 * Mounted once in ../router.ts:
 *   public.search  publicProcedure (anonymous, IP rate limited): public rows only
 *   player.search  protectedProcedure: also "members" rows of the player's clubs
 *
 * Every procedure returns its fixture from @duna/core/demo/search in demo
 * mode and throws `notImplementedYet` otherwise until B10 lands the service
 * in ../services/search/. Read ./README.md first.
 */
import { searchDemo } from "@duna/core/demo/search";
import { protectedProcedure, publicProcedure, router } from "../auth";
import {
  searchQueryInputSchema,
  searchResultsSchema,
  searchSuggestInputSchema,
  searchSuggestionsSchema,
} from "../contracts/search";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "search";

/** Demo filter: kinds and text only; an unmatched query shows the empty state. */
function demoResults(input: {
  readonly what?: { readonly kinds?: readonly string[] };
  readonly text?: string;
}) {
  const kinds = input.what?.kinds;
  const text = input.text?.trim().toLowerCase();
  const items = searchDemo.results.items.filter(
    (item) =>
      (!kinds?.length || kinds.includes(item.kind)) &&
      (!text || item.title.toLowerCase().includes(text)),
  );
  if (items.length === 0) return searchDemo.emptyResults;
  return { ...searchDemo.results, items, totalEstimate: items.length };
}

export const searchPublicRouter = router({
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Results for the map and list (F-Web-Search). */
  query: publicProcedure
    .input(searchQueryInputSchema)
    .output(searchResultsSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoResults(input);
      return notImplementedYet(DOMAIN, "query");
    }),

  /** Typeahead for the Where and What pickers. */
  suggest: publicProcedure
    .input(searchSuggestInputSchema)
    .output(searchSuggestionsSchema)
    .query(() => {
      if (usesDemoData()) return searchDemo.suggestions;
      return notImplementedYet(DOMAIN, "suggest");
    }),
});

export const searchPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Same shape as public.search.query, plus members-only rows of the player's clubs. */
  query: protectedProcedure
    .input(searchQueryInputSchema)
    .output(searchResultsSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoResults(input);
      return notImplementedYet(DOMAIN, "query");
    }),
});
