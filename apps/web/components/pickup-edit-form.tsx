"use client";

import type { EventSummary } from "@duna/core";
import { ArrowLeft, Check, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { updatePickupAction } from "@/app/events/[slug]/actions";
import { PlaceSearch, type PlaceDetails } from "./place-search";

function localDateTime(iso: string) {
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function PickupEditForm({ event }: { readonly event: EventSummary }) {
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
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [message, setMessage] = useState("");
  const endIso = useMemo(() => {
    const start = new Date(startsAt);
    return Number.isNaN(start.getTime())
      ? undefined
      : new Date(start.getTime() + durationMinutes * 60_000).toISOString();
  }, [durationMinutes, startsAt]);

  function choosePlace(place: PlaceDetails) {
    setVenueName(place.name ?? place.address ?? venueName);
    setAddress(place.address);
    setGooglePlaceId(place.placeId);
    setLatitude(place.latitude);
    setLongitude(place.longitude);
    setLocationConfidence("confirmed");
  }

  function save() {
    setMessage("");
    startTransition(async () => {
      const start = new Date(startsAt);
      if (Number.isNaN(start.getTime()) || !endIso) {
        setMessage("Choose a valid future start and duration.");
        return;
      }
      const response = await updatePickupAction({
        pickupSessionId: event.id,
        slug: event.slug,
        title,
        startsAt: start.toISOString(),
        endsAt: endIso,
        venueName,
        address,
        googlePlaceId,
        latitude,
        longitude,
        locationConfidence,
        capacity,
        note: note.trim() || undefined,
        approvalRequired,
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
    <div className="pickup-edit">
      <header>
        <Link href={`/events/${event.slug}`}>
          <ArrowLeft aria-hidden size={16} /> Back to pickup
        </Link>
        <span className="page-eyebrow">Host controls</span>
        <h1>Edit before anyone joins.</h1>
        <p>
          Once another player confirms a spot, core details lock so no one is
          surprised by a silent change.
        </p>
      </header>
      <section>
        <div className="pickup-edit__grid">
          <label>
            <span>Pickup name</span>
            <input
              maxLength={140}
              onChange={(e) => setTitle(e.target.value)}
              value={title}
            />
          </label>
          <label>
            <span>Starts</span>
            <input
              onChange={(e) => setStartsAt(e.target.value)}
              type="datetime-local"
              value={startsAt}
            />
          </label>
          <label>
            <span>Length</span>
            <select
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              value={durationMinutes}
            >
              {[60, 90, 120, 150, 180].map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Spots</span>
            <input
              max={100}
              min={2}
              onChange={(e) => setCapacity(Number(e.target.value))}
              type="number"
              value={capacity}
            />
          </label>
          <label className="pickup-edit__wide">
            <span>
              <MapPin aria-hidden size={15} /> Venue or address
            </span>
            <PlaceSearch
              onPlace={choosePlace}
              onValue={(value) => {
                setAddress(value);
                setVenueName(value);
                setLocationConfidence("approximate");
              }}
              value={address ?? venueName}
            />
            <small>
              {locationConfidence === "confirmed"
                ? "Confirmed Google place"
                : "Approximate location"}
            </small>
          </label>
          <label className="pickup-edit__wide">
            <span>Notes · Markdown supported</span>
            <textarea
              maxLength={2_000}
              onChange={(e) => setNote(e.target.value)}
              rows={6}
              value={note}
            />
          </label>
        </div>
        <div className="pickup-edit__rules">
          <label>
            <input
              checked={approvalRequired}
              onChange={(e) => setApprovalRequired(e.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Require approval</strong>
              Requests reach you first. Approval happens before checkout.
            </span>
          </label>
          <label>
            <input
              checked={visibility === "unlisted"}
              onChange={(e) =>
                setVisibility(e.target.checked ? "unlisted" : "public")
              }
              type="checkbox"
            />
            <span>
              <strong>Unlisted</strong>
              Anyone with the link can open it; it is hidden from discovery.
            </span>
          </label>
        </div>
        <div className="pickup-edit__guard">
          <ShieldCheck aria-hidden size={18} />
          Core details lock after the first other player confirms.
        </div>
        {message && <p role="status">{message}</p>}
        <button disabled={pending} onClick={save} type="button">
          <Check aria-hidden size={16} />
          {pending ? "Saving…" : "Save pickup"}
        </button>
      </section>
    </div>
  );
}
