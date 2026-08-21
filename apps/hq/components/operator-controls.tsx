"use client";

import type { OperatorWorkspace, WaiverWorkspace } from "@duna/api";
import { COURT_SURFACE_OPTIONS, formatMoney } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Bell,
  Building2,
  CalendarClock,
  CalendarOff,
  CalendarPlus,
  Camera,
  Check,
  CircleAlert,
  Clock3,
  CreditCard,
  Gauge,
  ImageIcon,
  Landmark,
  Mail,
  MapPinned,
  MessageSquareText,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Smartphone,
  UserRoundCheck,
  UserRoundX,
  UserPlus,
  Users,
  UploadCloud,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState, type ReactNode } from "react";
import {
  activateCourtAction,
  blockCourtTimeAction,
  createCourtAction,
  createMarketingCampaignAction,
  createMarketingFlowAction,
  createPlayerInvitationAction,
  createStaffInvitationAction,
  createProgramSessionAction,
  createRatePlanAction,
  createVenueAction,
  draftCourtScheduleAction,
  publishVenueAction,
  refreshStripeOnboardingAction,
  replaceCourtScheduleAction,
  saveMessageDraftAction,
  startStripeOnboardingAction,
  updateCourtBookingConfigurationAction,
  updateVenueProfileAction,
  type OperatorActionState,
} from "@/app/actions";
import { AddressEntry } from "./place-address-fields";
import {
  createCourtMediaPath,
  createVenueMediaPath,
  optimizeImageUpload,
} from "@/lib/media-storage";
import type { OperatorModule } from "./navigation";
import {
  CommerceSettingsControls,
  PeopleRefundControls,
  PeopleWalletControls,
  ProductCatalogControls,
} from "./commerce-controls";
import { SessionDraftManager } from "./session-draft-manager";

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

type MarketingSegment =
  | "all-active"
  | "active-members"
  | "inactive-30-days"
  | "high-churn-risk"
  | "upcoming-participants";
type MarketingTrigger =
  | "manual"
  | "no-booking"
  | "payment-failed"
  | "event-published"
  | "membership-renewal";
type MarketingChannel = "email" | "sms" | "push";
type MarketingFlowStep = "segment" | "trigger" | "action";

type MarketingFlowOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly description: string;
  readonly signal: string;
};

const marketingSegmentOptions: readonly MarketingFlowOption<MarketingSegment>[] =
  [
    {
      value: "all-active",
      label: "All active people",
      description: "Everyone currently connected to this organization.",
      signal: "Active relationship",
    },
    {
      value: "active-members",
      label: "Active members",
      description: "People with a current, valid membership.",
      signal: "Membership status",
    },
    {
      value: "inactive-30-days",
      label: "Drifting members",
      description: "People who have not booked in the selected window.",
      signal: "Booking recency",
    },
    {
      value: "high-churn-risk",
      label: "High churn signal",
      description: "Members whose recent behavior suggests they may leave.",
      signal: "Duna risk model",
    },
    {
      value: "upcoming-participants",
      label: "Upcoming participants",
      description: "People registered for a future event or service.",
      signal: "Future booking",
    },
  ];

const marketingTriggerOptions: readonly MarketingFlowOption<MarketingTrigger>[] =
  [
    {
      value: "manual",
      label: "After manual review",
      description: "Hold the audience until an operator starts the flow.",
      signal: "Operator controlled",
    },
    {
      value: "no-booking",
      label: "No recent booking",
      description: "Enter when someone reaches the inactivity window.",
      signal: "Daily evaluation",
    },
    {
      value: "payment-failed",
      label: "Payment failed",
      description: "Respond when a recurring payment needs attention.",
      signal: "Billing event",
    },
    {
      value: "event-published",
      label: "Event published",
      description: "React when a new event becomes available to book.",
      signal: "Publishing event",
    },
    {
      value: "membership-renewal",
      label: "Membership renewal",
      description: "Reach members around their upcoming renewal.",
      signal: "Renewal window",
    },
  ];

const marketingChannelOptions: readonly MarketingFlowOption<MarketingChannel>[] =
  [
    {
      value: "email",
      label: "Email",
      description: "A rich message delivered through Resend.",
      signal: "Subject + message",
    },
    {
      value: "sms",
      label: "SMS / RCS",
      description: "A concise mobile message routed through Sent.dm.",
      signal: "Mobile message",
    },
    {
      value: "push",
      label: "Push",
      description: "A timely notification in the Duna apps.",
      signal: "App notification",
    },
  ];

function MarketingSegmentGlyph({
  value,
  size = 20,
}: {
  readonly value: MarketingSegment;
  readonly size?: number;
}) {
  if (value === "active-members")
    return <UserRoundCheck aria-hidden size={size} />;
  if (value === "inactive-30-days")
    return <UserRoundX aria-hidden size={size} />;
  if (value === "high-churn-risk") return <Activity aria-hidden size={size} />;
  if (value === "upcoming-participants")
    return <CalendarClock aria-hidden size={size} />;
  return <Users aria-hidden size={size} />;
}

function MarketingTriggerGlyph({
  value,
  size = 20,
}: {
  readonly value: MarketingTrigger;
  readonly size?: number;
}) {
  if (value === "no-booking") return <Clock3 aria-hidden size={size} />;
  if (value === "payment-failed") return <CreditCard aria-hidden size={size} />;
  if (value === "event-published")
    return <CalendarPlus aria-hidden size={size} />;
  if (value === "membership-renewal") return <Gauge aria-hidden size={size} />;
  return <ShieldCheck aria-hidden size={size} />;
}

function MarketingChannelGlyph({
  value,
  size = 20,
}: {
  readonly value: MarketingChannel;
  readonly size?: number;
}) {
  if (value === "sms") return <Smartphone aria-hidden size={size} />;
  if (value === "push") return <Bell aria-hidden size={size} />;
  return <Mail aria-hidden size={size} />;
}

function MarketingCanvasNode({
  step,
  eyebrow,
  title,
  description,
  status,
  selected,
  icon,
  onSelect,
}: {
  readonly step: MarketingFlowStep;
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly status: string;
  readonly selected: boolean;
  readonly icon: ReactNode;
  readonly onSelect: () => void;
}) {
  return (
    <button
      aria-label={`Edit ${eyebrow}: ${title}`}
      aria-pressed={selected}
      className={`marketing-canvas-node marketing-canvas-node--${step} ${
        selected ? "is-selected" : ""
      }`}
      onClick={onSelect}
      type="button"
    >
      <span className="marketing-canvas-node__topline">
        <span>{eyebrow}</span>
        <small>{status}</small>
      </span>
      <span className="marketing-canvas-node__body">
        <span className="marketing-canvas-node__icon">{icon}</span>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
      </span>
      <span className="marketing-canvas-node__edit">
        Select to edit <ArrowRight aria-hidden size={14} />
      </span>
    </button>
  );
}

function MarketingFlowConnector({ label }: { readonly label: string }) {
  return (
    <span className="marketing-flow-connector" aria-hidden>
      <small>{label}</small>
      <span>
        <i />
      </span>
      <ArrowRight size={17} />
    </span>
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

function TeamMemberComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [deliveryMode, setDeliveryMode] = useState<"send" | "link-only">(
    "link-only",
  );
  const [copiedInvitationId, setCopiedInvitationId] = useState<string>();
  const [state, action, pending] = useActionState(
    createStaffInvitationAction,
    initialOperatorActionState,
  );
  const copyPrivateLink = () => {
    if (!state.privateClaimLink) return;
    void navigator.clipboard
      .writeText(state.privateClaimLink)
      .then(() => setCopiedInvitationId("new-link"));
  };
  return (
    <div className="operator-controls-grid operator-people-controls">
      <section className="hq-card operator-control-card">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Team · invite</span>
            <h2>Share secure team access.</h2>
            <p>
              Create a private claim link first, then send it however you want.
              Or let Duna deliver it by email or SMS.
            </p>
          </div>
          <UserPlus aria-hidden size={24} />
        </header>
        <form action={action} className="operator-form">
          <div className="operator-form-grid operator-form-grid--two">
            <label>
              <span>Full name</span>
              <input name="invitedName" required />
            </label>
            <label>
              <span>Role</span>
              <select name="role" defaultValue="coach">
                <option value="coach">Coach</option>
                {workspace.teamAccess.canInviteDirector && (
                  <option value="director">Director</option>
                )}
                <option value="manager">Manager</option>
                <option value="front-desk">Front desk</option>
                <option value="accountant">Accountant</option>
              </select>
            </label>
            {deliveryMode === "send" && (
              <>
                <label>
                  <span>Email</span>
                  <input name="invitedEmail" type="email" />
                </label>
                <label>
                  <span>Mobile · E.164</span>
                  <input
                    name="invitedPhoneE164"
                    inputMode="tel"
                    placeholder="+17045550123"
                  />
                </label>
              </>
            )}
            <label>
              <span>Worker classification</span>
              <select
                name="workerClassification"
                defaultValue="1099-contractor"
              >
                <option value="1099-contractor">1099 contractor</option>
                <option value="w2-employee">W-2 employee</option>
              </select>
            </label>
            <label>
              <span>How should they receive it?</span>
              <select
                name="deliveryMode"
                value={deliveryMode}
                onChange={(event) =>
                  setDeliveryMode(event.target.value as "send" | "link-only")
                }
              >
                <option value="link-only">
                  Private claim link — recommended
                </option>
                <option value="send">Send it from Duna</option>
              </select>
            </label>
            {deliveryMode === "send" && (
              <>
                <label>
                  <span>Send by</span>
                  <select name="preferredChannel" defaultValue="email">
                    <option value="email">Email · Resend</option>
                    <option value="sms">SMS · Sent.dm</option>
                  </select>
                </label>
                <p className="operator-form-hint operator-field--wide">
                  Add an email address or mobile number above to send this
                  invitation. A private link is also created for your records.
                </p>
              </>
            )}
            {deliveryMode === "link-only" && (
              <p className="operator-form-hint operator-field--wide">
                No email or mobile number needed. The private link is ready to
                copy as soon as you create it and expires after 7 days.
                {workspace.teamAccess.canInviteDirector &&
                  " Directors share organization leadership; the original Owner remains protected until ownership is transferred."}
              </p>
            )}
          </div>
          <div className="operator-legal-boundary">
            <ShieldCheck aria-hidden size={18} />
            <p>
              Classification is organization-controlled and cannot be changed by
              the invited team member. Duna records the selection but does not
              determine employment status.
            </p>
          </div>
          <label className="operator-confirmation">
            <input name="confirmed" required type="checkbox" value="true" />
            <span>
              <strong>I reviewed the role and classification.</strong>
              The recipient will see both before accepting.
            </span>
          </label>
          {state.privateClaimLink && (
            <div className="operator-private-link" role="status">
              <div>
                <span className="hq-eyebrow">Private claim link</span>
                <strong>Ready to share</strong>
                <p>
                  Anyone with this link can claim this specific team role for
                  the next 7 days.
                </p>
              </div>
              <div className="operator-private-link__controls">
                <input
                  aria-label="Private team invitation link"
                  readOnly
                  value={state.privateClaimLink}
                />
                <button
                  type="button"
                  className="hq-button hq-button--secondary hq-button--compact"
                  onClick={copyPrivateLink}
                >
                  {copiedInvitationId === "new-link" ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
          )}
          <div className="operator-form-footer">
            <ActionNotice state={state} />
            <SubmitButton pending={pending}>
              {deliveryMode === "link-only"
                ? "Create private link"
                : "Send team invitation"}
            </SubmitButton>
          </div>
        </form>
      </section>
      <section className="hq-card operator-control-card operator-invite-status">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Pending team access</span>
            <h2>{workspace.staffInvitations.length} recent invitations</h2>
            <p>Email uses Resend. SMS uses Sent.dm approved templates.</p>
          </div>
          <Badge
            tone={
              workspace.deliveryProviders.email ||
              workspace.deliveryProviders.sms
                ? "live"
                : "warning"
            }
          >
            {workspace.deliveryProviders.email ||
            workspace.deliveryProviders.sms
              ? "delivery ready"
              : "link only"}
          </Badge>
        </header>
        <div className="operator-compact-list">
          {workspace.staffInvitations.map((invitation) => (
            <article key={invitation.id}>
              <span>
                <strong>{invitation.invitedName}</strong>
                <small>
                  {invitation.role.replaceAll("-", " ")} ·{" "}
                  {invitation.workerClassification.replaceAll("-", " ")} ·{" "}
                  {invitation.deliveryStatus}
                </small>
              </span>
              <span className="operator-invite-actions">
                {invitation.status === "pending" && (
                  <button
                    type="button"
                    className="hq-button hq-button--secondary hq-button--compact"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(invitation.inviteUrl)
                        .then(() => setCopiedInvitationId(invitation.id));
                    }}
                  >
                    {copiedInvitationId === invitation.id
                      ? "Copied"
                      : "Copy claim link"}
                  </button>
                )}
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
              </span>
            </article>
          ))}
          {workspace.staffInvitations.length === 0 && (
            <div className="hq-empty">
              <strong>No team invitations yet.</strong>
              <span>Invite the first coach or operator here.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function RatePlanComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createRatePlanAction,
    initialOperatorActionState,
  );
  return (
    <section className="hq-card operator-control-card" id="court-pricing">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Court pricing</span>
          <h2>Set what a court costs</h2>
          <p>
            Create a reusable {workspace.organization.currency} rate, then
            attach it while adding or editing a court below.
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
    <section className="hq-card operator-control-card" id="venue-details">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Facility hierarchy</span>
          <h2>Add a venue</h2>
          <p>New venues begin as private drafts.</p>
        </div>
        <MapPinned aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <input name="locationKind" type="hidden" value="private-venue" />
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
          <label>
            <span>Venue setting</span>
            <select defaultValue="outdoor" name="environment" required>
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
            </select>
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
          <AddressEntry label="Venue or beach address" />
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

export function CourtComposer({
  workspace,
  redirectVenueId,
}: {
  readonly workspace: OperatorWorkspace;
  readonly redirectVenueId?: string;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    createCourtAction,
    initialOperatorActionState,
  );
  const [courtImageUrl, setCourtImageUrl] = useState("");
  const [courtName, setCourtName] = useState("");
  const [selectedVenueId, setSelectedVenueId] = useState(
    redirectVenueId ?? workspace.venues[0]?.id ?? "",
  );
  const [surface, setSurface] = useState("sand");
  const [capacity, setCapacity] = useState("12");
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const hasVenues = workspace.venues.length > 0;
  const membershipConfigured = workspace.catalog.some(
    (item) =>
      item.type === "plan" &&
      item.subtype === "membership" &&
      item.status === "active",
  );
  const selectedVenue = workspace.venues.find(
    (venue) => venue.id === selectedVenueId,
  );
  useEffect(() => {
    if (state.status === "success" && state.entityId && redirectVenueId) {
      router.push(
        `/locations/${redirectVenueId}/courts/${state.entityId}?created=true`,
      );
    }
  }, [redirectVenueId, router, state.entityId, state.status]);
  const uploadCourtImage = async (file?: File) => {
    if (!file) return;
    setUploadState("uploading");
    setUploadMessage("Optimizing your court image…");
    try {
      const prepared = await optimizeImageUpload(file);
      const stored = await upload(
        createCourtMediaPath(workspace.organization.id, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId: workspace.organization.id,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
            purpose: "court",
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: ({ percentage }) => {
            setUploadMessage(`Uploading… ${Math.round(percentage)}%`);
          },
        },
      );
      if (!stored.url) {
        throw new Error("Duna storage did not return a court image URL.");
      }
      setCourtImageUrl(stored.url);
      setUploadState("ready");
      setUploadMessage("Court image optimized and ready.");
    } catch (error) {
      setUploadState("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Court image upload failed.",
      );
    }
  };
  return (
    <section
      className="hq-card operator-control-card court-composer"
      id="court-builder"
    >
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Facility builder</span>
          <h2>Place a court in your facility</h2>
          <p>
            Give each court its own identity, operating rules, and visual place
            inside the venue.
          </p>
        </div>
        <Waves aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form court-builder">
        <aside
          className={`court-builder__preview ${
            courtImageUrl ? "court-builder__preview--image" : ""
          }`}
          style={
            courtImageUrl
              ? {
                  backgroundImage: `linear-gradient(180deg, rgba(6, 24, 38, .08), rgba(6, 24, 38, .88)), url("${courtImageUrl}")`,
                }
              : undefined
          }
        >
          <header>
            <Badge tone="warning">Draft court</Badge>
            <Camera aria-hidden size={18} />
          </header>
          <span className="court-builder__mark">
            <Waves aria-hidden size={28} />
          </span>
          <footer>
            <small>{selectedVenue?.name ?? "Choose a venue"}</small>
            <strong>{courtName || "Your new court"}</strong>
            <span>
              {surface.replace("-", " ")} · up to {capacity || "—"} players
            </span>
          </footer>
        </aside>

        <div className="court-builder__steps">
          <fieldset className="court-builder__step">
            <legend>
              <i>1</i>
              <span>
                <strong>Place it</strong>
                Choose where this court lives.
              </span>
            </legend>
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Venue</span>
                <select
                  name="venueId"
                  required
                  disabled={!hasVenues}
                  value={selectedVenueId}
                  onChange={(event) => setSelectedVenueId(event.target.value)}
                >
                  {workspace.venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>
                      {venue.name} · {venue.status}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Court name</span>
                <input
                  name="name"
                  onChange={(event) => setCourtName(event.target.value)}
                  placeholder="Court 3"
                  required
                  value={courtName}
                />
              </label>
              <div className="operator-field--wide operator-venue-image">
                <span>Court image</span>
                <label className="operator-venue-image__upload">
                  <UploadCloud aria-hidden size={18} />
                  <span>
                    <strong>
                      {courtImageUrl
                        ? "Replace court image"
                        : "Add court image"}
                    </strong>
                    <small>
                      A clear wide photo helps players find the right court.
                    </small>
                  </span>
                  <input
                    accept="image/avif,image/jpeg,image/png,image/webp"
                    disabled={uploadState === "uploading"}
                    onChange={(event) => {
                      void uploadCourtImage(event.target.files?.[0]);
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
                <input name="imageUrl" type="hidden" value={courtImageUrl} />
              </div>
            </div>
          </fieldset>

          <fieldset className="court-builder__step">
            <legend>
              <i>2</i>
              <span>
                <strong>Describe the space</strong>
                Set what players should expect.
              </span>
            </legend>
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Surface</span>
                <select
                  name="surface"
                  value={surface}
                  onChange={(event) => setSurface(event.target.value)}
                >
                  {COURT_SURFACE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Comfortable capacity</span>
                <input
                  type="number"
                  name="capacity"
                  min="1"
                  onChange={(event) => setCapacity(event.target.value)}
                  required
                  value={capacity}
                />
              </label>
              <label>
                <span>Booking audience</span>
                <select name="bookingPolicy" defaultValue="public">
                  <option value="public">Public</option>
                  <option disabled={!membershipConfigured} value="members">
                    {membershipConfigured
                      ? "Members"
                      : "Members · publish a membership first"}
                  </option>
                  <option disabled={!membershipConfigured} value="tiers">
                    {membershipConfigured
                      ? "Selected tiers"
                      : "Selected tiers · membership needed"}
                  </option>
                  <option value="staff">Staff only</option>
                  <option value="none">Not independently bookable</option>
                </select>
              </label>
              <label className="operator-switch court-builder__lighting">
                <input type="checkbox" name="lit" value="true" />
                <span>
                  <strong>Lit after dark</strong>
                  Keep evening slots available after sunset.
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="court-builder__step">
            <legend>
              <i>3</i>
              <span>
                <strong>Make it bookable</strong>
                Choose the prices, lengths, and guardrails.
              </span>
            </legend>
            <div className="operator-form-grid operator-form-grid--two">
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
          </fieldset>
        </div>
        {!hasVenues && (
          <p className="operator-inline-warning">
            <CircleAlert aria-hidden size={15} /> Create a venue first.
          </p>
        )}
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton
            pending={pending}
            disabled={!hasVenues || uploadState === "uploading"}
          >
            <Plus aria-hidden size={16} /> Add court to facility
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
  organizationId,
}: {
  readonly court: OperatorWorkspace["venues"][number]["courts"][number];
  readonly ratePlans?: OperatorWorkspace["ratePlans"];
  readonly organizationId: string;
}) {
  const [state, action, pending] = useActionState(
    updateCourtBookingConfigurationAction,
    initialOperatorActionState,
  );
  const [imageUrl, setImageUrl] = useState(court.imageUrl ?? "");
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "ready" | "error"
  >("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const uploadCourtImage = async (file?: File) => {
    if (!file) return;
    setUploadState("uploading");
    setUploadMessage("Optimizing your court image…");
    try {
      const prepared = await optimizeImageUpload(file);
      const stored = await upload(
        createCourtMediaPath(organizationId, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
            purpose: "court",
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: ({ percentage }) => {
            setUploadMessage(`Uploading… ${Math.round(percentage)}%`);
          },
        },
      );
      if (!stored.url) {
        throw new Error("Duna storage did not return a court image URL.");
      }
      setImageUrl(stored.url);
      setUploadState("ready");
      setUploadMessage("Court image optimized and ready to save.");
    } catch (error) {
      setUploadState("error");
      setUploadMessage(
        error instanceof Error ? error.message : "Court image upload failed.",
      );
    }
  };
  return (
    <details className="operator-inline-editor">
      <summary>
        <Gauge aria-hidden size={16} /> Court details & booking rules
      </summary>
      <form action={action} className="operator-form">
        <input type="hidden" name="courtId" value={court.id} />
        <div className="operator-form-grid operator-form-grid--two">
          <div className="operator-field--wide operator-venue-image">
            <span>Court image</span>
            {imageUrl && (
              <div
                aria-label={`Current image for ${court.name}`}
                className="operator-venue-image__preview"
                style={{ backgroundImage: `url("${imageUrl}")` }}
              />
            )}
            <label className="operator-venue-image__upload">
              <UploadCloud aria-hidden size={18} />
              <span>
                <strong>
                  {imageUrl ? "Replace image" : "Add court image"}
                </strong>
                <small>JPEG, PNG, WebP, or AVIF · up to 15 MB</small>
              </span>
              <input
                accept="image/avif,image/jpeg,image/png,image/webp"
                disabled={uploadState === "uploading"}
                onChange={(event) => {
                  void uploadCourtImage(event.target.files?.[0]);
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
            <input name="imageUrl" type="hidden" value={imageUrl} />
          </div>
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
          <SubmitButton
            disabled={uploadState === "uploading"}
            pending={pending}
          >
            Save court details
          </SubmitButton>
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

function courtScheduleSummary(
  court: OperatorWorkspace["venues"][number]["courts"][number],
) {
  const bookable = court.schedule.filter(
    (block) => block.mode !== "blocked" && block.mode !== "maintenance",
  );
  if (bookable.length === 0) return "No weekly availability";
  const weekdays = [...new Set(bookable.map((block) => block.weekday))].sort();
  const dayLabel =
    weekdays.length === 7
      ? "Every day"
      : weekdays.join(",") === "1,2,3,4,5"
        ? "Weekdays"
        : weekdays.map((day) => scheduleDayNames[day]).join(", ");
  const earliest = Math.min(...bookable.map((block) => block.startsAtMinute));
  const latest = Math.max(...bookable.map((block) => block.endsAtMinute));
  return `${dayLabel} · ${scheduleTime(earliest)}–${scheduleTime(latest)}`;
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
          <article className="operator-facility" key={venue.id}>
            <div
              className={`operator-facility__hero ${
                venue.heroImageTreatmentUrl || venue.heroImageUrl
                  ? "operator-facility__hero--image"
                  : ""
              }`}
              style={
                venue.heroImageTreatmentUrl || venue.heroImageUrl
                  ? {
                      backgroundImage: `linear-gradient(90deg, rgba(6, 24, 38, .88), rgba(6, 24, 38, .24)), url("${venue.heroImageTreatmentUrl ?? venue.heroImageUrl}")`,
                    }
                  : undefined
              }
            >
              <span>
                <small>Facility</small>
                <strong>{venue.name}</strong>
                <em>
                  {venue.locality ?? "Location incomplete"} · {venue.timezone}
                </em>
              </span>
              <Badge tone={venue.status === "active" ? "live" : "warning"}>
                {venue.status}
              </Badge>
            </div>
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
            <div className="operator-court-layout">
              {venue.courts.map((court) => {
                const rate = workspace.ratePlans.find(
                  (item) => item.id === court.ratePlanId,
                );
                const imageUrl =
                  court.imageUrl ??
                  venue.heroImageTreatmentUrl ??
                  venue.heroImageUrl;
                return (
                  <section className="operator-court-card" key={court.id}>
                    <div
                      className={`operator-court-card__media ${
                        imageUrl ? "operator-court-card__media--image" : ""
                      }`}
                      style={
                        imageUrl
                          ? {
                              backgroundImage: `linear-gradient(180deg, rgba(6, 24, 38, .04), rgba(6, 24, 38, .72)), url("${imageUrl}")`,
                            }
                          : undefined
                      }
                    >
                      {!imageUrl && (
                        <span>
                          <Waves aria-hidden size={26} />
                          Add a court image
                        </span>
                      )}
                      <Badge
                        tone={court.status === "active" ? "live" : "warning"}
                      >
                        {court.status}
                      </Badge>
                    </div>
                    <div className="operator-court-card__body">
                      <header>
                        <span>
                          <small>{court.surface.replace("-", " ")}</small>
                          <strong>{court.name}</strong>
                        </span>
                        <span className="operator-court-card__capacity">
                          {court.capacity}
                          <small>players</small>
                        </span>
                      </header>
                      <dl className="operator-court-card__facts">
                        <div>
                          <dt>
                            <CalendarClock aria-hidden size={15} /> Availability
                          </dt>
                          <dd>{courtScheduleSummary(court)}</dd>
                        </div>
                        <div>
                          <dt>
                            <Banknote aria-hidden size={15} /> Booking
                          </dt>
                          <dd>
                            {rate
                              ? `${formatMoney(
                                  rate.nonMemberAmountMinor ??
                                    rate.baseAmountMinor,
                                  rate.currency,
                                )} / ${rate.rateUnitMinutes} min`
                              : "Add a rate before publishing"}
                          </dd>
                        </div>
                      </dl>
                      <div className="operator-court-card__signals">
                        <span>
                          <strong>
                            {court.utilization.percent.toFixed(0)}%
                          </strong>
                          <small>utilized</small>
                        </span>
                        <span>
                          <strong>{court.utilization.bookingCount30d}</strong>
                          <small>bookings · 30d</small>
                        </span>
                        <span>
                          <strong>
                            {court.durationOptionsMinutes.join(" / ")}
                          </strong>
                          <small>minutes</small>
                        </span>
                      </div>
                      <i
                        aria-label={`${court.utilization.percent.toFixed(0)}% utilized`}
                        className="operator-utilization-bar"
                      >
                        <b
                          style={{
                            width: `${Math.max(2, court.utilization.percent)}%`,
                          }}
                        />
                      </i>
                      <div className="operator-court-card__actions">
                        <ConfirmCourt court={court} />
                        <CourtConfigurationEditor
                          court={court}
                          organizationId={workspace.organization.id}
                          ratePlans={workspace.ratePlans}
                        />
                      </div>
                    </div>
                  </section>
                );
              })}
              <a
                className="operator-court-card operator-court-card--add"
                href="#court-builder"
              >
                <span>
                  <Plus aria-hidden size={22} />
                </span>
                <strong>Add another court</strong>
                <small>Place a new bookable resource in {venue.name}.</small>
              </a>
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

function StripeOnboarding({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    startStripeOnboardingAction,
    initialOperatorActionState,
  );
  const [refreshState, refreshAction, refreshPending] = useActionState(
    refreshStripeOnboardingAction,
    initialOperatorActionState,
  );
  const ready = workspace.organization.stripeChargesEnabled;
  return (
    <section className="hq-card operator-control-card stripe-readiness-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Protected settlement</span>
          <h2>{ready ? "Stripe charges enabled" : "Finish Stripe Connect"}</h2>
          <p>
            Player payments settle into your connected Stripe balance. Duna
            releases only cleared funds that are outside every refund window
            before they can move to your bank.
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
        <>
          {workspace.organization.stripeAccountId && (
            <form action={refreshAction} className="operator-form">
              <div className="operator-form-footer">
                <ActionNotice state={refreshState} />
                <SubmitButton pending={refreshPending} secondary>
                  Refresh Stripe status
                </SubmitButton>
              </div>
            </form>
          )}
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
                {workspace.organization.stripeAccountId
                  ? "Continue Stripe setup"
                  : "Prepare secure Stripe link"}
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
        </>
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

function MarketingFlowComposer({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [selectedStep, setSelectedStep] =
    useState<MarketingFlowStep>("segment");
  const [segment, setSegment] = useState<MarketingSegment>("inactive-30-days");
  const [trigger, setTrigger] = useState<MarketingTrigger>("no-booking");
  const [channel, setChannel] = useState<MarketingChannel>("email");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [triggerDays, setTriggerDays] = useState("30");
  const [state, action, pending] = useActionState(
    createMarketingFlowAction,
    initialOperatorActionState,
  );
  const segmentOption = marketingSegmentOptions.find(
    (option) => option.value === segment,
  )!;
  const triggerOption = marketingTriggerOptions.find(
    (option) => option.value === trigger,
  )!;
  const channelOption = marketingChannelOptions.find(
    (option) => option.value === channel,
  )!;
  const providerReady = workspace.deliveryProviders[channel];
  const flowHasMessage = body.trim().length > 0;
  const nextStep: MarketingFlowStep =
    selectedStep === "segment"
      ? "trigger"
      : selectedStep === "trigger"
        ? "action"
        : "segment";
  const flowSummary =
    trigger === "no-booking"
      ? `${segmentOption.label} enter after ${triggerDays || "30"} days without a booking, then receive ${channelOption.label.toLowerCase()}.`
      : `${segmentOption.label} enter when “${triggerOption.label.toLowerCase()}” occurs, then receive ${channelOption.label.toLowerCase()}.`;

  function addPersonalization() {
    setBody((current) => {
      if (current.includes("{{first_name}}")) return current;
      return current.length > 0
        ? `Hi {{first_name}}, ${current}`
        : "Hi {{first_name}}, ";
    });
  }

  return (
    <section className="hq-card operator-control-card marketing-flow-builder marketing-studio">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">
            Automation studio · visual by design
          </span>
          <h2>Build the journey you can see.</h2>
          <p>
            Choose each connected step on the canvas. Duna handles audience
            qualification, consent, and guardian-safe delivery at review.
          </p>
        </div>
        <Sparkles aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form marketing-studio__form">
        <input name="segment" type="hidden" value={segment} />
        <input name="trigger" type="hidden" value={trigger} />
        <input name="channel" type="hidden" value={channel} />
        <input name="triggerDays" type="hidden" value={triggerDays} />
        <input name="subject" type="hidden" value={subject} />
        <input name="body" type="hidden" value={body} />

        <div className="marketing-studio__utility">
          <span>
            <i aria-hidden />
            Private draft
          </span>
          <span>
            {workspace.messageRecipients.length} connected{" "}
            {workspace.messageRecipients.length === 1 ? "person" : "people"}
          </span>
          <span>
            {providerReady ? "Delivery rail connected" : "Draft-only channel"}
          </span>
        </div>

        <div className="marketing-studio__workspace">
          <section className="marketing-flow-canvas-shell">
            <header className="marketing-flow-identity">
              <span className="hq-eyebrow">Flow blueprint</span>
              <input
                aria-label="Flow name"
                name="name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Name this automation"
                required
                value={name}
              />
              <input
                aria-label="Internal description"
                name="description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Add a short note for your team"
                value={description}
              />
            </header>

            <div
              className="marketing-flow-canvas"
              aria-label="Marketing automation flow"
              role="group"
            >
              <MarketingCanvasNode
                description={segmentOption.signal}
                eyebrow="1 · Segment"
                icon={<MarketingSegmentGlyph value={segment} />}
                onSelect={() => setSelectedStep("segment")}
                selected={selectedStep === "segment"}
                status="Configured"
                step="segment"
                title={segmentOption.label}
              />
              <MarketingFlowConnector label="qualifies" />
              <MarketingCanvasNode
                description={
                  trigger === "no-booking"
                    ? `${triggerDays || "30"} day window`
                    : triggerOption.signal
                }
                eyebrow="2 · Trigger"
                icon={<MarketingTriggerGlyph value={trigger} />}
                onSelect={() => setSelectedStep("trigger")}
                selected={selectedStep === "trigger"}
                status="Configured"
                step="trigger"
                title={triggerOption.label}
              />
              <MarketingFlowConnector label="then" />
              <MarketingCanvasNode
                description={
                  providerReady
                    ? "Delivery rail connected"
                    : "Safe to save as draft"
                }
                eyebrow="3 · Action"
                icon={<Send aria-hidden size={20} />}
                onSelect={() => setSelectedStep("action")}
                selected={selectedStep === "action"}
                status={flowHasMessage ? "Configured" : "Needs copy"}
                step="action"
                title={`Send ${channelOption.label}`}
              />
            </div>

            <div className="marketing-flow-explanation" aria-live="polite">
              <span className="marketing-flow-explanation__icon">
                <Sparkles aria-hidden size={17} />
              </span>
              <span>
                <small>What happens</small>
                <strong>{flowSummary}</strong>
              </span>
            </div>

            <footer className="marketing-flow-guardrail">
              <ShieldCheck aria-hidden size={18} />
              <span>
                <strong>Review stays between this draft and delivery.</strong>
                Duna re-checks consent, membership, and guardian routing before
                anyone can receive a message.
              </span>
            </footer>
          </section>

          <aside
            className={`marketing-flow-inspector marketing-flow-inspector--${selectedStep}`}
            aria-label={`Edit ${selectedStep}`}
          >
            <header>
              <span>
                Step{" "}
                {selectedStep === "segment"
                  ? "1"
                  : selectedStep === "trigger"
                    ? "2"
                    : "3"}{" "}
                of 3
              </span>
              <strong>
                {selectedStep === "segment"
                  ? "Who enters?"
                  : selectedStep === "trigger"
                    ? "What starts it?"
                    : "What should Duna do?"}
              </strong>
              <p>
                {selectedStep === "segment"
                  ? "Choose a live audience rule. The final people are resolved at review."
                  : selectedStep === "trigger"
                    ? "Choose the moment that moves a qualified person forward."
                    : "Choose one consented channel, then make the message feel personal."}
              </p>
            </header>

            {selectedStep === "segment" && (
              <div className="marketing-option-list">
                {marketingSegmentOptions.map((option) => (
                  <button
                    aria-pressed={segment === option.value}
                    className={segment === option.value ? "is-selected" : ""}
                    key={option.value}
                    onClick={() => setSegment(option.value)}
                    type="button"
                  >
                    <span className="marketing-option-list__icon">
                      <MarketingSegmentGlyph value={option.value} />
                    </span>
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.description}</small>
                      <em>{option.signal}</em>
                    </span>
                    <span className="marketing-option-list__check">
                      {segment === option.value ? (
                        <Check aria-hidden size={15} />
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {selectedStep === "trigger" && (
              <>
                <div className="marketing-option-list">
                  {marketingTriggerOptions.map((option) => (
                    <button
                      aria-pressed={trigger === option.value}
                      className={trigger === option.value ? "is-selected" : ""}
                      key={option.value}
                      onClick={() => setTrigger(option.value)}
                      type="button"
                    >
                      <span className="marketing-option-list__icon">
                        <MarketingTriggerGlyph value={option.value} />
                      </span>
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                        <em>{option.signal}</em>
                      </span>
                      <span className="marketing-option-list__check">
                        {trigger === option.value ? (
                          <Check aria-hidden size={15} />
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
                {trigger === "no-booking" && (
                  <label className="marketing-trigger-window">
                    <span>
                      <strong>Inactivity window</strong>
                      <small>
                        Re-evaluated daily before anyone enters the flow.
                      </small>
                    </span>
                    <span>
                      <input
                        aria-label="Days without a booking"
                        max="365"
                        min="1"
                        onChange={(event) => setTriggerDays(event.target.value)}
                        type="number"
                        value={triggerDays}
                      />
                      days
                    </span>
                  </label>
                )}
              </>
            )}

            {selectedStep === "action" && (
              <div className="marketing-action-editor">
                <div
                  className="marketing-channel-picker"
                  aria-label="Delivery channel"
                  role="group"
                >
                  {marketingChannelOptions.map((option) => (
                    <button
                      aria-label={`Send ${option.label}`}
                      aria-pressed={channel === option.value}
                      className={channel === option.value ? "is-selected" : ""}
                      key={option.value}
                      onClick={() => setChannel(option.value)}
                      type="button"
                    >
                      <MarketingChannelGlyph value={option.value} />
                      <span>
                        <strong>{option.label}</strong>
                        <small>
                          {workspace.deliveryProviders[option.value]
                            ? "Connected"
                            : "Draft only"}
                        </small>
                      </span>
                      {channel === option.value ? (
                        <Check aria-hidden size={14} />
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="marketing-message-composer">
                  {channel === "email" && (
                    <label>
                      <span>Subject</span>
                      <input
                        onChange={(event) => setSubject(event.target.value)}
                        placeholder="Ready for your next run?"
                        value={subject}
                      />
                    </label>
                  )}
                  <label>
                    <span>
                      <span>Message</span>
                      <button onClick={addPersonalization} type="button">
                        + First name
                      </button>
                    </span>
                    <textarea
                      onChange={(event) => setBody(event.target.value)}
                      placeholder="We saved a few upcoming sessions you may like…"
                      rows={7}
                      value={body}
                    />
                  </label>
                </div>

                <article
                  className={`marketing-message-preview marketing-message-preview--${channel}`}
                >
                  <header>
                    <span>
                      <MarketingChannelGlyph value={channel} size={17} />
                    </span>
                    <span>
                      <strong>{channelOption.label} preview</strong>
                      <small>Personalization shown at send time</small>
                    </span>
                  </header>
                  {channel === "email" && (
                    <strong>
                      {subject || "Your subject will appear here"}
                    </strong>
                  )}
                  <p>
                    {body ||
                      "Your message preview will appear here as you write."}
                  </p>
                  <footer>
                    <ShieldCheck aria-hidden size={14} />
                    Consent and guardian routing checked at review
                  </footer>
                </article>
              </div>
            )}

            <footer className="marketing-flow-inspector__footer">
              <span>
                <Check aria-hidden size={14} />
                Changes update the canvas live
              </span>
              <button onClick={() => setSelectedStep(nextStep)} type="button">
                {selectedStep === "action" ? "Back to segment" : "Next step"}
                <ArrowRight aria-hidden size={15} />
              </button>
            </footer>
          </aside>
        </div>

        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I reviewed this blueprint.</strong>
            Save it as a private draft. Activation, the resolved audience, and
            every outbound delivery remain a separate review step.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending} disabled={!flowHasMessage}>
            Save visual flow draft
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

function MarketingCampaignComposer() {
  const [state, action, pending] = useActionState(
    createMarketingCampaignAction,
    initialOperatorActionState,
  );
  return (
    <section className="hq-card operator-control-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">One-time campaign</span>
          <h2>Start with the audience.</h2>
          <p>
            Build a reviewable campaign draft. Recipient resolution and consent
            checks happen before scheduling.
          </p>
        </div>
        <MessageSquareText aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Campaign name</span>
            <input name="name" placeholder="August clinics" required />
          </label>
          <label>
            <span>Audience</span>
            <select name="segment" defaultValue="all-active">
              <option value="all-active">All active people</option>
              <option value="active-members">Active members</option>
              <option value="inactive-30-days">Inactive 30+ days</option>
              <option value="high-churn-risk">High churn signal</option>
              <option value="upcoming-participants">
                Upcoming participants
              </option>
            </select>
          </label>
          <label>
            <span>Channel</span>
            <select name="channel" defaultValue="email">
              <option value="email">Email · Resend</option>
              <option value="sms">SMS / RCS · Sent.dm</option>
              <option value="push">Push notification</option>
            </select>
          </label>
          <label>
            <span>Subject · email only</span>
            <input name="subject" placeholder="Play more this month" />
          </label>
          <label className="operator-field--wide">
            <span>Message</span>
            <textarea name="body" required rows={7} />
          </label>
        </div>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>Save as a private draft.</strong>
            This does not schedule or send the campaign.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending}>Save campaign draft</SubmitButton>
        </div>
      </form>
    </section>
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
        <RatePlanComposer workspace={workspace} />
      </div>
      <div className="operator-controls-grid operator-controls-grid--venue-courts">
        <CourtComposer workspace={workspace} />
      </div>
    </>
  );
}

export function OperatorControls({
  focusedCreate = false,
  module,
  waivers,
  workspace,
}: {
  readonly focusedCreate?: boolean;
  readonly module: OperatorModule;
  readonly waivers?: WaiverWorkspace;
  readonly workspace: OperatorWorkspace;
}) {
  if (module === "marketing") {
    return (
      <div className="commerce-controls">
        <MarketingFlowComposer workspace={workspace} />
        <MarketingCampaignComposer />
        <MessageComposer workspace={workspace} />
      </div>
    );
  }
  if (module === "team") {
    return <TeamMemberComposer workspace={workspace} />;
  }
  if (module === "members") {
    return (
      <div className="commerce-controls">
        <div className="operator-controls-grid">
          <PeopleWalletControls workspace={workspace} />
          <PeopleRefundControls workspace={workspace} />
        </div>
        <PlayerInvitationComposer workspace={workspace} />
      </div>
    );
  }
  if (module === "products") {
    return (
      <ProductCatalogControls
        focused={focusedCreate}
        waivers={waivers}
        workspace={workspace}
      />
    );
  }
  if (module === "payments") {
    return <StripeOnboarding workspace={workspace} />;
  }
  if (module === "settings") {
    return (
      <>
        <CommerceSettingsControls workspace={workspace} />
        <StripeOnboarding workspace={workspace} />
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
        <SessionDraftManager kinds={[kind]} workspace={workspace} />
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
  if (module === "calendar") {
    return (
      <>
        <SessionDraftManager workspace={workspace} />
        <SessionComposer workspace={workspace} defaultKind="open-play" />
      </>
    );
  }
  return (
    <section className="hq-card operator-control-card">
      <Building2 aria-hidden size={24} />
      <span className="hq-eyebrow">Configuration ready</span>
      <h2>{workspace.organization.name}</h2>
      <p>
        Use Venues for facilities and court pricing, Calendar for sessions,
        Money for payments, and Messages for consent-safe communication.
      </p>
    </section>
  );
}
