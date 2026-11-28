import { describe, expect, it } from "vitest";
import {
  isHiddenTidelineGalleryRoute,
  isTidelineGalleryEnabled,
} from "./gallery-guard";

describe("Tideline gallery guard", () => {
  it("hides every gallery route unless TIDELINE_GALLERY=1", () => {
    for (const env of [
      {},
      { TIDELINE_GALLERY: "0" },
      { TIDELINE_GALLERY: "true" },
    ]) {
      expect(isTidelineGalleryEnabled(env)).toBe(false);
      expect(isHiddenTidelineGalleryRoute("/tideline", env)).toBe(true);
      expect(isHiddenTidelineGalleryRoute("/tideline/book-lesson", env)).toBe(
        true,
      );
    }
  });

  it("serves the gallery with the flag", () => {
    const env = { TIDELINE_GALLERY: "1" };
    expect(isHiddenTidelineGalleryRoute("/tideline", env)).toBe(false);
    expect(isHiddenTidelineGalleryRoute("/tideline/book-lesson", env)).toBe(
      false,
    );
  });

  it("never matches product routes that merely share the prefix", () => {
    expect(isHiddenTidelineGalleryRoute("/tidelines", {})).toBe(false);
    expect(isHiddenTidelineGalleryRoute("/settings/tideline", {})).toBe(false);
    expect(isHiddenTidelineGalleryRoute("/", {})).toBe(false);
  });
});
