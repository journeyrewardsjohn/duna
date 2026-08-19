import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const builder = readFileSync(
  new URL("./guided-product-builder.tsx", import.meta.url),
  "utf8",
);
const draftReady = readFileSync(
  new URL("./product-draft-ready.tsx", import.meta.url),
  "utf8",
);

describe("guided product draft workflow", () => {
  it("keeps flexible online services valid until a real booking time exists", () => {
    expect(builder).not.toContain(
      '(deliveryMode !== "online" || sessionScheduleMode !== "flexible")',
    );
    expect(builder).toContain(
      "Flexible booking does not need preset session dates",
    );
  });

  it("makes the review acknowledgement an actual client and server save requirement", () => {
    expect(builder).toContain(
      "const draftSaveReady = editorSaveReady && confirmed;",
    );
    expect(builder).toContain('value={confirmed ? "true" : "false"}');
    expect(builder).toContain("disabled={!draftSaveReady || pending}");
    expect(builder).toContain("Before you can save");
    expect(builder).toContain("Complete {blocker.name}");
  });

  it("takes saved drafts to an explicit publish decision instead of returning to the editor", () => {
    expect(builder).toContain(
      "router.push(`/products/${state.entityId}/draft-ready`)",
    );
    expect(draftReady).toContain("Your changes are saved.");
    expect(draftReady).toContain("Publish Live");
    expect(draftReady).toContain("Edit draft");
    expect(draftReady).toContain("See all products");
  });
});
