import "server-only";

import type {
  CourtBookingInventory,
  DiscoveryMapItem,
  VenueSummary,
} from "@duna/api";
import { log } from "@duna/observability";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { type DayGroup, type ResultRow, searchDiscover } from "./results";
import { DEFAULT_DISCOVER_STATE } from "./search-state";

export interface VenueConditionsHour {
  readonly at: number;
  readonly temperatureC?: number;
  readonly windSpeedKph?: number;
  readonly windGustKph?: number;
  readonly windFromDeg?: number;
  readonly precipChancePct?: number;
  readonly uvIndex?: number;
}

export interface VenuePageData {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly region: string;
  readonly timezone: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly address?: string;
  readonly googlePlaceId?: string;
  readonly description?: string;
  readonly imageUrl?: string;
  readonly courtCount: number;
  readonly openNow?: boolean;
  readonly tags: readonly string[];
  readonly amenities: readonly string[];
  readonly inventory?: CourtBookingInventory;
  readonly summary?: VenueSummary;
  readonly club?: { readonly name: string; readonly href?: string };
  /** This week at the venue, by day, in the shared words. */
  readonly week: readonly DayGroup[];
  readonly coaches: readonly ResultRow[];
  /** Feed items for structured data (events here as `SportsEvent`). */
  readonly events: readonly DiscoveryMapItem[];
  readonly conditions: {
    readonly status: "ready" | "no-data" | "not-configured";
    readonly hour?: VenueConditionsHour;
    readonly attribution?: string;
  };
}

/** How close an item must be to count as "at this venue". */
const AT_VENUE_MILES = 1;

async function readConditions(
  venueId: string,
): Promise<VenuePageData["conditions"]> {
  try {
    const caller = await getServerCaller();
    const forecast = await caller.public.conditions.forecast({
      place: { venueId },
      hours: 2,
    });
    if (forecast.source === "provider-not-configured") {
      return { status: "not-configured" };
    }
    const hour = forecast.hours[0];
    if (!hour) return { status: "no-data" };
    return {
      status: "ready",
      hour: {
        at: Date.parse(hour.hourStartsAt),
        ...(hour.temperatureC !== undefined
          ? { temperatureC: hour.temperatureC }
          : {}),
        ...(hour.windSpeedKph !== undefined
          ? { windSpeedKph: hour.windSpeedKph }
          : {}),
        ...(hour.windGustKph !== undefined
          ? { windGustKph: hour.windGustKph }
          : {}),
        ...(hour.windDirectionDeg !== undefined
          ? { windFromDeg: hour.windDirectionDeg }
          : {}),
        ...(hour.precipitationProbability !== undefined
          ? { precipChancePct: hour.precipitationProbability }
          : {}),
        ...(hour.uvIndex !== undefined ? { uvIndex: hour.uvIndex } : {}),
      },
      ...(forecast.attribution ? { attribution: forecast.attribution } : {}),
    };
  } catch (error) {
    // The conditions service is still a seam outside demo mode: no weather,
    // said honestly on the page.
    log.info("web.venue.conditions_unavailable", {
      error: error instanceof Error ? error.name : "unknown",
    });
    return { status: "no-data" };
  }
}

/**
 * Everything a venue page shows, from the procedures the old pages called
 * (`public.courtBookingInventory`, `public.venues`) plus the discovery feed
 * for what is on this week and the club that runs it. Undefined when the
 * venue is neither bookable nor listed.
 */
export const loadVenuePage = cache(
  async (
    venueId: string,
    /** Where other venues link: `/venues` or `/app/venues`. */
    venuesPath: string,
  ): Promise<VenuePageData | undefined> => {
    const venueHref = (id: string) => `${venuesPath}/${id}`;
    const caller = await getServerCaller();
    const [inventory, venues, feed, conditions] = await Promise.all([
      caller.public.courtBookingInventory({ venueId }).catch(() => undefined),
      caller.public.venues().catch(() => [] as VenueSummary[]),
      caller.public.discoveryMap().catch(() => undefined),
      readConditions(venueId),
    ]);
    const summary = venues.find((venue) => venue.id === venueId);
    if (!inventory && !summary) return undefined;
    const base = inventory?.venue;
    const latitude = base?.latitude ?? summary?.latitude;
    const longitude = base?.longitude ?? summary?.longitude;
    const name = base?.name ?? summary!.name;
    const organizationId = base?.organizationId ?? summary?.organizationId;
    const items = feed?.items ?? [];
    const clubItem = items.find(
      (item) =>
        item.entityType === "organization" &&
        item.organizationId === organizationId,
    );
    const club = base
      ? {
          name: base.organizationName,
          href: `/clubs/${base.organizationSlug}`,
        }
      : clubItem
        ? { name: clubItem.title, href: clubItem.href }
        : undefined;

    let week: readonly DayGroup[] = [];
    let coaches: readonly ResultRow[] = [];
    let events: DiscoveryMapItem[] = [];
    if (latitude !== undefined && longitude !== undefined) {
      const results = searchDiscover(
        items,
        venues,
        {
          ...DEFAULT_DISCOVER_STATE,
          where: {
            kind: "place",
            label: name,
            latitude,
            longitude,
            venueId,
          },
          when: { kind: "preset", preset: "week" },
          radius: AT_VENUE_MILES,
        },
        { now: new Date(), venueHref },
      );
      week = results.days;
      coaches = results.places.filter((row) => row.kind === "coach");
      const ids = new Set(
        results.days.flatMap((day) => day.rows.map((row) => row.id)),
      );
      events = items.filter((item) => ids.has(item.id));
    }

    return {
      id: venueId,
      name,
      city: base?.city ?? summary!.city,
      region: base?.region ?? summary!.region,
      timezone: base?.timezone ?? summary!.timezone,
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
      ...(base?.address ? { address: base.address } : {}),
      ...(base?.googlePlaceId ? { googlePlaceId: base.googlePlaceId } : {}),
      ...(base?.description ? { description: base.description } : {}),
      ...((base?.heroImageUrl ?? summary?.imageUrl)
        ? { imageUrl: base?.heroImageUrl ?? summary?.imageUrl }
        : {}),
      courtCount: inventory?.courts.length ?? summary?.courtCount ?? 0,
      ...(summary ? { openNow: summary.openNow } : {}),
      tags: summary?.tags ?? [],
      amenities: base?.amenities ?? [],
      ...(inventory ? { inventory } : {}),
      ...(summary ? { summary } : {}),
      ...(club ? { club } : {}),
      week,
      coaches,
      events,
      conditions,
    };
  },
);
