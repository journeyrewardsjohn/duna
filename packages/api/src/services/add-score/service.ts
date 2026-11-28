/**
 * Add a score without an account (SITE-3). The anonymous draft's life:
 *
 *   save (per step) → read (resume) → preview (never writes) → claim
 *   (signed in: one normal unverified match through recordCompletedMatch)
 *   → deleted seven days after it was started, claimed or not.
 *
 * Nothing anonymous changes a rating, a ranking or a public page: the claim
 * creates a `pending-verification` match exactly as the signed-in recorder
 * does; ratings move only through the existing confirmation path.
 *
 * Abuse controls without friction (docs/product/add-score.md): per-address and
 * per-draft rate limits on every anonymous call (buckets keyed by a one-way
 * hash, never the raw address), content rules on typed names (contracts),
 * no contact details in a draft, nothing shown publicly.
 */
import { venues, getDatabase } from "@duna/db";
import { eq } from "drizzle-orm";
import { log } from "@duna/observability";
import type { ApiActor } from "../../context";
import {
  ADD_SCORE_DRAFT_TTL_DAYS,
  addScoreDraftDataSchema,
  type AddScoreClaimInput,
  type AddScoreClaimResult,
  type AddScoreDraftData,
  type AddScoreDraftView,
  type AddScorePreviewResult,
  type AddScoreReadResult,
  type AddScoreSaveResult,
  type AddScoreStep,
} from "../../contracts/add-score";
import { recordCompletedMatch } from "../../match-service";
import { consumeRateLimit } from "../../rate-limit";
import { usesDemoData } from "../data-source";
import { demoId } from "@duna/core/demo/ids";
import {
  expireProviderContent,
  markCandidateClaimed,
  recordPlaceForDraft,
} from "./candidates";
import { previewFromDraft } from "./preview";
import {
  ADD_SCORE_STEPS,
  completedSteps,
  hashDraftToken,
  hashedKey,
  mergeStep,
  newDraftToken,
  scoreShape,
  scoreWarnings,
  stepErrors,
} from "./rules";
import {
  DatabaseDraftStore,
  MemoryDraftStore,
  type DraftRecord,
  type DraftStore,
} from "./store";

export class AddScoreError extends Error {
  constructor(
    readonly code:
      | "RATE_LIMITED"
      | "NOT_FOUND"
      | "EXPIRED"
      | "NOT_READY"
      | "CLAIMED_BY_SOMEONE_ELSE"
      | "CLAIM_IN_PROGRESS"
      | "PLAYERS_DO_NOT_MATCH"
      | "UNDER_13",
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AddScoreError";
  }
}

const DAY_MS = 86_400_000;
/** A claim that stopped half way (a crash) may be retried after this. */
const STALE_CLAIM_MS = 2 * 60_000;

/** Rate-limit budgets: generous for a person, tight for a script. */
export const ADD_SCORE_LIMITS = {
  /** New drafts from one address: 12 an hour. */
  newDraftPerAddress: { capacity: 12, refillPerMinute: 0.2 },
  /** Saves from one address (several people on one network): 60, 30 a minute. */
  savePerAddress: { capacity: 60, refillPerMinute: 30 },
  /** Saves to one draft: 30, 15 a minute. */
  savePerDraft: { capacity: 30, refillPerMinute: 15 },
  previewPerAddress: { capacity: 60, refillPerMinute: 30 },
  previewPerDraft: { capacity: 30, refillPerMinute: 15 },
  readPerAddress: { capacity: 120, refillPerMinute: 60 },
  claimPerPerson: { capacity: 10, refillPerMinute: 5 },
} as const;

let memoryStore: MemoryDraftStore | undefined;
const databaseStore = new DatabaseDraftStore();

/** The store for this runtime (tests pass their own). */
export function draftStore(): DraftStore {
  if (usesDemoData()) {
    memoryStore ??= new MemoryDraftStore();
    return memoryStore;
  }
  return databaseStore;
}

async function limit(
  id: keyof typeof ADD_SCORE_LIMITS,
  key: string,
  now: Date,
): Promise<void> {
  const policy = ADD_SCORE_LIMITS[id];
  const decision = await consumeRateLimit({
    key: `add-score.${id}:${key}`,
    capacity: policy.capacity,
    refillPerMinute: policy.refillPerMinute,
    now,
  });
  if (!decision.allowed) {
    log.info("addScore.rateLimited", { policy: id });
    throw new AddScoreError(
      "RATE_LIMITED",
      `Lots of scores from here just now. Try again in ${decision.retryAfterSeconds} seconds.`,
      decision.retryAfterSeconds,
    );
  }
}

function isExpired(draft: DraftRecord, now: Date): boolean {
  return draft.expiresAt.getTime() <= now.getTime();
}

function parseData(value: unknown): AddScoreDraftData {
  const parsed = addScoreDraftDataSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function placeSummary(
  data: AddScoreDraftData,
  draft: Pick<DraftRecord, "venueId">,
): AddScoreDraftView["place"] {
  const place = data.place;
  if (!place) return undefined;
  if (place.kind === "duna") {
    return { kind: "duna", label: place.name, detail: "On Duna", isNew: false };
  }
  if (place.kind === "places") {
    return {
      kind: "places",
      label: place.name,
      detail: place.address,
      // A place that is already a Duna venue is not new.
      isNew: !draft.venueId,
    };
  }
  return {
    kind: "described",
    label: place.name,
    detail: place.address ?? "Pin dropped",
    isNew: true,
  };
}

function view(draft: DraftRecord, now: Date): AddScoreDraftView {
  const data = parseData(draft.data);
  return {
    data,
    completed: completedSteps(data, now),
    place: placeSummary(data, draft),
    warnings: data.sets?.length ? scoreWarnings(data.sets) : [],
    startedAt: draft.createdAt.toISOString(),
    expiresAt: draft.expiresAt.toISOString(),
  };
}

interface AnonymousCall {
  readonly token?: string;
  readonly ipAddress?: string;
  readonly requestId: string;
  readonly now: Date;
  readonly store?: DraftStore;
}

async function findDraft(
  store: DraftStore,
  token: string | undefined,
): Promise<DraftRecord | undefined> {
  if (!token) return undefined;
  return store.findByTokenHash(hashDraftToken(token));
}

/** Save one step. A first save starts the draft and returns its token. */
export async function saveScoreDraft(
  input: AnonymousCall & {
    readonly step: AddScoreStep;
    readonly data: AddScoreDraftData;
  },
): Promise<AddScoreSaveResult> {
  const store = input.store ?? draftStore();
  const address = hashedKey("ip", input.ipAddress);
  await limit("savePerAddress", address, input.now);

  let draft = await findDraft(store, input.token);
  if (draft && draft.status === "claimed") return { status: "claimed" };
  if (draft && draft.status === "claiming") {
    throw new AddScoreError(
      "CLAIM_IN_PROGRESS",
      "This score is being saved to an account.",
    );
  }
  if (draft && isExpired(draft, input.now)) {
    await store.delete(draft.id);
    return { status: "expired" };
  }
  if (input.token && !draft) {
    // A cookie for a draft that no longer exists (deleted by the cleanup).
    return { status: "expired" };
  }

  const merged = mergeStep(
    draft ? parseData(draft.data) : {},
    input.step,
    input.data,
  );
  const errors = stepErrors(input.step, merged, input.now);
  if (Object.keys(errors).length > 0) {
    return { status: "invalid", fieldErrors: errors };
  }

  let newToken: string | undefined;
  if (!draft) {
    await limit("newDraftPerAddress", address, input.now);
    newToken = newDraftToken();
    draft = await store.insert({
      id: crypto.randomUUID(),
      tokenHash: hashDraftToken(newToken),
      status: "draft",
      data: {},
      placeKind: null,
      venueId: null,
      venueCandidateId: null,
      playedOn: null,
      claimedByPersonId: null,
      claimedMatchId: null,
      claimStartedAt: null,
      claimedAt: null,
      expiresAt: new Date(
        input.now.getTime() + ADD_SCORE_DRAFT_TTL_DAYS * DAY_MS,
      ),
      createdAt: input.now,
      updatedAt: input.now,
    });
  } else {
    await limit("savePerDraft", draft.id, input.now);
  }

  let venueId = draft.venueId;
  let venueCandidateId = draft.venueCandidateId;
  if (input.step === "where" && merged.place) {
    if (usesDemoData()) {
      venueId = merged.place.kind === "duna" ? merged.place.venueId : null;
      venueCandidateId = null;
    } else {
      const landed = await recordPlaceForDraft({
        draftId: draft.id,
        previousCandidateId: draft.venueCandidateId,
        place: merged.place,
        now: input.now,
      });
      venueId = landed.venueId;
      venueCandidateId = landed.candidateId;
    }
  }

  const saved = await store.update(draft.id, {
    data: merged,
    placeKind: merged.place?.kind ?? null,
    venueId,
    venueCandidateId,
    playedOn: merged.playedOn ?? null,
    updatedAt: input.now,
  });
  log.info("addScore.draft.saved", {
    step: input.step,
    created: Boolean(newToken),
    placeKind: merged.place?.kind,
    requestId: input.requestId,
  });
  return {
    status: "saved",
    newToken,
    draft: view(saved ?? draft, input.now),
  };
}

/** Resume: the draft this browser started, if it is still here. */
export async function readScoreDraft(
  input: AnonymousCall,
): Promise<AddScoreReadResult> {
  const store = input.store ?? draftStore();
  await limit("readPerAddress", hashedKey("ip", input.ipAddress), input.now);
  const draft = await findDraft(store, input.token);
  if (!draft) return { state: input.token ? "expired" : "none" };
  if (draft.status === "claimed") {
    return { state: "claimed", matchId: draft.claimedMatchId ?? undefined };
  }
  if (isExpired(draft, input.now)) {
    await store.delete(draft.id);
    return { state: "expired" };
  }
  return { state: "active", draft: view(draft, input.now) };
}

/**
 * What this result would do. Reads the draft and runs the rating engine on
 * a copy of its result in memory; writes nothing.
 */
export async function previewScoreDraft(
  input: AnonymousCall,
): Promise<AddScorePreviewResult> {
  const store = input.store ?? draftStore();
  await limit("previewPerAddress", hashedKey("ip", input.ipAddress), input.now);
  const draft = await findDraft(store, input.token);
  if (!draft) return { state: input.token ? "expired" : "none" };
  if (isExpired(draft, input.now)) return { state: "expired" };
  await limit("previewPerDraft", draft.id, input.now);
  const data = parseData(draft.data);
  const missing = ADD_SCORE_STEPS.filter(
    (step) => Object.keys(stepErrors(step, data, input.now)).length > 0,
  );
  const preview = missing.includes("score")
    ? undefined
    : previewFromDraft(structuredClone(data));
  if (!preview || missing.length > 0) {
    return { state: "not-ready", missing };
  }
  return { state: "ready", preview };
}

/** "Start over": deletes the draft now. */
export async function discardScoreDraft(
  input: AnonymousCall,
): Promise<{ readonly discarded: boolean }> {
  const store = input.store ?? draftStore();
  await limit("savePerAddress", hashedKey("ip", input.ipAddress), input.now);
  const draft = await findDraft(store, input.token);
  if (!draft || draft.status !== "draft") return { discarded: false };
  return { discarded: await store.delete(draft.id) };
}

function playedAtFor(day: string): Date {
  // Midday UTC keeps the calendar day in every time zone people play in.
  return new Date(`${day}T12:00:00.000Z`);
}

/**
 * Save the draft to the signed-in person: exactly one normal unverified match
 * through `recordCompletedMatch` (the claimer on one side, everyone else a
 * provisional player who gets a confirm link only if a contact is given here).
 * Idempotent: claiming again returns the same match. A draft claimed by one
 * person can never be claimed by another.
 */
export async function claimScoreDraft(input: {
  readonly actor: ApiActor;
  readonly claim: AddScoreClaimInput;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
  readonly store?: DraftStore;
}): Promise<AddScoreClaimResult> {
  const store = input.store ?? draftStore();
  const { actor, claim, now } = input;
  await limit("claimPerPerson", actor.personId, now);
  if (actor.ageBand === "under-13") {
    throw new AddScoreError(
      "UNDER_13",
      "A parent or guardian needs to add this score from their account.",
    );
  }
  const draft = await findDraft(store, claim.token);
  if (!draft) {
    throw new AddScoreError(
      "NOT_FOUND",
      "We couldn’t find that score. It may have been deleted after 7 days.",
    );
  }
  if (draft.status === "claimed") {
    if (draft.claimedByPersonId === actor.personId && draft.claimedMatchId) {
      return { status: "already-claimed", matchId: draft.claimedMatchId };
    }
    throw new AddScoreError(
      "CLAIMED_BY_SOMEONE_ELSE",
      "This score was already saved to another account.",
    );
  }
  if (isExpired(draft, now)) {
    await store.delete(draft.id);
    throw new AddScoreError(
      "EXPIRED",
      "This score was deleted after 7 days. Add it again: it takes a minute.",
    );
  }
  if (draft.status === "claiming") {
    const stale =
      draft.claimStartedAt &&
      now.getTime() - draft.claimStartedAt.getTime() > STALE_CLAIM_MS;
    if (draft.claimedByPersonId !== actor.personId) {
      throw new AddScoreError(
        "CLAIMED_BY_SOMEONE_ELSE",
        "This score is being saved to another account.",
      );
    }
    if (!stale) {
      throw new AddScoreError(
        "CLAIM_IN_PROGRESS",
        "We’re already saving this score. Give it a moment.",
      );
    }
  }

  const data = parseData(draft.data);
  const missing = ADD_SCORE_STEPS.filter(
    (step) => Object.keys(stepErrors(step, data, now)).length > 0,
  );
  if (missing.length > 0) {
    throw new AddScoreError(
      "NOT_READY",
      "Finish the score first: where, the score and who played.",
    );
  }
  const format = data.format!;
  if (
    claim.teammates.length !== format - 1 ||
    claim.opponents.length !== format
  ) {
    throw new AddScoreError(
      "PLAYERS_DO_NOT_MATCH",
      `A ${format} v ${format} match needs ${format - 1} ${format - 1 === 1 ? "partner" : "teammates"} and ${format} players on the other side.`,
    );
  }
  const shape = scoreShape(data.sets!);
  if (!shape.ok) {
    throw new AddScoreError("NOT_READY", shape.problem);
  }

  const locked = await store.transition(
    draft.id,
    draft.status === "claiming" ? ["claiming"] : ["draft"],
    {
      status: "claiming",
      claimedByPersonId: actor.personId,
      claimStartedAt: now,
      updatedAt: now,
    },
    draft.status === "claiming"
      ? { claimedByPersonId: actor.personId }
      : undefined,
  );
  if (!locked) {
    // Someone else moved it first: answer as of now.
    const current = await store.findByTokenHash(draft.tokenHash);
    if (
      current?.status === "claimed" &&
      current.claimedByPersonId === actor.personId &&
      current.claimedMatchId
    ) {
      return { status: "already-claimed", matchId: current.claimedMatchId };
    }
    throw new AddScoreError(
      current?.claimedByPersonId === actor.personId
        ? "CLAIM_IN_PROGRESS"
        : "CLAIMED_BY_SOMEONE_ELSE",
      "This score is already being saved.",
    );
  }

  let matchId: string;
  try {
    if (usesDemoData()) {
      matchId = demoId("add-score", 1);
    } else {
      const place = data.place!;
      let venueId = place.kind === "duna" ? place.venueId : draft.venueId;
      if (venueId) {
        const venue = await getDatabase()
          .select({ id: venues.id })
          .from(venues)
          .where(eq(venues.id, venueId))
          .limit(1);
        if (!venue[0]) venueId = null;
      }
      const location =
        place.kind === "duna"
          ? undefined
          : {
              label: place.address
                ? `${place.name}, ${place.address}`
                : place.name,
              googlePlaceId:
                place.kind === "places" ? place.placeId : undefined,
              name: place.name,
              address: place.address,
              latitude: place.latitude,
              longitude: place.longitude,
            };
      const state = await recordCompletedMatch({
        actor,
        teamAIds: [actor.personId],
        teamBIds: [],
        provisionalParticipants: [
          ...claim.teammates.map((player) => ({
            side: "A" as const,
            givenName: player.firstName,
            familyName: player.lastName,
            email: player.email,
            phoneE164: player.phoneE164,
          })),
          ...claim.opponents.map((player) => ({
            side: "B" as const,
            givenName: player.firstName,
            familyName: player.lastName,
            email: player.email,
            phoneE164: player.phoneE164,
          })),
        ],
        venueId: venueId ?? undefined,
        location,
        playedAt: playedAtFor(data.playedOn!),
        setsToWin: shape.shape.setsToWin,
        setScores: data.sets!.map((set) => ({ a: set.you, b: set.them })),
        matchType: data.matchType!,
        allPlayersAgreedToRecord: true,
        deviceId: `add-score:${draft.id}`,
        requestId: input.requestId,
        ipAddress: input.ipAddress,
        now,
      });
      matchId = state.matchId;
    }
  } catch (error) {
    // Hand the draft back so the person can fix a name or a contact and retry.
    await store.transition(
      draft.id,
      ["claiming"],
      { status: "draft", claimedByPersonId: null, claimStartedAt: null },
      { claimedByPersonId: actor.personId },
    );
    throw error;
  }

  await store.update(draft.id, {
    status: "claimed",
    claimedMatchId: matchId,
    claimedAt: now,
    // Keep only who claimed it and which match it became.
    data: {},
    updatedAt: now,
  });
  if (draft.venueCandidateId && !usesDemoData()) {
    await markCandidateClaimed({
      draftId: draft.id,
      candidateId: draft.venueCandidateId,
      personId: actor.personId,
    }).catch((error: unknown) =>
      log.warn("addScore.candidate.claimCountFailed", {
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
  }
  log.info("addScore.draft.claimed", {
    requestId: input.requestId,
    format,
    matchType: data.matchType,
  });
  return { status: "claimed", matchId };
}

/**
 * Daily cleanup: deletes drafts seven days after they were started (claimed
 * or not) and clears provider content older than 30 days from candidates.
 * Bounded and idempotent; reports counts only.
 */
export async function cleanUpScoreDrafts(input: {
  readonly now: Date;
  readonly limit?: number;
  readonly store?: DraftStore;
}): Promise<{
  readonly draftsDeleted: number;
  readonly providerContentCleared: number;
}> {
  const store = input.store ?? draftStore();
  const draftsDeleted = await store.deleteExpired(
    input.now,
    input.limit ?? 5_000,
  );
  const providerContentCleared = usesDemoData()
    ? 0
    : await expireProviderContent(input.now);
  return { draftsDeleted, providerContentCleared };
}
