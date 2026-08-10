"use client";

import type { EventSummary } from "@duna/core";
import { Numeric } from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  Clock3,
  Eye,
  Globe2,
  Link2,
  MapPin,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useMemo, useState, useTransition } from "react";
import { updatePickupAction } from "@/app/events/[slug]/actions";
import { PlaceSearch, type PlaceDetails } from "./place-search";
import styles from "./pickup-edit-form.module.css";

const durationOptions = [60, 90, 120, 150, 180] as const;

function localDateTime(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function timeLabel(iso: string | undefined) {
  if (!iso) return "Choose a valid time";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function PickupEditForm({
  event,
  confirmedParticipantCount,
  initialWaitlistEnabled,
}: {
  readonly event: EventSummary;
  readonly confirmedParticipantCount: number;
  readonly initialWaitlistEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(event.title);
  const [startsAt, setStartsAt] = useState(localDateTime(event.startsAt));
  const initialDuration = Math.max(
    30,
    Math.round(
      (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) /
        60_000,
    ),
  );
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [venueName, setVenueName] = useState(event.venueName);
  const [address, setAddress] = useState(event.location?.address);
  const [googlePlaceId, setGooglePlaceId] = useState(
    event.location?.googlePlaceId,
  );
  const [latitude, setLatitude] = useState(event.location?.latitude);
  const [longitude, setLongitude] = useState(event.location?.longitude);
  const [locationConfidence, setLocationConfidence] = useState<
    "confirmed" | "approximate"
  >(event.location?.confidence ?? "approximate");
  const [capacity, setCapacity] = useState(event.capacity);
  const [note, setNote] = useState(
    event.description ?? event.shortSummary ?? "",
  );
  const [approvalRequired, setApprovalRequired] = useState(
    event.approvalRequired ?? false,
  );
  const [waitlistEnabled, setWaitlistEnabled] = useState(
    initialWaitlistEnabled,
  );
  const [visibility, setVisibility] = useState<"public" | "unlisted">(
    event.visibility ?? "public",
  );
  const [message, setMessage] = useState("");
  const startDate = useMemo(() => new Date(startsAt), [startsAt]);
  const endIso = useMemo(
    () =>
      Number.isNaN(startDate.getTime())
        ? undefined
        : new Date(
            startDate.getTime() + durationMinutes * 60_000,
          ).toISOString(),
    [durationMinutes, startDate],
  );
  const startIso = Number.isNaN(startDate.getTime())
    ? undefined
    : startDate.toISOString();
  const isFuture = Boolean(startIso && startDate.getTime() > Date.now());
  const canSave =
    title.trim().length >= 3 &&
    venueName.trim().length > 0 &&
    capacity >= Math.max(2, confirmedParticipantCount) &&
    capacity <= 100 &&
    Boolean(endIso) &&
    isFuture;
  const isDirty =
    title !== event.title ||
    startsAt !== localDateTime(event.startsAt) ||
    durationMinutes !== initialDuration ||
    venueName !== event.venueName ||
    address !== event.location?.address ||
    capacity !== event.capacity ||
    note !== (event.description ?? event.shortSummary ?? "") ||
    approvalRequired !== (event.approvalRequired ?? false) ||
    waitlistEnabled !== initialWaitlistEnabled ||
    visibility !== (event.visibility ?? "public");

  function choosePlace(place: PlaceDetails) {
    setVenueName(place.name ?? place.address ?? venueName);
    setAddress(place.address);
    setGooglePlaceId(place.placeId);
    setLatitude(place.latitude);
    setLongitude(place.longitude);
    setLocationConfidence("confirmed");
  }

  function save(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setMessage("");
    if (!canSave || !startIso || !endIso) {
      setMessage("Finish the highlighted details before saving.");
      return;
    }
    startTransition(async () => {
      const response = await updatePickupAction({
        pickupSessionId: event.id,
        slug: event.slug,
        title: title.trim(),
        startsAt: startIso,
        endsAt: endIso,
        venueName: venueName.trim(),
        address,
        googlePlaceId,
        latitude,
        longitude,
        locationConfidence,
        capacity,
        note: note.trim() || undefined,
        approvalRequired,
        waitlistEnabled,
        visibility,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setMessage(response.error);
        return;
      }
      setMessage("Pickup updated.");
      router.push(`/events/${event.slug}`);
      router.refresh();
    });
  }

  return (
    <main className={styles.editor}>
      <header className={styles.header}>
        <Link href={`/events/${event.slug}`}>
          <ArrowLeft aria-hidden size={17} /> Back to pickup
        </Link>
        <div className={styles.headerCopy}>
          <span>Host controls</span>
          <h1>Make the next game clear.</h1>
          <p>
            Adjust the essentials, review what players will see, then publish
            the update with confidence.
          </p>
        </div>
        <div className={styles.editWindow}>
          <ShieldCheck aria-hidden size={21} />
          <span>
            <strong>Creator controls</strong>
            Only you can publish changes. Confirmed players keep their places,
            so capacity cannot drop below the active roster.
          </span>
        </div>
      </header>

      <form className={styles.layout} onSubmit={save}>
        <div className={styles.fields}>
          <section className={styles.formCard}>
            <header className={styles.cardHeader}>
              <span className={styles.step}>01</span>
              <div>
                <h2>Name the session</h2>
                <p>Keep it short enough to scan in a player’s calendar.</p>
              </div>
              <Sparkles aria-hidden size={20} />
            </header>
            <label className={styles.field} htmlFor="pickup-title">
              <span>Pickup name</span>
              <input
                aria-invalid={title.trim().length < 3}
                id="pickup-title"
                maxLength={140}
                onChange={(inputEvent) => setTitle(inputEvent.target.value)}
                placeholder="Golden Hour 4s"
                value={title}
              />
              <small>{title.length} / 140 characters</small>
            </label>
            <label className={styles.field} htmlFor="pickup-note">
              <span>Player note</span>
              <textarea
                id="pickup-note"
                maxLength={2_000}
                onChange={(inputEvent) => setNote(inputEvent.target.value)}
                placeholder="What should players know before they arrive?"
                rows={5}
                value={note}
              />
              <small>Share the level, vibe, parking, or what to bring.</small>
            </label>
          </section>

          <section className={styles.formCard}>
            <header className={styles.cardHeader}>
              <span className={styles.step}>02</span>
              <div>
                <h2>Set the rhythm</h2>
                <p>Players see the start, finish, and capacity together.</p>
              </div>
              <CalendarClock aria-hidden size={20} />
            </header>
            <div className={styles.twoColumnFields}>
              <label className={styles.field} htmlFor="pickup-start">
                <span>Starts</span>
                <input
                  aria-invalid={!isFuture}
                  id="pickup-start"
                  min={localDateTime(new Date().toISOString())}
                  onChange={(inputEvent) =>
                    setStartsAt(inputEvent.target.value)
                  }
                  type="datetime-local"
                  value={startsAt}
                />
                <small>
                  {isFuture
                    ? event.timezone.replaceAll("_", " ")
                    : "Choose a future start time."}
                </small>
              </label>
              <label className={styles.field} htmlFor="pickup-capacity">
                <span>Total player spots</span>
                <span className={styles.capacityControl}>
                  <button
                    aria-label="Remove one spot"
                    disabled={
                      capacity <= Math.max(2, confirmedParticipantCount)
                    }
                    onClick={() =>
                      setCapacity((value) =>
                        Math.max(2, confirmedParticipantCount, value - 1),
                      )
                    }
                    type="button"
                  >
                    −
                  </button>
                  <input
                    id="pickup-capacity"
                    max={100}
                    min={Math.max(2, confirmedParticipantCount)}
                    onChange={(inputEvent) =>
                      setCapacity(Number(inputEvent.target.value))
                    }
                    type="number"
                    value={capacity}
                  />
                  <button
                    aria-label="Add one spot"
                    disabled={capacity >= 100}
                    onClick={() =>
                      setCapacity((value) => Math.min(100, value + 1))
                    }
                    type="button"
                  >
                    +
                  </button>
                </span>
                <small>
                  Includes your host spot. Pickup formats may have more than
                  four players.
                </small>
              </label>
            </div>
            <fieldset className={styles.durationField}>
              <legend>How long are you playing?</legend>
              <div>
                {durationOptions.map((minutes) => (
                  <button
                    aria-pressed={durationMinutes === minutes}
                    className={
                      durationMinutes === minutes ? styles.selected : undefined
                    }
                    key={minutes}
                    onClick={() => setDurationMinutes(minutes)}
                    type="button"
                  >
                    <Numeric tier="table">
                      {minutes < 120 ? `${minutes}m` : `${minutes / 60}h`}
                    </Numeric>
                  </button>
                ))}
              </div>
              <small>
                <Clock3 aria-hidden size={15} /> Ends {timeLabel(endIso)}
              </small>
            </fieldset>
          </section>

          <section className={styles.formCard}>
            <header className={styles.cardHeader}>
              <span className={styles.step}>03</span>
              <div>
                <h2>Confirm the place</h2>
                <p>A verified pin gives players reliable directions.</p>
              </div>
              <MapPin aria-hidden size={20} />
            </header>
            <label className={styles.field} htmlFor="pickup-place">
              <span>Venue or address</span>
              <PlaceSearch
                id="pickup-place"
                onPlace={choosePlace}
                onValue={(value) => {
                  setAddress(value);
                  setVenueName(value);
                  setLocationConfidence("approximate");
                }}
                value={address ?? venueName}
              />
            </label>
            <div
              className={
                locationConfidence === "confirmed"
                  ? styles.locationConfirmed
                  : styles.locationApproximate
              }
            >
              {locationConfidence === "confirmed" ? (
                <Check aria-hidden size={18} />
              ) : (
                <MapPin aria-hidden size={18} />
              )}
              <span>
                <strong>
                  {locationConfidence === "confirmed"
                    ? "Directions confirmed"
                    : "Pin needs confirmation"}
                </strong>
                <small>
                  {locationConfidence === "confirmed"
                    ? address
                    : "Choose a suggested place for the most reliable map pin."}
                </small>
              </span>
            </div>
          </section>

          <section className={styles.formCard}>
            <header className={styles.cardHeader}>
              <span className={styles.step}>04</span>
              <div>
                <h2>Choose who can join</h2>
                <p>These controls change discovery and confirmation.</p>
              </div>
              <Eye aria-hidden size={20} />
            </header>
            <fieldset className={styles.choiceGrid}>
              <legend>Discovery</legend>
              <button
                aria-pressed={visibility === "public"}
                className={
                  visibility === "public" ? styles.selected : undefined
                }
                onClick={() => setVisibility("public")}
                type="button"
              >
                <Globe2 aria-hidden size={20} />
                <span>
                  <strong>Public</strong>
                  <small>Visible in Discover and open by link.</small>
                </span>
                <Check aria-hidden className={styles.choiceCheck} size={17} />
              </button>
              <button
                aria-pressed={visibility === "unlisted"}
                className={
                  visibility === "unlisted" ? styles.selected : undefined
                }
                onClick={() => setVisibility("unlisted")}
                type="button"
              >
                <Link2 aria-hidden size={20} />
                <span>
                  <strong>Unlisted</strong>
                  <small>
                    Hidden from Discover; anyone with the link can open.
                  </small>
                </span>
                <Check aria-hidden className={styles.choiceCheck} size={17} />
              </button>
            </fieldset>
            <label className={styles.approvalToggle}>
              <span className={styles.toggleCopy}>
                <ShieldCheck aria-hidden size={20} />
                <span>
                  <strong>Approve players before they join</strong>
                  <small>
                    Requests wait for you before checkout or confirmation.
                  </small>
                </span>
              </span>
              <input
                checked={approvalRequired}
                onChange={(inputEvent) =>
                  setApprovalRequired(inputEvent.target.checked)
                }
                type="checkbox"
              />
            </label>
            <label className={styles.approvalToggle}>
              <span className={styles.toggleCopy}>
                <UsersRound aria-hidden size={20} />
                <span>
                  <strong>Enable waitlist when full</strong>
                  <small>
                    Players can line up for the next opening without taking a
                    confirmed spot.
                  </small>
                </span>
              </span>
              <input
                checked={waitlistEnabled}
                onChange={(inputEvent) =>
                  setWaitlistEnabled(inputEvent.target.checked)
                }
                type="checkbox"
              />
            </label>
          </section>
        </div>

        <aside className={styles.review}>
          <div className={styles.reviewCard}>
            <div className={styles.reviewStatus}>
              <span>{isDirty ? "Unpublished changes" : "Pickup is live"}</span>
              <i />
            </div>
            <span className={styles.reviewEyebrow}>Player preview</span>
            <h2>{title.trim() || "Untitled pickup"}</h2>
            <div className={styles.reviewTime}>
              <CalendarClock aria-hidden size={19} />
              <span>
                <strong>{timeLabel(startIso)}</strong>
                <small>
                  {durationMinutes} minutes · ends {timeLabel(endIso)}
                </small>
              </span>
            </div>
            <div className={styles.reviewDetail}>
              <MapPin aria-hidden size={19} />
              <span>
                <strong>{venueName || "Choose a venue"}</strong>
                <small>
                  {locationConfidence === "confirmed"
                    ? "Confirmed location"
                    : "Approximate location"}
                </small>
              </span>
            </div>
            <div className={styles.reviewDetail}>
              <UsersRound aria-hidden size={19} />
              <span>
                <strong>
                  <Numeric tier="table">{capacity}</Numeric> player spots
                </strong>
                <small>
                  {approvalRequired
                    ? "Host approval required"
                    : "Instant confirmation"}
                  {waitlistEnabled ? " · Waitlist on" : " · Waitlist off"}
                </small>
              </span>
            </div>
            <div className={styles.reviewVisibility}>
              {visibility === "public" ? (
                <Globe2 aria-hidden size={17} />
              ) : (
                <Link2 aria-hidden size={17} />
              )}
              {visibility === "public" ? "Public in Discover" : "Unlisted link"}
            </div>
            <div className={styles.guard}>
              <ShieldCheck aria-hidden size={18} />
              Core details lock at the start time. Until then, only the creator
              can publish edits.
            </div>
            {message && (
              <p className={styles.message} role="status">
                {message}
              </p>
            )}
            <button
              className={styles.saveButton}
              disabled={pending || !canSave || !isDirty}
              type="submit"
            >
              {pending ? "Saving…" : "Save and publish"}
              {pending ? (
                <Clock3 aria-hidden size={17} />
              ) : (
                <ArrowRight aria-hidden size={17} />
              )}
            </button>
            <Link className={styles.cancelLink} href={`/events/${event.slug}`}>
              Keep current details
            </Link>
          </div>
        </aside>
      </form>
    </main>
  );
}
