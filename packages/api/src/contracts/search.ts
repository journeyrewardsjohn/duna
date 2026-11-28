/**
 * Contract: search (owner: B10). Where / when / what search over the
 * denormalised `search_documents` index, with map bounds, facets and a live
 * availability summary for the visible results. Reads go to the replica
 * (`getReadOnlyDatabase()`). Frozen by W3-0; P3 and the player search boards
 * build against `@duna/core/demo/search`. Procedures: `public.search.*`,
 * `player.search.*` (see docs/plan/w3-contracts.md).
 */
import {
  searchDocumentKinds,
  searchDocumentVisibilities,
} from "@duna/db/schema";
import { z } from "zod";
import {
  w3AmountSchema,
  w3DateSchema,
  w3DateTimeSchema,
  w3IdSchema,
  w3PageInputSchema,
} from "./w3-common";

export const searchKindSchema = z.enum(searchDocumentKinds);
export const searchVisibilitySchema = z.enum(searchDocumentVisibilities);

export const searchBoundsSchema = z
  .object({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
  })
  .refine((bounds) => bounds.north >= bounds.south, {
    message: "north must be at or above south",
  });

export const searchQueryInputSchema = w3PageInputSchema.extend({
  /** Where: map bounds, or a point and radius, or a place typed by the person. */
  where: z
    .object({
      bounds: searchBoundsSchema.optional(),
      near: z
        .object({
          latitude: z.number().min(-90).max(90),
          longitude: z.number().min(-180).max(180),
          radiusKm: z.number().positive().max(500),
        })
        .optional(),
      place: z.string().max(120).optional(),
    })
    .optional(),
  /** When: a date range in the searcher's timezone (inclusive). */
  when: z
    .object({
      from: w3DateSchema,
      to: w3DateSchema,
      timezone: z.string().min(1).max(64).optional(),
    })
    .optional(),
  /** What: kinds and facet tags (discipline, level, kind tags). */
  what: z
    .object({
      kinds: z
        .array(searchKindSchema)
        .max(searchDocumentKinds.length)
        .optional(),
      tags: z.array(z.string().min(1).max(48)).max(20).optional(),
    })
    .optional(),
  text: z.string().max(120).optional(),
});

/** Live availability for a result, computed for the visible page only. */
export const searchAvailabilityStateSchema = z.enum([
  "open",
  "few-left",
  "full",
  "not-bookable",
  "unknown",
]);

export const searchResultSchema = z.object({
  id: w3IdSchema,
  kind: searchKindSchema,
  entityId: w3IdSchema,
  title: z.string().min(1),
  subtitle: z.string().optional(),
  path: z.string().startsWith("/"),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locality: z.string().optional(),
  startsAt: w3DateTimeSchema.optional(),
  endsAt: w3DateTimeSchema.optional(),
  tags: z.array(z.string()),
  priceFrom: w3AmountSchema.optional(),
  distanceKm: z.number().nonnegative().optional(),
  availability: z.object({
    state: searchAvailabilityStateSchema,
    /** "3 courts free at 5 PM", "2 spots left". */
    summary: z.string().optional(),
    nextAvailableAt: w3DateTimeSchema.optional(),
  }),
});

export const searchFacetSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const searchResultsSchema = z.object({
  items: z.array(searchResultSchema),
  nextCursor: z.string().optional(),
  /** An estimate; never shown as an exact total. */
  totalEstimate: z.number().int().nonnegative(),
  facets: z.object({
    kinds: z.array(searchFacetSchema.extend({ value: searchKindSchema })),
    tags: z.array(searchFacetSchema),
  }),
  /** Bounds that contain every result, to fit the map. */
  resultBounds: searchBoundsSchema.optional(),
});

export const searchSuggestInputSchema = z.object({
  text: z.string().min(1).max(120),
});
export const searchSuggestionsSchema = z.object({
  places: z.array(
    z.object({
      label: z.string().min(1),
      latitude: z.number(),
      longitude: z.number(),
    }),
  ),
  results: z.array(
    searchResultSchema.pick({ id: true, kind: true, title: true, path: true }),
  ),
});

/** One index row, as B10 maintains it (admin and tests; not a public shape). */
export const searchDocumentSchema = z.object({
  id: w3IdSchema,
  kind: searchKindSchema,
  entityId: w3IdSchema,
  organizationId: w3IdSchema.optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  path: z.string().startsWith("/"),
  visibility: searchVisibilitySchema,
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  locality: z.string().optional(),
  administrativeArea: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  startsAt: w3DateTimeSchema.optional(),
  endsAt: w3DateTimeSchema.optional(),
  tags: z.array(z.string()),
  priceFrom: w3AmountSchema.optional(),
  rank: z.number().int(),
  sourceUpdatedAt: w3DateTimeSchema,
  refreshedAt: w3DateTimeSchema,
});

export type SearchQueryInput = z.infer<typeof searchQueryInputSchema>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export type SearchResults = z.infer<typeof searchResultsSchema>;
export type SearchDocument = z.infer<typeof searchDocumentSchema>;
