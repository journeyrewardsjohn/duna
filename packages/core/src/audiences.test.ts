import { describe, expect, it } from "vitest";
import {
  audienceRuleHash,
  canonicalizeAudienceRuleAst,
  evaluateAudienceRule,
} from "./audiences";

const rule = {
  version: 1 as const,
  root: {
    kind: "group" as const,
    operator: "all" as const,
    rules: [
      {
        kind: "condition" as const,
        fact: "person-type" as const,
        operator: "is" as const,
        value: "player",
      },
      {
        kind: "condition" as const,
        fact: "payment-state" as const,
        operator: "is" as const,
        value: "failed",
      },
    ],
  },
};

describe("audience rules", () => {
  it("canonicalizes group ordering and produces a stable revision hash", () => {
    const reversed = {
      ...rule,
      root: { ...rule.root, rules: [...rule.root.rules].reverse() },
    };
    expect(audienceRuleHash(rule)).toBe(audienceRuleHash(reversed));
  });

  it("evaluates allowlisted facts and fails closed when a fact is unavailable", () => {
    expect(
      evaluateAudienceRule(rule, {
        personType: "player",
        paymentStates: ["failed"],
      }).matches,
    ).toBe(true);
    const result = evaluateAudienceRule(rule, { personType: "player" });
    expect(result.matches).toBe(false);
    expect(result.unavailable).toContain("payment-state");
  });

  it("rejects arbitrary facts and excessive nesting", () => {
    expect(() =>
      canonicalizeAudienceRuleAst({
        version: 1,
        root: {
          kind: "group",
          operator: "all",
          rules: [
            {
              kind: "condition",
              fact: "sql" as never,
              operator: "is",
              value: "x",
            },
          ],
        },
      }),
    ).toThrow("unknown fact");
  });
});
