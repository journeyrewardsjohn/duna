import { describe, expect, it } from "vitest";
import { mobileUserDisplayName, mobileUserInitials } from "./identity";

describe("mobile account identity", () => {
  it("uses the WorkOS profile name and initials", () => {
    const user = {
      email: "mara@example.com",
      firstName: "Mara",
      id: "user_1",
      lastName: "Lewis",
    };
    expect(mobileUserDisplayName(user)).toBe("Mara Lewis");
    expect(mobileUserInitials(user)).toBe("ML");
  });

  it("falls back to the account email when no profile name exists", () => {
    const user = { email: "coach@example.com", id: "user_2" };
    expect(mobileUserDisplayName(user)).toBe("coach");
    expect(mobileUserInitials(user)).toBe("CO");
  });
});
