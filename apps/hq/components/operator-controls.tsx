"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarPlus,
  Check,
  CircleAlert,
  CreditCard,
  Landmark,
  MapPinned,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import {
  activateCourtAction,
  createCourtAction,
  createProgramSessionAction,
  createRatePlanAction,
  createVenueAction,
  publishSessionAction,
  publishVenueAction,
  saveMessageDraftAction,
  startStripeOnboardingAction,
  type OperatorActionState,
} from "@/app/actions";
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
          <article key={venue.id}>
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
                    </span>
                    <ConfirmCourt court={court} />
                  </section>
                );
              })}
              {venue.courts.length === 0 && (
                <p className="operator-inline-warning">
                  Add a court before this venue can be published.
                </p>
              )}
            </div>
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
