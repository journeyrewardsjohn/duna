/**
 * Demo fixtures: concierge (owner: B7). Threads of every kind, a thread with
 * messages of every kind, Send proposals in every status, recipients with
 * every unreachable reason, deliveries in every status, and the demo
 * player's channels in every endpoint status. Shaped by
 * `contracts/concierge.ts`; parsed in
 * packages/api/src/contracts/concierge.test.ts. People are the fictional
 * demo club's people.
 */
import { demoOrganization, demoPeople, demoPlayer } from "../demo";
import { demoId } from "./ids";

const id = (n: number) => demoId("concierge", n);
const hash = (n: number) => n.toString(16).padStart(64, "0");
const ref = (person: {
  id: string;
  displayName: string;
  initials?: string;
}) => ({
  personId: person.id,
  displayName: person.displayName,
  ...(person.initials ? { initials: person.initials } : {}),
});

const [theo, noa, sam, elena] = demoPeople as unknown as [
  { id: string; displayName: string; initials: string },
  { id: string; displayName: string; initials: string },
  { id: string; displayName: string; initials: string },
  { id: string; displayName: string; initials: string },
];
const mara = {
  id: demoPlayer.id,
  displayName: demoPlayer.displayName,
  initials: "ML",
};
/** A fictional junior in the demo club, with Mara as guardian. */
const junior = { id: id(900), displayName: "Junior player", initials: "JP" };

export const conciergeDemoIds = {
  lessonThread: id(1),
  matchThread: id(2),
  tournamentThread: id(3),
  leagueThread: id(4),
  clubThread: id(5),
  dunaThread: id(6),
  clinicThread: id(7),
  divisionThread: id(8),
  readyProposal: id(30),
  sentProposal: id(34),
  emailEndpoint: id(70),
  imessageEndpoint: id(71),
  whatsappEndpoint: id(72),
} as const;

export const conciergeDemoThreads = [
  {
    conversationId: conciergeDemoIds.lessonThread,
    kind: "lesson" as const,
    title: "Private lesson · Theo Park",
    context: {
      type: "lesson" as const,
      id: id(101),
      label: "Private lesson",
      status: "Today",
      startsAt: "2026-11-28T17:00:00.000Z",
      place: "Court 2",
    },
    participantCount: 2,
    unreadCount: 2,
    minorPresent: false,
    lastMessagePreview: "See you on court 2 at 9.",
    lastMessageAt: "2026-11-28T14:05:00.000Z",
  },
  {
    conversationId: conciergeDemoIds.matchThread,
    kind: "match" as const,
    title: "Match · Lewis / Park vs Williams / Rivera",
    context: {
      type: "match" as const,
      id: id(102),
      label: "Pool play match",
      status: "Score posted",
    },
    participantCount: 4,
    unreadCount: 0,
    minorPresent: false,
    lastMessagePreview: "Score posted: 21–18, 19–21, 15–12",
    lastMessageAt: "2026-11-27T22:40:00.000Z",
  },
  {
    conversationId: conciergeDemoIds.tournamentThread,
    kind: "tournament" as const,
    title: "Winter Open",
    context: {
      type: "event" as const,
      id: id(103),
      label: "Winter Open",
      status: "Registered",
    },
    participantCount: 32,
    unreadCount: 1,
    minorPresent: true,
    lastMessagePreview: "Pool assignments are up.",
    lastMessageAt: "2026-11-27T19:00:00.000Z",
  },
  {
    conversationId: conciergeDemoIds.leagueThread,
    kind: "league" as const,
    title: "Thursday league",
    context: {
      type: "league" as const,
      id: id(104),
      label: "Thursday league",
      status: "Time changed",
    },
    participantCount: 18,
    unreadCount: 0,
    minorPresent: false,
    lastMessagePreview: "Week 3 moves to 6:30 PM.",
    lastMessageAt: "2026-11-26T18:00:00.000Z",
  },
  {
    conversationId: conciergeDemoIds.clubThread,
    kind: "club" as const,
    title: demoOrganization.name,
    context: {
      type: "organization" as const,
      id: demoOrganization.id,
      label: demoOrganization.name,
      status: "Member",
    },
    participantCount: 2,
    unreadCount: 0,
    minorPresent: true,
    lastMessagePreview: "Junior player is booked for Saturday clinic.",
    lastMessageAt: "2026-11-25T16:00:00.000Z",
  },
  {
    conversationId: conciergeDemoIds.dunaThread,
    kind: "duna" as const,
    title: "Duna",
    participantCount: 1,
    unreadCount: 0,
    minorPresent: false,
    lastMessagePreview: "Your Sand Rating moved from 3.34 to 3.42.",
    lastMessageAt: "2026-11-24T10:00:00.000Z",
  },
  {
    conversationId: conciergeDemoIds.clinicThread,
    kind: "lesson" as const,
    title: "Saturday clinic · Beginners",
    context: {
      type: "lesson" as const,
      id: id(107),
      label: "Saturday clinic",
      status: "Today",
      startsAt: "2026-11-28T16:00:00.000Z",
      place: "Courts 3–4",
    },
    participantCount: 9,
    unreadCount: 1,
    minorPresent: false,
    lastMessagePreview: "Rain is moving in: today's clinic moves to Sunday 9:00 AM.",
    lastMessageAt: "2026-11-28T15:00:00.000Z",
  },
  {
    conversationId: conciergeDemoIds.divisionThread,
    kind: "tournament" as const,
    title: "Winter Open · 16U girls",
    context: {
      type: "division" as const,
      id: id(108),
      label: "16U girls",
      status: "Guardian",
    },
    participantCount: 12,
    unreadCount: 0,
    minorPresent: true,
    lastMessagePreview: "Check-in opens at 7:30 AM at the main tent.",
    lastMessageAt: "2026-11-27T18:30:00.000Z",
  },
];

export const conciergeDemoThreadPage = {
  items: conciergeDemoThreads,
  counts: { all: 8, unread: 3, families: 3 },
};

/** The lesson thread opened, with one message of every kind. */
export const conciergeDemoThread = {
  ...conciergeDemoThreads[0]!,
  participants: [
    { ...ref(theo), role: "coach" as const },
    { ...ref(mara), role: "member" as const },
    { ...ref(junior), role: "member" as const },
    {
      ...ref(mara),
      personId: id(901),
      role: "guardian" as const,
      guardianOf: junior.displayName,
    },
  ],
  messages: [
    {
      messageId: id(201),
      sequence: 1,
      kind: "system" as const,
      body: "Lesson moved from 4:00 PM to 5:00 PM.",
      systemKind: "schedule" as const,
      systemDetails: {
        from: "2026-11-28T16:00:00.000Z",
        to: "2026-11-28T17:00:00.000Z",
      },
      createdAt: "2026-11-27T20:00:00.000Z",
    },
    {
      messageId: id(202),
      sequence: 2,
      kind: "coach" as const,
      author: ref(theo),
      onBehalfOfOrganization: demoOrganization.name,
      body: "See you on court 2 at 9.",
      channel: "duna" as const,
      delivery: {
        status: "read" as const,
        readBy: [mara.displayName],
        recipientCount: 1,
      },
      createdAt: "2026-11-28T14:00:00.000Z",
    },
    {
      messageId: id(203),
      sequence: 3,
      kind: "person" as const,
      author: ref(noa),
      body: "Can I join for the last half hour?",
      channel: "whatsapp" as const,
      createdAt: "2026-11-28T14:02:00.000Z",
    },
    {
      messageId: id(204),
      sequence: 4,
      kind: "mine" as const,
      author: ref(mara),
      body: "Thanks, I'll bring balls.",
      channel: "duna" as const,
      delivery: { status: "sent" as const, readBy: [], recipientCount: 1 },
      createdAt: "2026-11-28T14:04:00.000Z",
    },
    {
      messageId: id(205),
      sequence: 5,
      kind: "duna" as const,
      body: "Sunset is 4:45 PM; courts 1–6 are lit.",
      createdAt: "2026-11-28T14:05:00.000Z",
    },
  ],
};

type Channel = "duna" | "email" | "imessage" | "whatsapp";
type Reason =
  | "no-channel"
  | "channel-not-enabled"
  | "provider-not-configured"
  | "no-consent"
  | "quiet-hours"
  | "blocked";
const recipient = (
  n: number,
  person: { id: string; displayName: string; initials?: string },
  reach: { channel: Channel } | { reason: Reason },
  guardianOf?: { id: string; displayName: string; initials?: string },
) => ({
  recipientId: id(n),
  person: ref(person),
  ...(guardianOf ? { guardianOf: ref(guardianOf) } : {}),
  ...("channel" in reach
    ? { channel: reach.channel }
    : { unreachableReason: reach.reason }),
});

const readyRecipients = [
  recipient(301, mara, { channel: "duna" }, junior),
  recipient(302, noa, { channel: "whatsapp" }),
  recipient(303, sam, { reason: "no-channel" }),
  recipient(304, elena, { reason: "channel-not-enabled" }),
];
const otherRecipients = [
  recipient(305, sam, { reason: "provider-not-configured" }),
  recipient(306, elena, { reason: "no-consent" }),
  recipient(307, noa, { reason: "quiet-hours" }),
  recipient(308, theo, { reason: "blocked" }),
];
const sentRecipients = [
  recipient(311, mara, { channel: "duna" }),
  recipient(312, noa, { channel: "email" }),
  recipient(313, sam, { channel: "imessage" }),
  recipient(314, elena, { channel: "whatsapp" }),
  recipient(315, theo, { channel: "email" }),
  recipient(316, junior, { channel: "duna" }),
  recipient(317, noa, { channel: "duna" }),
  recipient(318, sam, { channel: "email" }),
];

type ProposalStatus =
  | "draft"
  | "ready"
  | "confirmed"
  | "sending"
  | "sent"
  | "partially-failed"
  | "cancelled"
  | "expired";
const proposal = (
  n: number,
  status: ProposalStatus,
  recipients: ReturnType<typeof recipient>[],
  draftedBy: "person" | "duna" = "person",
) => {
  const confirmed = !["draft", "ready", "cancelled", "expired"].includes(
    status,
  );
  return {
    proposalId: id(n),
    conversationId: conciergeDemoIds.lessonThread,
    author: ref(theo),
    draftedBy,
    body: "Rain is moving in: today's 5:00 PM lesson moves to Sunday 9:00 AM.",
    contentHash: hash(n),
    status,
    recipients,
    recipientCount: recipients.length,
    unreachableCount: recipients.filter((r) => "unreachableReason" in r).length,
    ...(recipients.some((r) => "guardianOf" in r)
      ? {
          guardianNote:
            "Guardians receive messages about the juniors they look after.",
        }
      : {}),
    ...(confirmed
      ? { confirmedBy: ref(theo), confirmedAt: "2026-11-28T15:00:00.000Z" }
      : {}),
    ...(status === "sent" || status === "partially-failed"
      ? { messageId: id(206) }
      : {}),
    expiresAt: "2026-11-28T15:15:00.000Z",
    createdAt: "2026-11-28T14:58:00.000Z",
  };
};

export const conciergeDemoProposals = [
  proposal(29, "draft", readyRecipients, "duna"),
  proposal(30, "ready", readyRecipients),
  proposal(31, "confirmed", otherRecipients),
  proposal(32, "sending", sentRecipients),
  proposal(33, "partially-failed", sentRecipients),
  proposal(34, "sent", sentRecipients),
  proposal(35, "cancelled", readyRecipients),
  proposal(36, "expired", readyRecipients, "duna"),
];

const deliveryStatuses = [
  "queued",
  "sent",
  "delivered",
  "read",
  "failed",
  "not-enabled",
  "provider-not-configured",
  "skipped",
] as const;

export const conciergeDemoDeliveries = {
  proposalId: conciergeDemoIds.sentProposal,
  deliveries: sentRecipients.map((r, index) => {
    const status = deliveryStatuses[index]!;
    return {
      deliveryId: id(401 + index),
      recipientId: r.recipientId,
      person: r.person,
      channel: (r as { channel: Channel }).channel,
      status,
      ...(status === "failed" ? { errorCode: "destination-rejected" } : {}),
      attempts: [
        "queued",
        "not-enabled",
        "provider-not-configured",
        "skipped",
      ].includes(status)
        ? 0
        : 1,
      ...(["sent", "delivered", "read", "failed"].includes(status)
        ? { sentAt: "2026-11-28T15:00:05.000Z" }
        : {}),
      ...(["delivered", "read"].includes(status)
        ? { deliveredAt: "2026-11-28T15:00:07.000Z" }
        : {}),
      ...(status === "read" ? { readAt: "2026-11-28T15:03:00.000Z" } : {}),
    };
  }),
};

export const conciergeDemoChannels = {
  preferredChannel: "duna" as const,
  quietHours: { start: "21:00", end: "07:00", timezone: "America/Los_Angeles" },
  availability: [
    { channel: "duna" as const, availability: "available" as const },
    {
      channel: "email" as const,
      availability: "provider-not-configured" as const,
    },
    { channel: "imessage" as const, availability: "not-enabled" as const },
    { channel: "whatsapp" as const, availability: "not-enabled" as const },
  ],
  endpoints: [
    {
      endpointId: id(69),
      channel: "duna" as const,
      status: "connected" as const,
      verifiedAt: "2026-10-01T12:00:00.000Z",
    },
    {
      endpointId: conciergeDemoIds.emailEndpoint,
      channel: "email" as const,
      destinationHint: "m••••@example.com",
      status: "connected" as const,
      verifiedAt: "2026-10-02T12:00:00.000Z",
    },
    {
      endpointId: conciergeDemoIds.imessageEndpoint,
      channel: "imessage" as const,
      destinationHint: "••• 0142",
      status: "pending-verification" as const,
    },
    {
      endpointId: conciergeDemoIds.whatsappEndpoint,
      channel: "whatsapp" as const,
      destinationHint: "••• 0199",
      status: "revoked" as const,
    },
  ],
};

/** The clinic thread: a club notice sent by the coach, delivered per person. */
export const conciergeDemoClinicThread = {
  ...conciergeDemoThreads[6]!,
  participants: [
    { ...ref(theo), role: "coach" as const },
    { ...ref(noa), role: "member" as const },
    { ...ref(sam), role: "member" as const },
    { ...ref(elena), role: "member" as const },
  ],
  messages: [
    {
      messageId: id(206),
      sequence: 1,
      kind: "coach" as const,
      author: ref(theo),
      onBehalfOfOrganization: demoOrganization.name,
      body: "Rain is moving in: today's clinic moves to Sunday 9:00 AM.",
      delivery: {
        status: "read" as const,
        readBy: [noa.displayName],
        recipientCount: 8,
      },
      createdAt: "2026-11-28T15:00:00.000Z",
    },
    {
      messageId: id(207),
      sequence: 2,
      kind: "person" as const,
      author: ref(sam),
      body: "Sunday works. Thanks for the heads up.",
      channel: "imessage" as const,
      createdAt: "2026-11-28T15:04:00.000Z",
    },
  ],
};

/** The division thread: a junior and her guardian in the same thread. */
export const conciergeDemoDivisionThread = {
  ...conciergeDemoThreads[7]!,
  participants: [
    { ...ref(elena), role: "staff" as const },
    { ...ref(junior), role: "member" as const },
    {
      ...ref(mara),
      role: "guardian" as const,
      guardianOf: junior.displayName,
    },
  ],
  messages: [
    {
      messageId: id(208),
      sequence: 1,
      kind: "coach" as const,
      author: ref(elena),
      onBehalfOfOrganization: demoOrganization.name,
      body: "Check-in opens at 7:30 AM at the main tent.",
      channel: "email" as const,
      createdAt: "2026-11-27T18:30:00.000Z",
    },
  ],
};

export const conciergeDemo = {
  domain: "concierge",
  threads: conciergeDemoThreadPage,
  thread: conciergeDemoThread,
  /** Opened threads the screens can show (lesson, clinic, division). */
  threadDetails: [
    conciergeDemoThread,
    conciergeDemoClinicThread,
    conciergeDemoDivisionThread,
  ],
  proposals: conciergeDemoProposals,
  deliveries: conciergeDemoDeliveries,
  channels: conciergeDemoChannels,
} as const;
