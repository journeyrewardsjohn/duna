import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const venueCreateSource = readFileSync(
  new URL("./venue-create-workspace.tsx", import.meta.url),
  "utf8",
);

// Brand uploads moved to Club setup › Identity (components/setup/brand-editor.tsx).
describe("venue uploads", () => {
  it("offers an upload beside the venue's image address", () => {
    expect(venueCreateSource).toContain('purpose: "venue"');
    expect(venueCreateSource).toContain('type="file"');
  });
});
