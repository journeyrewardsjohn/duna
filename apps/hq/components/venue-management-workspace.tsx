"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Check,
  CircleAlert,
  Clock3,
  Gauge,
  Image as ImageIcon,
  Layers3,
  MapPin,
  MapPinned,
  Plus,
  Settings2,
  Sun,
  UploadCloud,
  Users,
  Warehouse,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  publishVenueAction,
  updateVenueProfileAction,
  type OperatorActionState,
} from "@/app/actions";
import { formatAddress } from "@/lib/address";
import { createVenueMediaPath, optimizeImageUpload } from "@/lib/media-storage";
import { venueAmenityLabel } from "@/lib/venue-amenities";
import { AddressEntry } from "./place-address-fields";
import { RatePlanComposer } from "./operator-controls";
import { VenueAmenitiesField } from "./venue-amenities-field";

type Venue = OperatorWorkspace["venues"][number];
type Section = "overview" | "details" | "courts";

const initialState: OperatorActionState = { status: "idle", message: "" };

function courtScheduleSummary(court: Venue["courts"][number]): string {
  const open = court.schedule.filter(
    (block) => block.mode !== "blocked" && block.mode !== "maintenance",
  );
  if (open.length === 0) return "No weekly availability";
  const days = new Set(open.map((block) => block.weekday)).size;
  const earliest = Math.min(...open.map((block) => block.startsAtMinute));
  const latest = Math.max(...open.map((block) => block.endsAtMinute));
  const time = (minute: number) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2026, 0, 1, 0, minute)));
  return `${days === 7 ? "Every day" : `${days} days/week`} · ${time(earliest)}–${time(latest)}`;
}

function ActionNotice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <span className={`venue-action-notice is-${state.status}`} role="status">
      {state.status === "error" ? (
        <CircleAlert aria-hidden size={15} />
      ) : (
        <Check aria-hidden size={15} />
      )}
      {state.message}
    </span>
  );
}

function VenueOverview({
  venue,
  onEdit,
  created,
}: {
  readonly venue: Venue;
  readonly onEdit: () => void;
  readonly created: boolean;
}) {
  const [publishState, publishAction, publishPending] = useActionState(
    publishVenueAction,
    initialState,
  );
  const totalCapacity =
    venue.capacity ||
    venue.courts.reduce((total, court) => total + court.capacity, 0);
  const readyCourts = venue.courts.filter(
    (court) => court.status === "active" && court.ratePlanId,
  ).length;
  return (
    <div className="venue-overview-grid">
      {created && (
        <div className="venue-created-banner">
          <Check aria-hidden size={18} />
          <span>
            <strong>Venue draft created.</strong>
            Add courts, review pricing, then publish when it is ready for
            players.
          </span>
        </div>
      )}
      <section className="venue-overview-hero hq-card">
        <div
          className="venue-overview-hero__media"
          style={
            venue.heroImageTreatmentUrl || venue.heroImageUrl
              ? {
                  backgroundImage: `linear-gradient(120deg, rgba(17, 31, 14, .86), rgba(17, 31, 14, .18)), url("${venue.heroImageTreatmentUrl ?? venue.heroImageUrl}")`,
                }
              : undefined
          }
        >
          <span>
            {venue.locationKind === "public-location" ? (
              <MapPinned aria-hidden size={22} />
            ) : (
              <Building2 aria-hidden size={22} />
            )}
          </span>
          <div>
            <small>
              {venue.locationKind === "public-location"
                ? "Public location"
                : "Private venue"}
            </small>
            <strong>{venue.name}</strong>
            <span>
              {[venue.locality, venue.administrativeArea]
                .filter(Boolean)
                .join(", ") || "Location incomplete"}
            </span>
          </div>
          <Badge tone={venue.status === "active" ? "live" : "warning"}>
            {venue.status}
          </Badge>
        </div>
        <div className="venue-overview-hero__story">
          <span className="hq-eyebrow">Player-facing story</span>
          <p>
            {venue.description ||
              "Add a concise venue story so players know what to expect before they arrive."}
          </p>
          <button
            className="hq-button hq-button--secondary hq-button--compact"
            onClick={onEdit}
            type="button"
          >
            <Settings2 aria-hidden size={15} /> Edit venue details
          </button>
        </div>
      </section>

      <section className="venue-overview-metrics">
        <article>
          <Gauge aria-hidden size={20} />
          <span>
            <small>Utilization · 30d</small>
            <Numeric>{venue.utilization.percent.toFixed(1)}%</Numeric>
          </span>
        </article>
        <article>
          <Waves aria-hidden size={20} />
          <span>
            <small>Courts</small>
            <Numeric>{venue.courts.length}</Numeric>
          </span>
        </article>
        <article>
          <Users aria-hidden size={20} />
          <span>
            <small>Comfortable capacity</small>
            <Numeric>{totalCapacity}</Numeric>
          </span>
        </article>
        <article>
          <CalendarClock aria-hidden size={20} />
          <span>
            <small>Bookings · 30d</small>
            <Numeric>{venue.utilization.bookingCount30d}</Numeric>
          </span>
        </article>
      </section>

      <section className="venue-overview-location hq-card">
        <header>
          <span>
            <MapPin aria-hidden size={19} />
            <strong>Exact location</strong>
          </span>
          <button onClick={onEdit} type="button">
            Edit location <ArrowRight aria-hidden size={14} />
          </button>
        </header>
        {venue.latitude !== undefined && venue.longitude !== undefined ? (
          <img
            alt={`Map showing ${venue.name}`}
            src={`/api/places/map?latitude=${venue.latitude}&longitude=${venue.longitude}&zoom=16`}
          />
        ) : (
          <div className="venue-overview-location__empty">
            <MapPinned aria-hidden size={28} /> Add an exact map pin
          </div>
        )}
        <p>
          {formatAddress({
            addressLine1: venue.addressLine1,
            addressLine2: venue.addressLine2,
            locality: venue.locality,
            administrativeArea: venue.administrativeArea,
            postalCode: venue.postalCode,
            countryCode: venue.countryCode,
          }) || "Address not yet configured"}
        </p>
      </section>

      <section className="venue-overview-readiness hq-card">
        <header>
          <span className="hq-eyebrow">Publication readiness</span>
          <strong>
            {venue.status === "active" ? "Live for players" : "Private draft"}
          </strong>
        </header>
        <ul>
          <li className={venue.latitude !== undefined ? "is-ready" : ""}>
            <i>{venue.latitude !== undefined && <Check size={13} />}</i>
            Exact location confirmed
          </li>
          <li className={venue.courts.length > 0 ? "is-ready" : ""}>
            <i>{venue.courts.length > 0 && <Check size={13} />}</i>
            At least one court added
          </li>
          <li className={readyCourts > 0 ? "is-ready" : ""}>
            <i>{readyCourts > 0 && <Check size={13} />}</i>
            Active court with pricing
          </li>
        </ul>
        {venue.status === "draft" && (
          <form action={publishAction}>
            <input name="venueId" type="hidden" value={venue.id} />
            <input name="confirmed" type="hidden" value="true" />
            <ActionNotice state={publishState} />
            <button
              className="hq-button hq-button--primary"
              disabled={publishPending || readyCourts === 0}
              type="submit"
            >
              {publishPending ? "Publishing…" : "Publish venue"}
            </button>
          </form>
        )}
      </section>

      <section className="venue-overview-amenities hq-card">
        <header>
          <span className="hq-eyebrow">Arrival essentials</span>
          <button onClick={onEdit} type="button">
            Edit features <ArrowRight aria-hidden size={14} />
          </button>
        </header>
        {venue.amenities.length > 0 ? (
          <div>
            {venue.amenities.map((amenity) => (
              <span key={amenity}>
                <Check aria-hidden size={14} /> {venueAmenityLabel(amenity)}
              </span>
            ))}
          </div>
        ) : (
          <p>No arrival features have been added yet.</p>
        )}
      </section>
    </div>
  );
}

function VenueDetails({
  venue,
  organizationId,
}: {
  readonly venue: Venue;
  readonly organizationId: string;
}) {
  const [state, action, pending] = useActionState(
    updateVenueProfileAction,
    initialState,
  );
  const [locationKind, setLocationKind] = useState(venue.locationKind);
  const [environment, setEnvironment] = useState(venue.environment);
  const [heroImageUrl, setHeroImageUrl] = useState(venue.heroImageUrl ?? "");
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");

  async function uploadVenueImage(file?: File) {
    if (!file) return;
    setUploadState("uploading");
    setUploadMessage("Optimizing your venue image…");
    try {
      const prepared = await optimizeImageUpload(file);
      const stored = await upload(
        createVenueMediaPath(organizationId, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
            purpose: "venue",
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: ({ percentage }) => {
            setUploadMessage(`Uploading… ${Math.round(percentage)}%`);
          },
        },
      );
      if (!stored.url)
        throw new Error("Duna storage did not return an image URL.");
      setHeroImageUrl(stored.url);
      setUploadState("ready");
      setUploadMessage("Venue image ready to save.");
    } catch (error) {
      setUploadState("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Venue image upload failed.",
      );
    }
  }

  return (
    <form action={action} className="venue-details-form hq-card">
      <input name="venueId" type="hidden" value={venue.id} />
      <header>
        <div>
          <span className="hq-eyebrow">Venue details</span>
          <h2>Edit the place, not just its story.</h2>
          <p>
            Identity, access type, exact location, imagery, and player arrival
            details all stay editable here.
          </p>
        </div>
        <Badge tone={venue.status === "active" ? "live" : "warning"}>
          {venue.status}
        </Badge>
      </header>

      <fieldset className="venue-details-form__section">
        <legend>Place type</legend>
        <div className="venue-kind-choices venue-kind-choices--compact">
          <label
            className={locationKind === "public-location" ? "is-selected" : ""}
          >
            <input
              checked={locationKind === "public-location"}
              name="locationKind"
              onChange={() => setLocationKind("public-location")}
              type="radio"
              value="public-location"
            />
            <span>
              <MapPinned aria-hidden size={21} />
              <strong>Public location</strong>
              <small>Beach, park, pier, or community court.</small>
            </span>
            <i>{locationKind === "public-location" && <Check size={14} />}</i>
          </label>
          <label
            className={locationKind === "private-venue" ? "is-selected" : ""}
          >
            <input
              checked={locationKind === "private-venue"}
              name="locationKind"
              onChange={() => setLocationKind("private-venue")}
              type="radio"
              value="private-venue"
            />
            <span>
              <Building2 aria-hidden size={21} />
              <strong>Private venue</strong>
              <small>Club, academy, resort, or managed facility.</small>
            </span>
            <i>{locationKind === "private-venue" && <Check size={14} />}</i>
          </label>
        </div>
      </fieldset>

      <fieldset className="venue-details-form__section">
        <legend>Playing environment</legend>
        <div className="venue-kind-choices venue-kind-choices--compact">
          <label className={environment === "outdoor" ? "is-selected" : ""}>
            <input
              checked={environment === "outdoor"}
              name="environment"
              onChange={() => setEnvironment("outdoor")}
              type="radio"
              value="outdoor"
            />
            <span>
              <Sun aria-hidden size={21} />
              <strong>Outdoors</strong>
              <small>Satellite imagery and real-world dimensions.</small>
            </span>
            <i>{environment === "outdoor" && <Check size={14} />}</i>
          </label>
          <label className={environment === "indoor" ? "is-selected" : ""}>
            <input
              checked={environment === "indoor"}
              name="environment"
              onChange={() => setEnvironment("indoor")}
              type="radio"
              value="indoor"
            />
            <span>
              <Warehouse aria-hidden size={21} />
              <strong>Indoors</strong>
              <small>Schematic-backed floorplan and indoor wayfinding.</small>
            </span>
            <i>{environment === "indoor" && <Check size={14} />}</i>
          </label>
        </div>
      </fieldset>

      <fieldset className="venue-details-form__section">
        <legend>Identity & story</legend>
        <div className="venue-form-grid">
          <label className="venue-form-grid__wide">
            <span>Venue name</span>
            <input
              defaultValue={venue.name}
              maxLength={120}
              name="name"
              required
            />
          </label>
          <label>
            <span>Comfortable venue capacity</span>
            <input
              defaultValue={venue.capacity}
              min="0"
              name="capacity"
              required
              type="number"
            />
          </label>
          <label>
            <span>Venue timezone</span>
            <input defaultValue={venue.timezone} name="timezone" required />
          </label>
          <label className="venue-form-grid__wide">
            <span>Player-facing description</span>
            <textarea
              defaultValue={venue.description}
              maxLength={2000}
              name="description"
              rows={5}
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="venue-details-form__section">
        <legend>Address & exact pin</legend>
        <AddressEntry
          exactPin
          initial={{
            googlePlaceId: venue.googlePlaceId,
            addressLine1: venue.addressLine1,
            addressLine2: venue.addressLine2,
            locality: venue.locality,
            administrativeArea: venue.administrativeArea,
            postalCode: venue.postalCode,
            countryCode: venue.countryCode,
            latitude: venue.latitude,
            longitude: venue.longitude,
          }}
          label="Search for this venue or location"
          required
        />
      </fieldset>

      <fieldset className="venue-details-form__section">
        <legend>Venue image</legend>
        <div className="venue-image-editor">
          <div
            className={`venue-image-editor__preview ${heroImageUrl ? "has-image" : ""}`}
            style={
              heroImageUrl
                ? { backgroundImage: `url("${heroImageUrl}")` }
                : undefined
            }
          >
            {!heroImageUrl && <ImageIcon aria-hidden size={28} />}
          </div>
          <div>
            <label className="venue-image-editor__upload">
              <UploadCloud aria-hidden size={18} />
              <span>
                <strong>
                  {heroImageUrl ? "Replace image" : "Upload venue image"}
                </strong>
                <small>JPEG, PNG, WebP, or AVIF · up to 15 MB</small>
              </span>
              <input
                accept="image/avif,image/jpeg,image/png,image/webp"
                disabled={uploadState === "uploading"}
                onChange={(event) =>
                  void uploadVenueImage(event.target.files?.[0])
                }
                type="file"
              />
            </label>
            <label>
              <span>Or use an image URL</span>
              <input
                onChange={(event) => setHeroImageUrl(event.target.value)}
                placeholder="https://…"
                type="url"
                value={heroImageUrl}
              />
            </label>
            {uploadMessage && (
              <small className={`venue-upload-message is-${uploadState}`}>
                {uploadMessage}
              </small>
            )}
          </div>
        </div>
        <input name="heroImageUrl" type="hidden" value={heroImageUrl} />
      </fieldset>

      <VenueAmenitiesField initial={venue.amenities} />

      <input name="temporaryPresent" type="hidden" value="true" />
      <label className="venue-event-toggle">
        <input
          defaultChecked={venue.temporary}
          name="temporary"
          type="checkbox"
          value="true"
        />
        <span>
          <strong>Temporary event venue</strong>
          <small>
            Use for a tournament, clinic, or pop-up with a finite lifecycle.
          </small>
        </span>
      </label>

      <footer className="venue-details-form__footer">
        <ActionNotice state={state} />
        <button
          className="hq-button hq-button--primary"
          disabled={pending || uploadState === "uploading"}
          type="submit"
        >
          {pending ? "Saving venue…" : "Save venue details"}
        </button>
      </footer>
    </form>
  );
}

function VenueCourts({
  venue,
  workspace,
}: {
  readonly venue: Venue;
  readonly workspace: OperatorWorkspace;
}) {
  return (
    <div className="venue-courts-workspace">
      <section className="venue-courts-list hq-card">
        <header>
          <div>
            <span className="hq-eyebrow">Court management</span>
            <h2>Courts at {venue.name}</h2>
            <p>
              Each court now has its own details, availability, pricing, and
              cancellation workspace.
            </p>
          </div>
          <Link
            className="hq-button hq-button--primary"
            href={`/locations/${venue.id}/courts/create`}
          >
            <Plus aria-hidden size={16} /> Add court
          </Link>
        </header>
        <div className="venue-court-list">
          {venue.courts.map((court) => {
            const rate = workspace.ratePlans.find(
              (item) => item.id === court.ratePlanId,
            );
            return (
              <Link
                className="venue-court-row"
                href={`/locations/${venue.id}/courts/${court.id}`}
                key={court.id}
              >
                <span
                  className={`venue-court-row__image ${court.imageUrl ? "has-image" : ""}`}
                  style={
                    court.imageUrl
                      ? { backgroundImage: `url("${court.imageUrl}")` }
                      : undefined
                  }
                >
                  {!court.imageUrl && <Waves aria-hidden size={22} />}
                </span>
                <span className="venue-court-row__identity">
                  <small>{court.surface.replaceAll("-", " ")}</small>
                  <strong>{court.name}</strong>
                  <span>
                    {court.lit ? "Lit after dark" : "Daylight only"} · up to{" "}
                    {court.capacity} players
                  </span>
                </span>
                <span>
                  <small>Availability</small>
                  <strong>{courtScheduleSummary(court)}</strong>
                </span>
                <span>
                  <small>Pricing</small>
                  <strong>
                    {rate
                      ? `${formatMoney(
                          rate.nonMemberAmountMinor ?? rate.baseAmountMinor,
                          rate.currency,
                        )} / ${rate.rateUnitMinutes} min`
                      : "Not attached"}
                  </strong>
                </span>
                <Badge tone={court.status === "active" ? "live" : "warning"}>
                  {court.status}
                </Badge>
                <ArrowRight aria-hidden size={18} />
              </Link>
            );
          })}
          {venue.courts.length === 0 && (
            <div className="venue-court-list__empty">
              <Waves aria-hidden size={27} />
              <strong>No courts yet</strong>
              <p>Add the first playable or bookable resource at this venue.</p>
              <Link
                className="hq-button hq-button--primary"
                href={`/locations/${venue.id}/courts/create`}
              >
                Add the first court
              </Link>
            </div>
          )}
        </div>
      </section>

      <section className="venue-rate-plans hq-card" id="court-pricing">
        <header>
          <div>
            <span className="hq-eyebrow">Reusable pricing</span>
            <h2>Court rate plans</h2>
          </div>
          <Badge>{workspace.organization.currency}</Badge>
        </header>
        <div>
          {workspace.ratePlans.map((rate) => (
            <article key={rate.id}>
              <span>
                <Clock3 aria-hidden size={17} />
                <strong>{rate.name}</strong>
                <small>{rate.rateUnitMinutes} minute unit</small>
              </span>
              <Numeric>
                {formatMoney(
                  rate.nonMemberAmountMinor ?? rate.baseAmountMinor,
                  rate.currency,
                )}
              </Numeric>
            </article>
          ))}
        </div>
        <details className="venue-rate-plans__creator">
          <summary>
            <Plus aria-hidden size={16} /> Create a rate plan
          </summary>
          <RatePlanComposer workspace={workspace} />
        </details>
      </section>
    </div>
  );
}

export function VenueManagementWorkspace({
  venue,
  workspace,
  initialSection = "overview",
  created = false,
}: {
  readonly venue: Venue;
  readonly workspace: OperatorWorkspace;
  readonly initialSection?: Section;
  readonly created?: boolean;
}) {
  const [section, setSection] = useState<Section>(initialSection);
  return (
    <main className="hq-page venue-management-page">
      <header className="venue-management-header">
        <Link
          aria-label="Back to venues"
          className="venue-workspace-back"
          href="/locations"
        >
          <ArrowLeft aria-hidden size={19} />
        </Link>
        <div>
          <span className="hq-eyebrow">
            {venue.locationKind === "public-location"
              ? "Public location"
              : "Private venue"}
          </span>
          <h1>{venue.name}</h1>
          <p>
            {[venue.locality, venue.administrativeArea]
              .filter(Boolean)
              .join(", ") || "Location incomplete"}{" "}
            · {venue.timezone}
          </p>
        </div>
        <Link
          className="hq-button hq-button--primary"
          href={`/locations/${venue.id}/courts/create`}
        >
          <Plus aria-hidden size={16} /> Add court
        </Link>
      </header>

      <nav aria-label="Venue workspace" className="venue-management-tabs">
        {(
          [
            ["overview", "Overview", Gauge],
            ["details", "Venue details", Settings2],
            ["courts", `Courts & rates · ${venue.courts.length}`, Waves],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            aria-current={section === value ? "page" : undefined}
            className={section === value ? "is-active" : ""}
            key={value}
            onClick={() => setSection(value)}
            type="button"
          >
            <Icon aria-hidden size={16} /> {label}
          </button>
        ))}
        <Link href={`/locations/${venue.id}/layout`}>
          <Layers3 aria-hidden size={16} /> Venue layout
        </Link>
      </nav>

      {section === "overview" ? (
        <VenueOverview
          created={created}
          onEdit={() => setSection("details")}
          venue={venue}
        />
      ) : section === "details" ? (
        <VenueDetails
          organizationId={workspace.organization.id}
          venue={venue}
        />
      ) : (
        <VenueCourts venue={venue} workspace={workspace} />
      )}
    </main>
  );
}
