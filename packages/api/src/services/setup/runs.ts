/**
 * Setup runs: start, advance (resumable, idempotent, lease-fenced), finish,
 * fail and cancel. Run: queued → reading → review → applied; reading →
 * failed; queued | reading → cancelled.
 *
 * Long work survives a serverless timeout because every step persists its
 * progress: pages are rows (queued → reading → read | failed | skipped),
 * facts found on a page are written with the page in one transaction, and a
 * run is "held" only through its `updated_at` heartbeat. A step that stops
 * (timeout, crash, deploy) is taken over once the lease lapses, by the next
 * `run` poll or by `processPendingSetupRuns` (cron). Taking over puts any
 * half-read page back in the queue; nothing is read twice into the result.
 */
import {
  organizations,
  setupProposals,
  setupRunPages,
  setupRuns,
} from "@duna/db";
import { log, report } from "@duna/observability";
import { TRPCError } from "@trpc/server";
import { waitUntil } from "@vercel/functions";
import { and, asc, desc, eq, gte, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";
import type { SetupRun, setupStartRunInputSchema } from "../../contracts/setup";
import { providerNotConfigured } from "../../observability";
import { isAllowedByRobots, parseRobots, planPages } from "./discovery";
import {
  createGatewaySetupExtractor,
  isSetupModelConfigured,
  type SetupExtractor,
} from "./extractor";
import {
  SetupReadError,
  setupFailureMessages,
  type SetupFailureReason,
} from "./failure-reasons";
import { setupLimits } from "./limits";
import { diffAgainstCurrent, mergeFacts } from "./merge";
import {
  createFirecrawlSetupReader,
  isSetupReaderConfigured,
  siteStatusFailure,
  type SetupSiteReader,
} from "./reader";
import {
  loadCurrentRecords,
  loadRunWithPages,
  runToContract,
  setupDatabase,
  type SetupExecutor,
  type SetupProposalRow,
  type SetupRunRow,
} from "./records";
import { sanitisePageText } from "./sanitize";
import {
  checkSetupUrl,
  isSameSite,
  normaliseSetupUrl,
  sourcePath,
  systemHostResolver,
  type HostResolver,
} from "./url-safety";
import {
  brandingFacts,
  validatePageExtraction,
  type SetupFact,
} from "./validate";

/** Everything outside the database a run touches; tests inject recordings. */
export interface SetupRunDependencies {
  readonly reader?: SetupSiteReader;
  readonly extractor?: SetupExtractor;
  readonly resolveHost?: HostResolver;
  /** Hands a run to background work; default: waitUntil on Vercel. */
  readonly schedule?: (runId: string) => void;
  readonly clock?: () => Date;
}

interface ResolvedDependencies {
  readonly reader: () => SetupSiteReader;
  readonly extractor: () => SetupExtractor;
  readonly resolveHost: HostResolver;
  readonly schedule: (runId: string) => void;
  readonly clock: () => Date;
}

function resolveDependencies(
  deps: SetupRunDependencies = {},
): ResolvedDependencies {
  let reader = deps.reader;
  let extractor = deps.extractor;
  return {
    reader: () => (reader ??= createFirecrawlSetupReader()),
    extractor: () => (extractor ??= createGatewaySetupExtractor()),
    resolveHost: deps.resolveHost ?? systemHostResolver,
    schedule: deps.schedule ?? scheduleSetupRunAdvance,
    clock: deps.clock ?? (() => new Date()),
  };
}

/** Runs a step in the background without blocking the request. */
export function scheduleSetupRunAdvance(runId: string): void {
  const task = advanceSetupRun(runId).catch((error: unknown) => {
    report(error, { event: "setup.run.step-failed", fields: { runId } });
  });
  if (process.env.VERCEL) {
    try {
      waitUntil(task);
      return;
    } catch {
      // Outside a request (cron, scripts) the task simply runs.
    }
  }
  void task;
}

export type StartRunRequest = z.infer<typeof setupStartRunInputSchema>;

/**
 * Starts a run. Order matters: nothing reaches the network or the database
 * until the needed providers are configured and the address is valid.
 */
export async function startSetupRun(input: {
  readonly organizationId: string;
  readonly personId: string;
  readonly request: StartRunRequest;
  readonly now: Date;
  readonly deps?: SetupRunDependencies;
}): Promise<SetupRun> {
  const { request } = input;
  if (request.sourceKind === "google-listing") {
    // No listing reader exists yet: the honest not-configured state.
    providerNotConfigured("siteReader");
  }
  if (
    request.sourceKind === "website" &&
    !input.deps?.reader &&
    !isSetupReaderConfigured()
  ) {
    providerNotConfigured("siteReader");
  }
  if (!input.deps?.extractor && !isSetupModelConfigured()) {
    providerNotConfigured("aiGateway");
  }
  let sourceUrl: string | null = null;
  if (request.sourceKind === "website") {
    const checked = normaliseSetupUrl(request.sourceUrl);
    if (!checked.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: setupFailureMessages[checked.reason],
      });
    }
    sourceUrl = checked.url;
  }
  const sourceText =
    request.sourceKind === "description" ? request.sourceText.trim() : null;
  const deps = resolveDependencies(input.deps);
  const database = setupDatabase();

  const outcome = await database.transaction(async (tx) => {
    // One start at a time per club.
    await tx
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .for("update");
    const [active] = await tx
      .select()
      .from(setupRuns)
      .where(
        and(
          eq(setupRuns.organizationId, input.organizationId),
          inArray(setupRuns.status, ["queued", "reading"]),
        ),
      )
      .orderBy(desc(setupRuns.createdAt))
      .limit(1);
    if (active) {
      if (active.sourceUrl === sourceUrl && active.sourceText === sourceText) {
        return { runId: active.id, created: false };
      }
      throw new TRPCError({
        code: "CONFLICT",
        message:
          "Duna is already reading for this club. Wait for it to finish, or cancel it.",
      });
    }
    const since = new Date(input.now.getTime() - 24 * 60 * 60_000);
    const [{ count }] = (await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(setupRuns)
      .where(
        and(
          eq(setupRuns.organizationId, input.organizationId),
          gte(setupRuns.createdAt, since),
        ),
      )) as [{ count: number }];
    if (Number(count) >= setupLimits.runsPerClubPerDay) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Duna can read for your club ${setupLimits.runsPerClubPerDay} times a day. Try again tomorrow, or fill in your club by hand.`,
      });
    }
    const [previous] = await tx
      .select({ id: setupRuns.id })
      .from(setupRuns)
      .where(
        and(
          eq(setupRuns.organizationId, input.organizationId),
          inArray(setupRuns.status, ["review", "applied"]),
        ),
      )
      .orderBy(desc(setupRuns.createdAt))
      .limit(1);
    const [run] = await tx
      .insert(setupRuns)
      .values({
        organizationId: input.organizationId,
        sourceKind: request.sourceKind,
        sourceUrl,
        sourceText,
        status: "queued",
        pagesTotal: sourceUrl ? 1 : 0,
        previousRunId: previous?.id ?? null,
        startedByPersonId: input.personId,
        createdAt: input.now,
        updatedAt: input.now,
      })
      .returning({ id: setupRuns.id });
    if (sourceUrl) {
      await tx.insert(setupRunPages).values({
        runId: run!.id,
        position: 0,
        url: sourceUrl,
        title: "Home",
        status: "queued",
        createdAt: input.now,
      });
    }
    return { runId: run!.id, created: true };
  });
  if (outcome.created) {
    log.info("setup.run.started", {
      runId: outcome.runId,
      organizationId: input.organizationId,
      sourceKind: request.sourceKind,
    });
  }
  deps.schedule(outcome.runId);
  const loaded = await loadRunWithPages(
    database,
    input.organizationId,
    outcome.runId,
  );
  return runToContract(loaded!.run, loaded!.pages);
}

function isActive(run: SetupRunRow): boolean {
  return run.status === "queued" || run.status === "reading";
}

/** True when a run is waiting for work and nobody holds it. */
export function needsAdvance(run: SetupRunRow, now: Date): boolean {
  if (run.status === "queued") return true;
  return (
    run.status === "reading" &&
    run.updatedAt.getTime() < now.getTime() - setupLimits.leaseMs
  );
}

/** The `run` query: returns the run and, if it stalled, wakes it up. */
export async function getSetupRun(input: {
  readonly organizationId: string;
  readonly runId: string;
  readonly now: Date;
  readonly deps?: SetupRunDependencies;
}): Promise<SetupRun> {
  const loaded = await loadRunWithPages(
    setupDatabase(),
    input.organizationId,
    input.runId,
  );
  if (!loaded)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That setup run was not found.",
    });
  if (needsAdvance(loaded.run, input.now)) {
    resolveDependencies(input.deps).schedule(loaded.run.id);
  }
  return runToContract(loaded.run, loaded.pages);
}

export async function getLatestSetupRun(input: {
  readonly organizationId: string;
  readonly now: Date;
  readonly deps?: SetupRunDependencies;
}): Promise<SetupRun | null> {
  const [latest] = await setupDatabase()
    .select({ id: setupRuns.id })
    .from(setupRuns)
    .where(eq(setupRuns.organizationId, input.organizationId))
    .orderBy(desc(setupRuns.createdAt))
    .limit(1);
  if (!latest) return null;
  return getSetupRun({ ...input, runId: latest.id });
}

/** Cancels a queued or reading run; facts gathered so far are discarded. */
export async function cancelSetupRun(input: {
  readonly organizationId: string;
  readonly runId: string;
  readonly now: Date;
}): Promise<SetupRun> {
  const database = setupDatabase();
  await database.transaction(async (tx) => {
    const [run] = await tx
      .update(setupRuns)
      .set({ status: "cancelled", finishedAt: input.now, updatedAt: input.now })
      .where(
        and(
          eq(setupRuns.id, input.runId),
          eq(setupRuns.organizationId, input.organizationId),
          inArray(setupRuns.status, ["queued", "reading"]),
        ),
      )
      .returning({ id: setupRuns.id });
    if (!run) return;
    await tx.delete(setupProposals).where(eq(setupProposals.runId, run.id));
    await tx
      .update(setupRunPages)
      .set({ status: "skipped" })
      .where(
        and(
          eq(setupRunPages.runId, run.id),
          inArray(setupRunPages.status, ["queued", "reading"]),
        ),
      );
    log.info("setup.run.cancelled", { runId: run.id });
  });
  const loaded = await loadRunWithPages(
    database,
    input.organizationId,
    input.runId,
  );
  if (!loaded)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "That setup run was not found.",
    });
  if (!["cancelled"].includes(loaded.run.status) && isActive(loaded.run)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This run could not be cancelled.",
    });
  }
  return runToContract(loaded.run, loaded.pages);
}

/** Claims the run for one step; undefined when another step holds it or it is done. */
async function claimRun(
  runId: string,
  now: Date,
): Promise<SetupRunRow | undefined> {
  const database = setupDatabase();
  const staleBefore = new Date(now.getTime() - setupLimits.leaseMs);
  return database.transaction(async (tx) => {
    const [claimed] = await tx
      .update(setupRuns)
      .set({
        status: "reading",
        startedAt: sql`coalesce(${setupRuns.startedAt}, ${now})`,
        updatedAt: now,
      })
      .where(
        and(
          eq(setupRuns.id, runId),
          or(
            eq(setupRuns.status, "queued"),
            and(
              eq(setupRuns.status, "reading"),
              lt(setupRuns.updatedAt, staleBefore),
            ),
          ),
        ),
      )
      .returning();
    if (!claimed) return undefined;
    // A page left half-read by a stopped step goes back in the queue.
    await tx
      .update(setupRunPages)
      .set({ status: "queued" })
      .where(
        and(
          eq(setupRunPages.runId, runId),
          eq(setupRunPages.status, "reading"),
        ),
      );
    return claimed;
  });
}

async function heartbeat(runId: string, now: Date): Promise<boolean> {
  const [row] = await setupDatabase()
    .update(setupRuns)
    .set({ updatedAt: now })
    .where(and(eq(setupRuns.id, runId), eq(setupRuns.status, "reading")))
    .returning({ id: setupRuns.id });
  return Boolean(row);
}

/** Hands the run back so the next step can start at once. */
async function releaseRun(runId: string, now: Date): Promise<void> {
  await setupDatabase()
    .update(setupRuns)
    .set({ updatedAt: new Date(now.getTime() - setupLimits.leaseMs - 1) })
    .where(and(eq(setupRuns.id, runId), eq(setupRuns.status, "reading")));
}

export async function failSetupRun(
  runId: string,
  reason: SetupFailureReason,
  now: Date,
): Promise<void> {
  await setupDatabase().transaction(async (tx) => {
    const [run] = await tx
      .update(setupRuns)
      .set({
        status: "failed",
        outcome: "site-unreachable",
        failureReason: reason,
        finishedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(setupRuns.id, runId),
          inArray(setupRuns.status, ["queued", "reading"]),
        ),
      )
      .returning({ id: setupRuns.id });
    if (!run) return;
    await tx.delete(setupProposals).where(eq(setupProposals.runId, runId));
    await tx
      .update(setupRunPages)
      .set({ status: "skipped" })
      .where(
        and(eq(setupRunPages.runId, runId), eq(setupRunPages.status, "queued")),
      );
  });
  log.warn("setup.run.failed", { runId, reason });
}

const nanpCountries = new Set(["US", "CA", "PR", "GU", "VI", "AS", "MP"]);

async function validationContext(organizationId: string) {
  const [organization] = await setupDatabase()
    .select({
      currency: organizations.currency,
      countryCode: organizations.countryCode,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return {
    currency: organization?.currency ?? "USD",
    callingCode: nanpCountries.has(organization?.countryCode ?? "US")
      ? "1"
      : "",
  };
}

/** Stores the facts of one page and marks it read, atomically. */
async function recordPage(input: {
  readonly run: SetupRunRow;
  readonly pageId?: string;
  readonly facts: readonly SetupFact[];
  readonly title?: string;
  readonly url?: string;
  readonly now: Date;
}): Promise<boolean> {
  return setupDatabase().transaction(async (tx) => {
    const [held] = await tx
      .update(setupRuns)
      .set({
        pagesRead: input.pageId
          ? sql`${setupRuns.pagesRead} + 1`
          : setupRuns.pagesRead,
        itemsFound: sql`${setupRuns.itemsFound} + ${input.facts.length}`,
        updatedAt: input.now,
      })
      .where(
        and(eq(setupRuns.id, input.run.id), eq(setupRuns.status, "reading")),
      )
      .returning({ id: setupRuns.id });
    if (!held) return false;
    if (input.facts.length) {
      await tx.insert(setupProposals).values(
        input.facts.map((fact) => ({
          organizationId: input.run.organizationId,
          runId: input.run.id,
          category: fact.category,
          fieldKey: fact.fieldKey,
          label: fact.label.slice(0, 200),
          payload: {
            ...fact.value,
            mergeKey: fact.mergeKey,
            confidence: fact.confidence,
            quotes: [fact.quote],
          },
          sourcePages: [fact.quote.page],
          needsCheck: fact.checks.length > 0,
          checkNote: fact.checks.length ? fact.checks.join(". ") : null,
          createdAt: input.now,
          updatedAt: input.now,
        })),
      );
    }
    if (input.pageId) {
      await tx
        .update(setupRunPages)
        .set({
          status: "read",
          itemsFound: input.facts.length,
          readAt: input.now,
          ...(input.title ? { title: input.title.slice(0, 200) } : {}),
          ...(input.url ? { url: input.url } : {}),
        })
        .where(
          and(
            eq(setupRunPages.id, input.pageId),
            eq(setupRunPages.status, "reading"),
          ),
        );
    }
    return true;
  });
}

async function markPage(
  pageId: string,
  status: "failed" | "skipped",
): Promise<void> {
  await setupDatabase()
    .update(setupRunPages)
    .set({ status })
    .where(
      and(
        eq(setupRunPages.id, pageId),
        inArray(setupRunPages.status, ["reading", "queued"]),
      ),
    );
}

function factFromRow(row: SetupProposalRow): SetupFact {
  const { mergeKey, confidence, quotes, ...value } = row.payload as Record<
    string,
    unknown
  > & {
    mergeKey?: string;
    confidence?: "stated" | "inferred";
    quotes?: { page: string; text: string }[];
  };
  return {
    category: row.category as SetupFact["category"],
    fieldKey: row.fieldKey,
    mergeKey: mergeKey ?? row.fieldKey,
    label: row.label,
    value,
    quote: quotes?.[0] ?? { page: row.sourcePages[0] ?? "/", text: "" },
    confidence: confidence ?? "stated",
    checks: row.checkNote ? row.checkNote.split(". ").filter(Boolean) : [],
  };
}

/**
 * Merges the run's facts, diffs them against the club's current records,
 * supersedes older pending proposals and opens the run for review. Runs in
 * one transaction fenced on `status = 'reading'`, so it happens once.
 */
export async function finishSetupRun(runId: string, now: Date): Promise<void> {
  const finished = await setupDatabase().transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(setupRuns)
      .where(and(eq(setupRuns.id, runId), eq(setupRuns.status, "reading")))
      .for("update");
    if (!run) return undefined;
    const raw = await tx
      .select()
      .from(setupProposals)
      .where(eq(setupProposals.runId, runId));
    const current = await loadCurrentRecords(
      tx as SetupExecutor,
      run.organizationId,
    );
    const drafts = diffAgainstCurrent(
      mergeFacts(raw.map(factFromRow)),
      current,
    );
    await tx.delete(setupProposals).where(eq(setupProposals.runId, runId));
    if (drafts.length) {
      await tx.insert(setupProposals).values(
        drafts.map((draft) => ({
          organizationId: run.organizationId,
          runId,
          category: draft.category,
          fieldKey: draft.fieldKey,
          label: draft.label.slice(0, 200),
          payload: draft.payload,
          candidates: draft.candidates,
          sourcePages: draft.sourcePages,
          needsCheck: draft.needsCheck,
          checkNote: draft.checkNote ?? null,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
    // A newer read replaces what older runs still had pending.
    await tx
      .update(setupProposals)
      .set({ decision: "superseded", updatedAt: now })
      .where(
        and(
          eq(setupProposals.organizationId, run.organizationId),
          ne(setupProposals.runId, runId),
          eq(setupProposals.decision, "pending"),
        ),
      );
    await tx
      .update(setupRunPages)
      .set({ status: "skipped" })
      .where(
        and(
          eq(setupRunPages.runId, runId),
          inArray(setupRunPages.status, ["queued", "reading"]),
        ),
      );
    const outcome =
      run.sourceKind === "description"
        ? "no-website"
        : drafts.length < setupLimits.foundVeryLittleBelow
          ? "found-very-little"
          : "complete";
    await tx
      .update(setupRuns)
      .set({
        status: "review",
        outcome,
        itemsFound: drafts.length,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(setupRuns.id, runId));
    return { outcome, proposals: drafts.length, rawFacts: raw.length };
  });
  if (finished) log.info("setup.run.finished", { runId, ...finished });
}

/** Reads one page through the reader with the URL checks around it. */
async function readCheckedPage(input: {
  readonly url: string;
  readonly homeUrl?: string;
  readonly discover: boolean;
  readonly deps: ResolvedDependencies;
}) {
  const before = await checkSetupUrl(input.url, input.deps.resolveHost);
  if (!before.ok) throw new SetupReadError(before.reason);
  const page = await input.deps
    .reader()
    .read(before.url, { discover: input.discover });
  const statusFailure = siteStatusFailure(page.statusCode);
  if (statusFailure) throw statusFailure;
  // Redirects: wherever the reader ended up must pass the same checks.
  const after = await checkSetupUrl(
    page.finalUrl || before.url,
    input.deps.resolveHost,
  );
  if (!after.ok) throw new SetupReadError("address-not-allowed");
  if (input.homeUrl && !isSameSite(after.url, input.homeUrl)) {
    throw new SetupReadError("address-not-allowed");
  }
  if (page.markdown.length > setupLimits.maxPageChars)
    throw new SetupReadError("too-large");
  return { ...page, finalUrl: after.url };
}

/**
 * One step of a run: claims it, reads pages until the step budget is spent,
 * and finishes the run when nothing is left. Safe to call any number of
 * times, concurrently, after a crash: the lease and the per-page status make
 * every step idempotent.
 */
export async function advanceSetupRun(
  runId: string,
  dependencies?: SetupRunDependencies,
): Promise<void> {
  const deps = resolveDependencies(dependencies);
  const stepStarted = deps.clock();
  const run = await claimRun(runId, stepStarted);
  if (!run) return;
  const context = await validationContext(run.organizationId);

  if (
    run.startedAt &&
    deps.clock().getTime() - run.startedAt.getTime() > setupLimits.runDeadlineMs
  ) {
    if (run.pagesRead > 0) await finishSetupRun(runId, deps.clock());
    else await failSetupRun(runId, "timed-out", deps.clock());
    return;
  }

  if (run.sourceKind === "description") {
    try {
      const sanitised = sanitisePageText(run.sourceText ?? "");
      const raw = await deps.extractor()({
        source: "description",
        text: sanitised.text,
      });
      const { facts, dropped } = validatePageExtraction(raw, {
        page: "description",
        text: sanitised.text,
        ...context,
      });
      log.info("setup.page.extracted", {
        runId,
        facts: facts.length,
        dropped,
        removedLines: sanitised.removedLines,
      });
      if (await recordPage({ run, facts, now: deps.clock() })) {
        await finishSetupRun(runId, deps.clock());
      }
    } catch (error) {
      report(error, { event: "setup.extract.failed", fields: { runId } });
      await releaseRun(runId, deps.clock());
    }
    return;
  }

  while (
    deps.clock().getTime() - stepStarted.getTime() <
    setupLimits.stepBudgetMs
  ) {
    const pages = await setupDatabase()
      .select()
      .from(setupRunPages)
      .where(eq(setupRunPages.runId, runId))
      .orderBy(asc(setupRunPages.position));
    const next = pages.find((page) => page.status === "queued");
    if (!next) {
      const home = pages.find((page) => page.position === 0);
      if (home?.status === "read") await finishSetupRun(runId, deps.clock());
      return;
    }
    const [claimedPage] = await setupDatabase()
      .update(setupRunPages)
      .set({ status: "reading" })
      .where(
        and(eq(setupRunPages.id, next.id), eq(setupRunPages.status, "queued")),
      )
      .returning();
    if (!claimedPage) return;
    if (!(await heartbeat(runId, deps.clock()))) return; // cancelled meanwhile
    const isHome = claimedPage.position === 0;
    const homeUrl = isHome
      ? undefined
      : pages.find((page) => page.position === 0)?.url;

    try {
      let robots = undefined as ReturnType<typeof parseRobots> | undefined;
      if (isHome) {
        const syntax = await checkSetupUrl(claimedPage.url, deps.resolveHost);
        if (!syntax.ok) throw new SetupReadError(syntax.reason);
        robots = parseRobots(
          await deps.reader().readRobots(new URL(syntax.url).origin),
        );
        if (!isAllowedByRobots(robots, new URL(syntax.url).pathname)) {
          throw new SetupReadError("blocked-by-site");
        }
      }
      const page = await readCheckedPage({
        url: claimedPage.url,
        homeUrl,
        discover: isHome,
        deps,
      });
      const sanitised = sanitisePageText(page.markdown);
      if (isHome && sanitised.text.replace(/\s+/g, " ").length < 40) {
        throw new SetupReadError("nothing-readable");
      }
      const path = sourcePath(page.finalUrl);
      let facts: SetupFact[] = [];
      let dropped = 0;
      if (sanitised.text.trim()) {
        try {
          const raw = await deps.extractor()({
            source: path,
            text: sanitised.text,
          });
          ({ facts, dropped } = validatePageExtraction(raw, {
            page: path,
            text: sanitised.text,
            ...context,
          }));
        } catch (error) {
          // The page was read; extraction failing must not fail the run.
          report(error, {
            event: "setup.extract.failed",
            fields: { runId, pageNumber: claimedPage.position },
          });
        }
      }
      if (isHome) facts.push(...brandingFacts(page.branding, path));
      log.info("setup.page.extracted", {
        runId,
        pageNumber: claimedPage.position,
        facts: facts.length,
        dropped,
        removedLines: sanitised.removedLines,
        chars: page.markdown.length,
      });
      if (isHome) {
        const planned = planPages(page.finalUrl, page.links, robots);
        if (planned.length) {
          await setupDatabase()
            .insert(setupRunPages)
            .values(
              planned.map((plannedPage, index) => ({
                runId,
                position: index + 1,
                url: plannedPage.url,
                title:
                  plannedPage.topic[0]!.toUpperCase() +
                  plannedPage.topic.slice(1),
                status: "queued",
                createdAt: deps.clock(),
              })),
            )
            .onConflictDoNothing();
        }
        await setupDatabase()
          .update(setupRuns)
          .set({ pagesTotal: 1 + planned.length })
          .where(and(eq(setupRuns.id, runId), eq(setupRuns.status, "reading")));
      }
      const recorded = await recordPage({
        run,
        pageId: claimedPage.id,
        facts,
        title: isHome ? "Home" : undefined,
        url: isHome ? page.finalUrl : undefined,
        now: deps.clock(),
      });
      if (!recorded) return;
    } catch (error) {
      const reason = error instanceof SetupReadError ? error.reason : undefined;
      if (!reason) {
        report(error, {
          event: "setup.page.failed",
          fields: { runId, pageNumber: claimedPage.position },
        });
      }
      if (isHome) {
        await failSetupRun(runId, reason ?? "no-response", deps.clock());
        return;
      }
      await markPage(claimedPage.id, "failed");
      log.warn("setup.page.failed", {
        runId,
        pageNumber: claimedPage.position,
        reason: reason ?? "error",
      });
    }
  }
  // Budget spent: hand the run back and continue in a fresh step.
  await releaseRun(runId, deps.clock());
  deps.schedule(runId);
}

/** Cron entry: advances every run that is waiting or whose step stalled. */
export async function processPendingSetupRuns(input?: {
  readonly limit?: number;
  readonly now?: Date;
  readonly deps?: SetupRunDependencies;
}): Promise<{ readonly advanced: number }> {
  const now = input?.now ?? new Date();
  const staleBefore = new Date(now.getTime() - setupLimits.leaseMs);
  const candidates = await setupDatabase()
    .select({ id: setupRuns.id })
    .from(setupRuns)
    .where(
      or(
        eq(setupRuns.status, "queued"),
        and(
          eq(setupRuns.status, "reading"),
          lt(setupRuns.updatedAt, staleBefore),
        ),
      ),
    )
    .orderBy(asc(setupRuns.updatedAt))
    .limit(Math.min(20, Math.max(1, input?.limit ?? 5)));
  for (const candidate of candidates) {
    await advanceSetupRun(candidate.id, input?.deps);
  }
  return { advanced: candidates.length };
}

/**
 * Retention (proposed default, docs/product/club-setup.md): run pages and
 * quoted text are deleted once a run finished more than `retentionDays`
 * ago. Decisions, applied values and the audit trail stay.
 */
export async function purgeExpiredSetupRunData(
  now: Date,
): Promise<{ readonly runs: number }> {
  const cutoff = new Date(
    now.getTime() - setupLimits.retentionDays * 24 * 60 * 60_000,
  );
  return setupDatabase().transaction(async (tx) => {
    const expired = await tx
      .select({ id: setupRuns.id })
      .from(setupRuns)
      .where(and(lt(setupRuns.finishedAt, cutoff)));
    const ids = expired.map((run) => run.id);
    if (!ids.length) return { runs: 0 };
    await tx.delete(setupRunPages).where(inArray(setupRunPages.runId, ids));
    await tx
      .update(setupProposals)
      .set({ payload: sql`${setupProposals.payload} - 'quotes'` })
      .where(inArray(setupProposals.runId, ids));
    await tx
      .update(setupRuns)
      .set({
        sourceText: sql`case when ${setupRuns.sourceKind} = 'description' then '[removed]' else null end`,
      })
      .where(inArray(setupRuns.id, ids));
    return { runs: ids.length };
  });
}
