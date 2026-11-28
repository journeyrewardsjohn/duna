import { formatMoney } from "@duna/core";
import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Chip,
  EmptyFirstUse,
  Icon,
  Notice,
  ObjectHeader,
  Rise,
} from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PlaceSubNav,
  PublishPlaceButton,
} from "@/components/setup/place-controls";
import {
  placeAddress,
  placeMissing,
  placeStatus,
} from "@/components/setup/places";
import { loadWorkspace } from "@/components/setup/setup-data";
import { SetupScreen, setupContext } from "@/components/setup/setup-screen";
import { SetupBlockState } from "@/components/setup/setup-states";
import { PageSection } from "@/components/shell/page-header";
import { venueAmenityLabel } from "@/lib/venue-amenities";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ venueId: string }>;
}): Promise<Metadata> {
  const { venueId } = await params;
  const workspace = await loadWorkspace();
  const venue =
    workspace.state === "ok"
      ? workspace.data.venues.find((v) => v.id === venueId)
      : undefined;
  return { title: venue?.name ?? "Place" };
}

/**
 * A place (venue): Draft or Live, its key facts, what it still needs (each
 * linked to its fix), its courts, where it is and how people arrive. The
 * facility studio on the satellite map and the details editor open from
 * its tabs.
 */
export default async function PlacePage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ venueId: string }>;
  readonly searchParams: Promise<{ created?: string }>;
}) {
  const { venueId } = await params;
  const { created } = await searchParams;
  const context = await setupContext();
  const workspace = await loadWorkspace();
  if (workspace.state !== "ok") {
    return (
      <SetupScreen askLabel="Place" askStarters={[]} tab="places" title="Place">
        <div className="hqs-section">
          <SetupBlockState
            loaded={workspace}
            organization={context.organization}
            retryHref={hqHref("place", { venueId })}
            what="this place"
          />
        </div>
      </SetupScreen>
    );
  }
  const venue = workspace.data.venues.find((item) => item.id === venueId);
  if (!venue) notFound();
  const status = placeStatus(venue);
  const missing = placeMissing(venue);
  const rates = workspace.data.ratePlans;
  const capacity =
    venue.capacity ||
    venue.courts.reduce((total, court) => total + court.capacity, 0);
  const ready = venue.courts.some(
    (court) => court.status === "active" && court.ratePlanId,
  );
  const fixes: Readonly<Record<string, string>> = {
    "An exact map pin": hqHref("placeDetails", { venueId }),
    "At least one court": hqHref("placeCourtCreate", { venueId }),
    "A live court with a price": hqHref("placeDetails", { venueId }),
  };
  return (
    <SetupScreen
      askLabel={venue.name}
      askStarters={[
        `What does ${venue.name} still need before it goes live?`,
        "Add two more sand courts here",
        "Which courts are lit after dark?",
      ]}
      crumb={venue.name}
      header={
        <ObjectHeader
          actions={
            <>
              <Button
                href={hqHref("placeLayout", { venueId })}
                variant="secondary"
              >
                Open layout studio
              </Button>
              {venue.status === "draft" ? (
                <PublishPlaceButton
                  name={venue.name}
                  ready={ready}
                  venueId={venue.id}
                />
              ) : null}
            </>
          }
          back={{ href: hqHref("places"), label: "Places and courts" }}
          description={placeAddress(venue) || "No address yet"}
          facts={[
            {
              label: "Courts",
              value: String(venue.courts.length),
              numeric: true,
            },
            {
              label: "Comfortable capacity",
              value: String(capacity),
              numeric: true,
            },
            {
              label: "Bookings, 30 days",
              value: String(venue.utilization.bookingCount30d),
              numeric: true,
            },
            {
              label: "Used, 30 days",
              value: `${venue.utilization.percent.toFixed(0)}%`,
              numeric: true,
            },
          ]}
          mark={
            <span className="setup-place-mark">
              <Icon
                name={venue.environment === "indoor" ? "indoor" : "beach"}
                size="nav"
              />
            </span>
          }
          status={{ label: status.label, tone: status.tone }}
          subnav={
            <PlaceSubNav
              current="overview"
              name={venue.name}
              venueId={venue.id}
            />
          }
          title={venue.name}
        />
      }
      parentHref={hqHref("places")}
      tab="places"
      title={venue.name}
    >
      {created === "true" ? (
        <Rise from="top">
          <Notice
            role="status"
            title={`${venue.name} is saved as a draft`}
            tone="positive"
          >
            Add its courts and a price, then publish it when it is ready for
            players.
          </Notice>
        </Rise>
      ) : null}
      <PageSection
        id="needs"
        title={missing.length ? "Before players can book" : "Ready for players"}
      >
        {missing.length === 0 ? (
          <p className="setup-section-lead">
            {venue.status === "active"
              ? "It's live: players can find it and book its live courts."
              : "Everything is in place. Publish it when you're ready."}
          </p>
        ) : (
          <ul className="setup-needs">
            {missing.map((item) => (
              <li key={item}>
                <Icon name="alert" size="inline" />
                <span>{item}</span>
                <Link
                  className="setup-link"
                  href={fixes[item] ?? hqHref("placeDetails", { venueId })}
                >
                  Fix this
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      <PageSection
        aside={
          <Button
            href={hqHref("placeCourtCreate", { venueId })}
            size="sm"
            variant="secondary"
          >
            Add a court
          </Button>
        }
        flush
        id="courts"
        title="Courts"
      >
        {venue.courts.length === 0 ? (
          <EmptyFirstUse
            action={
              <Button
                href={hqHref("placeCourtCreate", { venueId })}
                variant="secondary"
              >
                Add the first court
              </Button>
            }
            description="Courts are what people book. Draw them on the map in the layout studio, or add them one at a time."
            icon="court"
            title="No courts yet"
          />
        ) : (
          <ul className="setup-courts">
            {venue.courts.map((court) => {
              const rate = rates.find((item) => item.id === court.ratePlanId);
              return (
                <li key={court.id}>
                  <Link
                    className="setup-court"
                    href={hqHref("placeCourt", { venueId, courtId: court.id })}
                  >
                    <span className="setup-court__name">{court.name}</span>
                    <span className="setup-court__detail">
                      {court.surface.charAt(0).toUpperCase() +
                        court.surface.slice(1)}{" "}
                      · {court.lit ? "Lit after dark" : "Daylight only"} · up to{" "}
                      {court.capacity} players
                    </span>
                    <span className="setup-court__price td-num">
                      {rate
                        ? `${formatMoney(rate.nonMemberAmountMinor ?? rate.baseAmountMinor, rate.currency)} / ${rate.rateUnitMinutes} min`
                        : "No price yet"}
                    </span>
                    <Chip
                      kind="status"
                      tone={court.status === "active" ? "positive" : undefined}
                    >
                      {court.status === "active"
                        ? "Live"
                        : court.status === "draft"
                          ? "Draft"
                          : court.status}
                    </Chip>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>

      <div className="setup-cols">
        <PageSection
          aside={
            <Link
              className="setup-link"
              href={hqHref("placeDetails", { venueId })}
            >
              Edit location
            </Link>
          }
          id="location"
          title="Where it is"
        >
          {venue.latitude !== undefined && venue.longitude !== undefined ? (
            // A static map tile from HQ's own map endpoint.
            <img
              alt={`Map showing ${venue.name}`}
              className="setup-map"
              src={`/api/places/map?latitude=${venue.latitude}&longitude=${venue.longitude}&zoom=16`}
            />
          ) : (
            <p className="setup-quiet">
              No map pin yet. Add one so players can find the courts.
            </p>
          )}
          <p className="setup-section-lead">
            {placeAddress(venue) || "No address yet"}
          </p>
        </PageSection>
        <PageSection
          aside={
            <Link
              className="setup-link"
              href={hqHref("placeDetails", { venueId })}
            >
              Edit
            </Link>
          }
          id="arrival"
          title="Arriving"
        >
          {venue.amenities.length > 0 ? (
            <ul className="setup-amenities">
              {venue.amenities.map((amenity) => (
                <li key={amenity}>
                  <Icon name="check" size="inline" />
                  {venueAmenityLabel(amenity)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="setup-quiet">
              No arrival details yet: parking, showers, lights.
            </p>
          )}
          {venue.description ? (
            <p className="setup-section-lead">{venue.description}</p>
          ) : null}
        </PageSection>
      </div>
    </SetupScreen>
  );
}
