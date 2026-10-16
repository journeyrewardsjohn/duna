import { describe, expect, it } from "vitest";
import { getAskDunaInternalHref } from "./ask-duna-links";

describe("Ask Duna internal navigation", () => {
  it("keeps product paths, query strings and fragments in HQ", () => {
    for (const href of [
      "/settings/theme",
      "/settings?section=business#details",
      "/ask/30000000-0000-4000-8000-000000000001",
    ])
      expect(getAskDunaInternalHref(href)).toBe(href);
  });

  it("does not bypass link review for external, protocol-relative or disguised destinations", () => {
    for (const href of [
      undefined,
      "https://example.com/settings",
      "javascript:alert(1)",
      "//example.com/settings",
      "/\\example.com/settings",
      "/\n/example.com/settings",
      "/path/../../..//example.com/settings",
    ])
      expect(getAskDunaInternalHref(href)).toBeNull();
  });
});
