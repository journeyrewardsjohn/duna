import { describe, expect, it } from "vitest";
import {
  DUNA_EVENT_MEDIA,
  defaultEventMedia,
  eventMediaForKind,
} from "./event-media";

describe("event media library", () => {
  it("keeps a broad, unique set of optimized covers", () => {
    expect(DUNA_EVENT_MEDIA).toHaveLength(20);
    expect(new Set(DUNA_EVENT_MEDIA.map((item) => item.id)).size).toBe(20);
    expect(
      DUNA_EVENT_MEDIA.every((item) =>
        item.path.startsWith("/media/event-library/duna-event-"),
      ),
    ).toBe(true);
  });

  it("prioritizes covers that fit the event type", () => {
    const choices = eventMediaForKind("clinic");
    expect(choices[0]?.kinds).toContain("clinic");
    expect(choices).toHaveLength(DUNA_EVENT_MEDIA.length);
  });

  it("selects a stable fallback for the same event", () => {
    expect(defaultEventMedia("tournament", "summer-open")).toEqual(
      defaultEventMedia("tournament", "summer-open"),
    );
  });
});
