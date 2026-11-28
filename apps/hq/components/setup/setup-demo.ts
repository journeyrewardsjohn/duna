import type { SetupProfile, SetupProposal, SetupRun } from "@duna/api";
import { usesDemoData } from "@duna/api";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import {
  setupDemo,
  setupDemoFailureReasons,
  setupDemoIds,
  setupDemoProposals,
  setupDemoRuns,
} from "@duna/core/demo/setup";
import { cookies } from "next/headers";
import { reviewGroupOf } from "./setup-model";

/**
 * Club setup on demo data (no database). The setup procedures answer fixed
 * fixtures there: a read never moves past "queued" and a decision is not
 * remembered. So the demo club can be set up end to end, this keeps the
 * demo's own progress in a cookie: a read started here walks queued →
 * reading → review over a few seconds, decisions and hand edits are
 * remembered, and Apply marks what was kept as added. Only ever used when
 * the API serves demo data; real clubs never touch it.
 *
 * Test servers (the persona switch's guard: no sign-in, DUNA_DEMO_PERSONAS)
 * may also pick a scenario with the `duna-demo-setup` cookie: `fresh` (no
 * read yet), `fail:<reason>` (the read fails with that reason), `little`
 * (found very little), `no-reader` (the website reader is not set up).
 */
export const DEMO_SETUP_COOKIE = "duna-demo-setup";
const STATE_COOKIE = "duna-demo-setup-state";

/** How long the demo read takes to queue, then to read. */
const QUEUED_MS = 1_200;
const READING_MS = 3_600;

type Decision = SetupProposal["decision"];

interface DemoState {
  /** When a read started here (ms). */
  readonly started?: number;
  /** The read started here: website, description or a re-read. */
  readonly kind?: "website" | "description" | "reread";
  readonly sourceUrl?: string;
  readonly cancelled?: boolean;
  readonly applied?: boolean;
  /** Decisions by proposal id: [decision, edited value]. */
  readonly decisions?: Record<string, [Decision, Record<string, unknown>?]>;
  /** Hand edits to the profile. */
  readonly profile?: Partial<SetupProfile> & {
    readonly sports?: readonly ("beach" | "indoor")[];
  };
  /** Hand edits to the brand. */
  readonly brand?: { readonly primary?: string; readonly markForm?: string };
}

export function isDemoSetup(): boolean {
  return usesDemoData();
}

function testServer(env = process.env): boolean {
  return (
    !isWorkOSAuthKitConfigured(env) &&
    env.DUNA_DEMO_PERSONAS === "enabled" &&
    env.NEXT_PUBLIC_DEMO_MODE !== "false" &&
    env.VERCEL_ENV !== "production"
  );
}

/** The scenario a test server asked for, if any. */
export async function demoScenario(): Promise<string | undefined> {
  if (!isDemoSetup() || !testServer()) return undefined;
  return (await cookies()).get(DEMO_SETUP_COOKIE)?.value;
}

async function readState(): Promise<DemoState> {
  const raw = (await cookies()).get(STATE_COOKIE)?.value;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as DemoState) : {};
  } catch {
    return {};
  }
}

async function writeState(state: DemoState): Promise<void> {
  (await cookies()).set(STATE_COOKIE, JSON.stringify(state), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 6,
  });
}

const reviewRun = () =>
  setupDemoRuns.find((run) => run.id === setupDemoIds.reviewRun) as SetupRun;
const readingRun = () =>
  setupDemoRuns.find((run) => run.id === setupDemoIds.readingRun) as SetupRun;
const foundLittle = () =>
  setupDemoRuns.find(
    (run) => run.id === setupDemoIds.foundLittleRun,
  ) as SetupRun;

function failedRun(reason: string): SetupRun | undefined {
  if (reason === "no-response") {
    return setupDemoRuns.find(
      (run) => run.id === setupDemoIds.unreachableRun,
    ) as SetupRun;
  }
  return setupDemoRuns.find(
    (run) => run.status === "failed" && run.failureReason === reason,
  ) as SetupRun | undefined;
}

/** The demo read as it stands now. */
function stagedRun(state: DemoState, now = Date.now()): SetupRun {
  const base = reviewRun();
  const sourceUrl = state.sourceUrl ?? base.sourceUrl;
  const sourceKind = state.kind === "description" ? "description" : "website";
  if (state.cancelled) {
    return {
      ...base,
      sourceKind,
      sourceUrl,
      status: "cancelled",
      outcome: undefined,
      pages: [],
      pagesRead: 0,
      pagesTotal: 0,
      itemsFound: 0,
    };
  }
  const elapsed = now - (state.started ?? 0);
  if (elapsed < QUEUED_MS) {
    return {
      ...base,
      sourceKind,
      sourceUrl,
      status: "queued",
      outcome: undefined,
      finishedAt: undefined,
      pages: [],
      pagesRead: 0,
      pagesTotal: 0,
      itemsFound: 0,
    };
  }
  if (elapsed < READING_MS) {
    const reading = readingRun();
    return {
      ...reading,
      id: base.id,
      sourceKind,
      sourceUrl,
      pages: sourceKind === "description" ? [] : reading.pages,
    };
  }
  return {
    ...base,
    sourceKind,
    sourceUrl,
    status: state.applied ? "applied" : "review",
    outcome: sourceKind === "description" ? "no-website" : "complete",
    pages: sourceKind === "description" ? [] : base.pages,
  };
}

/** startRun on demo data, or undefined to let the fixture answer. */
export async function demoStartRun(input: {
  readonly sourceKind: "website" | "description";
  readonly sourceUrl?: string;
  readonly reread?: boolean;
}): Promise<SetupRun> {
  const scenario = await demoScenario();
  if (scenario?.startsWith("fail:")) {
    const failed = failedRun(scenario.slice(5));
    if (failed)
      return { ...failed, sourceUrl: input.sourceUrl ?? failed.sourceUrl };
  }
  if (scenario === "little") return foundLittle();
  const state: DemoState = {
    ...(await readState()),
    started: Date.now(),
    kind: input.reread ? "reread" : input.sourceKind,
    sourceUrl: input.sourceUrl,
    cancelled: false,
    applied: false,
    decisions: {},
  };
  await writeState(state);
  return stagedRun(state);
}

/** run(runId) on demo data. */
export async function demoRun(runId: string): Promise<SetupRun | undefined> {
  const state = await readState();
  if (runId === setupDemoIds.reviewRun && state.started)
    return stagedRun(state);
  return setupDemoRuns.find((run) => run.id === runId) as SetupRun | undefined;
}

/** latestRun on demo data: the read started here, none (fresh), or the fixture. */
export async function demoLatestRun(): Promise<SetupRun | null | undefined> {
  const state = await readState();
  if (state.started) return stagedRun(state);
  if ((await demoScenario()) === "fresh") return null;
  return undefined;
}

export async function demoCancelRun(runId: string): Promise<SetupRun> {
  const state = await readState();
  if (runId === setupDemoIds.reviewRun && state.started) {
    const next = { ...state, cancelled: true };
    await writeState(next);
    return stagedRun(next);
  }
  const run = setupDemoRuns.find((candidate) => candidate.id === runId);
  return { ...(run as SetupRun), status: "cancelled" };
}

/** A re-read proposes only what differs, each with the value it replaces. */
function rereadView(proposal: SetupProposal): SetupProposal | undefined {
  const profile = setupDemo.profile;
  if (proposal.fieldKey === "contact.email") {
    return {
      ...proposal,
      payload: { ...proposal.payload, before: profile.email },
    };
  }
  if (proposal.fieldKey === "contact.phone") {
    return {
      ...proposal,
      payload: { ...proposal.payload, before: profile.phoneE164 },
      needsCheck: true,
      checkNote: "You set this yourself: your website says something else",
    };
  }
  if (proposal.fieldKey === "identity.tagline") {
    return {
      ...proposal,
      payload: {
        ...proposal.payload,
        value: "[new tagline]",
        before: profile.tagline,
      },
    };
  }
  return undefined;
}

const demoEntity = (proposal: SetupProposal) => {
  const group = reviewGroupOf(proposal);
  if (proposal.fieldKey === "places.venue") {
    return { type: "venue", id: "10000000-0000-4000-8000-000000000101" };
  }
  if (group === "offerings") return { type: "catalog_item", id: proposal.id };
  if (group === "team") {
    return { type: "organization_staff_profile", id: proposal.id };
  }
  if (group === "policies") {
    return typeof proposal.payload.refundBeforeMinutes === "number"
      ? { type: "organization_refund_policy", id: proposal.id }
      : { type: "organization_knowledge_note", id: proposal.id };
  }
  return { type: "organization_profile", id: setupDemo.profile.organizationId };
};

/** proposals(runId) on demo data with what the person decided here. */
export async function demoProposals(runId: string): Promise<SetupProposal[]> {
  const state = await readState();
  const fresh = Boolean(state.started) && runId === setupDemoIds.reviewRun;
  const base = (setupDemoProposals as SetupProposal[]).filter(
    (proposal) => proposal.runId === runId,
  );
  const shaped = base.flatMap((proposal) => {
    let next: SetupProposal = proposal;
    if (fresh && proposal.decision !== "superseded") {
      next = {
        ...proposal,
        decision: "pending",
        editedPayload: undefined,
        decidedAt: undefined,
        appliedAt: undefined,
        appliedEntity: undefined,
      };
    }
    if (fresh && state.kind === "reread") {
      const view = rereadView(next);
      return view ? [view] : [];
    }
    return [next];
  });
  return shaped.map((proposal) => {
    const decided = fresh ? state.decisions?.[proposal.id] : undefined;
    if (!decided) return proposal;
    const [decision, editedPayload] = decided;
    return {
      ...proposal,
      decision,
      editedPayload,
      decidedAt: "2026-11-28T09:00:00.000Z",
      ...(decision === "applied"
        ? {
            appliedAt: "2026-11-28T09:01:00.000Z",
            appliedEntity: demoEntity(proposal),
          }
        : {}),
    };
  });
}

export async function demoDecide(
  proposalId: string,
  decision: "kept" | "skipped" | "edited",
  editedPayload?: Record<string, unknown>,
): Promise<void> {
  const state = await readState();
  if (!state.started) return;
  await writeState({
    ...state,
    decisions: {
      ...state.decisions,
      [proposalId]: editedPayload ? [decision, editedPayload] : [decision],
    },
  });
}

/** applyProposals on demo data: kept and edited become added. */
export async function demoApply(runId: string): Promise<{
  readonly applied: number;
  readonly skipped: number;
  readonly proposals: SetupProposal[];
}> {
  const state = await readState();
  if (!state.started || runId !== setupDemoIds.reviewRun) {
    const proposals = await demoProposals(runId);
    return {
      applied: proposals.filter((p) => p.decision === "applied").length,
      skipped: proposals.filter((p) => p.decision === "skipped").length,
      proposals,
    };
  }
  const decisions = { ...state.decisions };
  for (const [id, [decision, edited]] of Object.entries(decisions)) {
    if (decision === "kept" || decision === "edited") {
      decisions[id] = edited ? ["applied", edited] : ["applied"];
    }
  }
  await writeState({ ...state, decisions, applied: true });
  const proposals = await demoProposals(runId);
  return {
    applied: proposals.filter((p) => p.decision === "applied").length,
    skipped: proposals.filter((p) => p.decision === "skipped").length,
    proposals,
  };
}

/** The demo profile with the hand edits made here. */
export async function demoProfile(): Promise<
  SetupProfile & { readonly sports?: readonly ("beach" | "indoor")[] }
> {
  const state = await readState();
  return { ...setupDemo.profile, ...state.profile } as SetupProfile & {
    readonly sports?: readonly ("beach" | "indoor")[];
  };
}

export async function demoUpdateProfile(
  update: Partial<SetupProfile> & {
    readonly sports?: readonly ("beach" | "indoor")[];
    readonly confirmFields?: readonly string[];
  },
): Promise<SetupProfile> {
  const state = await readState();
  const current = { ...setupDemo.profile, ...state.profile };
  const { confirmFields = [], ...values } = update;
  const fieldSources = {
    ...current.fieldSources,
  } as SetupProfile["fieldSources"];
  for (const key of Object.keys(values)) {
    if (key === "name" || key === "sports") continue;
    fieldSources[key] = { source: "person", confirmed: true };
  }
  for (const key of confirmFields) {
    const existing = fieldSources[key];
    if (existing) fieldSources[key] = { ...existing, confirmed: true };
  }
  const profile = {
    ...state.profile,
    ...values,
    fieldSources,
    updatedAt: new Date().toISOString(),
  };
  await writeState({ ...state, profile });
  return { ...current, ...profile } as SetupProfile;
}

export async function demoBrand(): Promise<DemoState["brand"]> {
  return (await readState()).brand;
}

export async function demoSaveBrand(brand: DemoState["brand"]): Promise<void> {
  const state = await readState();
  await writeState({ ...state, brand: { ...state.brand, ...brand } });
}

/** Every failure reason the demo can show (for the scenario cookie). */
export const demoFailureReasons = setupDemoFailureReasons;
