import { describe, expect, it } from "vitest";
import { isPermissionDenied } from "./permission-denied";

describe("isPermissionDenied", () => {
  it("is true for a FORBIDDEN refusal, whatever its message", () => {
    expect(
      isPermissionDenied(Object.assign(new Error("x"), { code: "FORBIDDEN" })),
    ).toBe(true);
    expect(isPermissionDenied({ code: "FORBIDDEN" })).toBe(true);
  });

  it("looks through a cause chain", () => {
    const inner = Object.assign(new Error("inner"), { code: "FORBIDDEN" });
    expect(isPermissionDenied(new Error("outer", { cause: inner }))).toBe(true);
  });

  it("is false for every other failure", () => {
    expect(
      isPermissionDenied(
        Object.assign(new Error("x"), { code: "INTERNAL_SERVER_ERROR" }),
      ),
    ).toBe(false);
    expect(
      isPermissionDenied(new Error("Missing required scope: payments:read")),
    ).toBe(false);
    expect(isPermissionDenied(null)).toBe(false);
    expect(isPermissionDenied("FORBIDDEN")).toBe(false);
  });

  it("does not loop on a self-referencing cause", () => {
    const error: { code: string; cause?: unknown } = { code: "BAD" };
    error.cause = error;
    expect(isPermissionDenied(error)).toBe(false);
  });
});
