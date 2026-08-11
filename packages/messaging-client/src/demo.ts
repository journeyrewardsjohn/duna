import type {
  ConversationDetail,
  MessagingInbox,
  MessagingModerationCase,
  MessagingPrincipal,
} from "./contracts";

const ids = {
  event: "61d68766-68fc-4d07-b473-986acbed21d1",
  org: "37f7252f-e9c6-4bf9-8286-4d06eb4767ea",
  support: "64870af2-2755-4e74-a373-c00a85eab5a9",
  alex: "fbe95134-0e3f-4f8a-a466-b12e3da4e3f0",
  mia: "1dc66d99-ec02-4d10-8845-788ee74c63ac",
  parent: "0a342157-a2dd-48c2-8a68-af08504b0561",
  eventMessage: "73c29c09-2372-41f1-af55-e4283053b616",
  replyMessage: "99a5badf-a132-4e7c-bb75-dd0247466f91",
  supportMessage: "3f09ee2c-c798-4f82-80ee-e7b34b9cde3b",
  moderation: "87fe603d-5957-422e-b8ef-53f2999f15fc",
} as const;

const org: MessagingPrincipal = {
  type: "organization",
  id: ids.org,
  displayName: "Duna Beach Club",
};
const alex: MessagingPrincipal = {
  type: "user",
  id: ids.alex,
  displayName: "Alex Morgan",
};
const mia: MessagingPrincipal = {
  type: "user",
  id: ids.mia,
  displayName: "Mia Rivera",
};
const parent: MessagingPrincipal = {
  type: "user",
  id: ids.parent,
  displayName: "Elena Rivera · Parent",
};
const support: MessagingPrincipal = {
  type: "agent",
  id: "duna-ai-support",
  displayName: "Duna Support",
};

export function demoMessagingInbox(
  principal: MessagingPrincipal = alex,
  now = new Date("2026-08-11T16:20:00.000Z"),
): MessagingInbox {
  const eventMessage = {
    id: ids.eventMessage,
    conversationId: ids.event,
    clientMessageId: "833cf692-900d-44c7-b823-e5a49df32a77",
    seq: 2,
    sender: org,
    kind: "schedule-change" as const,
    body: "Saturday check-in now opens at 8:15 AM. Your division begins at 9:00 AM.",
    widgets: [
      {
        kind: "schedule-change" as const,
        title: "Check-in moved 15 minutes earlier",
        previousStartsAt: "2026-08-15T06:30:00.000Z",
        startsAt: "2026-08-15T06:15:00.000Z",
        acknowledgementRequired: true,
      },
    ],
    attachments: [],
    status: "published" as const,
    moderationState: "not-required" as const,
    createdAt: "2026-08-11T15:42:00.000Z",
  };
  const supportMessage = {
    id: ids.supportMessage,
    conversationId: ids.support,
    clientMessageId: "c1e29fa7-ebf0-447f-b54c-227535efb522",
    seq: 1,
    sender: support,
    kind: "support-response" as const,
    body: "Hi Alex — I can help with registrations, lessons, rentals, payments, or anything else in Duna. What do you need?",
    widgets: [
      {
        kind: "quick-actions" as const,
        title: "Start with one of these",
        actions: [
          {
            id: "registration",
            label: "My registration",
            style: "primary" as const,
          },
          { id: "payment", label: "A payment", style: "secondary" as const },
          {
            id: "human",
            label: "Talk to support",
            style: "secondary" as const,
          },
        ],
      },
    ],
    attachments: [],
    status: "published" as const,
    moderationState: "not-required" as const,
    createdAt: "2026-08-10T13:20:00.000Z",
  };
  return {
    principal,
    conversations: [
      {
        id: ids.event,
        type: "event",
        title: "Golden Hour Open · Players",
        context: {
          type: "event",
          id: "9cc8bac0-6f89-4192-8d40-c2610e5d8f58",
          label: "Golden Hour Open",
          organizationId: ids.org,
        },
        participants: [org, alex, mia],
        lastMessage: eventMessage,
        unreadCount: 2,
        announcementOnly: false,
        muted: false,
        safety: {
          minorPresent: true,
          guardianPresent: true,
          screeningRequired: true,
        },
        updatedAt: eventMessage.createdAt,
      },
      {
        id: ids.support,
        type: "support",
        title: "Duna Support",
        participants: [support, alex],
        lastMessage: supportMessage,
        unreadCount: 0,
        announcementOnly: false,
        muted: false,
        safety: {
          minorPresent: false,
          guardianPresent: false,
          screeningRequired: false,
        },
        updatedAt: supportMessage.createdAt,
      },
    ],
    totalUnread: 2,
    syncedAt: now.toISOString(),
  };
}

export function demoConversationDetail(
  conversationId: string = ids.event,
): ConversationDetail {
  const inbox = demoMessagingInbox();
  const conversation =
    inbox.conversations.find((item) => item.id === conversationId) ??
    inbox.conversations[0]!;
  if (conversation.type === "support") {
    return {
      conversation,
      participants: [
        {
          principal: support,
          role: "agent",
          canPost: true,
          lastReadSeq: 1,
          lastDeliveredSeq: 1,
        },
        {
          principal: alex,
          role: "member",
          canPost: true,
          lastReadSeq: 1,
          lastDeliveredSeq: 1,
        },
      ],
      messages: conversation.lastMessage ? [conversation.lastMessage] : [],
      permissions: {
        canPost: true,
        canAddParticipants: false,
        canManageConversation: false,
        canBlock: false,
      },
    };
  }
  const firstMessage = {
    id: ids.replyMessage,
    conversationId: conversation.id,
    clientMessageId: "8040acf7-2f9a-437e-a454-bfa6fa554ee4",
    seq: 1,
    sender: mia,
    kind: "text" as const,
    body: "Will warm-up courts be available before our first pool match?",
    widgets: [],
    attachments: [],
    status: "published" as const,
    moderationState: "safe" as const,
    createdAt: "2026-08-11T15:35:00.000Z",
  };
  return {
    conversation,
    participants: [
      {
        principal: org,
        role: "moderator",
        canPost: true,
        lastReadSeq: 2,
        lastDeliveredSeq: 2,
      },
      {
        principal: alex,
        role: "member",
        canPost: true,
        lastReadSeq: 0,
        lastDeliveredSeq: 2,
      },
      {
        principal: mia,
        role: "member",
        canPost: true,
        lastReadSeq: 2,
        lastDeliveredSeq: 2,
      },
      {
        principal: parent,
        role: "guardian",
        guardianOfPersonId: ids.mia,
        canPost: true,
        lastReadSeq: 2,
        lastDeliveredSeq: 2,
      },
    ],
    messages: [
      firstMessage,
      ...(conversation.lastMessage ? [conversation.lastMessage] : []),
    ],
    permissions: {
      canPost: true,
      canAddParticipants: false,
      canManageConversation: false,
      canBlock: true,
    },
  };
}

export const demoModerationCases: readonly MessagingModerationCase[] = [
  {
    id: ids.moderation,
    messageId: ids.replyMessage,
    conversationId: ids.event,
    conversationTitle: "Golden Hour Open · Players",
    status: "open",
    severity: "medium",
    categories: ["adult-minor-boundary"],
    explanation:
      "Automated screening requested a human review of an adult-to-minor direct reply. The message remains held; no penalty was applied.",
    messagePreview:
      "Will warm-up courts be available before our first pool match?",
    attachments: [],
    minorPresent: true,
    createdAt: "2026-08-11T15:36:00.000Z",
  },
];

export const demoMessagingIds = ids;
