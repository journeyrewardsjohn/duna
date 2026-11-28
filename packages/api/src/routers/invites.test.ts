import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invitesDemo } from "@duna/core/demo/invites";
import { createApiContext, createDemoActor } from "../context";
import { inviteSmsStatusSchema } from "../contracts/invites";
import { createCaller } from "../router";

// player.invites in demo mode (no database: CI and Playwright): the preview
// works from fixtures, the send answers "not configured", status is fixtures.
describe("player.invites (demo mode)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => vi.unstubAllEnvs());

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() }));
  const subjectId = "00000000-0000-4000-8000-000000000001";

  it("previews the exact text and who cannot be texted", async () => {
    const preview = await caller().player.invites.smsPreview({
      inviteKind: "court-booking",
      subjectId,
      recipients: [
        { name: "Sam", phoneE164: "+1 310 482 0142" },
        { name: "Stopped", phoneE164: invitesDemo.optedOutE164 },
        { name: "Typo", phoneE164: "12" + "34567" },
      ],
    });
    expect(preview.sendState).toBe("not-configured");
    expect(preview.readyCount).toBe(1);
    expect(preview.recipients[0]!.text).toMatch(
      /^Duna: Alex R\. invited you to a court booking at Demo Beach Courts on Sun, Dec 6 at 9:00 AM PST\. Join here: \S+\/app\/booking-invite\/\S+ Reply STOP to opt out\.$/,
    );
    expect(preview.recipients.slice(1).map((r) => r.reason)).toEqual([
      "opted-out",
      "invalid-number",
    ]);
    expect(preview.previewHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("answers not configured on send", async () => {
    await expect(
      caller().player.invites.sendSms({
        inviteKind: "pickup",
        subjectId,
        recipients: [{ name: "Sam", phoneE164: "+13104820142" }],
        previewHash: "a".repeat(64),
        confirmed: true,
        idempotencyKey: "demo-send-0001",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("refuses a send without confirmation or with more than eight people", async () => {
    await expect(
      caller().player.invites.sendSms({
        inviteKind: "pickup",
        subjectId,
        recipients: [{ name: "Sam", phoneE164: "+13104820142" }],
        previewHash: "a".repeat(64),
        confirmed: false as unknown as true,
        idempotencyKey: "demo-send-0002",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller().player.invites.smsPreview({
        inviteKind: "pickup",
        subjectId,
        recipients: Array.from({ length: 9 }, (_, index) => ({
          name: `P${index}`,
          phoneE164: `+1310482014${index}`,
        })),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns fixture delivery states that match the contract", async () => {
    const status = await caller().player.invites.smsStatus({
      inviteKind: "session",
      subjectId,
    });
    expect(inviteSmsStatusSchema.parse(status).recipients).toHaveLength(3);
  });

  it("refuses a junior account", async () => {
    const junior = createCaller(
      createApiContext({ actor: { ...createDemoActor(), ageBand: "teen" } }),
    );
    await expect(
      junior.player.invites.smsPreview({
        inviteKind: "session",
        subjectId,
        recipients: [{ name: "Sam", phoneE164: "+13104820142" }],
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
