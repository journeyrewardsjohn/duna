import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => ({
  File: class ExpoFileMock extends Blob {
    readonly exists = true;
    readonly name: string;

    constructor(uri: string) {
      super(["image-bytes"], { type: "image/jpeg" });
      this.name = uri.split("/").at(-1) || "photo.jpg";
    }

    delete() {}
  },
}));

import {
  askPlayerDunaAi,
  confirmPlayerDunaAiAction,
  getMobileAuthToken,
  transcribeMatchJournalVoice,
  uploadPlayerMedia,
} from "./mobile-api";

describe("mobile authentication", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns a refreshed access token", async () => {
    await expect(getMobileAuthToken(async () => "token", 10)).resolves.toBe(
      "token",
    );
  });

  it("fails clearly instead of leaving a request busy forever", async () => {
    await expect(
      getMobileAuthToken(() => new Promise(() => undefined), 1),
    ).rejects.toThrow("secure session took too long");
  });
});

describe("native player media upload", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends a byte-backed file instead of the unsupported React Native URI object", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          contentType: "image/jpeg",
          height: 1800,
          kind: "action",
          size: 11,
          url: "https://media.example/artwork.jpg",
          width: 1200,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await uploadPlayerMedia(async () => "token", {
      height: 1800,
      name: "attack.jpg",
      type: "image/jpeg",
      uri: "file:///tmp/attack.jpg",
      width: 1200,
    });

    const request = fetchMock.mock.calls[0]?.[1];
    const body = request?.body as FormData;
    const file = body.get("file");
    expect(file).toBeInstanceOf(Blob);
    expect(file).not.toMatchObject({ uri: "file:///tmp/attack.jpg" });
    expect((file as globalThis.File).name).toBe("attack.jpg");
  });
});

describe("Duna AI mobile transport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("sends the player surface and bounded chat history to the governed endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reply: "Here are two events that fit.",
          cards: [],
          suggestions: [],
          toolsUsed: ["player.dashboard.read"],
          reasoningEffort: "high",
          providerAvailable: true,
          researchUsed: false,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await askPlayerDunaAi(async () => "player-token", {
      message: "Find a tournament this weekend",
      context: {
        pathname: "/app/ai",
        timezone: "America/New_York",
      },
      history: [{ role: "user", body: "I play advanced doubles" }],
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toMatch(/\/api\/duna-ai$/);
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer player-token",
    );
    expect(JSON.parse(String(request?.body))).toMatchObject({
      mode: "ask",
      surface: "player",
      message: "Find a tournament this weekend",
      history: [{ role: "user", body: "I play advanced doubles" }],
    });
  });

  it("confirms a reviewed action through the same first-party endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          result: {
            draft: { id: "draft-1" },
            status: "applied",
            reply: "Your booking was cancelled.",
            changes: ["Cancelled one booking"],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const outcome = await confirmPlayerDunaAiAction(
      async () => "player-token",
      { draftId: "draft-1", confirmationNonce: "nonce-1" },
    );

    expect(outcome.status).toBe("applied");
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      mode: "confirm",
      draftId: "draft-1",
      confirmationNonce: "nonce-1",
    });
  });
});

describe("private match-journal voice transport", () => {
  afterEach(() => vi.restoreAllMocks());

  it("marks audio as match-journal input and sends an authenticated byte-backed file", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ text: "I served the short seam well." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(
      transcribeMatchJournalVoice(async () => "player-token", {
        name: "reflection.m4a",
        uri: "file:///tmp/reflection.m4a",
      }),
    ).resolves.toBe("I served the short seam well.");

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    expect(url).toContain("/api/duna-ai/transcribe");
    expect(new Headers(request?.headers).get("authorization")).toBe(
      "Bearer player-token",
    );
    const body = request?.body as FormData;
    expect(body.get("purpose")).toBe("match-journal");
    expect(body.get("audio")).toBeInstanceOf(Blob);
  });
});
