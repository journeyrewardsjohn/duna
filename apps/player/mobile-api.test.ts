import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-file-system", () => ({
  File: class ExpoFileMock extends Blob {
    readonly name: string;

    constructor(uri: string) {
      super(["image-bytes"], { type: "image/jpeg" });
      this.name = uri.split("/").at(-1) || "photo.jpg";
    }
  },
}));

import { uploadPlayerMedia } from "./mobile-api";

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
