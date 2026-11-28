import type {
  OperatorWorkspace,
  SetupProfile,
  SetupProposal,
  SetupReadiness,
  SetupRun,
} from "@duna/api";
import { isProviderUsable } from "@duna/api";
import { PROVIDER_NOT_CONFIGURED_MESSAGE } from "@duna/api/observability";
import { log, report } from "@duna/observability";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import {
  demoLatestRun,
  demoProfile,
  demoProposals,
  demoRun,
  demoScenario,
  isDemoSetup,
} from "./setup-demo";

/**
 * Club setup's reads (H-SETUP). Each read becomes an honest result a block
 * can render: the data, "you need access", "not set up yet", not found, or
 * a failure with its reference. A block never fails the whole page.
 */
export type Loaded<T> =
  | { readonly state: "ok"; readonly data: T }
  | { readonly state: "denied" }
  | { readonly state: "not-configured" }
  | { readonly state: "not-found" }
  | { readonly state: "error"; readonly reference: string };

export function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

/** The API's "not set up here yet" answer. */
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
      log.info("hq.setup.block_not_configured", { block });
      return { state: "not-configured" };
    }
    if (errorCode(error) === "NOT_FOUND") return { state: "not-found" };
    const reference = report(error, {
      event: "hq.setup.block_failed",
      tags: { block },
    });
    return { state: "error", reference };
  }
}

/** The club's profile, plus its sports (which live on the organisation). */
export type SetupProfileView = SetupProfile & {
  readonly sports: readonly ("beach" | "indoor")[];
};

export const loadWorkspace = cache(
  async (): Promise<Loaded<OperatorWorkspace>> => {
    const caller = await getServerCaller();
    return settle(() => caller.operator.workspace(), "workspace");
  },
);

export const loadProfile = cache(
  async (): Promise<Loaded<SetupProfileView>> => {
    const caller = await getServerCaller();
    const workspace = await loadWorkspace();
    const sports =
      workspace.state === "ok"
        ? workspace.data.organization.volleyballTypes
        : [];
    if (isDemoSetup()) {
      const profile = await demoProfile();
      return {
        state: "ok",
        data: { ...profile, sports: profile.sports ?? sports },
      };
    }
    const loaded = await settle(
      () => caller.operator.setup.profile(),
      "profile",
    );
    return loaded.state === "ok"
      ? { state: "ok", data: { ...loaded.data, sports } }
      : loaded;
  },
);

export const loadReadiness = cache(
  async (): Promise<Loaded<SetupReadiness>> => {
    const caller = await getServerCaller();
    return settle(() => caller.operator.setup.readiness(), "readiness");
  },
);

export const loadLatestRun = cache(
  async (): Promise<Loaded<SetupRun | null>> => {
    if (isDemoSetup()) {
      const demo = await demoLatestRun();
      if (demo !== undefined) return { state: "ok", data: demo };
    }
    const caller = await getServerCaller();
    return settle(() => caller.operator.setup.latestRun(), "latest_run");
  },
);

export async function loadRun(runId: string): Promise<Loaded<SetupRun>> {
  if (isDemoSetup()) {
    const demo = await demoRun(runId);
    return demo ? { state: "ok", data: demo } : { state: "not-found" };
  }
  const caller = await getServerCaller();
  return settle(() => caller.operator.setup.run({ runId }), "run");
}

export async function loadProposals(
  runId: string,
): Promise<Loaded<SetupProposal[]>> {
  if (isDemoSetup()) return { state: "ok", data: await demoProposals(runId) };
  const caller = await getServerCaller();
  return settle(
    async () => (await caller.operator.setup.proposals({ runId })).proposals,
    "proposals",
  );
}

/**
 * Whether Duna can read a website here: the website reader and the model
 * both set up. Without them every by-hand path still works.
 */
export async function websiteReaderStatus(): Promise<
  "ready" | "not-configured"
> {
  if (isDemoSetup()) {
    return (await demoScenario()) === "no-reader" ? "not-configured" : "ready";
  }
  return isProviderUsable("siteReader") && isProviderUsable("aiGateway")
    ? "ready"
    : "not-configured";
}

/** Whether Duna can propose facts from a description (the model only). */
export async function describeStatus(): Promise<"ready" | "not-configured"> {
  if (isDemoSetup()) {
    return (await demoScenario()) === "no-reader" ? "not-configured" : "ready";
  }
  return isProviderUsable("aiGateway") ? "ready" : "not-configured";
}
