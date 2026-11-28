import type {
  OrganizationMoneyWorkspace,
  PayAccount,
  PayPublishGate,
  payDisputesPageSchema,
  payObligationsPageSchema,
} from "@duna/api";
import type { z } from "zod";
import { PROVIDER_NOT_CONFIGURED_MESSAGE } from "@duna/api/observability";
import { isStripeConfigured } from "@duna/api/payments";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { payDemo } from "@duna/core/demo/pay";
import { log, report } from "@duna/observability";
import { cookies } from "next/headers";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { demoFirstDayRequested } from "../today/today-data";
import type { AccountStatus } from "./money-model";
import { setupSteps } from "./money-setup";

/**
 * Money's reads (H10). Each procedure is read once per request and turned
 * into an honest result a block can render: the data; "you need access";
 * "not configured yet" (a procedure whose service has not landed, or an
 * environment without payment keys); not found; or a failure with its
 * reference. A block never fails the whole page, and nothing here invents an
 * amount: a block without data shows its state, never a zero.
 */
export type Loaded<T> =
  | { readonly state: "ok"; readonly data: T }
  | { readonly state: "denied" }
  | { readonly state: "not-configured" }
  | { readonly state: "not-found" }
  | { readonly state: "error"; readonly reference: string };

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** The API's "not configured yet" answer (observability/trpc.ts, routers/not-implemented.ts). */
export function isNotConfiguredAnswer(error: unknown): boolean {
  const code = errorCode(error);
  if (code === "NOT_IMPLEMENTED") return true;
  return (
    code === "PRECONDITION_FAILED" &&
    error instanceof Error &&
    error.message === PROVIDER_NOT_CONFIGURED_MESSAGE
  );
}

export async function settle<T>(
  read: () => Promise<T>,
  block: string,
): Promise<Loaded<T>> {
  try {
    return { state: "ok", data: await read() };
  } catch (error) {
    if (isPermissionDenied(error)) return { state: "denied" };
    if (isNotConfiguredAnswer(error)) {
      log.info("hq.money.block_not_configured", { block });
      return { state: "not-configured" };
    }
    if (errorCode(error) === "NOT_FOUND") return { state: "not-found" };
    const reference = report(error, {
      event: "hq.money.block_failed",
      tags: { block },
    });
    return { state: "error", reference };
  }
}

/** The cookie the browser suites use to walk Duna Pay through each status (demo only). */
export const DEMO_PAY_COOKIE = "duna-demo-pay";

const accountStatuses = Object.keys(payDemo.accounts) as AccountStatus[];

/**
 * Test servers only (the persona switch's guard): the account fixture for a
 * status named in the cookie, so the setup flow can be seen in every state.
 */
export async function demoPayStatusRequested(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<AccountStatus | undefined> {
  if (
    isWorkOSAuthKitConfigured(env) ||
    env.DUNA_DEMO_PERSONAS !== "enabled" ||
    env.NEXT_PUBLIC_DEMO_MODE === "false" ||
    env.VERCEL_ENV === "production"
  ) {
    return undefined;
  }
  const value = (await cookies()).get(DEMO_PAY_COOKIE)?.value;
  return accountStatuses.find((status) => status === value);
}

/**
 * Whether Duna Pay can reach its payment partner in this environment.
 * Without keys (demo, and production until the owner sets live keys) the
 * onboarding answers "not configured" and the page explains what Duna Pay is
 * instead of offering a link that cannot open.
 */
export function payProcessorConfigured(): boolean {
  return isStripeConfigured();
}

export const loadAccount = cache(async (): Promise<Loaded<PayAccount>> => {
  const caller = await getServerCaller();
  const [demoStatus, firstDay] = await Promise.all([
    demoPayStatusRequested(),
    demoFirstDayRequested(),
  ]);
  const result = await settle(() => caller.operator.pay.account(), "account");
  if (result.state !== "ok") return result;
  const status = demoStatus ?? (firstDay ? "not-started" : undefined);
  if (status) {
    return { state: "ok", data: payDemo.accounts[status] as PayAccount };
  }
  return result;
});

export const loadPublishGate = cache(
  async (): Promise<Loaded<PayPublishGate>> => {
    const caller = await getServerCaller();
    const [gate, account, demoStatus, firstDay] = await Promise.all([
      settle(() => caller.operator.pay.publishGate({}), "publishGate"),
      loadAccount(),
      demoPayStatusRequested(),
      demoFirstDayRequested(),
    ]);
    // A demo status override shows the gate that status implies.
    if (
      gate.state === "ok" &&
      account.state === "ok" &&
      (demoStatus || firstDay)
    ) {
      const steps = setupSteps(account.data);
      return {
        state: "ok",
        data: {
          ...gate.data,
          ready:
            steps.every((step) => step.done) && account.data.status === "ready",
          steps: gate.data.steps.map((step) => ({
            ...step,
            state: steps.find((s) => s.key === step.key)?.done
              ? "done"
              : "to-do",
          })),
        },
      };
    }
    return gate;
  },
);

export const loadPayoutSettings = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.pay.payoutSettings(), "payoutSettings");
});

type ObligationsPage = z.infer<typeof payObligationsPageSchema>;
type DisputesPage = z.infer<typeof payDisputesPageSchema>;

export const loadObligations = cache(
  async (): Promise<Loaded<ObligationsPage>> => {
    const caller = await getServerCaller();
    if (await demoFirstDayRequested()) {
      return { state: "ok", data: { items: [] } };
    }
    return settle(
      () => caller.operator.pay.obligations({ limit: 100 }),
      "obligations",
    );
  },
);

export const loadObligation = cache(async (obligationId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.pay.obligation({ obligationId }),
    "obligation",
  );
});

export const loadHolds = cache(async () => {
  const caller = await getServerCaller();
  if (await demoFirstDayRequested()) return { state: "ok", data: [] } as const;
  return settle(() => caller.operator.pay.holds(), "holds");
});

export const loadReserves = cache(async () => {
  const caller = await getServerCaller();
  if (await demoFirstDayRequested()) return { state: "ok", data: [] } as const;
  return settle(() => caller.operator.pay.reserves(), "reserves");
});

export const loadRecoveries = cache(async () => {
  const caller = await getServerCaller();
  if (await demoFirstDayRequested()) return { state: "ok", data: [] } as const;
  return settle(() => caller.operator.pay.recoveries(), "recoveries");
});

export const loadDisputes = cache(async (): Promise<Loaded<DisputesPage>> => {
  const caller = await getServerCaller();
  if (await demoFirstDayRequested()) {
    return { state: "ok", data: { items: [] } };
  }
  return settle(() => caller.operator.pay.disputes({ limit: 100 }), "disputes");
});

export const loadDispute = cache(async (disputeCaseId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.pay.dispute({ disputeCaseId }),
    "dispute",
  );
});

export const loadMoneyHome = cache(async () => {
  const caller = await getServerCaller();
  if (await demoFirstDayRequested())
    return { state: "not-configured" } as const;
  return settle(() => caller.operator.pay.moneyHome(), "moneyHome");
});

export const loadTaxSettings = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.pay.taxSettings(), "taxSettings");
});

/** A club on its first day: the processor balance and history are empty. */
function emptyMoneyWorkspace(
  workspace: OrganizationMoneyWorkspace,
): OrganizationMoneyWorkspace {
  return {
    ...workspace,
    balance: {
      totalMinor: 0,
      availableMinor: 0,
      heldMinor: 0,
      pendingMinor: 0,
      inTransitMinor: 0,
      nextReleaseMinor: 0,
    },
    transactions: [],
    payouts: [],
    disputes: [],
  };
}

/**
 * The live money workspace (balance from the processor and Duna's ledger,
 * payouts, payout settings, refund policies). Its own procedure predates
 * Duna Pay's and is live today.
 */
export const loadMoneyWorkspace = cache(async () => {
  const caller = await getServerCaller();
  const result = await settle(
    () => caller.operator.moneyWorkspace(),
    "moneyWorkspace",
  );
  if (result.state === "ok" && (await demoFirstDayRequested())) {
    return { state: "ok", data: emptyMoneyWorkspace(result.data) } as const;
  }
  return result;
});

/** Every payment the club has taken, including credit-paid orders. */
export const loadTransactions = cache(async () => {
  const caller = await getServerCaller();
  if (await demoFirstDayRequested()) return { state: "ok", data: [] } as const;
  return settle(() => caller.operator.transactions(), "transactions");
});

export const loadTransaction = cache(async (transactionId: string) => {
  const caller = await getServerCaller();
  return settle(
    () => caller.operator.transaction({ transactionId }),
    "transaction",
  );
});
