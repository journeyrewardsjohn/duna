import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyDunaAiAction,
  confirmDunaAiAction,
  dunaAiRequestSchema,
  findScheduleConflicts,
  hasDunaAiGatewayCredential,
  rankDiscoveryItems,
  resolveDunaAiCopilotModel,
  resolveDunaAiGatewayCredentialSource,
  transcribeDunaAiAudio,
} from "./duna-ai";
import { proposeAgentAction } from "./risk";

afterEach(() => {
  delete process.env.DUNA_COPILOT_MODEL;
  delete process.env.DUNA_TRANSCRIPTION_MODEL;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.OPENAI_API_KEY;
});

describe("Duna AI action classification", () => {
  it("treats money movement and cancellations as consequential", () => {
    expect(classifyDunaAiAction("Please refund this payment")).toMatchObject({
      toolName: "payments.refund",
      scope: "payments:write",
    });
    expect(classifyDunaAiAction("Cancel this court booking")).toMatchObject({
      toolName: "bookings.cancel",
      scope: "bookings:write",
    });
  });

  it("keeps availability as a reviewable proposal", () => {
    expect(
      classifyDunaAiAction("Set coach availability for next Tuesday"),
    ).toMatchObject({
      toolName: "staff.availability.set",
      scope: "sessions:write",
    });
  });

  it("does not infer an action from an ordinary question", () => {
    expect(classifyDunaAiAction("Why did my rating move?")).toBeUndefined();
  });

  it("does not infer a write from a question about availability", () => {
    expect(
      classifyDunaAiAction("What is the coach availability next Tuesday?"),
    ).toBeUndefined();
  });
});

describe("Duna AI context", () => {
  it("finds real overlaps without flagging adjacent sessions", () => {
    expect(
      findScheduleConflicts([
        {
          title: "Morning clinic",
          startsAt: "2026-08-18T13:00:00.000Z",
          endsAt: "2026-08-18T14:30:00.000Z",
        },
        {
          title: "Private lesson",
          startsAt: "2026-08-18T14:00:00.000Z",
          endsAt: "2026-08-18T15:00:00.000Z",
        },
        {
          title: "Open play",
          startsAt: "2026-08-18T15:00:00.000Z",
          endsAt: "2026-08-18T17:00:00.000Z",
        },
      ]),
    ).toEqual(["Morning clinic overlaps Private lesson"]);
  });

  it("ranks discovery against the user's request", () => {
    const items = [
      {
        id: "event:1",
        entityType: "event",
        kind: "clinic",
        title: "Advanced beach clinic",
        subtitle: "Ocean Park",
        href: "/events/advanced",
        latitude: 26.1,
        longitude: -80.1,
        startsAt: "2026-08-19T13:00:00.000Z",
        endsAt: "2026-08-19T15:00:00.000Z",
        tags: ["advanced", "clinic"],
      },
      {
        id: "venue:1",
        entityType: "venue",
        kind: "court-booking",
        title: "Family courts",
        subtitle: "West Park",
        href: "/venues/family",
        latitude: 26.2,
        longitude: -80.2,
        tags: ["beginner", "courts"],
      },
    ] as const;
    const ranked = rankDiscoveryItems(
      items,
      "Find an advanced clinic",
      new Date("2026-08-17T12:00:00.000Z"),
    );
    expect(ranked[0]?.title).toBe("Advanced beach clinic");
    expect(
      rankDiscoveryItems(
        items,
        "Find an elite tournament",
        new Date("2026-08-17T12:00:00.000Z"),
      ),
    ).toEqual([]);
  });

  it("re-checks current permission before confirming a write", async () => {
    const now = new Date("2026-08-17T12:00:00.000Z");
    const draft = await proposeAgentAction({
      toolName: "events.create",
      toolInput: { request: "Create a clinic" },
      proposedDiff: { operation: "Create event" },
      actorPersonId: "person-1",
      conversationId: "conversation-1",
      now,
    });
    await expect(
      confirmDunaAiAction({
        actor: {
          personId: "person-1",
          displayName: "Player",
          roles: ["player"],
          scopes: ["profile:read"],
          ageBand: "adult",
          isDemo: true,
        },
        draftId: draft.id,
        requestId: "request-1",
        now,
      }),
    ).rejects.toThrow("no longer has permission");
  });
});

describe("Duna AI model", () => {
  it("uses a provider-qualified Terra model through Gateway by default", () => {
    expect(resolveDunaAiCopilotModel()).toBe("openai/gpt-5.6-terra");
  });

  it("supports a dedicated co-pilot model override", () => {
    process.env.DUNA_COPILOT_MODEL = "openai/gpt-5.6-luna";
    expect(resolveDunaAiCopilotModel()).toBe("openai/gpt-5.6-luna");
  });

  it("requires Vercel AI Gateway credentials and ignores a direct OpenAI key", () => {
    process.env.OPENAI_API_KEY = "direct-key-must-not-be-used";
    expect(hasDunaAiGatewayCredential()).toBe(false);
    process.env.VERCEL_OIDC_TOKEN = "vercel-oidc";
    expect(hasDunaAiGatewayCredential()).toBe(true);
  });

  it("prefers automatic OIDC in Vercel deployments over a stale API key", () => {
    process.env.VERCEL = "1";
    process.env.AI_GATEWAY_API_KEY = "stale-api-key";
    process.env.VERCEL_OIDC_TOKEN = "current-oidc-token";
    expect(resolveDunaAiGatewayCredentialSource()).toBe("oidc");
  });

  it("accepts the request-scoped OIDC token used by Vercel functions", () => {
    process.env.VERCEL = "1";
    process.env.AI_GATEWAY_API_KEY = "stale-api-key";
    expect(resolveDunaAiGatewayCredentialSource("request-oidc-token")).toBe(
      "oidc",
    );
  });

  it("prefers a stable API key outside Vercel deployments", () => {
    process.env.AI_GATEWAY_API_KEY = "local-api-key";
    process.env.VERCEL_OIDC_TOKEN = "pulled-oidc-token";
    expect(resolveDunaAiGatewayCredentialSource()).toBe("api-key");
  });

  it("accepts bounded image and file context on an ask turn", () => {
    expect(
      dunaAiRequestSchema.parse({
        mode: "ask",
        message: "What should I notice?",
        surface: "hq",
        attachments: [
          {
            kind: "image",
            name: "court.png",
            mimeType: "image/png",
            data: "data:image/png;base64,Y291cnQ=",
          },
        ],
      }),
    ).toMatchObject({ attachments: [{ name: "court.png" }] });
  });

  it("routes signed-in voice transcription through Vercel AI Gateway", async () => {
    process.env.AI_GATEWAY_API_KEY = "gateway-key";
    process.env.DUNA_TRANSCRIPTION_MODEL = "openai/gpt-transcribe";
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(_url).toBe(
          "https://ai-gateway.vercel.sh/v1/audio/transcriptions",
        );
        expect(init?.headers).toEqual({ Authorization: "Bearer gateway-key" });
        const form = init?.body as FormData;
        expect(form.get("model")).toBe("openai/gpt-transcribe");
        return Response.json({ text: "Show me tomorrow's clinics." });
      },
    );
    await expect(
      transcribeDunaAiAudio({
        actor: {
          personId: "person-voice",
          displayName: "Voice Operator",
          roles: ["manager"],
          scopes: ["reports:read"],
          ageBand: "adult",
          isDemo: true,
        },
        audio: new Blob(["voice"], { type: "audio/webm" }),
        filename: "voice.webm",
        now: new Date("2026-08-20T16:00:00.000Z"),
        fetchImpl,
      }),
    ).resolves.toBe("Show me tomorrow's clinics.");
  });

  it("uses the request-scoped OIDC token for Vercel voice transcription", async () => {
    process.env.VERCEL = "1";
    process.env.AI_GATEWAY_API_KEY = "stale-api-key";
    const fetchImpl = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.headers).toEqual({
          Authorization: "Bearer runtime-oidc-token",
        });
        return Response.json({ text: "Show my next booking." });
      },
    );
    await expect(
      transcribeDunaAiAudio({
        actor: {
          personId: "person-runtime-voice",
          displayName: "Runtime Voice Player",
          roles: ["player"],
          scopes: ["profile:read"],
          ageBand: "adult",
          isDemo: true,
        },
        audio: new Blob(["voice"], { type: "audio/webm" }),
        filename: "voice.webm",
        now: new Date("2026-08-20T16:00:00.000Z"),
        requestOidcToken: "runtime-oidc-token",
        fetchImpl,
      }),
    ).resolves.toBe("Show my next booking.");
  });
});
