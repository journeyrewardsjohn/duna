import type {
  ConciergeSendProposal,
  ConciergeThread,
  ConciergeThreadSummary,
} from "@duna/api";
import { appRouter, isFeatureEnabled, providerStatus } from "@duna/api";
import type { MessageWidget } from "@duna/messaging-client";
import { log, report } from "@duna/observability";
import { cache } from "react";
import { getServerCaller } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import { isNotConfigured, loadPerson } from "../people/people-data";
import { getHqSession, hasScope } from "../shell/hq-session";
import type { ShellSession } from "../shell/session-types";
import { capabilitiesFrom, type InboxCapabilities } from "./inbox-capabilities";
import {
  audiencesFor,
  type Audience,
  type ChannelAvailability,
  type ComposeResource,
  type ConciergeChannel,
  type InboxState,
  type PersonContext,
  personContextFrom,
  threadsQuery,
} from "./inbox-model";

/**
 * Inbox's reads (H-INBOX). Each becomes an honest result a pane can render:
 * the data; "you need access"; "not set up yet" (an environment without
 * Duna Database); not found; or a failure with its reference. Logs carry
 * event names, ids and counts only: never a message body, a name, a
 * destination or a value about health or money.
 */
export type Loaded<T> =
  | { readonly state: "ok"; readonly data: T }
  | { readonly state: "denied" }
  | { readonly state: "not-configured" }
  | { readonly state: "not-found" }
  | { readonly state: "error"; readonly reference: string };

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

async function settle<T>(
  read: () => Promise<T>,
  block: string,
): Promise<Loaded<T>> {
  try {
    return { state: "ok", data: await read() };
  } catch (error) {
    if (isPermissionDenied(error)) return { state: "denied" };
    if (isNotConfigured(error)) {
      log.info("hq.inbox.blockNotConfigured", { block });
      return { state: "not-configured" };
    }
    if (codeOf(error) === "NOT_FOUND") return { state: "not-found" };
    const reference = report(error, {
      event: "hq.inbox.blockFailed",
      tags: { block },
    });
    return { state: "error", reference };
  }
}

/** Who is looking, and what they may do here. */
export interface InboxContext {
  readonly session: ShellSession;
  readonly organization: string;
  readonly organizationId?: string;
  readonly timeZone: string;
  readonly personId?: string;
  /** Reads threads (messages:read). */
  readonly canRead: boolean;
  /** Writes, edits and reviews; assigns (messages:propose). */
  readonly canDraft: boolean;
  /** Presses Send (messages:write). */
  readonly canSend: boolean;
  /** Sees people's records beside a thread (members:read). */
  readonly canSeePeople: boolean;
  /** Sees balances and spend (payments:read). */
  readonly canSeePayments: boolean;
  readonly capabilities: InboxCapabilities;
  readonly now: string;
}

/** Every procedure path the API router serves. */
function procedurePaths(): string[] {
  const definition = (
    appRouter as unknown as { _def?: { procedures?: Record<string, unknown> } }
  )._def;
  return Object.keys(definition?.procedures ?? {});
}

export function inboxCapabilitiesNow(): InboxCapabilities {
  return capabilitiesFrom(procedurePaths());
}

export const inboxContext = cache(async (): Promise<InboxContext> => {
  const session = await getHqSession();
  return {
    session,
    organization: session.organization?.name ?? "your club",
    organizationId: session.organization?.id,
    timeZone: session.organization?.timezone ?? "UTC",
    personId: session.person?.id,
    canRead: hasScope(session, "messages:read"),
    canDraft: hasScope(session, "messages:propose"),
    canSend: hasScope(session, "messages:write"),
    canSeePeople: hasScope(session, "members:read"),
    canSeePayments: hasScope(session, "payments:read"),
    capabilities: inboxCapabilitiesNow(),
    now: new Date().toISOString(),
  };
});

export interface ThreadList {
  readonly items: readonly ConciergeThreadSummary[];
  readonly counts: {
    readonly all: number;
    readonly unread: number;
    readonly families: number;
  };
}

export const loadThreads = cache(
  async (state: InboxState): Promise<Loaded<ThreadList>> => {
    const caller = await getServerCaller();
    const loaded = await settle(
      () => caller.operator.concierge.threads(threadsQuery(state)),
      "threads",
    );
    if (loaded.state === "ok") {
      log.info("hq.inbox.threadsLoaded", {
        count: loaded.data.items.length,
        filter: state.filter,
      });
    }
    return loaded;
  },
);

/** The club's unread count for the sidebar; nothing when it can't be read. */
export async function inboxUnreadCount(): Promise<number | undefined> {
  const session = await getHqSession();
  if (session.access !== "operator" || !hasScope(session, "messages:read"))
    return undefined;
  try {
    const caller = await getServerCaller();
    const page = await caller.operator.concierge.threads({
      filter: "unread",
      queue: "all",
      limit: 1,
    });
    return page.counts.unread || undefined;
  } catch {
    return undefined;
  }
}

export const loadThread = cache(
  async (conversationId: string): Promise<Loaded<ConciergeThread>> => {
    const caller = await getServerCaller();
    return settle(
      () => caller.operator.concierge.thread({ conversationId }),
      "thread",
    );
  },
);

/**
 * Cards and polls in a thread (they live on the messaging record; Concierge
 * carries text). By message id. Missing cards only lose the cards: the
 * thread still reads.
 */
export const loadCards = cache(
  async (
    conversationId: string,
  ): Promise<ReadonlyMap<string, readonly MessageWidget[]>> => {
    try {
      const caller = await getServerCaller();
      const detail = await caller.messaging.conversation({
        conversationId,
        asPrincipal: "organization",
      });
      return new Map(
        detail.messages
          .filter((message) => message.widgets.length > 0)
          .map((message) => [message.id, message.widgets] as const),
      );
    } catch (error) {
      log.info("hq.inbox.cardsUnavailable", {
        code: codeOf(error) ?? "unknown",
      });
      return new Map();
    }
  },
);

export const loadProposal = cache(
  async (proposalId: string): Promise<Loaded<ConciergeSendProposal>> => {
    const caller = await getServerCaller();
    return settle(
      () => caller.operator.concierge.proposal({ proposalId }),
      "proposal",
    );
  },
);

const channelFlags = {
  email: "concierge.channel.email",
  imessage: "concierge.channel.imessage",
  whatsapp: "concierge.channel.whatsapp",
} as const;

/**
 * Whether each channel works for the club right now: its kill switch and
 * whether Duna has its production values (names only, never values). The
 * same rule Concierge applies to every send; the Duna app always works.
 */
export const loadClubChannels = cache(
  async (
    organizationId?: string,
  ): Promise<Readonly<Record<ConciergeChannel, ChannelAvailability>>> => {
    const of = async (
      channel: keyof typeof channelFlags,
    ): Promise<ChannelAvailability> => {
      const on = await isFeatureEnabled(channelFlags[channel], {
        ...(organizationId ? { organizationId } : {}),
      });
      if (!on) return "not-enabled";
      return providerStatus(channel) === "not-configured"
        ? "provider-not-configured"
        : "available";
    };
    const [email, imessage, whatsapp] = await Promise.all([
      of("email"),
      of("imessage"),
      of("whatsapp"),
    ]);
    return { duna: "available", email, imessage, whatsapp };
  },
);

export interface StaffMember {
  readonly personId: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly role: string;
}

const loadWorkspace = cache(async () => {
  const caller = await getServerCaller();
  return settle(() => caller.operator.workspace(), "workspace");
});

/** The club's staff, for assigning and handing off a thread. */
export const loadStaff = cache(async (): Promise<readonly StaffMember[]> => {
  const workspace = await loadWorkspace();
  if (workspace.state !== "ok") return [];
  return [...workspace.data.staff]
    .map((member) => ({
      personId: member.personId,
      name: member.displayName,
      ...(member.avatarUrl ? { avatarUrl: member.avatarUrl } : {}),
      role: member.isOwner ? "Owner" : member.role.replace(/-/g, " "),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
});

export interface ComposePerson {
  readonly personId: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly detail: string;
  readonly isMinor: boolean;
}

export interface ComposeOptions {
  readonly organizationId: string;
  readonly audiences: readonly Audience[];
  readonly people: readonly ComposePerson[];
  readonly practicePlans: readonly ComposeResource[];
  readonly sessions: readonly ComposeResource[];
}

/** What a new conversation can be about and who it can reach. */
export const loadComposeOptions = cache(
  async (): Promise<Loaded<ComposeOptions>> => {
    const caller = await getServerCaller();
    const workspace = await loadWorkspace();
    if (workspace.state !== "ok") return workspace;
    const [events, training] = await Promise.all([
      settle(() => caller.operator.events(), "events"),
      settle(() => caller.operator.trainingWorkspace(), "trainingWorkspace"),
    ]);
    const data = workspace.data;
    const people = new Map<string, ComposePerson>();
    for (const person of data.people) {
      if (person.status !== "active") continue;
      people.set(person.personId, {
        personId: person.personId,
        name: person.displayName,
        ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
        detail: person.isMinor
          ? "Junior · their guardian is included"
          : person.roles.join(" · "),
        isMinor: person.isMinor,
      });
    }
    for (const person of data.messageRecipients) {
      if (people.has(person.id)) continue;
      people.set(person.id, {
        personId: person.id,
        name: person.displayName,
        detail: person.isMinor
          ? `${person.verifiedGuardianCount} verified guardian${person.verifiedGuardianCount === 1 ? "" : "s"}`
          : "Related to the club through Duna",
        isMinor: person.isMinor,
      });
    }
    const sorted = [...people.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const divisions =
      events.state === "ok"
        ? events.data.flatMap((event) =>
            (event.divisions ?? []).map((division) => ({
              id: division.id,
              title: `${event.title} · ${division.name}`,
            })),
          )
        : [];
    return {
      state: "ok",
      data: {
        organizationId: data.organization.id,
        audiences: audiencesFor({
          organizationId: data.organization.id,
          organizationName: data.organization.name,
          sessions: data.sessions.map((session) => ({
            id: session.id,
            title: session.title,
            kind: session.kind,
            ...(session.kind === "league" && session.programId
              ? { programId: session.programId }
              : {}),
            registrations: session.analytics.registrations,
          })),
          divisions,
          peopleCount: sorted.length,
        }),
        people: sorted,
        practicePlans:
          training.state === "ok"
            ? training.data.practicePlans.map((plan) => ({
                id: plan.id,
                title: plan.title,
                detail: `${plan.durationMinutes} min · ${plan.focusArea}`,
                href: "/training",
              }))
            : [],
        sessions: data.sessions.map((session) => ({
          id: session.id,
          title: session.title,
          detail: `${session.analytics.registrations} registered`,
          href: "/schedule",
          startsAt: session.startsAt,
        })),
      },
    };
  },
);

/**
 * The person beside a thread, cut to what this viewer may see: People's
 * own redaction (`loadPerson`), then money only with payments:read and
 * never anything about health.
 */
export const loadPersonContext = cache(
  async (personId: string): Promise<Loaded<PersonContext>> => {
    const context = await inboxContext();
    if (!context.canSeePeople) return { state: "denied" };
    const record = await loadPerson(personId);
    if (record.state !== "ok") return record;
    return {
      state: "ok",
      data: personContextFrom(
        { row: record.data.row, profile: record.data.profile },
        { canSeePayments: context.canSeePayments, now: new Date(context.now) },
      ),
    };
  },
);
