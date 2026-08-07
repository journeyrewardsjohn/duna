import { describe, expect, it } from "vitest";
import {
  createPublicCaller,
  createPublicCallerFromRequest,
} from "./public-api";

describe("public API caller", () => {
  it("reads public data without an AuthKit middleware session", async () => {
    const caller = createPublicCallerFromRequest(
      new Request("https://duna.coach/api/public-markdown?path=/rankings", {
        headers: {
          "user-agent": "Duna Markdown regression test",
          "x-forwarded-for": "203.0.113.7",
        },
      }),
    );

    const health = await caller.public.health();
    expect(health.status).toBe("ok");
  });

  it("supports public metadata generation without request state", async () => {
    const health = await createPublicCaller().public.health();
    expect(health.service).toBe("duna-api");
  });
});
