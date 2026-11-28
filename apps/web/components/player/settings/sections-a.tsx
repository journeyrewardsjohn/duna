"use client";

/**
 * Settings sections, part one: the profile (saved in place), who can see me,
 * notifications and connected channels, and Duna Premium.
 */
import { formatMoney } from "@duna/core";
import { report } from "@duna/observability";
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  Notice,
  Segmented,
  Select,
  Switch,
  useAction,
  useConfirm,
  useDebouncedValue,
} from "@duna/ui/tideline";
import { useEffect, useState } from "react";
import {
  changeDunaPlusAction,
  checkHandleAvailabilityAction,
  openDunaPlusPortalAction,
  recordBirthDateAction,
  recordMarketingConsentAction,
  startDunaPlusAction,
  updateProfileAccentAction,
  updateProfileAction,
} from "@/app/(next)/(app)/app/settings/actions";
import { ActionError } from "../action-result";
import type { PlayerSettingsData } from "../api-types";
import {
  ACCOUNT_NOTICES_SENTENCE,
  MARKETING_CHOICES,
  type MarketingScope,
} from "../privacy-model";
import { PrivacyChoice } from "./privacy-choice";

type Legacy<T> =
  ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string };

/** The settings actions answer `{ ok, error }`: a refusal becomes an error. */
export function settled<T>(answer: Legacy<T>): T {
  if (!answer.ok) throw new ActionError(answer.error);
  return answer;
}

export function SettingsSection({
  id,
  title,
  lead,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly lead?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`${id}-title`} className="pp-setting" id={id}>
      <h2 className="pp-h2" id={`${id}-title`}>
        {title}
      </h2>
      {lead ? <p className="td-meta">{lead}</p> : null}
      {children}
    </section>
  );
}

const ACCENTS = [
  { value: "dune-gold", label: "Dune gold" },
  { value: "marine", label: "Marine" },
  { value: "deep-coral", label: "Deep coral" },
  { value: "moss", label: "Moss" },
  { value: "terracotta", label: "Terracotta" },
  { value: "slate-blue", label: "Slate blue" },
  { value: "ochre", label: "Ochre" },
  { value: "plum", label: "Plum" },
  { value: "sea-green", label: "Sea green" },
  { value: "ink", label: "Ink" },
] as const;

type Accent = (typeof ACCENTS)[number]["value"];

export function ProfileSection({
  settings,
}: {
  readonly settings: PlayerSettingsData;
}) {
  const profile = settings.profile;
  const [form, setForm] = useState({
    displayName: profile.person.displayName,
    handle: profile.person.handle,
    email: profile.email ?? "",
    phoneE164: profile.phoneE164 ?? "",
    homeMarket: profile.person.homeMarket ?? "",
    locale: profile.locale,
    measurementSystem: profile.measurementSystem,
  });
  const [handleNote, setHandleNote] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [accent, setAccent] = useState<Accent>(
    settings.publicIdentity.accentId,
  );
  const handle = useDebouncedValue(form.handle.trim(), 450);

  useEffect(() => {
    if (handle === profile.person.handle) {
      setHandleNote(null);
      return;
    }
    if (handle.length < 3 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) {
      setHandleNote({
        ok: false,
        text: "Use 3 to 48 lowercase letters or numbers, with single hyphens between words.",
      });
      return;
    }
    let active = true;
    void checkHandleAvailabilityAction(handle).then((answer) => {
      if (!active) return;
      setHandleNote(
        answer.ok
          ? { ok: answer.result.available, text: answer.result.message }
          : { ok: false, text: answer.error },
      );
    });
    return () => {
      active = false;
    };
  }, [handle, profile.person.handle]);

  const save = useAction(
    async () =>
      settled(
        await updateProfileAction({
          ...form,
          visibility: profile.visibility,
        }),
      ),
    {
      messages: { success: "Profile saved" },
      report: (error) =>
        report(error, { event: "web.settings.profile_failed" }),
    },
  );
  const saveBirth = useAction(
    async () => settled(await recordBirthDateAction(birthDate)),
    {
      messages: {
        success: (answer) =>
          answer.result.requiresGuardian
            ? "Birth date saved. A guardian now manages bookings, payments and consent for this account."
            : "Birth date saved.",
      },
      report: (error) => report(error, { event: "web.settings.birth_failed" }),
    },
  );
  const saveAccent = useAction(
    async (_context, next: Accent) =>
      settled(await updateProfileAccentAction(next)),
    {
      messages: { success: "Profile colour saved" },
      optimistic: {
        apply: (next) => {
          const before = accent;
          setAccent(next);
          return () => setAccent(before);
        },
      },
    },
  );
  const set = (key: keyof typeof form) => (value: unknown) =>
    setForm((current) => ({ ...current, [key]: String(value ?? "") }));

  return (
    <SettingsSection
      id="profile"
      lead="Your name and handle show wherever your profile does."
      title="Profile"
    >
      <form
        className="pp-stack"
        onSubmit={(event) => {
          event.preventDefault();
          void save.run();
        }}
      >
        <div className="pp-fieldrow">
          <Field label="Name">
            <Input
              autoComplete="name"
              maxLength={80}
              minLength={2}
              onValueChange={set("displayName")}
              required
              value={form.displayName}
            />
          </Field>
          <Field
            error={handleNote && !handleNote.ok ? handleNote.text : undefined}
            hint={
              handleNote?.ok
                ? handleNote.text
                : "Your address: duna.coach/players/your-handle"
            }
            label="Handle"
          >
            <Input
              autoCapitalize="none"
              autoComplete="username"
              maxLength={48}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  handle: String(value ?? "")
                    .toLowerCase()
                    .replaceAll(/[^a-z0-9-]/g, ""),
                }))
              }
              value={form.handle}
            />
          </Field>
        </div>
        <div className="pp-fieldrow">
          <Field label="Email" optional>
            <Input
              autoComplete="email"
              onValueChange={set("email")}
              type="email"
              value={form.email}
            />
          </Field>
          <Field
            hint="With the country code, like +15551234567"
            label="Phone"
            optional
          >
            <Input
              autoComplete="tel"
              onValueChange={set("phoneE164")}
              type="tel"
              value={form.phoneE164}
            />
          </Field>
        </div>
        <div className="pp-fieldrow">
          <Field label="Home area" optional>
            <Input
              maxLength={120}
              onValueChange={set("homeMarket")}
              value={form.homeMarket}
            />
          </Field>
          <Field label="Language">
            <Select
              onValueChange={(value) => value && set("locale")(value)}
              options={[
                { value: "en-US", label: "English (United States)" },
                { value: "es-US", label: "Español (Estados Unidos)" },
                { value: "pt-BR", label: "Português (Brasil)" },
              ]}
              value={form.locale}
            />
          </Field>
          <Field label="Units">
            <Select
              onValueChange={(value) =>
                value && set("measurementSystem")(value)
              }
              options={[
                { value: "imperial", label: "Feet and °F" },
                { value: "metric", label: "Metres and °C" },
              ]}
              value={form.measurementSystem}
            />
          </Field>
        </div>
        <div className="pp-row-actions">
          <Button loading={save.showPending} type="submit" variant="primary">
            Save profile
          </Button>
        </div>
      </form>
      <div className="pp-control">
        <span className="pp-label" id="pp-accent">
          Profile colour
        </span>
        <Segmented
          aria-labelledby="pp-accent"
          className="pp-wrap"
          onValueChange={(value) => {
            if (value && value !== accent) void saveAccent.run(value as Accent);
          }}
          options={ACCENTS}
          value={accent}
        />
      </div>
      {profile.birthDate ? (
        <p className="td-meta">
          Birth date on file. Age group:{" "}
          {profile.ageBand === "under-13"
            ? "under 13"
            : profile.ageBand === "teen"
              ? "13 to 17"
              : profile.ageBand === "adult"
                ? "18 and over"
                : "not known"}
          .
        </p>
      ) : (
        <form
          className="pp-fieldrow"
          onSubmit={(event) => {
            event.preventDefault();
            void saveBirth.run();
          }}
        >
          <Field
            hint="Duna uses it for age groups and to keep juniors safe. It is never public."
            label="Birth date"
          >
            <Input
              max={new Date().toISOString().slice(0, 10)}
              onValueChange={(value) => setBirthDate(String(value ?? ""))}
              required
              type="date"
              value={birthDate}
            />
          </Field>
          <div className="pp-row-actions pp-row-actions--end">
            <Button
              loading={saveBirth.showPending}
              type="submit"
              variant="secondary"
            >
              Save birth date
            </Button>
          </div>
        </form>
      )}
    </SettingsSection>
  );
}

export function PrivacySection({
  settings,
}: {
  readonly settings: PlayerSettingsData;
}) {
  const profile = settings.profile;
  return (
    <SettingsSection id="privacy" title="Who can see you">
      <PrivacyChoice
        displayName={profile.person.displayName}
        handle={profile.person.handle}
        homeArea={profile.person.homeMarket ?? ""}
        isMinor={Boolean(profile.person.isMinor)}
        ratingProvisional={profile.person.rating.confidence === "Provisional"}
        visibility={profile.visibility}
      />
    </SettingsSection>
  );
}

function ConsentSwitch({
  scope,
  label,
  sentence,
  granted,
}: {
  readonly scope: MarketingScope;
  readonly label: string;
  readonly sentence: string;
  readonly granted: boolean;
}) {
  const [on, setOn] = useState(granted);
  const save = useAction(
    async (_context, next: boolean) =>
      settled(await recordMarketingConsentAction(scope, next)),
    {
      messages: {
        success: (_answer, next) => `${label} ${next ? "on" : "off"}`,
      },
      optimistic: {
        apply: (next) => {
          const before = on;
          setOn(next);
          return () => setOn(before);
        },
      },
      report: (error) =>
        report(error, { event: "web.settings.consent_failed" }),
    },
  );
  return (
    <Switch
      checked={on}
      description={sentence}
      disabled={save.pending}
      label={label}
      onCheckedChange={(checked) => void save.run(checked === true)}
    />
  );
}

export function MessagesSection({
  settings,
}: {
  readonly settings: PlayerSettingsData;
}) {
  const granted = (scope: MarketingScope) =>
    settings.consents.find((consent) => consent.scope === scope)?.granted ??
    false;
  return (
    <SettingsSection id="notifications" title="Notifications">
      <p>{ACCOUNT_NOTICES_SENTENCE}</p>
      <div className="pp-stack">
        {MARKETING_CHOICES.map((choice) => (
          <ConsentSwitch
            granted={granted(choice.scope)}
            key={choice.scope}
            label={choice.label}
            scope={choice.scope}
            sentence={choice.sentence}
          />
        ))}
      </div>
      <Card className="pp-linkcard" variant="flat">
        <div>
          <p className="pp-label">Connected channels</p>
          <p className="td-meta">
            Choose whether clubs and coaches reach you by text, email or in
            Duna, and connect your number.
          </p>
        </div>
        <Button href="/app/messages/connect" size="sm" variant="secondary">
          Connect a channel
        </Button>
      </Card>
    </SettingsSection>
  );
}

type Plan = PlayerSettingsData["dunaPlusPlans"][number];
type Membership = NonNullable<PlayerSettingsData["membership"]>;

function membershipState(membership: Membership): string {
  if (membership.pausedUntil) return "Paused";
  if (membership.cancelAtPeriodEnd) return "Ends at the period end";
  return membership.status.replaceAll("_", " ");
}

export function PremiumSection({
  settings,
  notice,
}: {
  readonly settings: PlayerSettingsData;
  readonly notice?: string;
}) {
  const confirm = useConfirm();
  const [interval, setInterval] = useState<"month" | "year">("year");
  const membership = settings.membership;
  const open = useAction(
    async (_context, plan?: Plan) => {
      const answer = plan
        ? settled(await startDunaPlusAction(plan.plan, plan.interval))
        : settled(await openDunaPlusPortalAction());
      window.location.assign(answer.url);
      return answer;
    },
    {
      report: (error) =>
        report(error, { event: "web.settings.premium_failed" }),
    },
  );
  const change = (action: "cancel" | "pause" | "resume") => {
    const end = membership?.currentPeriodEndsAt
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
          new Date(membership.currentPeriodEndsAt),
        )
      : "the end of this paid period";
    void confirm.run({
      tier: "confirm",
      destructive: action === "cancel",
      title:
        action === "cancel"
          ? "Cancel Premium after this paid period?"
          : action === "pause"
            ? "Pause Premium billing for one month?"
            : "Resume Premium now?",
      description:
        action === "cancel"
          ? `Premium stays on until ${end}. Your profile, rating, matches, safety features and network stay free.`
          : action === "pause"
            ? `One of your four pause months is used (${membership?.pauseMonthsUsed ?? 0} used so far).`
            : "Billing and Premium benefits continue as before.",
      verb:
        action === "cancel"
          ? "Cancel Premium"
          : action === "pause"
            ? "Pause for a month"
            : "Resume Premium",
      cancelLabel: action === "cancel" ? "Keep Premium" : "Not now",
      agentConfirm: `${action === "cancel" ? "Cancels" : action === "pause" ? "Pauses" : "Resumes"} the Duna Premium membership`,
      perform: async () => settled(await changeDunaPlusAction(action)),
      success:
        action === "cancel"
          ? `Premium stays on until ${end}`
          : action === "pause"
            ? "Premium billing paused for one month"
            : "Premium resumed",
      report: (error) =>
        report(error, { event: "web.settings.premium_change_failed" }),
    });
  };
  return (
    <SettingsSection id="membership" title="Duna Premium">
      {notice ? <Notice tone="info">{notice}</Notice> : null}
      {settings.dunaPlus.active && !membership ? (
        <Notice tone="positive" title={settings.dunaPlus.label ?? "Premium"}>
          Your Premium benefits are on.
        </Notice>
      ) : null}
      {membership ? (
        <Card className="pp-plan">
          <div className="pp-plan__top">
            <Chip
              kind="status"
              tone={
                membership.pausedUntil || membership.cancelAtPeriodEnd
                  ? "warning"
                  : "positive"
              }
            >
              {membershipState(membership)}
            </Chip>
            <span className="pp-plan__kind">
              {membership.interval === "year" ? "Annual" : "Monthly"}
            </span>
          </div>
          <p className="pp-plan__title">{membership.tierName}</p>
          <p className="td-num">
            {formatMoney(membership.priceMinor, membership.currency)}
          </p>
          <p className="td-meta">
            {membership.currentPeriodEndsAt
              ? `${membership.cancelAtPeriodEnd ? "Premium until" : "This period ends"} ${new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(new Date(membership.currentPeriodEndsAt))}`
              : "The billing period is still being confirmed."}
            {` · ${membership.pauseMonthsUsed} of 4 pause months used`}
          </p>
          <ul className="pp-benefits">
            {membership.benefits.map((benefit) => (
              <li key={benefit}>{benefit}</li>
            ))}
          </ul>
          <div className="pp-plan__actions">
            <Button
              loading={open.showPending}
              onClick={() => void open.run()}
              size="sm"
              variant="secondary"
            >
              Manage billing or change plan
            </Button>
            {membership.pausedUntil || membership.cancelAtPeriodEnd ? (
              <Button
                onClick={() => change("resume")}
                size="sm"
                variant="secondary"
              >
                Resume Premium
              </Button>
            ) : (
              <>
                <Button
                  disabled={membership.pauseMonthsUsed >= 4}
                  onClick={() => change("pause")}
                  size="sm"
                  variant="secondary"
                >
                  Pause for a month
                </Button>
                <Button
                  onClick={() => change("cancel")}
                  size="sm"
                  variant="ghost"
                >
                  Cancel Premium
                </Button>
              </>
            )}
          </div>
        </Card>
      ) : (
        <>
          <p className="td-meta">
            Free includes 4 hours of uploaded video each month. Premium adds
            live broadcasting, more video and no Duna service fees on eligible
            purchases. It never changes your rating or eligibility.
          </p>
          <Segmented
            aria-label="Billing"
            onValueChange={(value) =>
              value && setInterval(value as "month" | "year")
            }
            options={[
              { value: "month", label: "Monthly" },
              { value: "year", label: "Annual · 2 months free" },
            ]}
            value={interval}
          />
          <div className="pp-plans">
            {settings.dunaPlusPlans
              .filter((plan) => plan.interval === interval)
              .map((plan) => (
                <Card className="pp-plan" key={`${plan.plan}-${plan.interval}`}>
                  <p className="pp-plan__title">{plan.name}</p>
                  <p className="td-num">
                    {formatMoney(plan.priceMinor, plan.currency)}
                  </p>
                  <p className="td-meta">
                    {plan.tagline}{" "}
                    {plan.interval === "year"
                      ? `${formatMoney(Math.round(plan.priceMinor / 12), plan.currency)} a month, billed once a year.`
                      : "Billed monthly. Cancel any time; it runs to the period end."}
                  </p>
                  <ul className="pp-benefits">
                    {plan.benefits.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </ul>
                  <Button
                    disabled={!plan.configured}
                    loading={open.showPending}
                    onClick={() => void open.run(plan)}
                    variant={plan.plan === "premium" ? "primary" : "secondary"}
                  >
                    {plan.configured
                      ? `Choose ${plan.name}`
                      : "Checkout unavailable"}
                  </Button>
                </Card>
              ))}
          </div>
        </>
      )}
      {confirm.dialog}
    </SettingsSection>
  );
}
