import type {
  ConciergeSendProposal,
  ConciergeThread,
  ConciergeThreadSummary,
  OperatorMemberProfile,
} from "@duna/api";
import type { MessageWidget } from "@duna/messaging-client";

/**
 * Inbox's pure rules (H-INBOX): which list is showing, where a link goes,
 * how messages group by day and channel, what each channel and delivery
 * state is called, and what a person's context may show to this viewer.
 * No I/O, so every rule is tested on its own.
 */

export type ConciergeChannel = "duna" | "email" | "imessage" | "whatsapp";
export type ThreadKind = ConciergeThreadSummary["kind"];
export type ThreadMessage = ConciergeThread["messages"][number];
export type Recipient = ConciergeSendProposal["recipients"][number];
export type UnreachableReason = NonNullable<Recipient["unreachableReason"]>;

/** The list filters. `muted` shows only when its capability is on. */
export const INBOX_FILTERS = [
  "all",
  "mine",
  "unassigned",
  "unread",
  "families",
  "muted",
] as const;
export type InboxFilter = (typeof INBOX_FILTERS)[number];

export const THREAD_KINDS = [
  "lesson",
  "match",
  "tournament",
  "league",
  "club",
  "duna",
] as const satisfies readonly ThreadKind[];

export const filterLabels: Record<InboxFilter, string> = {
  all: "All",
  mine: "Mine",
  unassigned: "Unassigned",
  unread: "Unread",
  families: "Families",
  muted: "Muted",
};

export const kindLabels: Record<ThreadKind, string> = {
  lesson: "Lessons and clinics",
  match: "Matches",
  tournament: "Tournaments",
  league: "Leagues",
  club: "Club and direct",
  duna: "Duna",
};

/** What the address says the Inbox shows. Unknown values fall back safely. */
export interface InboxState {
  readonly filter: InboxFilter;
  readonly kind?: ThreadKind;
  readonly q: string;
  readonly thread?: string;
  /** "new": the new-conversation pane. */
  readonly compose?: "new";
  /** A person to start with in the new-conversation pane. */
  readonly recipient?: string;
  /** A Send review handed over from another screen. */
  readonly proposal?: string;
  /** Whose context the side panel shows in a group thread. */
  readonly person?: string;
}

const idPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: string | undefined) =>
  value && idPattern.test(value) ? value : undefined;

export function parseInboxState(
  params: Readonly<Record<string, string | string[] | undefined>>,
): InboxState {
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const filter = INBOX_FILTERS.find((entry) => entry === one("filter"));
  const kind = THREAD_KINDS.find((entry) => entry === one("kind"));
  const q = (one("q") ?? "").trim().slice(0, 80);
  return {
    filter: filter ?? "all",
    ...(kind ? { kind } : {}),
    q,
    ...(id(one("thread")) ? { thread: id(one("thread")) } : {}),
    ...(one("compose") === "new" ? { compose: "new" as const } : {}),
    ...(id(one("recipient")) ? { recipient: id(one("recipient")) } : {}),
    ...(id(one("proposal")) ? { proposal: id(one("proposal")) } : {}),
    ...(id(one("person")) ? { person: id(one("person")) } : {}),
  };
}

/** The Inbox address for a state: only what differs from the defaults. */
export function inboxHref(
  state: InboxState,
  patch: Partial<Record<keyof InboxState, string | undefined>> = {},
): string {
  const merged: Record<string, string | undefined> = {
    filter: state.filter,
    kind: state.kind,
    q: state.q,
    thread: state.thread,
    compose: state.compose,
    recipient: state.recipient,
    proposal: state.proposal,
    person: state.person,
    ...patch,
  };
  const search = new URLSearchParams();
  for (const key of [
    "filter",
    "kind",
    "q",
    "thread",
    "compose",
    "recipient",
    "proposal",
    "person",
  ]) {
    const value = merged[key];
    if (!value) continue;
    if (key === "filter" && value === "all") continue;
    search.set(key, value);
  }
  const query = search.toString();
  return query ? `/inbox?${query}` : "/inbox";
}

/** The list query Concierge answers for a filter. Muted has no backend yet. */
export function threadsQuery(state: InboxState) {
  return {
    filter:
      state.filter === "unread" || state.filter === "families"
        ? state.filter
        : ("all" as const),
    queue:
      state.filter === "mine" || state.filter === "unassigned"
        ? state.filter
        : ("all" as const),
    ...(state.kind ? { kind: state.kind } : {}),
    ...(state.q ? { search: state.q } : {}),
    limit: 100,
  };
}

// ------------------------------------------------------------ channels

export const channelLabels: Record<ConciergeChannel, string> = {
  duna: "Duna app",
  email: "Email",
  imessage: "iMessage",
  whatsapp: "WhatsApp",
};

/** Short words beside a message: where it came in or went out. */
export const channelShort: Record<ConciergeChannel, string> = {
  duna: "In Duna",
  email: "By email",
  imessage: "By iMessage",
  whatsapp: "On WhatsApp",
};

export type ChannelAvailability =
  "available" | "not-enabled" | "provider-not-configured";

/**
 * What a channel that isn't working for the club needs, in the owner's
 * words. Never names an infrastructure vendor.
 */
export const channelNeeds: Record<Exclude<ConciergeChannel, "duna">, string> = {
  email:
    "a verified sending address and reply address for your club, set up with Duna support",
  imessage: "a Duna iMessage line for your club, set up with Duna support",
  whatsapp:
    "a WhatsApp business sender and approved message templates, set up with Duna support",
};

export interface ChannelStatus {
  readonly channel: ConciergeChannel;
  readonly label: string;
  readonly state: "on" | "not-set-up" | "switched-off";
  /** What it needs before it works (never shown as working). */
  readonly detail: string;
}

export function channelStatuses(
  availability: Readonly<Record<ConciergeChannel, ChannelAvailability>>,
): ChannelStatus[] {
  return (Object.keys(channelLabels) as ConciergeChannel[]).map((channel) => {
    const value = availability[channel];
    if (channel === "duna" || value === "available") {
      return {
        channel,
        label: channelLabels[channel],
        state: "on",
        detail:
          channel === "duna"
            ? "Every person gets it in the Duna app, with a notification."
            : `People who chose ${channelLabels[channel]} get it there.`,
      };
    }
    if (value === "not-enabled") {
      return {
        channel,
        label: channelLabels[channel],
        state: "switched-off",
        detail: `${channelLabels[channel]} is switched off for your club. People who chose it get the Duna app instead.`,
      };
    }
    return {
      channel,
      label: channelLabels[channel],
      state: "not-set-up",
      detail: `Not set up yet: needs ${channelNeeds[channel]}. Until then people who chose it get the Duna app instead.`,
    };
  });
}

/** Why one person on a Send review can't be reached, in plain words. */
export const unreachableText: Record<UnreachableReason, string> = {
  "no-channel": "Has no Duna account they can sign in to yet",
  "channel-not-enabled": "Their channel is switched off for your club",
  "provider-not-configured": "Their channel isn't set up for your club yet",
  "no-consent": "Opted out of messages on their channel",
  "quiet-hours": "It's their quiet hours: send again later",
  blocked: "Blocked messages from your club",
};

export type DeliveryStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "not-enabled"
  | "provider-not-configured"
  | "skipped";

export const deliveryLabels: Record<
  DeliveryStatus,
  {
    readonly label: string;
    readonly tone: "positive" | "neutral" | "danger" | "warning";
  }
> = {
  queued: { label: "Waiting to send", tone: "neutral" },
  sent: { label: "Sent", tone: "neutral" },
  delivered: { label: "Delivered", tone: "positive" },
  read: { label: "Read", tone: "positive" },
  failed: { label: "Not delivered", tone: "danger" },
  "not-enabled": { label: "Channel switched off", tone: "warning" },
  "provider-not-configured": { label: "Channel not set up", tone: "warning" },
  skipped: { label: "Skipped: left the thread", tone: "neutral" },
};

// ------------------------------------------------------------ the review

export interface ReviewSummary {
  readonly reachable: readonly Recipient[];
  readonly unreachable: readonly Recipient[];
  /** How many people the Send button names. */
  readonly sendCount: number;
  /** "Send to 3 people", "Send to Mara". */
  readonly verb: string;
  /** For the confirmation: who gets it, on what. */
  readonly byChannel: readonly {
    readonly channel: ConciergeChannel;
    readonly count: number;
  }[];
}

export function reviewSummary(proposal: ConciergeSendProposal): ReviewSummary {
  const reachable = proposal.recipients.filter(
    (recipient) => recipient.channel && !recipient.unreachableReason,
  );
  const unreachable = proposal.recipients.filter(
    (recipient) => !recipient.channel || recipient.unreachableReason,
  );
  const counts = new Map<ConciergeChannel, number>();
  for (const recipient of reachable) {
    const channel = recipient.channel as ConciergeChannel;
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  }
  const only = reachable.length === 1 ? reachable[0] : undefined;
  return {
    reachable,
    unreachable,
    sendCount: reachable.length,
    verb: only
      ? `Send to ${firstName(only.person.displayName)}`
      : `Send to ${reachable.length} people`,
    byChannel: [...counts.entries()].map(([channel, count]) => ({
      channel,
      count,
    })),
  };
}

/** A review that can still be sent (not sent, cancelled or expired). */
export function isOpenReview(proposal: ConciergeSendProposal): boolean {
  return proposal.status === "draft" || proposal.status === "ready";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// ------------------------------------------------------------ messages

export interface MessageRun {
  /** Where this run of messages came in or went out. */
  readonly channel: ConciergeChannel | "system";
  readonly messages: readonly ThreadMessage[];
}

export interface MessageDay {
  /** YYYY-MM-DD in the club's time zone. */
  readonly key: string;
  /** "Today", "Yesterday", "Thu, Nov 26". */
  readonly label: string;
  readonly runs: readonly MessageRun[];
}

function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

function dayLabel(key: string, now: Date, timeZone: string): string {
  const today = dayKey(now.toISOString(), timeZone);
  const yesterday = dayKey(
    new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    timeZone,
  );
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const [year, month, day] = key.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: "UTC",
  }).format(noon);
}

function runChannel(message: ThreadMessage): MessageRun["channel"] {
  if (message.kind === "system" || message.kind === "duna") return "system";
  return (message.channel as ConciergeChannel | undefined) ?? "duna";
}

/**
 * Messages in order, grouped by the club's calendar day, then into runs on
 * one channel, so "came in on WhatsApp" is said once for a run, not per line.
 */
export function groupMessages(
  messages: readonly ThreadMessage[],
  timeZone: string,
  now: Date,
): MessageDay[] {
  const sorted = [...messages].sort((a, b) => a.sequence - b.sequence);
  const days: {
    key: string;
    runs: { channel: MessageRun["channel"]; messages: ThreadMessage[] }[];
  }[] = [];
  for (const message of sorted) {
    const key = dayKey(message.createdAt, timeZone);
    let day = days.at(-1);
    if (!day || day.key !== key) {
      day = { key, runs: [] };
      days.push(day);
    }
    const channel = runChannel(message);
    const run = day.runs.at(-1);
    if (run && run.channel === channel) run.messages.push(message);
    else day.runs.push({ channel, messages: [message] });
  }
  return days.map((day) => ({
    key: day.key,
    label: dayLabel(day.key, now, timeZone),
    runs: day.runs,
  }));
}

/** "2:05 PM" in the club's time zone. */
export function timeOfDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/** A list row's time: "2:05 PM" today, "Yesterday", else "Nov 24". */
export function listTime(iso: string, timeZone: string, now: Date): string {
  const key = dayKey(iso, timeZone);
  const label = dayLabel(key, now, timeZone);
  if (label === "Today") return timeOfDay(iso, timeZone);
  if (label === "Yesterday") return label;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/** Who wrote a message, as the thread shows it. */
export function authorLine(message: ThreadMessage): string {
  if (message.kind === "duna") return "Duna";
  if (message.kind === "system") return "Update";
  const name = message.author?.displayName ?? "Someone";
  return message.onBehalfOfOrganization
    ? `${name} for ${message.onBehalfOfOrganization}`
    : name;
}

/** The club's side of the thread (sent by staff, shown on the right). */
export function isClubMessage(message: ThreadMessage): boolean {
  return message.kind === "coach" || message.kind === "mine";
}

/** The person the side panel is about: the one asked for, else the first member. */
export function focusPerson(
  thread: Pick<ConciergeThread, "participants">,
  requested?: string,
) {
  const people = thread.participants.filter(
    (participant) =>
      participant.role === "member" || participant.role === "guardian",
  );
  return (
    people.find((participant) => participant.personId === requested) ??
    people.find((participant) => participant.role === "member") ??
    people[0]
  );
}

// ------------------------------------------------------------ person context

export interface PersonContext {
  readonly personId: string;
  readonly name: string;
  readonly avatarUrl?: string;
  readonly relation: string;
  readonly isJunior: boolean;
  readonly guardianName?: string;
  readonly plan?: {
    readonly name: string;
    readonly status: string;
    readonly renews?: string;
  };
  readonly credits: number;
  /** Money: only for a viewer who may see payments. */
  readonly balance?: { readonly minor: number; readonly currency: string };
  readonly lifetimeSpend?: {
    readonly minor: number;
    readonly currency: string;
  };
  readonly upcoming: readonly {
    readonly id: string;
    readonly title: string;
    readonly startsAt: string;
    readonly timezone: string;
    readonly place?: string;
  }[];
}

/**
 * What the side panel may show about a person to THIS viewer. The profile
 * is already redacted by People's rules (`redactProfile`); this cuts it
 * again so money never reaches a viewer without `payments:read`, and health
 * is never part of it at all.
 */
export function personContextFrom(
  input: {
    readonly row: {
      readonly id: string;
      readonly name: string;
      readonly avatarUrl?: string;
      readonly relation: string;
      readonly isJunior: boolean;
      readonly guardianName?: string;
      readonly credits: number;
    };
    readonly profile: Pick<
      OperatorMemberProfile,
      "plans" | "creditGrants" | "sessions" | "relationship"
    >;
  },
  viewer: { readonly canSeePayments: boolean; readonly now: Date },
): PersonContext {
  const { row, profile } = input;
  const activePlan = profile.plans.find(
    (plan) => !["cancelled", "canceled", "expired"].includes(plan.status),
  );
  const currency =
    profile.creditGrants.find((grant) => grant.currency)?.currency ??
    activePlan?.currency ??
    "USD";
  const remainingMinor = profile.creditGrants
    .filter((grant) => grant.status === "active")
    .reduce((sum, grant) => sum + (grant.remainingValueMinor ?? 0), 0);
  const upcoming = profile.sessions
    .filter(
      (session) =>
        new Date(session.startsAt).getTime() > viewer.now.getTime() &&
        !["cancelled", "canceled"].includes(session.registrationStatus),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, 3)
    .map((session) => ({
      id: session.id,
      title: session.title,
      startsAt: session.startsAt,
      timezone: session.timezone,
      ...(session.venueName ? { place: session.venueName } : {}),
    }));
  return {
    personId: row.id,
    name: row.name,
    ...(row.avatarUrl ? { avatarUrl: row.avatarUrl } : {}),
    relation: row.relation,
    isJunior: row.isJunior,
    ...(row.guardianName ? { guardianName: row.guardianName } : {}),
    ...(activePlan
      ? {
          plan: {
            name: activePlan.name,
            status: activePlan.status,
            ...(activePlan.currentPeriodEndsAt
              ? { renews: activePlan.currentPeriodEndsAt }
              : {}),
          },
        }
      : {}),
    credits: row.credits,
    // The server omits the amounts for roles without payments:read (PRIV-2).
    ...(viewer.canSeePayments &&
    profile.relationship.lifetimeSpendMinor !== undefined
      ? {
          balance: { minor: remainingMinor, currency },
          lifetimeSpend: {
            minor: profile.relationship.lifetimeSpendMinor,
            currency,
          },
        }
      : {}),
    upcoming,
  };
}

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(minor / 100);
}

// ------------------------------------------------------------ new conversations

/** Who a new conversation is for. */
export type Audience =
  | {
      readonly kind: "club" | "session" | "division";
      readonly key: string;
      readonly title: string;
      readonly detail: string;
      readonly contextType:
        "organization" | "lesson" | "event" | "league" | "division";
      readonly contextId: string;
    }
  | {
      readonly kind: "person";
      readonly key: "person";
      readonly title: string;
      readonly detail: string;
    }
  | {
      readonly kind: "people";
      readonly key: "people";
      readonly title: string;
      readonly detail: string;
    };

export interface ComposeSession {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly programId?: string;
  readonly registrations: number;
}

/** The audiences a club can write to: the same real relationships as before. */
export function audiencesFor(input: {
  readonly organizationId: string;
  readonly organizationName: string;
  readonly sessions: readonly ComposeSession[];
  readonly divisions: readonly {
    readonly id: string;
    readonly title: string;
  }[];
  readonly peopleCount: number;
}): Audience[] {
  return [
    {
      kind: "club",
      key: `organization:${input.organizationId}`,
      title: "Everyone at the club",
      detail: `Active members and staff of ${input.organizationName}`,
      contextType: "organization",
      contextId: input.organizationId,
    },
    ...input.sessions.map((session): Audience => {
      const league = session.kind === "league" && session.programId;
      const contextType = league
        ? ("league" as const)
        : session.kind === "private-lesson"
          ? ("lesson" as const)
          : ("event" as const);
      const contextId = league ? session.programId! : session.id;
      return {
        kind: "session",
        key: `${contextType}:${contextId}`,
        title: session.title,
        detail: `${session.registrations} registered · ${session.kind.replace(/-/g, " ")}`,
        contextType,
        contextId,
      };
    }),
    ...input.divisions.map((division): Audience => ({
      kind: "division",
      key: `division:${division.id}`,
      title: division.title,
      detail: "Division",
      contextType: "division",
      contextId: division.id,
    })),
    {
      kind: "person",
      key: "person",
      title: "One person",
      detail: "A private thread between the club and them",
    },
    {
      kind: "people",
      key: "people",
      title: "Several people",
      detail: `A named group from ${input.peopleCount} people related to the club`,
    },
  ];
}

/** A card or poll added to a group message (Duna app only). */
export type CardDraft =
  | {
      readonly key: string;
      readonly kind: "practice-plan" | "session";
      readonly resourceId: string;
    }
  | {
      readonly key: string;
      readonly kind: "video";
      readonly title: string;
      readonly href: string;
    }
  | {
      readonly key: string;
      readonly kind: "poll";
      readonly title: string;
      readonly options: readonly string[];
      readonly allowMultipleAnswers: boolean;
      readonly hideVoterNames: boolean;
      readonly endsAt: string;
    };

export interface ComposeResource {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly href: string;
  readonly startsAt?: string;
}

/** The message cards as the messaging API takes them; incomplete ones are left out. */
export function widgetsFrom(
  cards: readonly CardDraft[],
  resources: {
    readonly practicePlans: readonly ComposeResource[];
    readonly sessions: readonly ComposeResource[];
  },
): MessageWidget[] {
  return cards.flatMap((card): MessageWidget[] => {
    if (card.kind === "poll") {
      const options = card.options
        .map((label, index) => ({
          id: `option-${index + 1}`,
          label: label.trim(),
        }))
        .filter((option) => option.label);
      if (options.length < 2 || !card.title.trim()) return [];
      return [
        {
          kind: "poll",
          id: card.key.slice(0, 36),
          title: card.title.trim(),
          options,
          allowMultipleAnswers: card.allowMultipleAnswers,
          hideVoterNames: card.hideVoterNames,
          ...(card.endsAt
            ? { endsAt: new Date(card.endsAt).toISOString() }
            : {}),
        },
      ];
    }
    if (card.kind === "video") {
      if (!card.title.trim() || !card.href.startsWith("/")) return [];
      return [
        {
          kind: "resource-card",
          resourceType: "video",
          title: card.title.trim(),
          action: { label: "Watch video", href: card.href },
        },
      ];
    }
    const list =
      card.kind === "session" ? resources.sessions : resources.practicePlans;
    const resource = list.find((candidate) => candidate.id === card.resourceId);
    if (!resource) return [];
    return [
      {
        kind: "resource-card",
        resourceType: card.kind,
        title: resource.title,
        detail: resource.detail,
        ...(resource.startsAt ? { startsAt: resource.startsAt } : {}),
        action: {
          label:
            card.kind === "session" ? "Open session" : "Open practice plan",
          href: resource.href,
        },
      },
    ];
  });
}

/**
 * How a new conversation is sent. To the club, a session, a league, a
 * division or one person it goes through Concierge: the Send review with
 * each person's channel. A named group of several people, or a message with
 * cards, a poll or "updates only", is a Duna-app group (`messaging.create`),
 * confirmed with its recipients restated.
 */
export function composeRoute(input: {
  readonly audience: Audience["kind"];
  readonly cards: number;
  readonly updatesOnly: boolean;
}): "concierge" | "group" {
  if (input.audience === "people") return "group";
  return input.cards > 0 || input.updatesOnly ? "group" : "concierge";
}
