"use client";

import type { OperatorWorkspace } from "@duna/api";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CircleAlert,
  MapPinned,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Warehouse,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { createVenueAction, type OperatorActionState } from "@/app/actions";
import type { AddressValue } from "@/lib/address";
import { AddressEntry } from "./place-address-fields";
import { VenueAmenitiesField } from "./venue-amenities-field";

const initialState: OperatorActionState = { status: "idle", message: "" };

const steps = [
  {
    label: "Place",
    detail: "Choose the venue type and exact location.",
  },
  {
    label: "Venue details",
    detail: "Name the place and shape its player-facing story.",
  },
  {
    label: "Features",
    detail: "Set arrival details and review the draft.",
  },
] as const;

export function VenueCreateWorkspace({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    createVenueAction,
    initialState,
  );
  const [step, setStep] = useState(0);
  const [locationKind, setLocationKind] = useState<
    "public-location" | "private-venue"
  >("public-location");
  const [environment, setEnvironment] = useState<"indoor" | "outdoor">(
    "outdoor",
  );
  const [address, setAddress] = useState<AddressValue>({ countryCode: "US" });
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(workspace.organization.timezone);
  const [capacity, setCapacity] = useState("0");
  const [description, setDescription] = useState("");
  const [temporary, setTemporary] = useState(false);

  useEffect(() => {
    if (state.status === "success" && state.entityId) {
      router.push(`/locations/${state.entityId}?created=true`);
    }
  }, [router, state.entityId, state.status]);

  const locationReady = Boolean(
    address.addressLine1 && address.locality && address.administrativeArea,
  );
  const detailsReady = name.trim().length >= 2 && Boolean(timezone.trim());
  const readiness = [locationReady, detailsReady, true];
  const completed = readiness.filter(Boolean).length;

  return (
    <main className="hq-page venue-create-page">
      <header className="venue-create-page__header">
        <Link
          aria-label="Back to venues"
          className="venue-workspace-back"
          href="/locations"
        >
          <ArrowLeft aria-hidden size={19} />
        </Link>
        <div>
          <span className="hq-eyebrow">Venues · guided setup</span>
          <h1>Create a place players can find.</h1>
          <p>
            Start with the real-world location. Duna keeps venue identity,
            courts, pricing, and availability in focused workspaces after this
            draft is created.
          </p>
        </div>
      </header>

      <form action={action} className="venue-create-studio">
        <aside className="venue-create-guide">
          <header>
            <span>
              <Sparkles aria-hidden size={16} /> Venue setup
            </span>
            <strong>{completed} of 3 ready</strong>
            <i>
              <b style={{ width: `${(completed / 3) * 100}%` }} />
            </i>
          </header>
          <nav aria-label="Venue setup steps">
            {steps.map((item, index) => (
              <button
                aria-current={step === index ? "step" : undefined}
                className={`${step === index ? "is-active" : ""} ${
                  readiness[index] ? "is-ready" : ""
                }`}
                key={item.label}
                onClick={() => setStep(index)}
                type="button"
              >
                <i>{readiness[index] ? <Check size={14} /> : index + 1}</i>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </button>
            ))}
          </nav>
          <div className="venue-create-guide__note">
            <ShieldCheck aria-hidden size={18} />
            <span>
              <strong>Private until you publish</strong>
              <small>
                Creating this venue never exposes it to players automatically.
              </small>
            </span>
          </div>
        </aside>

        <section className="venue-create-stage">
          <section hidden={step !== 0}>
            <span className="hq-eyebrow">01 · Place</span>
            <h2>What kind of place is this?</h2>
            <p>
              A public location can be a beach, park, or community court. A
              private venue is a facility your organization controls.
            </p>
            <div className="venue-kind-choices">
              <label
                className={
                  locationKind === "public-location" ? "is-selected" : ""
                }
              >
                <input
                  checked={locationKind === "public-location"}
                  name="locationKind"
                  onChange={() => setLocationKind("public-location")}
                  type="radio"
                  value="public-location"
                />
                <span>
                  <MapPinned aria-hidden size={24} />
                  <strong>Public location</strong>
                  <small>
                    Beach, park, pier, or public courts used for play or an
                    event.
                  </small>
                </span>
                <i>
                  {locationKind === "public-location" && <Check size={15} />}
                </i>
              </label>
              <label
                className={
                  locationKind === "private-venue" ? "is-selected" : ""
                }
              >
                <input
                  checked={locationKind === "private-venue"}
                  name="locationKind"
                  onChange={() => setLocationKind("private-venue")}
                  type="radio"
                  value="private-venue"
                />
                <span>
                  <Building2 aria-hidden size={24} />
                  <strong>Private venue</strong>
                  <small>
                    Club, academy, resort, or managed facility with controlled
                    access.
                  </small>
                </span>
                <i>{locationKind === "private-venue" && <Check size={15} />}</i>
              </label>
            </div>
            <h3 className="venue-create-stage__subheading">
              Is play indoors or outdoors?
            </h3>
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
                  <Sun aria-hidden size={22} />
                  <strong>Outdoors</strong>
                  <small>Build layouts over precise satellite imagery.</small>
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
                  <Warehouse aria-hidden size={22} />
                  <strong>Indoors</strong>
                  <small>
                    Upload a schematic for an intelligent floorplan.
                  </small>
                </span>
                <i>{environment === "indoor" && <Check size={14} />}</i>
              </label>
            </div>
            <AddressEntry
              exactPin
              label={
                locationKind === "public-location"
                  ? "Find the beach, park, or public courts"
                  : "Find the private venue or street address"
              }
              onChange={setAddress}
              onPlaceResolved={(place) => {
                if (place.timeZone) setTimezone(place.timeZone);
              }}
              onVenueName={(value) => {
                if (!name.trim()) setName(value);
              }}
              required
            />
          </section>

          <section hidden={step !== 1}>
            <span className="hq-eyebrow">02 · Venue details</span>
            <h2>Give this place a clear identity.</h2>
            <p>
              Use the name players recognize. You can refine the story, imagery,
              and operational details at any time.
            </p>
            <div className="venue-form-grid">
              <label className="venue-form-grid__wide">
                <span>Venue name</span>
                <input
                  autoComplete="organization"
                  maxLength={120}
                  name="name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Hermosa Beach Pier"
                  value={name}
                />
              </label>
              <label>
                <span>Comfortable venue capacity</span>
                <input
                  min="0"
                  name="capacity"
                  onChange={(event) => setCapacity(event.target.value)}
                  type="number"
                  value={capacity}
                />
              </label>
              <label>
                <span>Venue timezone</span>
                <input
                  name="timezone"
                  onChange={(event) => setTimezone(event.target.value)}
                  value={timezone}
                />
              </label>
              <label className="venue-form-grid__wide">
                <span>Player-facing description</span>
                <textarea
                  maxLength={2000}
                  name="description"
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Tell players where to meet, what the sand is like, and what makes this place special."
                  rows={5}
                  value={description}
                />
              </label>
              <label className="venue-form-grid__wide">
                <span>Venue hero image URL</span>
                <input name="heroImageUrl" placeholder="https://…" type="url" />
              </label>
            </div>
            <input name="temporaryPresent" type="hidden" value="true" />
            <label className="venue-event-toggle">
              <input
                checked={temporary}
                name="temporary"
                onChange={(event) => setTemporary(event.target.checked)}
                type="checkbox"
                value="true"
              />
              <span>
                <strong>Temporary event venue</strong>
                <small>
                  Use this for a tournament, clinic, or pop-up with a finite
                  lifecycle.
                </small>
              </span>
            </label>
          </section>

          <section hidden={step !== 2}>
            <span className="hq-eyebrow">03 · Features & review</span>
            <h2>Help players arrive prepared.</h2>
            <p>
              These features become structured venue information instead of an
              ambiguous comma-separated note.
            </p>
            <VenueAmenitiesField />
            <article className="venue-create-review">
              <header>
                <span>
                  {locationKind === "public-location" ? (
                    <MapPinned aria-hidden size={20} />
                  ) : (
                    <Building2 aria-hidden size={20} />
                  )}
                  <strong>{name || "Unnamed venue"}</strong>
                </span>
                <small>Private draft</small>
              </header>
              <dl>
                <div>
                  <dt>Type</dt>
                  <dd>
                    {locationKind === "public-location"
                      ? "Public location"
                      : "Private venue"}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>
                    {[address.locality, address.administrativeArea]
                      .filter(Boolean)
                      .join(", ") || "Location needed"}
                  </dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{environment === "outdoor" ? "Outdoors" : "Indoors"}</dd>
                </div>
                <div>
                  <dt>Capacity</dt>
                  <dd>{capacity || "0"}</dd>
                </div>
                <div>
                  <dt>Next</dt>
                  <dd>Add courts and publish</dd>
                </div>
              </dl>
              {description && <p>{description}</p>}
            </article>
          </section>

          <footer className="venue-create-stage__footer">
            <span>
              {state.status !== "idle" && (
                <small
                  className={`venue-action-notice is-${state.status}`}
                  role="status"
                >
                  {state.status === "error" && (
                    <CircleAlert aria-hidden size={15} />
                  )}
                  {state.message}
                </small>
              )}
            </span>
            <div>
              {step > 0 && (
                <button
                  className="hq-button hq-button--secondary"
                  onClick={() => setStep((current) => current - 1)}
                  type="button"
                >
                  <ArrowLeft aria-hidden size={16} /> Back
                </button>
              )}
              {step < 2 ? (
                <button
                  className="hq-button hq-button--primary"
                  disabled={step === 0 ? !locationReady : !detailsReady}
                  onClick={() => setStep((current) => current + 1)}
                  type="button"
                >
                  Continue <ArrowRight aria-hidden size={16} />
                </button>
              ) : (
                <button
                  className="hq-button hq-button--primary"
                  disabled={pending || !locationReady || !detailsReady}
                  type="submit"
                >
                  <Plus aria-hidden size={16} />
                  {pending ? "Creating venue…" : "Create venue draft"}
                </button>
              )}
            </div>
          </footer>
        </section>

        <aside className="venue-create-preview">
          <span className="venue-create-preview__mark">
            <Waves aria-hidden size={26} />
          </span>
          <small>
            {locationKind === "public-location"
              ? "Public location"
              : "Private venue"}{" "}
            · {environment === "outdoor" ? "Outdoors" : "Indoors"}
          </small>
          <strong>{name || "Your new venue"}</strong>
          <span>
            {[address.locality, address.administrativeArea]
              .filter(Boolean)
              .join(", ") || "Choose a place to begin"}
          </span>
        </aside>
      </form>
    </main>
  );
}
