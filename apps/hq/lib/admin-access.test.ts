import { describe, expect, it } from "vitest";
import { isAdminAccessDenied } from "./admin-access";

describe("administration access denial", () => {
  it("recognizes the authorization code regardless of the protected endpoint's wording", () => {
    for (const message of [
      "Platform administration access required",
      "Super Admin access required",
    ]) {
      expect(
        isAdminAccessDenied(
          Object.assign(new Error(message), { code: "FORBIDDEN" }),
        ),
      ).toBe(true);
    }
  });
  it("does not conceal service failures or infer access from an error message", () => {
    for (const error of [
      null,
      undefined,
      "FORBIDDEN",
      new Error("Super Admin access required"),
      { code: "INTERNAL_SERVER_ERROR" },
      { code: "NOT_FOUND" },
    ]) {
      expect(isAdminAccessDenied(error)).toBe(false);
    }
  });
});
