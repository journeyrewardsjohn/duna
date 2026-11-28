import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The guard against shipping a dead end: an Inbox capability switch turns
 * on by itself when its procedures appear in the API router, so if a switch
 * is on while its server action still answers "isn't switched on yet",
 * Inbox would offer a control that cannot work. Each switch here runs its
 * actions against a stand-in caller and fails on the "needs API" answer.
 */
const logged: string[] = [];
const called: string[] = [];

vi.mock("@duna/observability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@duna/observability")>()),
  log: {
    info: (event: string) => logged.push(event),
    warn: (event: string) => logged.push(event),
    error: (event: string) => logged.push(event),
  },
  report: () => "reference",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/components/people/people-data", () => ({
  isNotConfigured: () => false,
}));

const hash = "a".repeat(64);
const proposal = {
  proposalId: "10000000-0000-4000-8000-000000000030",
  conversationId: "10000000-0000-4000-8000-000000000001",
  status: "sent",
  recipientCount: 2,
  unreachableCount: 0,
  contentHash: hash,
};

vi.mock("@/lib/api", () => {
  const answers: Record<string, unknown> = {
    "operator.concierge.draftSend": proposal,
    "operator.concierge.editDraft": proposal,
    "operator.concierge.confirmSend": proposal,
    "operator.concierge.cancelSend": proposal,
    "operator.concierge.setRecipientChannel": proposal,
    "operator.concierge.deliveries": {
      proposalId: proposal.proposalId,
      deliveries: [],
    },
    "operator.concierge.assignThread": {
      conversationId: proposal.conversationId,
      assigneePersonId: null,
    },
    "operator.concierge.markRead": { conversationId: proposal.conversationId },
    "operator.concierge.drafts.createFromHandoff": {
      conversationId: proposal.conversationId,
      proposal,
    },
    "messaging.create": { id: proposal.conversationId },
  };
  // Any procedure path, recorded and answered (an empty object by default).
  const caller = (path: string[]): unknown =>
    new Proxy(async () => undefined, {
      // Not a promise: `await` must not treat the stand-in as one.
      get: (_target, key) =>
        key === "then" ? undefined : caller([...path, String(key)]),
      apply: async () => {
        called.push(path.join("."));
        return answers[path.join(".")] ?? {};
      },
    });
  return {
    getServerCaller: async () => caller([]),
    getServerContext: async () => ({ requestId: "request-1" }),
  };
});

const conversationId = proposal.conversationId;
const proposalId = proposal.proposalId;
const key = "10000000-0000-4000-8000-0000000000aa";

async function actions() {
  return import("@/app/(next)/(hq)/inbox/actions");
}

/** Every action each switch offers, called as its screen calls it. */
const actionsFor: Record<
  string,
  (a: Awaited<ReturnType<typeof actions>>) => Promise<{ ok: boolean }>[]
> = {
  reply: (a) => [
    a.reviewReplyAction({
      conversationId,
      body: "Hi",
      draftedBy: "person",
      kind: "conversation",
    }),
    a.editReviewAction({ proposalId, body: "Hi again" }),
    a.confirmSendAction({ proposalId, contentHash: hash, idempotencyKey: key }),
    a.cancelReviewAction({ proposalId }),
  ],
  channelChoice: (a) => [
    a.setRecipientChannelAction({
      proposalId,
      recipientId: key,
      channel: "duna",
    }),
  ],
  deliveries: (a) => [a.deliveriesAction({ proposalId })],
  assign: (a) => [
    a.assignThreadAction({ conversationId, assigneePersonId: null }),
  ],
  markRead: (a) => [a.markReadAction({ conversationId, sequence: 3 })],
  startThread: (a) => [
    a.startThreadAction({
      contextType: "organization",
      contextId: "org",
      body: "Courts reopen Monday.",
      draftedBy: "person",
    }),
  ],
  groupConversation: (a) => [
    a.createGroupAction({
      organizationId: "org",
      title: "Saturday clinic",
      message: "See you there",
      recipientPersonIds: [key],
      widgets: [],
      announcementOnly: false,
      idempotencyKey: key,
    }),
  ],
  mute: (a) => [a.muteThreadAction({ conversationId, muted: true })],
  markDone: (a) => [a.markDoneAction({ conversationId, done: true })],
  askDraft: (a) => [a.suggestReplyAction({ conversationId })],
};

describe("Inbox capability switches never lead to a dead end", () => {
  // The whole API router loads once (slow on a cold CI runner).
  let paths: string[] = [];
  beforeAll(async () => {
    const { appRouter } = await import("@duna/api");
    paths = Object.keys(
      (appRouter as unknown as { _def: { procedures: object } })._def
        .procedures,
    );
  }, 120_000);

  beforeEach(() => {
    logged.length = 0;
    called.length = 0;
  });

  it("names every switch's actions here", async () => {
    const { INBOX_CAPABILITY_PROCEDURES } =
      await import("./inbox-capabilities");
    expect(Object.keys(actionsFor).sort()).toEqual(
      Object.keys(INBOX_CAPABILITY_PROCEDURES).sort(),
    );
  });

  it("every switch that is on reaches its procedures, never 'needs API'", async () => {
    const { capabilitiesFrom } = await import("./inbox-capabilities");
    const capabilities = capabilitiesFrom(paths);
    const loaded = await actions();
    for (const [capability, on] of Object.entries(capabilities)) {
      if (!on) continue;
      logged.length = 0;
      called.length = 0;
      const results = await Promise.all(actionsFor[capability]!(loaded));
      expect(logged, capability).not.toContain("hq.inbox.actionNeedsApi");
      for (const result of results) expect(result.ok, capability).toBe(true);
      expect(
        called.every(
          (path) =>
            path.startsWith("operator.concierge.") ||
            path === "messaging.create",
        ),
        capability,
      ).toBe(true);
      expect(called.length, capability).toBe(results.length);
    }
  }, 60_000);

  it("every switch that is off answers 'not switched on' and changes nothing", async () => {
    const { capabilitiesFrom } = await import("./inbox-capabilities");
    const capabilities = capabilitiesFrom(paths);
    const loaded = await actions();
    for (const [capability, on] of Object.entries(capabilities)) {
      if (on) continue;
      called.length = 0;
      const results = await Promise.all(actionsFor[capability]!(loaded));
      for (const result of results) expect(result.ok, capability).toBe(false);
      expect(called, capability).toEqual([]);
    }
  });

  it("matches what the API serves today", async () => {
    const { capabilitiesFrom } = await import("./inbox-capabilities");
    expect(capabilitiesFrom(paths)).toEqual({
      reply: true,
      channelChoice: true,
      deliveries: true,
      assign: true,
      markRead: true,
      startThread: true,
      groupConversation: true,
      // Concierge has a person's own mute, not a staff mute (Needs API).
      mute: false,
      // Marking a thread done is not built.
      markDone: false,
      // Ask Duna opens beside the thread instead of writing into it.
      askDraft: false,
    });
  });
});
