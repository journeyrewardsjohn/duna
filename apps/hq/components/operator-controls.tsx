"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarOff,
  CalendarPlus,
  Check,
  CircleAlert,
  CreditCard,
  Gauge,
  ImageIcon,
  Landmark,
  MapPinned,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UploadCloud,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState, type ReactNode } from "react";
import {
  activateCourtAction,
  blockCourtTimeAction,
  createCourtAction,
  createPlayerInvitationAction,
  createProgramSessionAction,
  createRatePlanAction,
  createVenueAction,
  draftCourtScheduleAction,
  publishSessionAction,
  publishVenueAction,
  replaceCourtScheduleAction,
  saveMessageDraftAction,
  startStripeOnboardingAction,
  updateCourtBookingConfigurationAction,
  updateVenueProfileAction,
  type OperatorActionState,
} from "@/app/actions";
import { createVenueMediaPath, optimizeImageUpload } from "@/lib/media-storage";
import type { OperatorModule } from "./navigation";

const initialOperatorActionState: OperatorActionState = {
  status: "idle",
  message: "",
};

function ActionNotice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`operator-action-notice operator-action-notice--${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.status === "success" ? (
        <Check aria-hidden size={15} />
      ) : (
        <CircleAlert aria-hidden size={15} />
      )}
      {state.message}
    </p>
  );
}

function SubmitButton({
  pending,
  children,
  secondary,
  disabled,
}: {
  readonly pending: boolean;
  readonly children: ReactNode;
  readonly secondary?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      className={`hq-button ${
        secondary ? "hq-button--secondary" : "hq-button--primary"
      }`}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function MoneyInput({
  label,
  name,
  defaultValue,
  required,
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue?: string;
  readonly required?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="operator-money-input">
        <small>$</small>
        <input
          type="number"
          name={name}
          min="0"
          step="0.01"
          defaultValue={defaultValue}
          required={required}
          inputMode="decimal"
        />
      </span>
    </label>
  );
}

function PlayerInvitationComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [isMinor, setIsMinor] = useState(false);
  const [state, action, pending] = useActionState(
    createPlayerInvitationAction,
    initialOperatorActionState,
  );
  return (
    <div className="operator-controls-grid operator-people-controls">
      <section className="hq-card operator-control-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">People · invite</span>
            <h2>Add a player without creating an identity for them.</h2>
            <p>
              Adults claim their own profile. Minors are routed to a parent or
              guardian and remain private while the relationship is reviewed.
            </p>
          </div>
          <UserPlus aria-hidden size={24} />
        </header>
        <form action={action} className="operator-form">
          <div className="operator-form-grid operator-form-grid--two">
            <label>
              <span>Player name</span>
              <input name="invitedName" required />
            </label>
            <label>
              <span>Relationship</span>
              <select name="relationship" defaultValue="player">
                <option value="player">Player</option>
                <option value="member">Member</option>
              </select>
            </label>
            {!isMinor && (
              <>
                <label>
                  <span>Player email</span>
                  <input name="invitedEmail" type="email" />
                </label>
                <label>
                  <span>Player mobile · E.164</span>
                  <input
                    name="invitedPhoneE164"
                    inputMode="tel"
                    placeholder="+17045550123"
                  />
                </label>
              </>
            )}
          </div>
          <label className="operator-switch">
            <input
              type="checkbox"
              name="isMinor"
              value="true"
              checked={isMinor}
              onChange={(event) => setIsMinor(event.target.checked)}
            />
            <span>
              <strong>This player is a minor</strong>
              Send the invitation to a parent or guardian and create the child
              profile only after acceptance.
            </span>
          </label>
          {isMinor && (
            <fieldset className="operator-guardian-fields">
              <legend>Parent or guardian</legend>
              <div className="operator-form-grid operator-form-grid--two">
                <label>
                  <span>Name</span>
                  <input name="guardianName" required />
                </label>
                <label>
                  <span>Email</span>
                  <input name="guardianEmail" type="email" />
                </label>
                <label className="operator-field--wide">
                  <span>Mobile · E.164</span>
                  <input
                    name="guardianPhoneE164"
                    inputMode="tel"
                    placeholder="+17045550123"
                  />
                </label>
              </div>
            </fieldset>
          )}
          <label className="operator-confirmation">
            <input type="checkbox" name="confirmed" value="true" required />
            <span>
              <strong>I checked this recipient.</strong>
              SMS is transactional. A minor’s guardian must accept before the
              player joins the roster.
            </span>
          </label>
          <div className="operator-form-footer">
            <ActionNotice state={state} />
            <SubmitButton pending={pending}>Create invitation</SubmitButton>
          </div>
        </form>
      </section>
      <section className="hq-card operator-control-card operator-invite-status">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Invitation rail</span>
            <h2>{workspace.invitations.length} recent invitations</h2>
            <p>
              SMS uses Sent.dm. Email delivery remains a configuration gate.
            </p>
          </div>
          <Badge tone={workspace.deliveryProviders.sms ? "live" : "warning"}>
            SMS {workspace.deliveryProviders.sms ? "ready" : "needs key"}
          </Badge>
        </header>
        <div className="operator-compact-list">
          {workspace.invitations.map((invitation) => (
            <article key={invitation.id}>
              <span>
                <strong>{invitation.invitedName}</strong>
                <small>
                  {invitation.isMinor ? "Minor · guardian routed" : "Adult"} ·{" "}
                  {invitation.deliveryChannel ?? "link"} ·{" "}
                  {invitation.deliveryStatus}
                </small>
              </span>
              <Badge
                tone={
                  invitation.status === "claimed"
                    ? "live"
                    : invitation.status === "pending"
                      ? "warning"
                      : "neutral"
                }
              >
                {invitation.status}
              </Badge>
            </article>
          ))}
          {workspace.invitations.length === 0 && (
            <div className="hq-empty">
              <strong>No invitations yet.</strong>
              <span>The first player invitation will appear here.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function RatePlanComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createRatePlanAction,
    initialOperatorActionState,
  );
  return (
    <section className="hq-card operator-control-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Pricing controls</span>
          <h2>Create a court rate plan</h2>
          <p>
            Prices use {workspace.organization.currency} and remain inactive
            until attached to a court.
          </p>
        </div>
        <Landmark aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Plan name</span>
            <input
              name="name"
              placeholder="Peak court hour"
              maxLength={80}
              required
            />
          </label>
          <label>
            <span>Rate unit</span>
            <select name="rateUnitMinutes" defaultValue="60">
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
              <option value="90">90 minutes</option>
              <option value="120">120 minutes</option>
            </select>
          </label>
          <MoneyInput
            label="Base price"
            name="baseAmount"
            defaultValue="0.00"
            required
          />
          <MoneyInput label="Member price" name="memberAmount" />
          <MoneyInput label="Public price" name="nonMemberAmount" />
        </div>
        <label className="operator-confirmation">
          <input type="checkbox" name="confirmed" value="true" required />
          <span>
            <strong>I reviewed these exact prices.</strong>
            Price creation is audit-logged and never delegated to Duna AI.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending}>
            <Plus aria-hidden size={16} /> Create rate plan
          </SubmitButton>
        </div>
      </form>
      {workspace.ratePlans.length > 0 && (
        <div className="operator-compact-list">
          {workspace.ratePlans.map((rate) => (
            <article key={rate.id}>
              <span>
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
      )}
    </section>
  );
}

function VenueComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createVenueAction,
    initialOperatorActionState,
  );
  return (
    <section className="hq-card operator-control-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Facility hierarchy</span>
          <h2>Add a venue</h2>
          <p>New venues begin as private drafts.</p>
        </div>
        <MapPinned aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Venue name</span>
            <input name="name" placeholder="Manhattan Beach Pier" required />
          </label>
          <label>
            <span>Venue capacity</span>
            <input
              type="number"
              name="capacity"
              min="0"
              defaultValue="0"
              required
            />
          </label>
          <label className="operator-field--wide">
            <span>Player-facing description</span>
            <textarea
              name="description"
              rows={3}
              placeholder="A bright, welcoming home for training and play."
            />
          </label>
          <label className="operator-field--wide">
            <span>Venue hero image URL</span>
            <input type="url" name="heroImageUrl" placeholder="https://…" />
          </label>
          <label className="operator-field--wide">
            <span>Amenities</span>
            <input
              name="amenities"
              placeholder="Showers, parking, pro shop, covered courts"
            />
          </label>
          <label className="operator-field--wide">
            <span>Street or beach access</span>
            <input name="addressLine1" placeholder="1200 Ocean Drive" />
          </label>
          <label>
            <span>City</span>
            <input name="locality" placeholder="Manhattan Beach" />
          </label>
          <label>
            <span>State / region</span>
            <input name="administrativeArea" placeholder="CA" />
          </label>
          <label>
            <span>Postal code</span>
            <input name="postalCode" placeholder="90266" />
          </label>
          <label>
            <span>Country</span>
            <input name="countryCode" defaultValue="US" maxLength={2} />
          </label>
          <label className="operator-field--wide">
            <span>Venue timezone</span>
            <input
              name="timezone"
              defaultValue={workspace.organization.timezone}
              required
            />
          </label>
        </div>
        <label className="operator-switch">
          <input type="checkbox" name="temporary" value="true" />
          <span>
            <strong>Temporary event venue</strong>
            Use for a beach or pop-up location with a finite lifecycle.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending}>
            <Plus aria-hidden size={16} /> Create venue draft
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function CourtComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createCourtAction,
    initialOperatorActionState,
  );
  const hasVenues = workspace.venues.length > 0;
  return (
    <section className="hq-card operator-control-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Bookable resources</span>
          <h2>Add a court</h2>
          <p>
            Duration, buffers, notice, audience, and pricing are enforced on the
            server.
          </p>
        </div>
        <Waves aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Venue</span>
            <select name="venueId" required disabled={!hasVenues}>
              {workspace.venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name} · {venue.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Court name</span>
            <input name="name" placeholder="Court 3" required />
          </label>
          <label>
            <span>Comfortable capacity</span>
            <input
              type="number"
              name="capacity"
              min="1"
              defaultValue="12"
              required
            />
          </label>
          <label>
            <span>Surface</span>
            <select name="surface" defaultValue="sand">
              <option value="sand">Sand</option>
              <option value="grass">Grass</option>
              <option value="indoor-sand">Indoor sand</option>
              <option value="hardcourt">Hardcourt</option>
            </select>
          </label>
          <label>
            <span>Booking audience</span>
            <select name="bookingPolicy" defaultValue="public">
              <option value="public">Public</option>
              <option value="members">Members</option>
              <option value="tiers">Selected tiers</option>
              <option value="staff">Staff only</option>
              <option value="none">Not independently bookable</option>
            </select>
          </label>
          <label className="operator-field--wide">
            <span>Rate plan</span>
            <select name="ratePlanId" defaultValue="">
              <option value="">Choose before activation</option>
              {workspace.ratePlans.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name} ·{" "}
                  {formatMoney(rate.baseAmountMinor, rate.currency)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Minimum duration</span>
            <select name="minimumDurationMinutes" defaultValue="60">
              <option value="30">30 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </select>
          </label>
          <label>
            <span>Maximum duration</span>
            <select name="maximumDurationMinutes" defaultValue="120">
              <option value="60">60 min</option>
              <option value="90">90 min</option>
              <option value="120">2 hours</option>
              <option value="180">3 hours</option>
            </select>
          </label>
          <label>
            <span>Bookable lengths</span>
            <input
              name="durationOptionsMinutes"
              defaultValue="60,90,120"
              placeholder="60,90,120"
              required
            />
          </label>
          <label>
            <span>Start-time increment</span>
            <select name="bookingIncrementMinutes" defaultValue="30">
              <option value="15">Every 15 min</option>
              <option value="30">Every 30 min</option>
              <option value="60">Every hour</option>
            </select>
          </label>
          <label>
            <span>Setup buffer</span>
            <select name="bufferBeforeMinutes" defaultValue="0">
              <option value="0">None</option>
              <option value="10">10 min</option>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
            </select>
          </label>
          <label>
            <span>Reset buffer</span>
            <select name="bufferAfterMinutes" defaultValue="0">
              <option value="0">None</option>
              <option value="10">10 min</option>
              <option value="15">15 min</option>
              <option value="30">30 min</option>
            </select>
          </label>
          <label>
            <span>Minimum notice</span>
            <select name="minimumNoticeMinutes" defaultValue="60">
              <option value="0">None</option>
              <option value="60">1 hour</option>
              <option value="240">4 hours</option>
              <option value="1440">24 hours</option>
            </select>
          </label>
          <label>
            <span>Book ahead</span>
            <select name="maximumAdvanceDays" defaultValue="90">
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </label>
        </div>
        <label className="operator-switch">
          <input type="checkbox" name="lit" value="true" />
          <span>
            <strong>Lit after dark</strong>
            Player discovery may show evening availability.
          </span>
        </label>
        {!hasVenues && (
          <p className="operator-inline-warning">
            <CircleAlert aria-hidden size={15} /> Create a venue first.
          </p>
        )}
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending} disabled={!hasVenues}>
            <Plus aria-hidden size={16} /> Create court draft
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function ConfirmCourt({
  court,
}: {
  readonly court: OperatorWorkspace["venues"][number]["courts"][number];
}) {
  const [state, action, pending] = useActionState(
    activateCourtAction,
    initialOperatorActionState,
  );
  if (court.status !== "draft") return null;
  return (
    <form action={action} className="operator-inline-action">
      <input type="hidden" name="courtId" value={court.id} />
      <input type="hidden" name="confirmed" value="true" />
      <ActionNotice state={state} />
      <SubmitButton pending={pending} secondary>
        Confirm & activate
      </SubmitButton>
    </form>
  );
}

function ConfirmVenue({
  venue,
}: {
  readonly venue: OperatorWorkspace["venues"][number];
}) {
  const [state, action, pending] = useActionState(
    publishVenueAction,
    initialOperatorActionState,
  );
  if (venue.status !== "draft") return null;
  return (
    <form action={action} className="operator-inline-action">
      <input type="hidden" name="venueId" value={venue.id} />
      <input type="hidden" name="confirmed" value="true" />
      <ActionNotice state={state} />
      <SubmitButton pending={pending}>
        Publish venue <ArrowUpRight aria-hidden size={15} />
      </SubmitButton>
    </form>
  );
}

function VenueProfileEditor({
  venue,
  organizationId,
}: {
  readonly venue: OperatorWorkspace["venues"][number];
  readonly organizationId: string;
}) {
  const [state, action, pending] = useActionState(
    updateVenueProfileAction,
    initialOperatorActionState,
  );
  const [heroImageUrl, setHeroImageUrl] = useState(venue.heroImageUrl ?? "");
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const uploadVenueImage = async (file?: File) => {
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
      if (!stored.url) {
        throw new Error("Duna storage did not return a venue image URL.");
      }
      setHeroImageUrl(stored.url);
      setUploadState("ready");
      setUploadMessage("Image optimized and ready to save.");
    } catch (error) {
      setUploadState("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Venue image upload failed.",
      );
    }
  };
  return (
    <details className="operator-inline-editor">
      <summary>
        <ImageIcon aria-hidden size={16} /> Venue story & image
      </summary>
      <form action={action} className="operator-form">
        <input type="hidden" name="venueId" value={venue.id} />
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Venue capacity</span>
            <input
              type="number"
              name="capacity"
              min="0"
              defaultValue={venue.capacity}
              required
            />
          </label>
          <label className="operator-field--wide">
            <span>Player-facing description</span>
            <textarea
              name="description"
              rows={3}
              defaultValue={venue.description}
              placeholder="What should players know and feel about this venue?"
            />
          </label>
          <div className="operator-field--wide operator-venue-image">
            <span>Venue image</span>
            {heroImageUrl && (
              <div
                aria-label="Current venue image"
                className="operator-venue-image__preview"
                style={{ backgroundImage: `url("${heroImageUrl}")` }}
              />
            )}
            <label className="operator-venue-image__upload">
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
                onChange={(event) => {
                  void uploadVenueImage(event.target.files?.[0]);
                }}
                type="file"
              />
            </label>
            {uploadMessage && (
              <p
                className={`operator-upload-status operator-upload-status--${uploadState}`}
                role={uploadState === "error" ? "alert" : "status"}
              >
                {uploadMessage}
              </p>
            )}
            <details className="operator-image-url">
              <summary>Or paste an image URL</summary>
              <input
                onChange={(event) => setHeroImageUrl(event.target.value)}
                placeholder="https://…"
                type="url"
                value={heroImageUrl}
              />
            </details>
            <input name="heroImageUrl" type="hidden" value={heroImageUrl} />
          </div>
          <label className="operator-field--wide">
            <span>Amenities</span>
            <input
              name="amenities"
              defaultValue={venue.amenities.join(", ")}
              placeholder="Parking, showers, pro shop"
            />
          </label>
        </div>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton
            disabled={uploadState === "uploading"}
            pending={pending}
          >
            Save venue profile
          </SubmitButton>
        </div>
      </form>
    </details>
  );
}

function CourtConfigurationEditor({
  court,
  ratePlans = [],
}: {
  readonly court: OperatorWorkspace["venues"][number]["courts"][number];
  readonly ratePlans?: OperatorWorkspace["ratePlans"];
}) {
  const [state, action, pending] = useActionState(
    updateCourtBookingConfigurationAction,
    initialOperatorActionState,
  );
  return (
    <details className="operator-inline-editor">
      <summary>
        <Gauge aria-hidden size={16} /> Booking rules
      </summary>
      <form action={action} className="operator-form">
        <input type="hidden" name="courtId" value={court.id} />
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Capacity</span>
            <input
              type="number"
              name="capacity"
              min="1"
              defaultValue={court.capacity}
              required
            />
          </label>
          <label>
            <span>Rate plan</span>
            <select name="ratePlanId" defaultValue={court.ratePlanId ?? ""}>
              <option value="">Not available for paid checkout</option>
              {ratePlans.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.name} ·{" "}
                  {formatMoney(
                    rate.nonMemberAmountMinor ?? rate.baseAmountMinor,
                    rate.currency,
                  )}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Bookable lengths</span>
            <input
              name="durationOptionsMinutes"
              defaultValue={court.durationOptionsMinutes.join(",")}
              required
            />
          </label>
          <label>
            <span>Start-time increment</span>
            <select
              name="bookingIncrementMinutes"
              defaultValue={court.bookingIncrementMinutes}
            >
              <option value="15">15 minutes</option>
              <option value="30">30 minutes</option>
              <option value="60">60 minutes</option>
            </select>
          </label>
          <label>
            <span>Minimum notice · minutes</span>
            <input
              type="number"
              name="minimumNoticeMinutes"
              min="0"
              defaultValue={court.minimumNoticeMinutes}
              required
            />
          </label>
          <label>
            <span>Booking horizon · days</span>
            <input
              type="number"
              name="maximumAdvanceDays"
              min="1"
              defaultValue={court.maximumAdvanceDays}
              required
            />
          </label>
          <label className="operator-field--wide">
            <span>Cancellation policy title</span>
            <input
              name="policyTitle"
              defaultValue={court.cancellationPolicy.title}
              required
            />
          </label>
          <label className="operator-field--wide">
            <span>Cancellation policy</span>
            <textarea
              name="policyMarkdown"
              rows={5}
              defaultValue={court.cancellationPolicy.markdown}
              required
            />
          </label>
          <label>
            <span>Refund until · hours before</span>
            <input
              type="number"
              name="refundBeforeHours"
              min="0"
              defaultValue={court.cancellationPolicy.refundBeforeHours ?? 24}
              required
            />
          </label>
          <label>
            <span>Credit until · hours before</span>
            <input
              type="number"
              name="creditBeforeHours"
              min="0"
              defaultValue={court.cancellationPolicy.creditBeforeHours ?? 2}
              required
            />
          </label>
          <label className="operator-field--wide">
            <span>Late cancellation result</span>
            <input
              name="lateCancellation"
              defaultValue={court.cancellationPolicy.lateCancellation}
              placeholder="Non-refundable inside the cancellation window."
            />
          </label>
        </div>
        <label className="operator-switch">
          <input
            type="checkbox"
            name="requireFullScroll"
            value="true"
            defaultChecked={court.cancellationPolicy.requireFullScroll}
          />
          <span>
            <strong>Require players to read the full policy</strong>
            Checkout stays locked until they reach the end.
          </span>
        </label>
        <label className="operator-confirmation">
          <input type="checkbox" name="confirmed" value="true" required />
          <span>
            <strong>I reviewed these booking rules.</strong>
            The change is audit-logged and affects new reservations.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending}>Apply booking rules</SubmitButton>
        </div>
      </form>
    </details>
  );
}

const scheduleDayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function scheduleTime(minute: number) {
  const hour = Math.floor(minute / 60);
  const minutes = minute % 60;
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2020, 0, 1, hour, minutes)));
}

function ScheduleCopilot({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const courts = workspace.venues.flatMap((venue) =>
    venue.courts.map((court) => ({ ...court, venueName: venue.name })),
  );
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [draftState, draftAction, draftPending] = useActionState(
    draftCourtScheduleAction,
    initialOperatorActionState,
  );
  const [applyState, applyAction, applyPending] = useActionState(
    replaceCourtScheduleAction,
    initialOperatorActionState,
  );
  const [blockState, blockAction, blockPending] = useActionState(
    blockCourtTimeAction,
    initialOperatorActionState,
  );
  return (
    <section className="hq-card operator-control-card operator-control-card--wide">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Duna AI · schedule copilot</span>
          <h2>Describe when a court should be open.</h2>
          <p>
            Duna turns plain language into a weekly draft. Nothing changes until
            you review and confirm.
          </p>
        </div>
        <Sparkles aria-hidden size={24} />
      </header>
      {courts.length > 0 ? (
        <>
          <label className="operator-copilot-court">
            <span>Court</span>
            <select
              value={courtId}
              onChange={(event) => setCourtId(event.target.value)}
            >
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.venueName} · {court.name}
                </option>
              ))}
            </select>
          </label>
          <form action={draftAction} className="operator-copilot-form">
            <textarea
              name="prompt"
              rows={3}
              defaultValue="Open weekdays from 8am to 10pm and weekends from 7am to 8pm for court rentals."
              required
            />
            <SubmitButton pending={draftPending}>
              <Sparkles aria-hidden size={16} /> Draft schedule
            </SubmitButton>
          </form>
          <ActionNotice state={draftState} />
          {draftState.scheduleProposal && (
            <div className="operator-schedule-proposal">
              <header>
                <strong>{draftState.scheduleProposal.summary}</strong>
                <Badge>Proposed</Badge>
              </header>
              <div>
                {draftState.scheduleProposal.blocks.map((block) => (
                  <span key={`${block.weekday}-${block.startsAtMinute}`}>
                    <strong>{scheduleDayNames[block.weekday]}</strong>
                    <small>
                      {scheduleTime(block.startsAtMinute)}–
                      {scheduleTime(block.endsAtMinute)}
                    </small>
                  </span>
                ))}
              </div>
              <ul>
                {draftState.scheduleProposal.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
              <form action={applyAction}>
                <input type="hidden" name="courtId" value={courtId} />
                <input
                  type="hidden"
                  name="blocks"
                  value={JSON.stringify(draftState.scheduleProposal.blocks)}
                />
                <input type="hidden" name="confirmed" value="true" />
                <div className="operator-form-footer">
                  <ActionNotice state={applyState} />
                  <SubmitButton pending={applyPending}>
                    Confirm & publish schedule
                  </SubmitButton>
                </div>
              </form>
            </div>
          )}
          <details className="operator-blackout">
            <summary>
              <CalendarOff aria-hidden size={16} /> Block a date or maintenance
              window
            </summary>
            <form action={blockAction} className="operator-form">
              <input type="hidden" name="courtId" value={courtId} />
              <div className="operator-form-grid operator-form-grid--two">
                <label>
                  <span>Starts</span>
                  <input type="datetime-local" name="localStartsAt" required />
                </label>
                <label>
                  <span>Ends</span>
                  <input type="datetime-local" name="localEndsAt" required />
                </label>
                <label className="operator-field--wide">
                  <span>Reason</span>
                  <input name="reason" placeholder="Net maintenance" required />
                </label>
              </div>
              <label className="operator-confirmation">
                <input type="checkbox" name="confirmed" value="true" required />
                <span>
                  <strong>Block this time from new reservations.</strong>
                  Existing bookings remain visible for staff review.
                </span>
              </label>
              <div className="operator-form-footer">
                <ActionNotice state={blockState} />
                <SubmitButton pending={blockPending} secondary>
                  Block court time
                </SubmitButton>
              </div>
            </form>
          </details>
        </>
      ) : (
        <div className="hq-empty">
          <strong>Add a court before drafting availability.</strong>
          <span>The schedule copilot will appear here automatically.</span>
        </div>
      )}
    </section>
  );
}

function FacilityInventory({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  return (
    <section className="hq-card operator-control-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Live configuration</span>
          <h2>{workspace.venues.length} venues</h2>
          <p>
            Drafts remain invisible to players until you confirm publication.
          </p>
        </div>
        <Badge>
          {workspace.venues.reduce(
            (total, venue) => total + venue.courts.length,
            0,
          )}{" "}
          courts
        </Badge>
      </header>
      <div className="operator-facility-list">
        {workspace.venues.map((venue) => (
          <article
            className="operator-facility"
            key={venue.id}
            style={
              venue.heroImageTreatmentUrl || venue.heroImageUrl
                ? {
                    backgroundImage: `linear-gradient(110deg, rgba(7, 24, 37, .96), rgba(7, 24, 37, .66)), url(${venue.heroImageTreatmentUrl ?? venue.heroImageUrl})`,
                  }
                : undefined
            }
          >
            <header>
              <span>
                <strong>{venue.name}</strong>
                <small>
                  {venue.locality ?? "City missing"} · {venue.timezone}
                </small>
              </span>
              <Badge tone={venue.status === "active" ? "live" : "warning"}>
                {venue.status}
              </Badge>
            </header>
            <section className="operator-venue-metrics">
              <span>
                <small>Utilization · 30d</small>
                <Numeric>{venue.utilization.percent.toFixed(1)}%</Numeric>
              </span>
              <span>
                <small>Bookings</small>
                <Numeric>{venue.utilization.bookingCount30d}</Numeric>
              </span>
              <span>
                <small>Capacity</small>
                <Numeric>
                  {venue.capacity ||
                    venue.courts.reduce(
                      (total, court) => total + court.capacity,
                      0,
                    )}
                </Numeric>
              </span>
            </section>
            <div>
              {venue.courts.map((court) => {
                const rate = workspace.ratePlans.find(
                  (item) => item.id === court.ratePlanId,
                );
                return (
                  <section key={court.id}>
                    <span>
                      <strong>{court.name}</strong>
                      <small>
                        {court.surface} · {court.bookingPolicy} ·{" "}
                        {court.minimumDurationMinutes}–
                        {court.maximumDurationMinutes} min
                      </small>
                    </span>
                    <span>
                      <Numeric>
                        {rate
                          ? formatMoney(
                              rate.nonMemberAmountMinor ?? rate.baseAmountMinor,
                              rate.currency,
                            )
                          : "No rate"}
                      </Numeric>
                      <Badge
                        tone={court.status === "active" ? "live" : "warning"}
                      >
                        {court.status}
                      </Badge>
                      <i className="operator-utilization-bar">
                        <b
                          style={{
                            width: `${Math.max(2, court.utilization.percent)}%`,
                          }}
                        />
                      </i>
                    </span>
                    <ConfirmCourt court={court} />
                    <CourtConfigurationEditor
                      court={court}
                      ratePlans={workspace.ratePlans}
                    />
                  </section>
                );
              })}
              {venue.courts.length === 0 && (
                <p className="operator-inline-warning">
                  Add a court before this venue can be published.
                </p>
              )}
            </div>
            <VenueProfileEditor
              organizationId={workspace.organization.id}
              venue={venue}
            />
            <ConfirmVenue venue={venue} />
          </article>
        ))}
        {workspace.venues.length === 0 && (
          <div className="hq-empty">
            <strong>No connected facilities yet.</strong>
            <span>Create the first venue draft below.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function SessionComposer({
  workspace,
  defaultKind,
}: {
  readonly workspace: OperatorWorkspace;
  readonly defaultKind?: OperatorWorkspace["sessions"][number]["kind"];
}) {
  const [state, action, pending] = useActionState(
    createProgramSessionAction,
    initialOperatorActionState,
  );
  const activeVenues = workspace.venues.filter(
    (venue) => venue.status === "active",
  );
  return (
    <section className="hq-card operator-control-card operator-control-card--wide">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Program + session draft</span>
          <h2>Build player-facing inventory</h2>
          <p>
            Venue time is converted server-side, including daylight-saving
            validation.
          </p>
        </div>
        <CalendarPlus aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--three">
          <label className="operator-field--wide">
            <span>Title</span>
            <input
              name="title"
              placeholder="Saturday Junior Development"
              required
            />
          </label>
          <label>
            <span>Session type</span>
            <select name="kind" defaultValue={defaultKind ?? "clinic"}>
              <option value="clinic">Clinic</option>
              <option value="open-play">Open play</option>
              <option value="private-lesson">Private lesson</option>
              <option value="league">League</option>
              <option value="tournament">Tournament</option>
              <option value="court-rental">Court rental</option>
            </select>
          </label>
          <label>
            <span>Venue</span>
            <select
              name="venueId"
              required
              disabled={activeVenues.length === 0}
            >
              {activeVenues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Court</span>
            <select name="courtId" defaultValue="">
              <option value="">Any / assign later</option>
              {activeVenues.flatMap((venue) =>
                venue.courts
                  .filter((court) => court.status === "active")
                  .map((court) => (
                    <option key={court.id} value={court.id}>
                      {venue.name} · {court.name}
                    </option>
                  )),
              )}
            </select>
          </label>
          <label>
            <span>Starts at venue</span>
            <input type="datetime-local" name="localStartsAt" required />
          </label>
          <label>
            <span>Ends at venue</span>
            <input type="datetime-local" name="localEndsAt" required />
          </label>
          <label>
            <span>Capacity</span>
            <input
              type="number"
              name="capacity"
              min="1"
              defaultValue="16"
              required
            />
          </label>
          <label>
            <span>Minimum to run</span>
            <input
              type="number"
              name="minimumCapacity"
              min="1"
              defaultValue="4"
              required
            />
          </label>
          <MoneyInput
            label="Player price"
            name="price"
            defaultValue="0.00"
            required
          />
          <label className="operator-field--full">
            <span>Description</span>
            <textarea
              name="description"
              rows={4}
              placeholder="What players will work on, who it is for, and what to bring."
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input type="checkbox" name="confirmedPrice" value="true" required />
          <span>
            <strong>I reviewed the player price.</strong>
            Saving creates a private draft. Publishing is a separate explicit
            action.
          </span>
        </label>
        {activeVenues.length === 0 && (
          <p className="operator-inline-warning">
            <CircleAlert aria-hidden size={15} /> Publish an active venue before
            scheduling a session.
          </p>
        )}
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending} disabled={activeVenues.length === 0}>
            <Plus aria-hidden size={16} /> Save session draft
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function PublishSession({
  session,
}: {
  readonly session: OperatorWorkspace["sessions"][number];
}) {
  const [state, action, pending] = useActionState(
    publishSessionAction,
    initialOperatorActionState,
  );
  if (session.status !== "draft") return null;
  return (
    <form action={action} className="operator-inline-action">
      <input type="hidden" name="sessionId" value={session.id} />
      <input type="hidden" name="confirmed" value="true" />
      <ActionNotice state={state} />
      <SubmitButton pending={pending}>Confirm & open registration</SubmitButton>
    </form>
  );
}

function SessionDrafts({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const drafts = workspace.sessions.filter(
    (session) => session.status === "draft",
  );
  return (
    <section className="hq-card operator-control-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Publication gate</span>
          <h2>{drafts.length} private drafts</h2>
          <p>Paid sessions also require Stripe charges to be enabled.</p>
        </div>
        <ShieldCheck aria-hidden size={24} />
      </header>
      <div className="operator-compact-list">
        {drafts.map((session) => (
          <article key={session.id}>
            <span>
              <strong>{session.title}</strong>
              <small>
                {session.kind.replaceAll("-", " ")} ·{" "}
                {new Date(session.startsAt).toLocaleString()}
              </small>
            </span>
            <Numeric>
              {formatMoney(session.priceMinor, session.currency)}
            </Numeric>
            <PublishSession session={session} />
          </article>
        ))}
        {drafts.length === 0 && (
          <div className="hq-empty">
            <strong>No session drafts waiting.</strong>
            <span>Create one below or manage published inventory above.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function StripeOnboarding({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    startStripeOnboardingAction,
    initialOperatorActionState,
  );
  const ready = workspace.organization.stripeChargesEnabled;
  return (
    <section className="hq-card operator-control-card stripe-readiness-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Direct settlement</span>
          <h2>{ready ? "Stripe charges enabled" : "Finish Stripe Connect"}</h2>
          <p>
            Player payments settle directly to your connected business account.
            Duna does not custody club revenue.
          </p>
        </div>
        <CreditCard aria-hidden size={24} />
      </header>
      <div className="stripe-readiness-steps">
        <span className="complete">
          <Check aria-hidden size={15} /> Sandbox integration configured
        </span>
        <span
          className={workspace.organization.stripeAccountId ? "complete" : ""}
        >
          {workspace.organization.stripeAccountId ? (
            <Check aria-hidden size={15} />
          ) : (
            <Numeric>2</Numeric>
          )}
          Connected account created
        </span>
        <span className={ready ? "complete" : ""}>
          {ready ? <Check aria-hidden size={15} /> : <Numeric>3</Numeric>}
          Business verification and charges enabled
        </span>
      </div>
      {!ready && (
        <form action={action} className="operator-form">
          <div className="operator-legal-boundary">
            <ShieldCheck aria-hidden size={18} />
            <p>
              Stripe will ask <strong>you</strong> to verify the business and
              accept its legal terms. Duna cannot complete those attestations
              for you.
            </p>
          </div>
          <div className="operator-form-footer">
            <ActionNotice state={state} />
            <SubmitButton pending={pending}>
              Prepare secure Stripe link
            </SubmitButton>
          </div>
          {state.onboardingUrl && (
            <a
              className="hq-button hq-button--primary stripe-onboarding-link"
              href={state.onboardingUrl}
              rel="noreferrer"
            >
              Continue securely with Stripe{" "}
              <ArrowUpRight aria-hidden size={16} />
            </a>
          )}
        </form>
      )}
    </section>
  );
}

function MessageComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    saveMessageDraftAction,
    initialOperatorActionState,
  );
  return (
    <div className="operator-controls-grid operator-controls-grid--messages">
      <section className="hq-card operator-control-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Consent-safe composer</span>
            <h2>Save a message draft</h2>
            <p>
              Consent and guardian routing are checked again at the server
              boundary.
            </p>
          </div>
          <MessageSquareText aria-hidden size={24} />
        </header>
        <form action={action} className="operator-form">
          <div className="operator-form-grid operator-form-grid--two">
            <label className="operator-field--wide">
              <span>Recipient</span>
              <select
                name="recipientPersonId"
                required
                disabled={workspace.messageRecipients.length === 0}
              >
                {workspace.messageRecipients.map((recipient) => (
                  <option key={recipient.id} value={recipient.id}>
                    {recipient.displayName}
                    {recipient.isMinor
                      ? ` · minor · ${recipient.verifiedGuardianCount} guardian`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Classification</span>
              <select name="classification" defaultValue="transactional">
                <option value="transactional">Transactional</option>
                <option value="marketing">Marketing</option>
              </select>
            </label>
            <label>
              <span>Channel</span>
              <select name="channel" defaultValue="email">
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="push">Push</option>
              </select>
            </label>
            <label className="operator-field--full">
              <span>Subject</span>
              <input name="subject" placeholder="Saturday session update" />
            </label>
            <label className="operator-field--full">
              <span>Message</span>
              <textarea
                name="body"
                rows={7}
                placeholder="Write the exact message for review."
                required
              />
            </label>
          </div>
          <div className="operator-legal-boundary">
            <ShieldCheck aria-hidden size={18} />
            <p>
              This action saves a draft only. No email, text, or push
              notification will be sent.
            </p>
          </div>
          <div className="operator-form-footer">
            <ActionNotice state={state} />
            <SubmitButton
              pending={pending}
              disabled={workspace.messageRecipients.length === 0}
            >
              Save protected draft
            </SubmitButton>
          </div>
        </form>
      </section>
      <section className="hq-card operator-control-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Delivery readiness</span>
            <h2>Transports</h2>
          </div>
          <Sparkles aria-hidden size={24} />
        </header>
        <div className="operator-provider-list">
          {(
            [
              ["email", workspace.deliveryProviders.email],
              ["sms", workspace.deliveryProviders.sms],
              ["push", workspace.deliveryProviders.push],
            ] as const
          ).map(([provider, configured]) => (
            <article key={provider}>
              <span>
                <strong>{provider.toUpperCase()}</strong>
                <small>
                  {configured
                    ? "Credentials detected; dispatch confirmation still required."
                    : "Provider credentials not connected."}
                </small>
              </span>
              <Badge tone={configured ? "live" : "warning"}>
                {configured ? "configured" : "draft only"}
              </Badge>
            </article>
          ))}
        </div>
        <div className="operator-compact-list">
          {workspace.messageDrafts.map((draft) => (
            <article key={draft.id}>
              <span>
                <strong>{draft.recipientName}</strong>
                <small>
                  {draft.channel} · {draft.kind.replace("operator-", "")} ·{" "}
                  {draft.guardianCopyCount} guardian copies
                </small>
              </span>
              <Badge>{draft.status}</Badge>
            </article>
          ))}
          {workspace.messageDrafts.length === 0 && (
            <div className="hq-empty">
              <strong>No protected drafts.</strong>
              <span>Drafts appear here after consent checks pass.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function FacilitiesControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  return (
    <>
      <FacilityInventory workspace={workspace} />
      <ScheduleCopilot workspace={workspace} />
      <div className="operator-controls-grid">
        <VenueComposer workspace={workspace} />
        <CourtComposer workspace={workspace} />
      </div>
    </>
  );
}

export function OperatorControls({
  module,
  workspace,
}: {
  readonly module: OperatorModule;
  readonly workspace: OperatorWorkspace;
}) {
  if (module === "messages") {
    return <MessageComposer workspace={workspace} />;
  }
  if (module === "members") {
    return <PlayerInvitationComposer workspace={workspace} />;
  }
  if (module === "payments") {
    return (
      <div className="operator-controls-grid">
        <StripeOnboarding workspace={workspace} />
        <RatePlanComposer workspace={workspace} />
      </div>
    );
  }
  if (module === "settings") {
    return (
      <>
        <div className="operator-controls-grid">
          <StripeOnboarding workspace={workspace} />
          <RatePlanComposer workspace={workspace} />
        </div>
        <FacilitiesControls workspace={workspace} />
      </>
    );
  }
  if (module === "locations") {
    return <FacilitiesControls workspace={workspace} />;
  }
  if (module === "events" || module === "leagues") {
    const kind = module === "leagues" ? "league" : "tournament";
    return (
      <>
        <SessionDrafts workspace={workspace} />
        <section className="hq-card guided-create-card">
          <span className="guided-create-card__icon">
            <Sparkles aria-hidden size={24} />
          </span>
          <div>
            <span className="hq-eyebrow">Guided create</span>
            <h2>Build a {kind} without fighting a wall of settings.</h2>
            <p>
              Start with the type, then Duna reveals the right divisions,
              schedule, tickets, guests, policies, and Money gate.
            </p>
          </div>
          <Link
            className="hq-button hq-button--primary"
            href={`/events/create?type=${kind}`}
          >
            Open guided flow <ArrowRight aria-hidden size={16} />
          </Link>
        </section>
      </>
    );
  }
  if (module === "calendar" || module === "programs") {
    const defaultKind = module === "calendar" ? "open-play" : "clinic";
    return (
      <>
        <SessionDrafts workspace={workspace} />
        <SessionComposer workspace={workspace} defaultKind={defaultKind} />
        {module === "calendar" && <FacilitiesControls workspace={workspace} />}
      </>
    );
  }
  return (
    <section className="hq-card operator-control-card">
      <Building2 aria-hidden size={24} />
      <span className="hq-eyebrow">Configuration ready</span>
      <h2>{workspace.organization.name}</h2>
      <p>
        Use Calendar for facility and session operations, Money for rates and
        Stripe, and Messages for consent-safe communication.
      </p>
    </section>
  );
}
