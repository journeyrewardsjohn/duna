import type { OperatorWorkspace } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Chip, Icon, rallyStyle, riseClassName } from "@duna/ui/tideline";
import Link from "next/link";

export type Venue = OperatorWorkspace["venues"][number];

/** Draft, Live, or the venue's own word for a pause: words first, tone repeats them. */
export function placeStatus(venue: Pick<Venue, "status">): {
  readonly label: string;
  readonly tone?: "positive" | "warning" | "neutral";
} {
  switch (venue.status) {
    case "active":
      return { label: "Live", tone: "positive" };
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "maintenance":
      return { label: "Maintenance", tone: "warning" };
    case "seasonal":
      return { label: "Seasonal", tone: "warning" };
    case "closed":
      return { label: "Closed", tone: "warning" };
  }
}

/** What a place still needs before players can book it, in order. */
export function placeMissing(venue: Venue): string[] {
  const missing: string[] = [];
  if (venue.latitude === undefined || venue.longitude === undefined) {
    missing.push("An exact map pin");
  }
  if (venue.courts.length === 0) missing.push("At least one court");
  else if (
    !venue.courts.some((court) => court.status === "active" && court.ratePlanId)
  ) {
    missing.push("A live court with a price");
  }
  return missing;
}

export function placeAddress(venue: Venue): string {
  return [venue.addressLine1, venue.locality, venue.administrativeArea]
    .filter(Boolean)
    .join(", ");
}

/** Every place as a row: status, courts, where it is, and what is missing. */
export function PlaceRows({ venues }: { readonly venues: readonly Venue[] }) {
  return (
    <ul className="setup-places">
      {venues.map((venue, index) => {
        const status = placeStatus(venue);
        const missing = placeMissing(venue);
        return (
          <li
            className={riseClassName()}
            key={venue.id}
            style={rallyStyle(index)}
          >
            <Link
              className="setup-place"
              href={hqHref("place", { venueId: venue.id })}
            >
              <Icon
                name={venue.environment === "indoor" ? "indoor" : "beach"}
                size="control"
              />
              <span className="setup-place__text">
                <span className="setup-place__name">{venue.name}</span>
                <span className="setup-place__detail">
                  {placeAddress(venue) || "No address yet"} ·{" "}
                  {venue.courts.length} court
                  {venue.courts.length === 1 ? "" : "s"}
                </span>
                {missing.length > 0 ? (
                  <span className="setup-place__missing">
                    Needs: {missing.join(", ").toLowerCase()}
                  </span>
                ) : null}
              </span>
              <Chip kind="status" tone={status.tone}>
                {status.label}
              </Chip>
              <Icon name="chevron-right" size="inline" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
