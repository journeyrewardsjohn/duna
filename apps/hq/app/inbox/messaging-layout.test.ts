import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("./messaging.module.css", import.meta.url),
  "utf8",
);
const actionFormSource = readFileSync(
  new URL("./messaging-action-form.tsx", import.meta.url),
  "utf8",
);

function ruleBody(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = stylesheet.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`),
  );

  return match?.[1] ?? "";
}

describe("HQ messaging layout", () => {
  it("keeps compose actions inside a fixed footer while fields scroll", () => {
    expect(ruleBody(".workspace > *")).toMatch(/min-height:\s*0;/);
    expect(ruleBody(".composePanel > form")).toMatch(
      /grid-template-rows:\s*minmax\(0,\s*1fr\)\s*auto;/,
    );
    expect(ruleBody(".composePanel > form")).toMatch(/overflow:\s*hidden;/);
    expect(ruleBody(".composeFields")).toMatch(/overflow:\s*auto;/);
    expect(actionFormSource).toContain(
      "<footer className={styles.composeActions}>",
    );
  });

  it("keeps the operator draft when a server validation stays inline", () => {
    expect(actionFormSource).toContain("event.preventDefault()");
    expect(actionFormSource).toContain("new FormData(event.currentTarget)");
    expect(actionFormSource).toContain(
      "startTransition(() => formAction(formData))",
    );
  });
});
