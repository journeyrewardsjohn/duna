import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const actionFormSource = readFileSync(
  new URL("./messaging-action-form.tsx", import.meta.url),
  "utf8",
);

describe("HQ messaging form", () => {
  it("keeps the operator draft when a server validation stays inline", () => {
    expect(actionFormSource).toContain("event.preventDefault()");
    expect(actionFormSource).toContain("new FormData(event.currentTarget)");
    expect(actionFormSource).toContain(
      "startTransition(() => formAction(formData))",
    );
  });
});
