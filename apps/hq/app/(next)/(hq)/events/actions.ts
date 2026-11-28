"use server";

import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import type { MoneyActionResult } from "@/components/money/money-action-result";
import { isNotConfiguredAnswer } from "@/components/money/money-data";
import type { EventCapability } from "@/components/events/events-capabilities";
import {
  DEMO_EVENTS_COOKIE,
  isDemoEventId,
  parseDemoEvents,
  serializeDemoEvents,
  type DemoEventsStore,
} from "@/components/events/events-demo";
import { localInputToInstant } from "@/components/events/events-model";
import { getHqSession } from "@/components/shell/hq-session";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";

/**
 * Events' changes (H-EVENTS). Each is a person's confirmed action from the
 * event workspace: the screen says what will happen and who it reaches (for
 * money, who gets what back), asks, then calls one of these with the
 * idempotency key the confirming control made (reused on retry). They answer
 * a result instead of throwing, so the screen can say what happened and give
 * the reference. In demo mode (no Duna Database) a change is kept in a
 * cookie in the person's own browser, so the workspace shows it.
 */

type Result<T> = MoneyActionResult<T>;

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

const plainCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
]);

const deniedWords = {
  change:
    "Your role can't change this event. Nothing was changed; the club's owner or a director can.",
  money:
    "Your role can't return money. Nothing was changed; the club's owner can.",
  read: "Your role can't see this. Nothing was changed; the club's owner can.",
} as const;

/** A change the API cannot make yet, or the demo club cannot keep. */
class NotAvailableYet extends Error {}

function needsApi(capability: EventCapability, words: string): never {
  log.info("hq.events.needs_api", { capability });
  throw new NotAvailableYet(words);
}

async function run<T>(
  action: string,
  sessionId: string | undefined,
  perform: () => Promise<T>,
  options: {
    readonly read?: boolean;
    readonly denied?: keyof typeof deniedWords;
  } = {},
): Promise<Result<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    if (!options.read) {
      revalidatePath("/events");
      if (sessionId) revalidatePath(`/events/${sessionId}`, "layout");
    }
    log.info(
      options.read ? "hq.events.read_succeeded" : "hq.events.action_succeeded",
      { action },
    );
    return { ok: true, data };
  } catch (error) {
    if (error instanceof NotAvailableYet) {
      return {
        ok: false,
        code: "not-configured",
        message: error.message,
        reference: requestId,
      };
    }
    if (isPermissionDenied(error)) {
      log.info("hq.events.action_denied", { action });
      return {
        ok: false,
        code: "denied",
        message:
          deniedWords[options.denied ?? (options.read ? "read" : "change")],
        reference: requestId,
      };
    }
    if (isNotConfiguredAnswer(error)) {
      return {
        ok: false,
        code: "not-configured",
        message:
          "This isn't set up in this environment yet. Nothing was changed.",
        reference: requestId,
      };
    }
    const code = codeOf(error);
    log.warn("hq.events.action_failed", { action, code: code ?? "unknown" });
    const said =
      code && plainCodes.has(code) && error instanceof Error && error.message
        ? error.message
        : undefined;
    return {
      ok: false,
      code: "failed",
      message: said
        ? /Nothing was/.test(said)
          ? said
          : `${said} Nothing was changed.`
        : "Something went wrong on our side. Nothing was changed; try again.",
      reference: requestId,
    };
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (value: string) =>
  uuidPattern.test(value) ? value : crypto.randomUUID();

async function isDemo() {
  return (await getHqSession()).demo;
}

async function updateDemo(change: (store: DemoEventsStore) => DemoEventsStore) {
  const jar = await cookies();
  const store = parseDemoEvents(jar.get(DEMO_EVENTS_COOKIE)?.value);
  jar.set(DEMO_EVENTS_COOKIE, serializeDemoEvents(change(store)), {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
  });
}

const add = (values: readonly string[], value: string) =>
  values.includes(value) ? values : [...values, value];

const demoOnly =
  "The demo club keeps this change for its own events only. Nothing was changed.";

function reasonOf(value: string, fallback: string): string {
  const text = value.trim();
  return text.length >= 3 ? text.slice(0, 500) : fallback;
}

/* ───────────────────────── Publishing and launch ───────────────────────── */

export async function publishEventAction(input: {
  readonly sessionId: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("publish", input.sessionId, async () => {
    if (await isDemo()) {
      if (!isDemoEventId(input.sessionId)) throw new NotAvailableYet(demoOnly);
      await updateDemo((store) => ({
        ...store,
        published: add(store.published, input.sessionId),
      }));
      return { id: input.sessionId };
    }
    const caller = await getServerCaller();
    const result = await caller.operator.publishSession({
      sessionId: input.sessionId,
      confirmed: true,
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

export async function closeRegistrationAction(input: {
  readonly sessionId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("close_registration", input.sessionId, async () => {
    if (await isDemo()) {
      if (!isDemoEventId(input.sessionId)) throw new NotAvailableYet(demoOnly);
      await updateDemo((store) => ({
        ...store,
        closed: add(store.closed, input.sessionId),
      }));
      return { id: input.sessionId };
    }
    const caller = await getServerCaller();
    const result = await caller.operator.closeEventRegistration({
      sessionId: input.sessionId,
      reason: reasonOf(input.reason, "Director closed registration."),
      confirmed: true,
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

export async function publishLiveAction(input: {
  readonly sessionId: string;
  readonly message: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("publish_live", input.sessionId, async () => {
    const message = input.message.trim();
    if (message.length < 10) {
      throw Object.assign(
        new Error("Write a message of at least 10 characters for the field."),
        { code: "BAD_REQUEST" },
      );
    }
    if (await isDemo()) {
      if (!isDemoEventId(input.sessionId)) throw new NotAvailableYet(demoOnly);
      await updateDemo((store) => ({
        ...store,
        live: add(store.live, input.sessionId),
      }));
      return { id: input.sessionId };
    }
    const caller = await getServerCaller();
    const result = await caller.operator.publishTournamentLive({
      sessionId: input.sessionId,
      participantMessage: message.slice(0, 500),
      reason: "Director reviewed every division and published the field.",
      confirmed: true,
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

export async function finalizeDivisionAction(input: {
  readonly sessionId: string;
  readonly divisionId: string;
  readonly step: "seeds" | "draw";
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run(`finalize_${input.step}`, input.sessionId, async () => {
    if (await isDemo()) {
      if (!isDemoEventId(input.sessionId)) throw new NotAvailableYet(demoOnly);
      await updateDemo((store) =>
        input.step === "seeds"
          ? { ...store, seedsFinal: add(store.seedsFinal, input.divisionId) }
          : { ...store, drawFinal: add(store.drawFinal, input.divisionId) },
      );
      return { id: input.divisionId };
    }
    const caller = await getServerCaller();
    const request = {
      divisionId: input.divisionId,
      reason:
        input.step === "seeds"
          ? "Director reviewed and finalized the seeds."
          : "Director reviewed and finalized the draw.",
      confirmed: true as const,
      idempotencyKey: key(input.idempotencyKey),
    };
    const result =
      input.step === "seeds"
        ? await caller.operator.finalizeDivisionSeeding(request)
        : await caller.operator.finalizeDivisionDraw(request);
    return { id: result.id };
  });
}

/* ───────────────────────────── Entries ───────────────────────────── */

export async function setTeamSelectionAction(input: {
  readonly sessionId: string;
  readonly teamEntryId: string;
  readonly status: "confirmed" | "waitlisted" | "withdrawn";
  readonly seed?: number;
  readonly reason: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("team_selection", input.sessionId, async () => {
    if (await isDemo()) {
      if (!isDemoEventId(input.sessionId)) throw new NotAvailableYet(demoOnly);
      await updateDemo((store) => ({
        ...store,
        selection: {
          ...store.selection,
          [input.teamEntryId]: {
            status: input.status,
            ...(input.seed ? { seed: input.seed } : {}),
          },
        },
      }));
      return { id: input.teamEntryId };
    }
    const caller = await getServerCaller();
    const result = await caller.operator.setTeamSelection({
      teamEntryId: input.teamEntryId,
      selectionStatus: input.status,
      ...(input.seed ? { seed: input.seed } : {}),
      reason: reasonOf(input.reason, "Director changed the field."),
      confirmed: true,
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

export async function recordAttendanceAction(input: {
  readonly sessionId: string;
  readonly registrationId: string;
  readonly status: "scheduled" | "attended" | "no-show";
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("attendance", input.sessionId, async () => {
    if (await isDemo()) {
      await updateDemo((store) => ({
        ...store,
        attendance: {
          ...store.attendance,
          [input.registrationId]: input.status,
        },
      }));
      return { id: input.registrationId };
    }
    const caller = await getServerCaller();
    const result = await caller.operator.recordSessionAttendance({
      registrationId: input.registrationId,
      status: input.status,
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

export interface PlayerMatch {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly rating?: number;
}

export async function searchPlayersAction(input: {
  readonly sessionId: string;
  readonly query: string;
}): Promise<Result<readonly PlayerMatch[]>> {
  return run(
    "player_search",
    undefined,
    async () => {
      const query = input.query.trim();
      if (query.length < 2) return [];
      const caller = await getServerCaller();
      if (await isDemo()) {
        const workspace = await caller.operator.workspace();
        const needle = query.toLowerCase();
        return workspace.people
          .filter((person) => person.displayName.toLowerCase().includes(needle))
          .slice(0, 8)
          .map((person) => ({
            id: person.personId,
            name: person.displayName,
            handle: "Member",
          }));
      }
      const players = await caller.operator.searchEventPlayers({
        sessionId: input.sessionId,
        query: query.slice(0, 80),
      });
      return players.map((player) => ({
        id: player.id,
        name: player.displayName,
        handle:
          player.connection === "organization" ? "Member" : `@${player.handle}`,
        ...(player.rating ? { rating: player.rating } : {}),
      }));
    },
    { read: true },
  );
}

export async function addPlayerAction(input: {
  readonly sessionId: string;
  readonly divisionId: string;
  readonly identity:
    | { readonly kind: "duna"; readonly personId: string }
    | {
        readonly kind: "guest";
        readonly givenName: string;
        readonly familyName: string;
        readonly email?: string;
      };
  readonly payment: "complimentary" | "to-be-paid";
  readonly reason: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ name: string; invitationUrl?: string }>> {
  return run("add_player", input.sessionId, async () => {
    if (await isDemo()) {
      throw new NotAvailableYet(
        "Adding a player needs the club's own data; the demo club's field stays as it is. Nothing was changed.",
      );
    }
    const caller = await getServerCaller();
    const result = await caller.operator.addEventPlayerEntry({
      sessionId: input.sessionId,
      divisionId: input.divisionId,
      identity:
        input.identity.kind === "duna"
          ? input.identity
          : {
              kind: "guest",
              givenName: input.identity.givenName.trim(),
              familyName: input.identity.familyName.trim(),
              ...(input.identity.email?.trim()
                ? { email: input.identity.email.trim() }
                : {}),
            },
      paymentTreatment: input.payment,
      reason: reasonOf(input.reason, "Director added a player."),
      confirmed: true,
      idempotencyKey: key(input.idempotencyKey),
    });
    return {
      name: result.displayName,
      ...(result.invitationUrl ? { invitationUrl: result.invitationUrl } : {}),
    };
  });
}

/* ──────────────────────── Schedule and courts ──────────────────────── */

export async function moveMatchAction(input: {
  readonly sessionId: string;
  readonly matchId: string;
  readonly courtId?: string;
  /** "2026-12-05T10:30" in the event's own time. */
  readonly localStartsAt?: string;
  readonly timeZone: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("move_match", input.sessionId, async () => {
    const scheduledAt = input.localStartsAt
      ? localInputToInstant(input.localStartsAt, input.timeZone)
      : undefined;
    if (input.localStartsAt && !scheduledAt) {
      throw Object.assign(new Error("Choose a valid date and time."), {
        code: "BAD_REQUEST",
      });
    }
    if (!scheduledAt && !input.courtId) {
      throw Object.assign(new Error("Choose a court or a time."), {
        code: "BAD_REQUEST",
      });
    }
    if (await isDemo()) {
      if (!isDemoEventId(input.sessionId)) throw new NotAvailableYet(demoOnly);
      await updateDemo((store) => ({
        ...store,
        schedule: {
          ...store.schedule,
          [input.matchId]: {
            ...store.schedule[input.matchId],
            ...(input.courtId ? { courtId: input.courtId } : {}),
            ...(scheduledAt ? { scheduledAt } : {}),
          },
        },
      }));
      return { id: input.matchId };
    }
    const caller = await getServerCaller();
    const result = await caller.operator.updateDivisionMatchSchedule({
      matchId: input.matchId,
      ...(input.courtId ? { courtId: input.courtId } : {}),
      ...(scheduledAt ? { scheduledAt } : {}),
      reason: reasonOf(
        input.reason,
        "Director changed the match's court or time.",
      ),
      confirmed: true,
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

export async function recordResultAction(input: {
  readonly sessionId: string;
  readonly matchId: string;
  readonly sets: readonly (readonly [number, number])[];
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("record_result", input.sessionId, async () => {
    const sets = input.sets.filter(
      ([home, away]) =>
        Number.isInteger(home) &&
        Number.isInteger(away) &&
        home >= 0 &&
        away >= 0 &&
        home !== away,
    );
    if (sets.length === 0) {
      throw Object.assign(new Error("Enter at least one finished set."), {
        code: "BAD_REQUEST",
      });
    }
    if ((await isDemo()) && isDemoEventId(input.sessionId)) {
      await updateDemo((store) => ({
        ...store,
        results: { ...store.results, [input.matchId]: sets.slice(0, 5) },
      }));
      return { id: input.matchId };
    }
    return needsApi(
      "recordResult",
      "Entering a result from HQ isn't available yet; scores come in as matches are scored courtside. Nothing was changed.",
    );
  });
}

/* ─────────────────────────────── Money ─────────────────────────────── */

export async function refundEntryAction(input: {
  readonly sessionId: string;
  readonly registrationId: string;
  readonly orderId?: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run(
    "refund_entry",
    input.sessionId,
    async () => {
      if (input.reason.trim().length < 5) {
        throw Object.assign(
          new Error("Say why, in a few words (at least 5 characters)."),
          { code: "BAD_REQUEST" },
        );
      }
      if (await isDemo()) {
        await updateDemo((store) => ({
          ...store,
          refunded: add(store.refunded, input.registrationId),
        }));
        return { id: input.registrationId };
      }
      const caller = await getServerCaller();
      const result = await caller.operator.refundEventRegistration({
        registrationId: input.registrationId,
        ...(input.orderId ? { orderId: input.orderId } : {}),
        reason: input.reason.trim().slice(0, 1_000),
        confirmed: true,
        idempotencyKey: key(input.idempotencyKey),
      });
      return { id: result.id };
    },
    { denied: "money" },
  );
}

export async function cancelEventAction(input: {
  readonly sessionId: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run(
    "cancel_event",
    input.sessionId,
    async () => {
      if (input.reason.trim().length < 3) {
        throw Object.assign(
          new Error("Say why, in a few words: players receive it."),
          { code: "BAD_REQUEST" },
        );
      }
      if (await isDemo()) {
        await updateDemo((store) => ({
          ...store,
          cancelled: add(store.cancelled, input.sessionId),
        }));
        return { id: input.sessionId };
      }
      const caller = await getServerCaller();
      const result = await caller.operator.cancelCalendarSession({
        sessionId: input.sessionId,
        reason: input.reason.trim().slice(0, 500),
        confirmed: true,
        idempotencyKey: key(input.idempotencyKey),
      });
      return { id: result.id };
    },
    { denied: "money" },
  );
}

export async function changeFeeAction(input: {
  readonly sessionId: string;
  readonly divisionId: string;
  readonly feeMinor: number;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run(
    "change_fee",
    input.sessionId,
    async () => {
      if (!Number.isInteger(input.feeMinor) || input.feeMinor < 0) {
        throw Object.assign(new Error("Enter a fee of zero or more."), {
          code: "BAD_REQUEST",
        });
      }
      if ((await isDemo()) && isDemoEventId(input.sessionId)) {
        await updateDemo((store) => ({
          ...store,
          fees: { ...store.fees, [input.divisionId]: input.feeMinor },
        }));
        return { id: input.divisionId };
      }
      return needsApi(
        "changeFee",
        "Changing a fee after people entered isn't available yet; set fees in the event studio before entries open. Nothing was changed.",
      );
    },
    { denied: "money" },
  );
}

export async function approveTicketAction(input: {
  readonly orderId: string;
  readonly ticketTypeId: string;
  readonly sessionId?: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ quantity: number }>> {
  return run(
    "approve_ticket",
    input.sessionId,
    async () => {
      if (await isDemo()) {
        throw new NotAvailableYet(
          "The demo club has no tickets waiting. Nothing was changed.",
        );
      }
      const caller = await getServerCaller();
      const result = await caller.operator.approveTicketOrder({
        orderId: input.orderId,
        ticketTypeId: input.ticketTypeId,
        confirmed: true,
        idempotencyKey: key(input.idempotencyKey),
      });
      return { quantity: result.quantity };
    },
    { denied: "money" },
  );
}

/* ───────────────────────── Details and notes ───────────────────────── */

export async function updateDetailsAction(input: {
  readonly sessionId: string;
  readonly title: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly localRegistrationClosesAt?: string;
  readonly capacity: number;
  readonly timeZone: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("update_details", input.sessionId, async () => {
    if (await isDemo()) {
      throw new NotAvailableYet(
        "Changing details needs the club's own data; the demo club's events stay as they are. Nothing was changed.",
      );
    }
    const caller = await getServerCaller();
    const result = await caller.operator.updateEventSession({
      sessionId: input.sessionId,
      title: input.title.trim(),
      localStartsAt: input.localStartsAt,
      localEndsAt: input.localEndsAt,
      ...(input.localRegistrationClosesAt
        ? { localRegistrationClosesAt: input.localRegistrationClosesAt }
        : {}),
      timezone: input.timeZone,
      capacity: input.capacity,
      reason: reasonOf(input.reason, "Updated by the event organizer."),
      confirmed: true,
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

export async function addNoteAction(input: {
  readonly sessionId: string;
  readonly subject?: string;
  readonly text: string;
  readonly visibility: "private" | "player";
  readonly source: "typed" | "livekit-voice";
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("add_note", input.sessionId, async () => {
    const text = input.text.trim();
    if (!text) {
      throw Object.assign(new Error("Write the note, or record it."), {
        code: "BAD_REQUEST",
      });
    }
    if (await isDemo()) {
      const noteId = crypto.randomUUID();
      await updateDemo((store) => ({
        ...store,
        notes: [
          ...store.notes,
          {
            id: noteId,
            sessionId: input.sessionId,
            ...(input.subject?.trim()
              ? { subject: input.subject.trim().slice(0, 160) }
              : {}),
            summary: text.slice(0, 600),
            visibility: input.visibility,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      return { id: noteId };
    }
    const caller = await getServerCaller();
    const result = await caller.operator.createSessionNote({
      sessionId: input.sessionId,
      ...(input.subject?.trim()
        ? { subject: input.subject.trim().slice(0, 160) }
        : {}),
      visibility: input.visibility,
      source: input.source,
      ...(input.source === "livekit-voice"
        ? { transcript: text.slice(0, 25_000) }
        : { summary: text.slice(0, 5_000) }),
      recipientPersonIds: [],
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

export async function shareNoteAction(input: {
  readonly sessionId: string;
  readonly noteId: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("share_note", input.sessionId, async () => {
    if (await isDemo()) {
      await updateDemo((store) => ({
        ...store,
        sharedNotes: add(store.sharedNotes, input.noteId),
      }));
      return { id: input.noteId };
    }
    const caller = await getServerCaller();
    const result = await caller.operator.publishSessionNote({
      noteId: input.noteId,
      confirmed: true,
      idempotencyKey: key(input.idempotencyKey),
    });
    return { id: result.id };
  });
}

/* ───────────────────────────── Messaging ───────────────────────────── */

export async function messageEntrantsAction(input: {
  readonly sessionId: string;
  readonly body: string;
  readonly idempotencyKey: string;
}): Promise<Result<{ id: string }>> {
  return run("message_entrants", input.sessionId, async () => {
    if (input.body.trim().length < 2) {
      throw Object.assign(new Error("Write the message first."), {
        code: "BAD_REQUEST",
      });
    }
    if (await isDemo()) {
      throw new NotAvailableYet(
        "The demo club doesn't send messages. Nothing was sent.",
      );
    }
    return needsApi(
      "messageEntrants",
      "Duna can't send to every entrant from here yet. Nothing was sent; use your own Messages or email app.",
    );
  });
}

/**
 * The link that opens the person's own Messages or email app with the
 * entrants who gave a number or an address, and the text. Duna sends
 * nothing: the person sends it from their app. Read only after they
 * confirmed, so contact details are never part of the page.
 */
export async function entrantsLinkAction(input: {
  readonly sessionId: string;
  readonly channel: "sms" | "email";
  readonly body: string;
}): Promise<Result<{ href: string; recipients: number }>> {
  return run(
    "entrants_link",
    undefined,
    async () => {
      const caller = await getServerCaller();
      if ((await isDemo()) && isDemoEventId(input.sessionId)) {
        throw new NotAvailableYet(
          "The demo club's entrants have no contact details. Nothing was opened.",
        );
      }
      const detail = await caller.operator.sessionDetail({
        sessionId: input.sessionId,
      });
      const active = detail.attendees.filter(
        (attendee) =>
          attendee.status !== "cancelled" && attendee.status !== "refunded",
      );
      const body = input.body.trim().slice(0, 1_000);
      if (input.channel === "sms") {
        const phones = [
          ...new Set(active.flatMap((a) => (a.phoneE164 ? [a.phoneE164] : []))),
        ];
        if (phones.length === 0) {
          throw Object.assign(
            new Error("No entrant gave a phone number. Try email."),
            { code: "PRECONDITION_FAILED" },
          );
        }
        return {
          href: `sms:${phones.join(",")}?body=${encodeURIComponent(body)}`,
          recipients: phones.length,
        };
      }
      const emails = [
        ...new Set(active.flatMap((a) => (a.email ? [a.email] : []))),
      ];
      if (emails.length === 0) {
        throw Object.assign(
          new Error("No entrant gave an email address. Try a text message."),
          { code: "PRECONDITION_FAILED" },
        );
      }
      return {
        href: `mailto:?bcc=${emails.map(encodeURIComponent).join(",")}&subject=${encodeURIComponent(detail.session.title)}&body=${encodeURIComponent(body)}`,
        recipients: emails.length,
      };
    },
    { read: true },
  );
}
