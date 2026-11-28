/**
 * Router: search (owner: B10). Where / when / what search, typeahead and one
 * session by id. Shapes are in ../contracts/search.ts; the service is
 * ../services/search/. Reads go to the replica (`getReadOnlyDatabase()`).
 *
 * Mounted once in ../router.ts:
 *   public.search  publicProcedure: public rows only; per-address budgets
 *   player.search  protectedProcedure: also members-only sessions of the
 *                  player's clubs
 *
 * Demo mode runs the same engine over @duna/core/demo/search.
 */
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../auth";
import type { ApiContext } from "../context";
import {
  searchQueryInputSchema,
  searchResultsSchema,
  searchSessionInputSchema,
  searchSessionSchema,
  searchSuggestInputSchema,
  searchSuggestionsSchema,
} from "../contracts/search";
import {
  SearchCursorError,
  SearchInputError,
  SearchNotFoundError,
  SearchRateLimitError,
  searchQuery,
  searchSession,
  searchSuggest,
} from "../services/search";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "search";

function caller(ctx: ApiContext) {
  return {
    personId: ctx.actor?.personId,
    ipAddress: ctx.ipAddress,
    now: ctx.now,
  };
}

/** Domain errors as tRPC codes; anything else is unexpected and reported. */
async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SearchRateLimitError) {
      // `cause.retryAfterSeconds` is what a route sends as Retry-After.
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: error.message,
        cause: error,
      });
    }
    if (
      error instanceof SearchInputError ||
      error instanceof SearchCursorError
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error.message,
        cause: error,
      });
    }
    if (error instanceof SearchNotFoundError) {
      throw new TRPCError({ code: "NOT_FOUND", message: error.message });
    }
    throw error;
  }
}

export const searchPublicRouter = router({
  status: publicProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Results for the map and list (Player Find, the site's search). */
  query: publicProcedure
    .input(searchQueryInputSchema)
    .output(searchResultsSchema)
    .query(({ ctx, input }) =>
      guarded(() =>
        searchQuery(input, {
          ...caller(ctx),
          personId: undefined,
          includeMembers: false,
        }),
      ),
    ),

  /** Typeahead for the Where and What pickers. */
  suggest: publicProcedure
    .input(searchSuggestInputSchema)
    .output(searchSuggestionsSchema)
    .query(({ ctx, input }) =>
      guarded(() => searchSuggest(input, caller(ctx))),
    ),

  /**
   * One bookable session (the detail screen, `duna://sessions/:id`). A
   * signed-in caller may also see members-only and private sessions they
   * belong to; anyone else gets NOT_FOUND, never FORBIDDEN.
   */
  session: publicProcedure
    .input(searchSessionInputSchema)
    .output(searchSessionSchema)
    .query(({ ctx, input }) =>
      guarded(() => searchSession(input, caller(ctx))),
    ),
});

export const searchPlayerRouter = router({
  status: protectedProcedure
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Same shape as public.search.query, plus members-only sessions of the player's clubs. */
  query: protectedProcedure
    .input(searchQueryInputSchema)
    .output(searchResultsSchema)
    .query(({ ctx, input }) =>
      guarded(() =>
        searchQuery(input, { ...caller(ctx), includeMembers: true }),
      ),
    ),
});
