import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const venueStyles = readFileSync(
  new URL("../app/design-v3.css", import.meta.url),
  "utf8",
);
const themeStyles = readFileSync(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);
const venueCreateSource = readFileSync(
  new URL("./venue-create-workspace.tsx", import.meta.url),
  "utf8",
);
const themeKitSource = readFileSync(
  new URL("./commerce-controls.tsx", import.meta.url),
  "utf8",
);

describe("venue and settings readability", () => {
  it("gives venue controls independent, readable typography", () => {
    expect(venueStyles).toContain("font-size: max(0.8rem, 13px);");
    expect(venueStyles).toContain("font-size: max(0.9rem, 14px);");
    expect(venueStyles).toContain("font-weight: 450;");
    expect(venueStyles).toContain(".venue-create-image-field");
  });

  it("keeps theme asset controls on semantic light and dark surfaces", () => {
    expect(themeStyles).toMatch(
      /\.theme-asset \{[\s\S]*?background: var\(--surface-2\);/,
    );
    expect(themeStyles).toMatch(
      /\.theme-asset > strong \{[\s\S]*?color: var\(--text-1\);/,
    );
    expect(themeStyles).toMatch(
      /\.theme-asset__upload > span \{[\s\S]*?color: var\(--btn-primary-fg\);/,
    );
    expect(themeStyles).toMatch(
      /\.theme-kit-editor \.theme-kit-preview \.theme-kit-preview__copy h3 \{[\s\S]*?color: var\(--theme-preview-ink\);/,
    );
  });

  it("offers uploads beside venue and brand URLs without a media-type dropdown", () => {
    expect(venueCreateSource).toContain('purpose: "venue"');
    expect(venueCreateSource).toContain('type="file"');
    expect(themeKitSource).toContain('uploadBrandMedia(file, "heroPosterUrl")');
    expect(themeKitSource).toContain('name="heroMediaType"');
    expect(themeKitSource).not.toMatch(
      /<select[\s\S]{0,160}name="heroMediaType"/,
    );
  });
});
