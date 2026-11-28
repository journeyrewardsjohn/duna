/**
 * The Duna Pay setup flow (H10, DP-Business → DP-Verify → DP-Payouts →
 * ready), read from the account the backend returned. Pure, so every status
 * is tested. The three steps are the publish gate's (services/pay/account.ts
 * `payPublishGateFor`): business facts confirmed, identity verified, a
 * verified payout bank.
 */
import type { PayAccount } from "@duna/api";
import type { SectionMark } from "@duna/ui/tideline";

export type SetupStepKey = "business" | "verify" | "payouts";

export interface SetupStep {
  readonly key: SetupStepKey;
  readonly label: string;
  readonly href: string;
  readonly done: boolean;
  readonly mark: SectionMark;
  /** One quiet line: what is left, or what was confirmed. */
  readonly detail: string;
}

export const dunaPayPaths = {
  home: "/money/duna-pay",
  business: "/money/duna-pay/business",
  verify: "/money/duna-pay/verify",
  payouts: "/money/duna-pay/payouts",
} as const;

type Account = Pick<
  PayAccount,
  "status" | "business" | "bank" | "payoutsEnabled" | "requirementsDue"
>;

export function setupSteps(account: Account): SetupStep[] {
  const business = Boolean(
    account.business.legalName ||
    (account.business.businessType && account.business.whatYouSell),
  );
  const verified = account.status === "ready" || account.status === "verifying";
  const payouts = account.payoutsEnabled && account.bank.status === "verified";
  const verifyMark: SectionMark = verified
    ? "done"
    : account.status === "action-needed" || account.status === "restricted"
      ? "attention"
      : account.status === "in-progress"
        ? "in-progress"
        : "not-started";
  const bankMark: SectionMark = payouts
    ? "done"
    : account.bank.status === "errored"
      ? "attention"
      : account.bank.status === "pending"
        ? "in-progress"
        : "not-started";
  return [
    {
      key: "business",
      label: "Business details",
      href: dunaPayPaths.business,
      done: business,
      mark: business ? "done" : "not-started",
      detail: business
        ? (account.business.legalName ?? "Confirmed")
        : "Who is getting paid, and what you sell",
    },
    {
      key: "verify",
      label: "Verify your identity",
      href: dunaPayPaths.verify,
      done: verified,
      mark: verifyMark,
      detail:
        account.status === "verifying"
          ? "Being checked"
          : verified
            ? "Verified"
            : account.requirementsDue.length > 0
              ? `${account.requirementsDue.length} ${account.requirementsDue.length === 1 ? "thing" : "things"} to fix`
              : "A few minutes with an ID to hand",
    },
    {
      key: "payouts",
      label: "Payout bank and schedule",
      href: dunaPayPaths.payouts,
      done: payouts,
      mark: bankMark,
      detail: payouts
        ? account.bank.last4
          ? `Bank ending ${account.bank.last4}`
          : "Bank verified"
        : account.bank.status === "errored"
          ? "The bank declined payouts"
          : account.bank.status === "pending"
            ? "Being checked"
            : "Where your money goes",
    },
  ];
}

export type SetupNext =
  | { readonly kind: "step"; readonly step: SetupStep }
  | { readonly kind: "wait" }
  | { readonly kind: "done" };

/**
 * The ONE next thing to do. Fixing what the account needs comes first,
 * then the steps in order; while the details are checked there is nothing
 * to do.
 */
export function setupNext(account: Account): SetupNext {
  const steps = setupSteps(account);
  if (account.status === "ready" && steps.every((step) => step.done)) {
    return { kind: "done" };
  }
  if (account.status === "action-needed" || account.status === "restricted") {
    const bankOnly =
      account.requirementsDue.length > 0 &&
      account.requirementsDue.every((r) => r.code === "external_account");
    return {
      kind: "step",
      step: steps.find((s) => s.key === (bankOnly ? "payouts" : "verify"))!,
    };
  }
  const open = steps.find((step) => !step.done);
  return open ? { kind: "step", step: open } : { kind: "wait" };
}
