import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const venueCreateSource = readFileSync(
  new URL("./venue-create-workspace.tsx", import.meta.url),
  "utf8",
);
const themeKitSource = readFileSync(
  new URL("./commerce-controls.tsx", import.meta.url),
  "utf8",
);

describe("venue and brand uploads", () => {
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
