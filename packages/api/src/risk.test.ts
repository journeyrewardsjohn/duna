import { describe, expect, it } from "vitest";
import { stableHash } from "./canonical";
import { confirmAgentAction, getAgentDraft, proposeAgentAction } from "./risk";

const actorPersonId = "person-1";
const organizationId = "organization-1";
const conversationId = "conversation-1";

describe("AI tool risk gate", () => {
  it("persists a canonical golden trace and requires one fresh confirmation", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const toolInput = {
      amountMinor: 4_000,
      order: { currency: "USD", id: "order-1" },
    };
    const draft = await proposeAgentAction({
      toolName: "payments.refund",
      toolInput,
      proposedDiff: { status: "refunded" },
      actorPersonId,
      organizationId,
      conversationId,
      now,
    });

    expect(draft).toMatchObject({
      toolName: "payments.refund",
      riskTier: "confirm-always",
      inputHash: stableHash(toolInput),
      actorPersonId,
      organizationId,
      conversationId,
      status: "proposed",
    });
    expect(draft.confirmationNonce).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    await expect(
      confirmAgentAction({
        draftId: draft.id,
        actorPersonId,
        organizationId,
        requestId: "request-wrong-nonce",
        now,
        confirmationNonce: "remembered-approval",
      }),
    ).rejects.toThrow("Fresh confirmation");

    await expect(
      confirmAgentAction({
        draftId: draft.id,
        actorPersonId,
        organizationId,
        requestId: "request-confirm",
        now,
        confirmationNonce: draft.confirmationNonce,
      }),
    ).resolves.toMatchObject({ status: "confirmed" });
    await expect(
      confirmAgentAction({
        draftId: draft.id,
        actorPersonId,
        organizationId,
        requestId: "request-replay",
        now,
        confirmationNonce: draft.confirmationNonce,
      }),
    ).rejects.toThrow("no longer confirmable");
    await expect(getAgentDraft(draft.id)).resolves.toMatchObject({
      status: "confirmed",
      confirmationNonce: undefined,
    });
  });

  it("binds confirmation to the proposing actor and organization", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const draft = await proposeAgentAction({
      toolName: "leagues.create",
      toolInput: { title: "Sunset League" },
      proposedDiff: { operation: "create" },
      actorPersonId,
      organizationId,
      conversationId,
      now,
    });
    await expect(
      confirmAgentAction({
        draftId: draft.id,
        actorPersonId: "another-person",
        organizationId,
        requestId: "request-other-person",
        now,
      }),
    ).rejects.toThrow("proposing actor");
    await expect(
      confirmAgentAction({
        draftId: draft.id,
        actorPersonId,
        organizationId: "another-organization",
        requestId: "request-other-org",
        now,
      }),
    ).rejects.toThrow("organization context");
  });

  it("expires drafts after fifteen minutes", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const draft = await proposeAgentAction({
      toolName: "events.publish",
      toolInput: { eventId: "event-1" },
      proposedDiff: { status: "published" },
      actorPersonId,
      organizationId,
      conversationId,
      now,
    });
    await expect(
      confirmAgentAction({
        draftId: draft.id,
        actorPersonId,
        organizationId,
        requestId: "request-expired",
        now: new Date("2026-07-30T12:15:00.000Z"),
        confirmationNonce: draft.confirmationNonce,
      }),
    ).rejects.toThrow("expired");
    await expect(getAgentDraft(draft.id)).resolves.toMatchObject({
      status: "expired",
    });
  });

  it("does not create drafts for read tools", async () => {
    await expect(
      proposeAgentAction({
        toolName: "events.search",
        toolInput: {},
        proposedDiff: {},
        actorPersonId,
        organizationId,
        conversationId,
        now: new Date(),
      }),
    ).rejects.toThrow("Read tools");
  });
});
