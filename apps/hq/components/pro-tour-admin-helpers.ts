import type { SandDataOverview } from "@duna/api";

export type ProfessionalEvent = SandDataOverview["events"][number];
export type ProfessionalTourFilter = "all" | "avp" | "fivb";
export type ProfessionalStatusFilter =
  "active" | "all" | "completed" | "live" | "upcoming";

export function professionalEventTour(
  event: ProfessionalEvent,
): Exclude<ProfessionalTourFilter, "all"> {
  return event.sourceSlug === "avp-league" ? "avp" : "fivb";
}

function eventStatusOrder(event: ProfessionalEvent): number {
  if (event.live || event.status === "live") return 0;
  if (event.status === "upcoming") return 1;
  return 2;
}

export function filterProfessionalEvents(
  events: readonly ProfessionalEvent[],
  filters: {
    readonly query: string;
    readonly status: ProfessionalStatusFilter;
    readonly tour: ProfessionalTourFilter;
  },
): readonly ProfessionalEvent[] {
  const query = filters.query.trim().toLowerCase();
  return [...events]
    .filter((event) => {
      const tourMatches =
        filters.tour === "all" || professionalEventTour(event) === filters.tour;
      const statusMatches =
        filters.status === "all" ||
        (filters.status === "active"
          ? event.live || ["live", "upcoming"].includes(event.status)
          : filters.status === "live"
            ? event.live || event.status === "live"
            : event.status === filters.status);
      const queryMatches =
        !query ||
        [
          event.name,
          event.location,
          event.category,
          event.externalEventId,
          event.sourceName,
        ].some((value) => value?.toLowerCase().includes(query));
      return tourMatches && statusMatches && queryMatches;
    })
    .sort((left, right) => {
      const statusOrder = eventStatusOrder(left) - eventStatusOrder(right);
      if (statusOrder !== 0) return statusOrder;
      if (eventStatusOrder(left) === 2) {
        return (right.startsOn ?? "").localeCompare(left.startsOn ?? "");
      }
      return (left.startsOn ?? "9999-12-31").localeCompare(
        right.startsOn ?? "9999-12-31",
      );
    });
}

export function eventBroadcastCoverage(event: ProfessionalEvent) {
  const matchOverrides = event.matches.filter(
    (match) => match.watchOptions.length > 0,
  ).length;
  return {
    defaults: event.watchOptions.length,
    matchOverrides,
    configured: event.watchOptions.length > 0 || matchOverrides > 0,
  };
}
