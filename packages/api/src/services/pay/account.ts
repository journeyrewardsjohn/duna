/**
 * Duna Pay account state (the six statuses HQ shows), onboarding, the
 * publish gate (`assertPaymentsReady`) and the club's payout settings.
 *
 * The status is derived from the processor's account facts on every sync
 * and stored on `organization_pay_accounts`; it is never set by hand. With
 * no processor keys (demo, unconfigured environments) nothing calls the
 * processor: onboarding answers `not-configured` and the status stays what
 * Duna knows.
 */
import {
  getDatabase,
  organizationMoneySettings,
  organizationPayAccounts,
  organizations,
} from "@duna/db";
import { log } from "@duna/observability";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import type { ApiActor } from "../../context";
import type {
  payAccountSchema,
  payOnboardingSessionSchema,
  payPayoutSettingsSchema,
  payPublishGateInputSchema,
  payPublishGateSchema,
  payUpdatePayoutSettingsInputSchema,
} from "../../contracts/pay";
import { updateOrganizationMoneySettings } from "../../money-service";
import { startStripeOnboarding } from "../../operator-service";
import {
  createConnectAccountSession,
  isStripeConfigured,
  retrieveConnectAccountFacts,
  type ConnectAccountFacts,
} from "../../payments";
import { loadPayPolicySettings } from "./policy-settings";

type PayAccount = z.infer<typeof payAccountSchema>;
type Status = PayAccount["status"];
type BankStatus = PayAccount["bank"]["status"];

const REQUIREMENT_LABELS: Readonly<Record<string, string>> = {
  external_account: "Add a bank account for payouts",
  "business_profile.url": "Add your website or a description of what you sell",
  "business_profile.mcc": "Choose your business category",
  "tos_acceptance.date": "Accept the Duna Pay terms",
  "company.tax_id": "Add your tax ID",
  "individual.dob.day": "Confirm your date of birth",
  "individual.id_number": "Confirm your identity number",
  "individual.verification.document": "Upload an identity document",
  "representative.dob.day": "Confirm the representative's date of birth",
  "representative.verification.document":
    "Upload the representative's identity document",
};

export function requirementLabel(code: string): string {
  if (REQUIREMENT_LABELS[code]) return REQUIREMENT_LABELS[code];
  const leaf = code.split(".").at(-1)?.replaceAll("_", " ") ?? code;
  return `Provide ${leaf}`;
}

/**
 * The six statuses (w3-contracts, "pay"): pure.
 * - not-started: no connected account.
 * - in-progress: account exists, details not submitted.
 * - verifying: submitted; the processor is checking, or nothing is due yet
 *   but charges or payouts are not enabled.
 * - action-needed: requirements due now, not past due.
 * - restricted: past due, or disabled.
 * - ready: charges and payouts enabled, nothing due.
 */
export function derivePayAccountStatus(
  facts: ConnectAccountFacts | undefined,
): Status {
  if (!facts) return "not-started";
  if (facts.pastDue.length || facts.disabledReason) return "restricted";
  if (!facts.detailsSubmitted) return "in-progress";
  if (facts.currentlyDue.length) return "action-needed";
  if (facts.chargesEnabled && facts.payoutsEnabled) return "ready";
  return "verifying";
}

function bankStatus(facts: ConnectAccountFacts | undefined): BankStatus {
  return facts?.bank?.status ?? "missing";
}

/** Refresh the stored status from the processor. No-op without keys. */
export async function syncPayAccount(input: {
  readonly organizationId: string;
  readonly now: Date;
}): Promise<void> {
  if (!isStripeConfigured()) return;
  const database = getDatabase();
  const [organization] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  if (!organization?.stripeAccountId) return;
  const facts = await retrieveConnectAccountFacts(organization.stripeAccountId);
  const status = derivePayAccountStatus(facts);
  const values = {
    status,
    chargesEnabled: facts.chargesEnabled,
    payoutsEnabled: facts.payoutsEnabled,
    cardPaymentsActive: facts.cardPaymentsActive,
    requirementsDue: [...facts.pastDue, ...facts.currentlyDue]
      .filter((code, index, all) => all.indexOf(code) === index)
      .map((code) => ({
        code: code.slice(0, 96),
        label: requirementLabel(code),
      })),
    requirementsDueBy: facts.currentDeadline ?? null,
    disabledReason: facts.disabledReason?.slice(0, 64) ?? null,
    bankStatus: bankStatus(facts),
    bankLast4:
      facts.bank?.last4 && /^\d{4}$/.test(facts.bank.last4)
        ? facts.bank.last4
        : null,
    bankName: facts.bank?.name ?? null,
    syncedAt: input.now,
    updatedAt: input.now,
  };
  await database
    .insert(organizationPayAccounts)
    .values({ organizationId: input.organizationId, ...values })
    .onConflictDoUpdate({
      target: organizationPayAccounts.organizationId,
      set: values,
    });
  log.info("pay.account.synced", {
    organizationId: input.organizationId,
    status,
  });
}

export async function loadPayAccount(
  organizationId: string,
): Promise<PayAccount> {
  const database = getDatabase();
  const [[organization], [row]] = await Promise.all([
    database
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
    database
      .select()
      .from(organizationPayAccounts)
      .where(eq(organizationPayAccounts.organizationId, organizationId))
      .limit(1),
  ]);
  if (!organization) throw new TRPCError({ code: "NOT_FOUND" });
  // Without a synced row the honest status is what Duna knows locally.
  const status: Status = row?.syncedAt
    ? (row.status as Status)
    : organization.stripeAccountId
      ? organization.stripeChargesEnabled
        ? "verifying"
        : "in-progress"
      : "not-started";
  return {
    organizationId,
    status,
    chargesEnabled: row?.chargesEnabled ?? organization.stripeChargesEnabled,
    payoutsEnabled: row?.payoutsEnabled ?? false,
    cardPaymentsActive: row?.cardPaymentsActive ?? false,
    requirementsDue: [...(row?.requirementsDue ?? [])],
    requirementsDueBy: row?.requirementsDueBy?.toISOString(),
    disabledReason: row?.disabledReason ?? undefined,
    bank: {
      status: (row?.bankStatus as BankStatus | undefined) ?? "missing",
      last4: row?.bankLast4 ?? undefined,
      name: row?.bankName ?? undefined,
    },
    onboardingMethod:
      (row?.onboardingMethod as "hosted" | "embedded" | undefined) ?? "hosted",
    business: {
      legalName: organization.legalName ?? undefined,
      businessType: row?.businessType ?? undefined,
      whatYouSell: row?.whatYouSell ?? undefined,
    },
    firstPayoutNotBefore: row?.firstPayoutNotBefore?.toISOString(),
    firstPayoutDelayWaived: Boolean(row?.firstPayoutDelayWaivedAt),
    startTranche: {
      optIn: row?.startTrancheOptIn ?? false,
      bps: row?.startTrancheBps ?? 0,
    },
    salesSuspendedAt: row?.salesSuspendedAt?.toISOString(),
    syncedAt: row?.syncedAt?.toISOString(),
  };
}

export async function updatePayBusiness(input: {
  readonly organizationId: string;
  readonly businessType?: string;
  readonly whatYouSell?: string;
  readonly now: Date;
}): Promise<PayAccount> {
  const values = {
    ...(input.businessType !== undefined
      ? { businessType: input.businessType }
      : {}),
    ...(input.whatYouSell !== undefined
      ? { whatYouSell: input.whatYouSell }
      : {}),
    updatedAt: input.now,
  };
  await getDatabase()
    .insert(organizationPayAccounts)
    .values({ organizationId: input.organizationId, ...values })
    .onConflictDoUpdate({
      target: organizationPayAccounts.organizationId,
      set: values,
    });
  return loadPayAccount(input.organizationId);
}

function hqOrigin(): string | undefined {
  const value =
    process.env.NEXT_PUBLIC_HQ_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  return value?.replace(/\/$/, "");
}

/** Hosted link or embedded session; `not-configured` without keys. */
export async function startPayOnboarding(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly method: "hosted" | "embedded";
  readonly returnPath: string;
  readonly requestId: string;
  readonly now: Date;
}): Promise<z.infer<typeof payOnboardingSessionSchema>> {
  const origin = hqOrigin();
  if (!isStripeConfigured() || !origin) return { state: "not-configured" };
  const database = getDatabase();
  let [organization] = await database
    .select()
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);
  if (!organization) throw new TRPCError({ code: "NOT_FOUND" });
  const returnUrl = `${origin}${input.returnPath}`;
  if (input.method === "hosted" || !organization.stripeAccountId) {
    // Creates the connected account on first use, then the hosted link.
    const hosted = await startStripeOnboarding({
      actor: input.actor,
      refreshUrl: returnUrl,
      returnUrl,
      requestId: input.requestId,
      now: input.now,
    });
    if (input.method === "hosted") {
      await recordOnboardingMethod(input.organizationId, "hosted", input.now);
      return {
        state: "hosted",
        url: hosted.onboardingUrl,
        // Account links expire after a few minutes; HQ opens it at once.
        expiresAt: new Date(input.now.getTime() + 5 * 60_000).toISOString(),
      };
    }
    [organization] = await database
      .select()
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);
  }
  if (!organization?.stripeAccountId) return { state: "not-configured" };
  const session = await createConnectAccountSession({
    accountId: organization.stripeAccountId,
  });
  await recordOnboardingMethod(input.organizationId, "embedded", input.now);
  log.info("pay.onboarding.started", {
    organizationId: input.organizationId,
    method: "embedded",
  });
  return {
    state: "embedded",
    clientSecret: session.clientSecret,
    expiresAt: session.expiresAt.toISOString(),
  };
}

async function recordOnboardingMethod(
  organizationId: string,
  method: "hosted" | "embedded",
  now: Date,
) {
  await getDatabase()
    .insert(organizationPayAccounts)
    .values({ organizationId, onboardingMethod: method, updatedAt: now })
    .onConflictDoUpdate({
      target: organizationPayAccounts.organizationId,
      set: { onboardingMethod: method, updatedAt: now },
    });
}

/**
 * `assertPaymentsReady` for the publish gate: business facts confirmed,
 * identity verified, payouts possible. Pure over the account.
 */
export function payPublishGateFor(
  account: PayAccount,
  input: z.infer<typeof payPublishGateInputSchema>,
): z.infer<typeof payPublishGateSchema> {
  const business = Boolean(
    account.business.legalName ||
    (account.business.businessType && account.business.whatYouSell),
  );
  const verified = account.status === "ready" || account.status === "verifying";
  const payouts = account.payoutsEnabled && account.bank.status === "verified";
  const steps = [
    {
      key: "business" as const,
      label: "Tell us about your business",
      done: business,
      href: "/money/duna-pay/business",
    },
    {
      key: "verify" as const,
      label: "Verify your identity",
      done: verified,
      href: "/money/duna-pay/verify",
    },
    {
      key: "payouts" as const,
      label: "Add a bank for payouts",
      done: payouts,
      href: "/money/duna-pay/payouts",
    },
  ];
  const ready = account.status === "ready" && steps.every((step) => step.done);
  const resumeHref = input.resume
    ? `/${input.resume.kind === "offering" ? "offerings" : input.resume.kind === "event" ? "events" : "facilities"}/${input.resume.id}?publish=1`
    : undefined;
  return {
    ready,
    steps: steps.map(({ done, ...step }) => ({
      ...step,
      state: done ? "done" : "to-do",
    })),
    resumeHref,
  };
}

export async function payPublishGate(
  organizationId: string,
  input: z.infer<typeof payPublishGateInputSchema>,
) {
  return payPublishGateFor(await loadPayAccount(organizationId), input);
}

/** Throws unless the club can take payments (for publish paths). */
export async function assertPaymentsReady(
  organizationId: string,
): Promise<void> {
  const gate = await payPublishGate(organizationId, {});
  if (!gate.ready) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Finish setting up Duna Pay before publishing paid offerings.",
    });
  }
}

type PayoutSettings = z.infer<typeof payPayoutSettingsSchema>;

export async function loadPayPayoutSettings(
  organizationId: string,
): Promise<PayoutSettings> {
  const [row] = await getDatabase()
    .select()
    .from(organizationMoneySettings)
    .where(eq(organizationMoneySettings.organizationId, organizationId))
    .limit(1);
  const weekday = (row?.weeklyPayoutDay ??
    "friday") as PayoutSettings["weeklyDay"];
  const [organization] = await getDatabase()
    .select({ currency: organizations.currency })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const descriptor = (value: string | null | undefined) =>
    value && /^[A-Z0-9 .-]{5,22}$/.test(value) ? value : undefined;
  return {
    interval: (row?.payoutInterval ??
      loadPayPolicySettings()
        .defaultPayoutInterval) as PayoutSettings["interval"],
    weeklyDay: weekday,
    monthlyDay: Math.min(28, Math.max(1, row?.monthlyPayoutDay ?? 1)),
    minimumPayout: {
      amountMinor: row?.minimumPayoutMinor ?? 0,
      currency: (
        organization?.currency ?? "USD"
      ).toUpperCase() as PayoutSettings["minimumPayout"]["currency"],
    },
    statementDescriptor: descriptor(row?.statementDescriptor),
    payoutStatementDescriptor: descriptor(row?.payoutStatementDescriptor),
    syncStatus:
      row?.stripeSettingsStatus === "synced"
        ? "synced"
        : row?.stripeSettingsStatus === "failed"
          ? "failed"
          : "not-synced",
  };
}

export async function updatePayPayoutSettings(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly changes: z.infer<typeof payUpdatePayoutSettingsInputSchema>;
  readonly now: Date;
}): Promise<PayoutSettings> {
  const current = await loadPayPayoutSettings(input.organizationId);
  await updateOrganizationMoneySettings({
    actor: input.actor,
    payoutInterval: input.changes.interval ?? current.interval,
    weeklyPayoutDay: input.changes.weeklyDay ?? current.weeklyDay,
    monthlyPayoutDay: input.changes.monthlyDay ?? current.monthlyDay,
    minimumPayoutMinor:
      input.changes.minimumPayout?.amountMinor ??
      current.minimumPayout.amountMinor,
    statementDescriptor:
      input.changes.statementDescriptor ?? current.statementDescriptor,
    payoutStatementDescriptor:
      input.changes.payoutStatementDescriptor ??
      current.payoutStatementDescriptor,
    now: input.now,
  });
  return loadPayPayoutSettings(input.organizationId);
}
