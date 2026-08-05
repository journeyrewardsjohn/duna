import { describe, expect, it } from "vitest";
import {
  assertPlayerMediaPath,
  playerMediaMaximumBytes,
  playerMediaPath,
  validatePlayerMediaInput,
} from "./player-media-storage";

describe("player artwork reference storage", () => {
  it("accepts only bounded image formats", () => {
    expect(
      validatePlayerMediaInput({ contentType: "image/webp", size: 2_048 }),
    ).toEqual({ contentType: "image/webp", extension: "webp" });
    expect(() =>
      validatePlayerMediaInput({ contentType: "image/svg+xml", size: 2_048 }),
    ).toThrow("JPG, PNG, WebP, or AVIF");
    expect(() =>
      validatePlayerMediaInput({
        contentType: "image/jpeg",
        size: playerMediaMaximumBytes + 1,
      }),
    ).toThrow("15 MB or smaller");
  });

  it("scopes generated paths to the authenticated person and image role", () => {
    const personId = "10000000-0000-4000-8000-000000000010";
    const pathname = playerMediaPath({
      personId,
      kind: "portrait",
      extension: "jpg",
    });
    expect(() =>
      assertPlayerMediaPath(pathname, {
        personId,
        kind: "portrait",
        extension: "jpg",
      }),
    ).not.toThrow();
    expect(() =>
      assertPlayerMediaPath(pathname, {
        personId: "10000000-0000-4000-8000-000000000011",
        kind: "portrait",
        extension: "jpg",
      }),
    ).toThrow("path is invalid");
  });
});
