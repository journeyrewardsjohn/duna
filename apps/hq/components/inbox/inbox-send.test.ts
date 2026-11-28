import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A person confirms every send. Reviewing, editing, starting a thread and
 * changing a channel never send; only the confirmation's own action does,
 * for the content hash that was reviewed. And nothing a person wrote reaches
 * the logs.
 */
const calls: { path: string; input: unknown }[] = [];
const logs: unknown[][] = [];
let nextError: (Error & { code?: string }) | undefined;

vi.mock("@duna/observability", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@duna/observability")>()),
  log: {
    info: (...args: unknown[]) => logs.push(args),
    warn: (...args: unknown[]) => logs.push(args),
    error: (...args: unknown[]) => logs.push(args),
  },
  report: () => "reference",
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/components/people/people-data", () => ({
  isNotConfigured: () => false,
}));

const hash = "b".repeat(64);
const proposal = {
  proposalId: "10000000-0000-4000-8000-000000000030",
  conversationId: "10000000-0000-4000-8000-000000000001",
  status: "ready",
  recipientCount: 3,
  unreachableCount: 1,
  contentHash: hash,
};

vi.mock("@/lib/api", () => {
  const caller = (path: string[]): unknown =>
    new Proxy(async () => undefined, {
      get: (_target, key) =>
        key === "then" ? undefined : caller([...path, String(key)]),
      apply: async (_target, _this, args: unknown[]) => {
        calls.push({ path: path.join("."), input: args[0] });
        if (nextError) {
          const error = nextError;
          nextError = undefined;
          throw error;
        }
        return path.join(".") === "operator.concierge.drafts.createFromHandoff"
          ? { conversationId: proposal.conversationId, proposal }
          : proposal;
      },
    });
  return {
    getServerCaller: async () => caller([]),
    getServerContext: async () => ({ requestId: "request-1" }),
  };
});

const secret = "Maya's knee is still sore, she owes $40 for the clinic";
const key = "10000000-0000-4000-8000-0000000000aa";

async function actions() {
  return import("@/app/(next)/(hq)/inbox/actions");
}

beforeEach(() => {
  calls.length = 0;
  logs.length = 0;
  nextError = undefined;
});

describe("Nothing is sent without the confirmation", () => {
  it("reviewing a reply builds the review and sends nothing", async () => {
    const a = await actions();
    const result = await a.reviewReplyAction({
      conversationId: proposal.conversationId,
      body: secret,
      draftedBy: "duna",
      kind: "conversation",
    });
    expect(result.ok).toBe(true);
    expect(calls.map((call) => call.path)).toEqual([
      "operator.concierge.draftSend",
    ]);
    expect(calls[0]!.input).toMatchObject({ draftedBy: "duna" });
  });

  it("editing, changing a channel and starting a thread send nothing", async () => {
    const a = await actions();
    await a.editReviewAction({ proposalId: proposal.proposalId, body: secret });
    await a.setRecipientChannelAction({
      proposalId: proposal.proposalId,
      recipientId: key,
      channel: "duna",
    });
    await a.startThreadAction({
      contextType: "direct",
      contextId: key,
      body: secret,
      draftedBy: "person",
    });
    expect(calls.map((call) => call.path)).not.toContain(
      "operator.concierge.confirmSend",
    );
    expect(calls.map((call) => call.path)).not.toContain("messaging.create");
  });

  it("refuses to send without the reviewed content hash", async () => {
    const a = await actions();
    const result = await a.confirmSendAction({
      proposalId: proposal.proposalId,
      contentHash: "",
      idempotencyKey: key,
    });
    expect(result).toMatchObject({ ok: false, code: "invalid" });
    expect(calls).toEqual([]);
  });

  it("sends exactly the version reviewed, once per key", async () => {
    const a = await actions();
    const result = await a.confirmSendAction({
      proposalId: proposal.proposalId,
      contentHash: hash,
      idempotencyKey: key,
    });
    expect(result.ok).toBe(true);
    expect(calls).toEqual([
      {
        path: "operator.concierge.confirmSend",
        input: {
          proposalId: proposal.proposalId,
          contentHash: hash,
          idempotencyKey: key,
        },
      },
    ]);
  });

  it("says to review again when something changed (and sends nothing)", async () => {
    const a = await actions();
    nextError = Object.assign(
      new Error("The message changed. Review it again."),
      {
        code: "CONFLICT",
      },
    );
    const result = await a.confirmSendAction({
      proposalId: proposal.proposalId,
      contentHash: hash,
      idempotencyKey: key,
    });
    expect(result).toMatchObject({ ok: false, code: "stale" });
    expect(result.ok ? "" : result.message).toMatch(
      /Nothing was sent\. Review it again\./,
    );
  });

  it("only the confirmation in the screens calls the sending actions", () => {
    const review = readFileSync(
      new URL("./send-review.tsx", import.meta.url),
      "utf8",
    );
    const compose = readFileSync(
      new URL("./new-conversation.tsx", import.meta.url),
      "utf8",
    );
    const composer = readFileSync(
      new URL("./composer.tsx", import.meta.url),
      "utf8",
    );
    // Each sending action is called once, as the `perform` of `confirm.run`.
    expect(review.match(/confirmSendAction\(/g)).toHaveLength(1);
    expect(review).toMatch(
      /confirm\.run\(\{[\s\S]*perform: async \(\{ idempotencyKey \}\) =>\s*unwrap\(\s*await confirmSendAction\(/,
    );
    expect(compose.match(/createGroupAction\(/g)).toHaveLength(1);
    expect(compose).toMatch(
      /confirm\.run\(\{[\s\S]*perform: async \(\{ idempotencyKey \}\) =>\s*unwrap\(\s*await createGroupAction\(/,
    );
    expect(composer).not.toMatch(/confirmSendAction|createGroupAction/);
  });
});

describe("Logs never carry what a person wrote", () => {
  it("logs ids, actions and counts only", async () => {
    const a = await actions();
    await a.reviewReplyAction({
      conversationId: proposal.conversationId,
      body: secret,
      draftedBy: "person",
      kind: "conversation",
    });
    await a.confirmSendAction({
      proposalId: proposal.proposalId,
      contentHash: hash,
      idempotencyKey: key,
    });
    await a.createGroupAction({
      organizationId: "org",
      title: "Knee check",
      message: secret,
      recipientPersonIds: [key],
      widgets: [],
      announcementOnly: false,
      idempotencyKey: key,
    });
    nextError = Object.assign(new Error(secret), {
      code: "INTERNAL_SERVER_ERROR",
    });
    await a.reviewReplyAction({
      conversationId: proposal.conversationId,
      body: secret,
      draftedBy: "person",
      kind: "conversation",
    });
    const { isValidEventName } = await import("@duna/observability");
    for (const [event] of logs) {
      expect(isValidEventName(String(event)), String(event)).toBe(true);
    }
    const text = JSON.stringify(logs);
    expect(logs.length).toBeGreaterThan(0);
    expect(text).not.toContain("knee");
    expect(text).not.toContain("Knee");
    expect(text).not.toContain("$40");
  });
});
