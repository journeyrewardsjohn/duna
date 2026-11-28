import { matchStatusEnum } from "@duna/db/schema";
import { describe, expect, it } from "vitest";
import { w3MatchStatusSchema } from "./w3-common";

describe("w3 common shapes", () => {
  it("offers every match_status, including not-finished", () => {
    expect(w3MatchStatusSchema.options).toEqual(matchStatusEnum.enumValues);
    expect(w3MatchStatusSchema.options).toContain("not-finished");
    expect(w3MatchStatusSchema.parse("not-finished")).toBe("not-finished");
  });
});
