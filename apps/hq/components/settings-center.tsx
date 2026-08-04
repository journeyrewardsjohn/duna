"use client";

import type { OperatorDashboard, OperatorWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  CreditCard,
  ExternalLink,
  Globe2,
  Landmark,
  MapPinned,
  Palette,
  ReceiptText,
  Settings2,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import {
  useActionState,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  startStripeOnboardingAction,
  updateCommerceSettingsAction,
  updateOrganizationProfileAction,
  type OperatorActionState,
} from "@/app/actions";
import { PlaceAddressFields } from "./place-address-fields";

export type SettingsSection =
  | "overview"
  | "business"
  | "brand"
  | "money"
  | "operations";

const initialActionState: OperatorActionState = {
  status: "idle",
  message: "",
};

const commonTimeZones = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "Europe/London",
  "Europe/Paris",
  "Australia/Sydney",
] as const;

const navigation: readonly {
  section: SettingsSection;
  label: string;
  detail: string;
  icon: LucideIcon;
}[] = [
  {
    section: "overview",
    label: "Overview",
    detail: "What needs attention",
    icon: Settings2,
  },
  {
    section: "business",
    label: "Business",
    detail: "Name, time zone, plan",
    icon: Building2,
  },
  {
    section: "brand",
    label: "Brand",
    detail: "Theme Kit and storefront",
    icon: Palette,
  },
  {
    section: "money",
    label: "Money & tax",
    detail: "Payments and legal address",
    icon: CreditCard,
  },
  {
    section: "operations",
    label: "Operations",
    detail: "Locations, team, account",
    icon: MapPinned,
  },
];

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
  children,
  pending,
}: {
  readonly children: ReactNode;
  readonly pending: boolean;
}) {
  return (
    <button
      className="hq-button hq-button--primary"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function StatusLine({
  complete,
  children,
}: {
  readonly complete: boolean;
  readonly children: ReactNode;
}) {
  return (
    <li>
      {complete ? (
        <CheckCircle2 aria-hidden size={17} />
      ) : (
        <Circle aria-hidden size={17} />
      )}
      {children}
    </li>
  );
}

function SummaryCard({
  icon: Icon,
  eyebrow,
  title,
  detail,
  status,
  tone,
  onOpen,
  children,
}: {
  readonly icon: LucideIcon;
  readonly eyebrow: string;
  readonly title: string;
  readonly detail: string;
  readonly status: string;
  readonly tone: "live" | "warning" | "neutral";
  readonly onOpen: () => void;
  readonly children?: ReactNode;
}) {
  return (
    <article className="hq-card settings-summary-card">
      <header>
        <span>
          <Icon aria-hidden size={21} />
        </span>
        <Badge tone={tone}>{status}</Badge>
      </header>
      <div>
        <span className="hq-eyebrow">{eyebrow}</span>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
      {children}
      <button onClick={onOpen} type="button">
        Review settings <ArrowRight aria-hidden size={15} />
      </button>
    </article>
  );
}

export function SettingsCenter({
  dashboard,
  initialSection = "overview",
  workspace,
}: {
  readonly dashboard: OperatorDashboard;
  readonly initialSection?: SettingsSection;
  readonly workspace: OperatorWorkspace;
}) {
  const [section, setSection] = useState<SettingsSection>(initialSection);
  const [profileState, profileAction, profilePending] = useActionState(
    updateOrganizationProfileAction,
    initialActionState,
  );
  const [commerceState, commerceAction, commercePending] = useActionState(
    updateCommerceSettingsAction,
    initialActionState,
  );
  const [stripeState, stripeAction, stripePending] = useActionState(
    startStripeOnboardingAction,
    initialActionState,
  );

  const organization = workspace.organization;
  const themeReady = Boolean(workspace.theme.publishedAt);
  const addressReady = Boolean(
    organization.addressLine1 &&
      organization.locality &&
      organization.administrativeArea &&
      organization.postalCode,
  );
  const paymentsReady = organization.stripeChargesEnabled;
  const profileReady = Boolean(organization.name && organization.timezone);
  const readiness = [profileReady, themeReady, addressReady, paymentsReady];
  const completedCount = readiness.filter(Boolean).length;
  const completion = Math.round((completedCount / readiness.length) * 100);
  const timeZoneOptions = useMemo(
    () =>
      commonTimeZones.includes(
        organization.timezone as (typeof commonTimeZones)[number],
      )
        ? commonTimeZones
        : ([organization.timezone, ...commonTimeZones] as readonly string[]),
    [organization.timezone],
  );
  const nextStep = !profileReady
    ? {
        label: "Confirm your business details",
        detail:
          "Set the name and time zone Duna should use across schedules and customer receipts.",
        section: "business" as const,
      }
    : !themeReady
      ? {
          label: "Publish your player-facing brand",
          detail:
            "Add a logo, a short story, and a simple visual system before sharing your storefront.",
          section: "brand" as const,
        }
      : !addressReady
        ? {
            label: "Add your legal business address",
            detail:
              "Duna needs a complete address before tax settings can be prepared safely.",
            section: "money" as const,
          }
        : !paymentsReady
          ? {
              label: "Finish secure payment setup",
              detail:
                "Connect the business so customer payments can settle directly to it.",
              section: "money" as const,
            }
          : {
              label: "Your essentials are ready",
              detail:
                "Keep locations, team access, and account preferences current as the business grows.",
              section: "operations" as const,
            };

  const paymentStatus = paymentsReady
    ? "Ready"
    : organization.stripeAccountId
      ? "Verification needed"
      : "Not connected";
  const paymentTone = paymentsReady
    ? "live"
    : organization.stripeAccountId
      ? "warning"
      : "neutral";
  const themeStyle = {
    "--settings-theme-primary": workspace.theme.palette.primary,
    "--settings-theme-accent": workspace.theme.palette.accent,
    "--settings-theme-sand": workspace.theme.palette.sand,
    "--settings-theme-ink": workspace.theme.palette.ink,
    "--settings-theme-canvas": workspace.theme.palette.canvas,
  } as CSSProperties;

  return (
    <div className="settings-center">
      <nav aria-label="Settings sections" className="settings-center__nav">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              aria-current={section === item.section ? "page" : undefined}
              className={section === item.section ? "active" : undefined}
              key={item.section}
              onClick={() => setSection(item.section)}
              type="button"
            >
              <Icon aria-hidden size={18} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.detail}</small>
              </span>
              <ChevronRight aria-hidden size={15} />
            </button>
          );
        })}
      </nav>

      <div className="settings-center__content">
        {section === "overview" && (
          <div className="settings-overview">
            <section className="settings-readiness">
              <div className="settings-readiness__score">
                <span>{completion}%</span>
                <small>essential setup</small>
              </div>
              <div>
                <span className="hq-eyebrow">Recommended next step</span>
                <h2>{nextStep.label}</h2>
                <p>{nextStep.detail}</p>
                <button
                  className="hq-button hq-button--primary"
                  onClick={() => setSection(nextStep.section)}
                  type="button"
                >
                  Continue setup <ArrowRight aria-hidden size={16} />
                </button>
              </div>
              <ul>
                <StatusLine complete={profileReady}>Business details</StatusLine>
                <StatusLine complete={themeReady}>Published Theme Kit</StatusLine>
                <StatusLine complete={addressReady}>Legal address</StatusLine>
                <StatusLine complete={paymentsReady}>Online payments</StatusLine>
              </ul>
            </section>

            <div className="settings-summary-grid">
              <SummaryCard
                detail={`${organization.timezone.replaceAll("_", " ")} · ${
                  organization.currency
                }`}
                eyebrow="Business"
                icon={Building2}
                onOpen={() => setSection("business")}
                status={profileReady ? "Ready" : "Needs review"}
                title={organization.name}
                tone={profileReady ? "live" : "warning"}
              >
                <dl>
                  <div>
                    <dt>Plan</dt>
                    <dd>{organization.plan.replaceAll("-", " ")}</dd>
                  </div>
                  <div>
                    <dt>Venues</dt>
                    <dd>{workspace.venues.length}</dd>
                  </div>
                </dl>
              </SummaryCard>

              <SummaryCard
                detail={
                  workspace.theme.profileSummary ??
                  "Add a clear story, logo, and visual system for players and parents."
                }
                eyebrow="Brand & storefront"
                icon={Palette}
                onOpen={() => setSection("brand")}
                status={themeReady ? "Published" : "Draft"}
                title={workspace.theme.tagline ?? organization.name}
                tone={themeReady ? "live" : "warning"}
              >
                <div className="settings-theme-swatches">
                  {Object.entries(workspace.theme.palette).map(
                    ([name, value]) => (
                      <i
                        key={name}
                        style={{ backgroundColor: value }}
                        title={`${name}: ${value}`}
                      />
                    ),
                  )}
                </div>
              </SummaryCard>

              <SummaryCard
                detail={
                  addressReady
                    ? `${organization.locality}, ${organization.administrativeArea}`
                    : "Add the business address used for tax and payment readiness."
                }
                eyebrow="Money & tax"
                icon={CreditCard}
                onOpen={() => setSection("money")}
                status={paymentStatus}
                title={
                  paymentsReady
                    ? "Payments are ready"
                    : "Finish payment setup"
                }
                tone={paymentTone}
              >
                <dl>
                  <div>
                    <dt>Automatic tax</dt>
                    <dd>
                      {organization.stripeTaxEnabled ? "On" : "Off"}
                    </dd>
                  </div>
                  <div>
                    <dt>Tax status</dt>
                    <dd>
                      {organization.taxRegistrationStatus.replaceAll("-", " ")}
                    </dd>
                  </div>
                </dl>
              </SummaryCard>

              <SummaryCard
                detail="Keep the places, people, and access behind the business accurate."
                eyebrow="Operations"
                icon={MapPinned}
                onOpen={() => setSection("operations")}
                status="Connected"
                title="Locations, team & account"
                tone="neutral"
              >
                <dl>
                  <div>
                    <dt>Team</dt>
                    <dd>{workspace.staff.length}</dd>
                  </div>
                  <div>
                    <dt>Members</dt>
                    <dd>{workspace.people.length}</dd>
                  </div>
                </dl>
              </SummaryCard>
            </div>
          </div>
        )}

        {section === "business" && (
          <section className="settings-section">
            <header className="settings-section__header">
              <span>
                <Building2 aria-hidden size={21} />
              </span>
              <div>
                <span className="hq-eyebrow">Business identity</span>
                <h2>The details customers see and schedules rely on.</h2>
                <p>
                  Keep this simple: one display name and one operating time
                  zone across Duna.
                </p>
              </div>
            </header>

            <div className="settings-business-layout">
              <form action={profileAction} className="hq-card settings-form">
                <div className="operator-form-grid operator-form-grid--two">
                  <label className="operator-field--wide">
                    <span>Business display name</span>
                    <input
                      defaultValue={organization.name}
                      maxLength={120}
                      name="name"
                      required
                    />
                    <small>
                      Used in Duna HQ, your storefront, messages, and receipts.
                    </small>
                  </label>
                  <label className="operator-field--wide">
                    <span>Primary time zone</span>
                    <select
                      defaultValue={organization.timezone}
                      name="timezone"
                      required
                    >
                      {timeZoneOptions.map((timeZone) => (
                        <option key={timeZone} value={timeZone}>
                          {timeZone.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                    <small>
                      Event times remain stored safely and display in each
                      venue&apos;s time zone.
                    </small>
                  </label>
                </div>
                <footer className="settings-form__footer">
                  <ActionNotice state={profileState} />
                  <SubmitButton pending={profilePending}>
                    Save business details
                  </SubmitButton>
                </footer>
              </form>

              <aside className="hq-card settings-plan-card">
                <span className="hq-eyebrow">Workspace plan</span>
                <h3>{organization.plan.replaceAll("-", " ")}</h3>
                <p>
                  Your plan controls available business capabilities. A plan
                  change never silently alters customer pricing.
                </p>
                <dl>
                  <div>
                    <dt>Currency</dt>
                    <dd>{organization.currency}</dd>
                  </div>
                  <div>
                    <dt>Venues</dt>
                    <dd>{workspace.venues.length}</dd>
                  </div>
                </dl>
                <button onClick={() => setSection("money")} type="button">
                  Review money setup <ArrowRight aria-hidden size={15} />
                </button>
              </aside>
            </div>
          </section>
        )}

        {section === "brand" && (
          <section className="settings-section">
            <header className="settings-section__header">
              <span>
                <Palette aria-hidden size={21} />
              </span>
              <div>
                <span className="hq-eyebrow">Brand & storefront</span>
                <h2>Make it unmistakably yours.</h2>
                <p>
                  One Theme Kit powers the organization profile and gives every
                  player-facing surface a consistent voice.
                </p>
              </div>
            </header>

            <div className="settings-brand-layout" style={themeStyle}>
              <article className="settings-brand-preview">
                <div
                  className="settings-brand-preview__hero"
                  style={
                    workspace.theme.heroMediaType === "image" &&
                    workspace.theme.heroMediaUrl
                      ? {
                          backgroundImage: `linear-gradient(180deg, transparent, rgb(5 18 32 / 72%)), url("${workspace.theme.heroMediaUrl}")`,
                        }
                      : undefined
                  }
                >
                  {workspace.theme.logoUrl ? (
                    <span
                      aria-label={`${organization.name} logo`}
                      role="img"
                      style={{
                        backgroundImage: `url("${workspace.theme.logoUrl}")`,
                      }}
                    />
                  ) : (
                    <i>{organization.name.slice(0, 2).toUpperCase()}</i>
                  )}
                </div>
                <div>
                  <small>{organization.name}</small>
                  <h3>
                    {workspace.theme.tagline || "Make every session count."}
                  </h3>
                  <p>
                    {workspace.theme.profileSummary ||
                      "Tell players and parents what makes your organization special."}
                  </p>
                </div>
              </article>

              <aside className="hq-card settings-brand-checklist">
                <header>
                  <div>
                    <span className="hq-eyebrow">Theme Kit readiness</span>
                    <h3>{themeReady ? "Published" : "Ready for your touch"}</h3>
                  </div>
                  <Badge tone={themeReady ? "live" : "warning"}>
                    {themeReady ? "Live" : "Draft"}
                  </Badge>
                </header>
                <ul>
                  <StatusLine complete={Boolean(workspace.theme.logoUrl)}>
                    Logo or primary mark
                  </StatusLine>
                  <StatusLine complete={Boolean(workspace.theme.tagline)}>
                    Short customer-facing tagline
                  </StatusLine>
                  <StatusLine
                    complete={Boolean(workspace.theme.profileSummary)}
                  >
                    Organization story
                  </StatusLine>
                  <StatusLine complete={Boolean(workspace.theme.heroMediaUrl)}>
                    Hero image or video
                  </StatusLine>
                </ul>
                <p>
                  Changes can be saved privately. Nothing becomes player-facing
                  until you choose Publish.
                </p>
                <Link
                  className="hq-button hq-button--primary"
                  href="/settings/theme"
                >
                  Open Theme Kit <Sparkles aria-hidden size={16} />
                </Link>
              </aside>
            </div>
          </section>
        )}

        {section === "money" && (
          <section className="settings-section">
            <header className="settings-section__header">
              <span>
                <CreditCard aria-hidden size={21} />
              </span>
              <div>
                <span className="hq-eyebrow">Money & tax</span>
                <h2>Get paid directly, with the right location attached.</h2>
                <p>
                  Duna prepares the workflow; you remain in control of business
                  verification, tax registrations, and legal attestations.
                </p>
              </div>
            </header>

            <div className="settings-money-layout">
              <article className="hq-card settings-payment-card">
                <header>
                  <span>
                    <Landmark aria-hidden size={22} />
                  </span>
                  <div>
                    <span className="hq-eyebrow">Online payments</span>
                    <h3>
                      {paymentsReady
                        ? "Your business can accept payments"
                        : organization.stripeAccountId
                          ? "Finish business verification"
                          : "Connect your business"}
                    </h3>
                  </div>
                  <Badge tone={paymentTone}>{paymentStatus}</Badge>
                </header>
                <p>
                  Customer payments settle to your connected business account.
                  Duna never asks you to enter bank or identity details here.
                </p>
                <ol>
                  <li className="complete">
                    <Check aria-hidden size={15} /> Secure Duna integration
                  </li>
                  <li className={organization.stripeAccountId ? "complete" : ""}>
                    {organization.stripeAccountId ? (
                      <Check aria-hidden size={15} />
                    ) : (
                      <span>2</span>
                    )}
                    Connected business account
                  </li>
                  <li className={paymentsReady ? "complete" : ""}>
                    {paymentsReady ? (
                      <Check aria-hidden size={15} />
                    ) : (
                      <span>3</span>
                    )}
                    Verification complete
                  </li>
                </ol>
                {!paymentsReady && (
                  <form action={stripeAction}>
                    <div className="settings-legal-note">
                      <ShieldCheck aria-hidden size={18} />
                      <p>
                        Stripe will ask <strong>you</strong> to verify the
                        business and accept its terms. Duna cannot do that on
                        your behalf.
                      </p>
                    </div>
                    <ActionNotice state={stripeState} />
                    <button
                      className="hq-button hq-button--primary"
                      disabled={stripePending}
                      type="submit"
                    >
                      {stripePending
                        ? "Preparing secure link…"
                        : organization.stripeAccountId
                          ? "Resume secure setup"
                          : "Start secure setup"}
                      <ExternalLink aria-hidden size={15} />
                    </button>
                  </form>
                )}
                {stripeState.onboardingUrl && (
                  <a
                    className="settings-secure-handoff"
                    href={stripeState.onboardingUrl}
                    rel="noreferrer"
                  >
                    Continue securely with Stripe
                    <ExternalLink aria-hidden size={15} />
                  </a>
                )}
              </article>

              <form action={commerceAction} className="hq-card settings-form">
                <header className="settings-form__heading">
                  <span>
                    <ReceiptText aria-hidden size={20} />
                  </span>
                  <div>
                    <span className="hq-eyebrow">Legal & tax location</span>
                    <h3>Business address</h3>
                    <p>
                      Used as the fallback taxable location. In-person sales use
                      the venue address.
                    </p>
                  </div>
                  <Badge
                    tone={addressReady ? "live" : "warning"}
                  >
                    {addressReady ? "Complete" : "Needed"}
                  </Badge>
                </header>
                <div className="operator-form-grid operator-form-grid--two">
                  <label className="operator-field--wide">
                    <span>Legal business name</span>
                    <input
                      defaultValue={organization.legalName}
                      maxLength={180}
                      name="legalName"
                    />
                  </label>
                  <PlaceAddressFields
                    initial={{
                      googlePlaceId: organization.googlePlaceId,
                      addressLine1: organization.addressLine1,
                      addressLine2: organization.addressLine2,
                      locality: organization.locality,
                      administrativeArea: organization.administrativeArea,
                      postalCode: organization.postalCode,
                      countryCode: organization.countryCode,
                      latitude: organization.latitude,
                      longitude: organization.longitude,
                    }}
                    label="Search for the legal business address"
                    required
                  />
                </div>
                <label
                  className={`operator-switch ${
                    paymentsReady ? "" : "is-disabled"
                  }`}
                >
                  <input
                    defaultChecked={organization.stripeTaxEnabled}
                    disabled={!paymentsReady}
                    name="stripeTaxEnabled"
                    type="checkbox"
                    value="true"
                  />
                  <span>
                    <strong>Calculate eligible tax automatically</strong>
                    {paymentsReady
                      ? "Turn this on only after confirming the registrations the business needs."
                      : "Finish payment verification before automatic tax can be enabled."}
                  </span>
                </label>
                <input name="confirmed" type="hidden" value="true" />
                <footer className="settings-form__footer">
                  <ActionNotice state={commerceState} />
                  <SubmitButton pending={commercePending}>
                    Save legal & tax settings
                  </SubmitButton>
                </footer>
              </form>
            </div>
          </section>
        )}

        {section === "operations" && (
          <section className="settings-section">
            <header className="settings-section__header">
              <span>
                <MapPinned aria-hidden size={21} />
              </span>
              <div>
                <span className="hq-eyebrow">Operations</span>
                <h2>Put each operational setting where it belongs.</h2>
                <p>
                  The settings home stays simple; detailed work opens in the
                  workspace built for it.
                </p>
              </div>
            </header>

            <div className="settings-directory">
              {[
                {
                  href: "/locations",
                  icon: MapPinned,
                  title: "Locations & courts",
                  detail: `${workspace.venues.length} ${
                    workspace.venues.length === 1 ? "venue" : "venues"
                  } · addresses, hours, courts, and booking rules`,
                },
                {
                  href: "/team",
                  icon: UsersRound,
                  title: "Team & permissions",
                  detail: `${workspace.staff.length} team ${
                    workspace.staff.length === 1 ? "member" : "members"
                  } · roles, access, and availability`,
                },
                {
                  href: "/messages",
                  icon: Globe2,
                  title: "Customer communication",
                  detail: `${workspace.messageDrafts.length} protected ${
                    workspace.messageDrafts.length === 1 ? "draft" : "drafts"
                  } · consent-safe messaging`,
                },
                {
                  href: "/account",
                  icon: ShieldCheck,
                  title: "Your account & security",
                  detail:
                    "Personal identity, sign-in security, data export, and account deletion",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Link className="hq-card" href={item.href} key={item.href}>
                    <span>
                      <Icon aria-hidden size={21} />
                    </span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <ArrowRight aria-hidden size={17} />
                  </Link>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
