import { describe, expect, it } from "vitest";
import {
  assertCourtMediaPath,
  assertEventMediaPath,
  assertVenueMediaPath,
  createCourtMediaPath,
  createEventMediaPath,
  createVenueMediaPath,
  validateEventMediaInput,
} from "./media-storage";

const organizationId = "10000000-0000-4000-8000-000000000001";
const identifier = "20000000-0000-4000-8000-000000000002";

describe("event media storage", () => {
  it("accepts optimized images and large-video multipart candidates", () => {
    expect(
      validateEventMediaInput({
        fileName: "cover.webp",
        contentType: "image/webp",
        size: 1_200_000,
      }),
    ).toMatchObject({
      extension: "webp",
      kind: "image",
      maxBytes: 15_000_000,
    });
    expect(
      validateEventMediaInput({
        fileName: "event.mp4",
        contentType: "video/mp4",
        size: 120_000_000,
      }),
    ).toMatchObject({
      extension: "mp4",
      kind: "video",
      maxBytes: 250_000_000,
    });
  });

  it("rejects unsupported and oversized uploads", () => {
    expect(() =>
      validateEventMediaInput({
        fileName: "event.svg",
        contentType: "image/svg+xml",
        size: 1_000,
      }),
    ).toThrow("Use a JPEG");
    expect(() =>
      validateEventMediaInput({
        fileName: "huge.mov",
        contentType: "video/quicktime",
        size: 250_000_001,
      }),
    ).toThrow("Videos must be smaller");
  });

  it("keeps every object inside its organization UUID path", () => {
    const pathname = createEventMediaPath(
      organizationId,
      "image/jpeg",
      identifier,
    );
    expect(pathname).toBe(`events/${organizationId}/${identifier}.jpg`);
    expect(() =>
      assertEventMediaPath(pathname, organizationId, "jpg"),
    ).not.toThrow();
    expect(() =>
      assertEventMediaPath(
        `events/${organizationId}/../outside.jpg`,
        organizationId,
        "jpg",
      ),
    ).toThrow("destination is invalid");

    const venuePath = createVenueMediaPath(
      organizationId,
      "image/webp",
      identifier,
    );
    expect(venuePath).toBe(`venues/${organizationId}/${identifier}.webp`);
    expect(() =>
      assertVenueMediaPath(venuePath, organizationId, "webp"),
    ).not.toThrow();
    expect(() =>
      createVenueMediaPath(organizationId, "video/mp4", identifier),
    ).toThrow("safe venue image path");

    const courtPath = createCourtMediaPath(
      organizationId,
      "image/png",
      identifier,
    );
    expect(courtPath).toBe(`courts/${organizationId}/${identifier}.png`);
    expect(() =>
      assertCourtMediaPath(courtPath, organizationId, "png"),
    ).not.toThrow();
    expect(() =>
      assertCourtMediaPath(
        `courts/${organizationId}/../outside.png`,
        organizationId,
        "png",
      ),
    ).toThrow("destination is invalid");
    expect(() =>
      createCourtMediaPath(organizationId, "video/mp4", identifier),
    ).toThrow("safe court image path");
  });
});
