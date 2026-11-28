import { conciergeDemo, conciergeDemoIds } from "@duna/core/demo/concierge";
import {
  conciergeChannels,
  conciergeDeliveryStatuses,
  conciergeDraftedBy,
  conciergeEndpointStatuses,
  conciergeProposalStatuses,
  conciergeUnreachableReasons,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  conciergeChannelsSchema,
  conciergeDeliveriesSchema,
  conciergeMessageKindSchema,
  conciergeSendProposalSchema,
  conciergeThreadKindSchema,
  conciergeThreadSchema,
  conciergeThreadsSchema,
} from "./concierge";
import { expectCoverage } from "./w3-test-support";

// The connected path is simulated by switching only the data-source rule;
// sign-in and organisation checks still run in demo mode (no database).
const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("concierge contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    conciergeThreadsSchema.parse(conciergeDemo.threads);
    conciergeThreadSchema.parse(conciergeDemo.thread);
    for (const thread of conciergeDemo.threadDetails)
      conciergeThreadSchema.parse(thread);
    for (const proposal of conciergeDemo.proposals)
      conciergeSendProposalSchema.parse(proposal);
    conciergeDeliveriesSchema.parse(conciergeDemo.deliveries);
    conciergeChannelsSchema.parse(conciergeDemo.channels);
  });

  it("covers every state of every state machine", () => {
    expectCoverage(
      conciergeProposalStatuses,
      conciergeDemo.proposals.map((p) => p.status),
    );
    expectCoverage(
      conciergeDraftedBy,
      conciergeDemo.proposals.map((p) => p.draftedBy),
    );
    const recipients = conciergeDemo.proposals.flatMap((p) => p.recipients);
    expectCoverage(
      conciergeUnreachableReasons,
      recipients.flatMap((r) =>
        "unreachableReason" in r && r.unreachableReason
          ? [r.unreachableReason]
          : [],
      ),
    );
    expectCoverage(
      conciergeChannels,
      recipients.flatMap((r) =>
        "channel" in r && r.channel ? [r.channel] : [],
      ),
    );
    expectCoverage(
      conciergeDeliveryStatuses,
      conciergeDemo.deliveries.deliveries.map((d) => d.status),
    );
    expectCoverage(
      conciergeEndpointStatuses,
      conciergeDemo.channels.endpoints.map((e) => e.status),
    );
    expectCoverage(
      conciergeThreadKindSchema.options,
      conciergeDemo.threads.items.map((t) => t.kind),
    );
    expectCoverage(
      conciergeMessageKindSchema.options,
      conciergeDemo.thread.messages.map((m) => m.kind),
    );
  });
});

describe("concierge routers in demo mode and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));

  it("serves fixtures in demo mode", async () => {
    const operator = caller().operator.concierge;
    const unread = await operator.threads({ filter: "unread", limit: 25 });
    expect(unread.items.every((t) => t.unreadCount > 0)).toBe(true);
    const thread = await operator.thread({
      conversationId: conciergeDemo.thread.conversationId,
    });
    expect(thread.messages.length).toBe(5);
    const draft = await operator.draftSend({
      conversationId: thread.conversationId,
      body: "Courts are closed for lightning.",
      draftedBy: "duna",
    });
    expect(draft.status).toBe("ready");
    const sent = await operator.confirmSend({
      proposalId: draft.proposalId,
      contentHash: draft.contentHash,
      idempotencyKey: "concierge-test-1",
    });
    expect(sent.status).toBe("sent");
    await expect(
      operator.confirmSend({
        proposalId: draft.proposalId,
        contentHash: "f".repeat(64),
        idempotencyKey: "concierge-test-2",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const player = caller().player.concierge;
    const whatsapp = await player.connectChannel({
      channel: "whatsapp",
      destination: "+13105550142",
    });
    expect(whatsapp).toEqual({ availability: "not-enabled" });
    await expect(player.channels()).resolves.toMatchObject({
      preferredChannel: "duna",
    });
  });

  it("runs the real service outside demo mode (no W3-0 stub left)", async () => {
    dataSource.demo = false;
    const error = await caller()
      .operator.concierge.threads({ filter: "all", limit: 25 })
      .catch((caught: unknown) => caught);
    expect(isNotImplementedYet(error)).toBe(false);
  });

  it("serves the richer demo threads and hand-offs without sending", async () => {
    const operator = caller().operator.concierge;
    const families = await operator.threads({ filter: "families", limit: 25 });
    expect(families.items.every((thread) => thread.minorPresent)).toBe(true);
    const division = await operator.thread({
      conversationId: conciergeDemoIds.divisionThread,
    });
    expect(division.participants.some((p) => p.role === "guardian")).toBe(true);
    const handoff = await operator.drafts.createFromHandoff({
      source: "hq.offerings.session",
      contextType: "lesson",
      contextId: "11111111-1111-4111-8111-111111111111",
      suggestedText: "Bring water: it will be hot.",
    });
    expect(handoff.proposal?.status).toBe("ready");
    expect(handoff.proposal?.body).toBe("Bring water: it will be hot.");
    const withoutText = await operator.drafts.createFromHandoff({
      source: "hq.people.nextBestAction",
      contextType: "organization",
      contextId: "11111111-1111-4111-8111-111111111111",
    });
    expect(withoutText.proposal).toBeUndefined();
  });
});
