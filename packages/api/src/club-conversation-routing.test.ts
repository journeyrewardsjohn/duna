import { describe, expect, it } from "vitest";
import { resolveClubDestination } from "./club-conversation-routing";
const destinations = [
  {
    organizationId: "north",
    label: "North Beach Club",
    conversationIds: ["north-thread"],
  },
  {
    organizationId: "south",
    label: "South Beach Club",
    conversationIds: ["south-thread"],
  },
];
describe("club conversation routing", () => {
  it("continues an authorized thread before interpreting prose", () => {
    expect(
      resolveClubDestination({
        destinations,
        conversationId: "north-thread",
        message: "South Beach Club",
      }),
    ).toMatchObject({
      status: "routed",
      organizationId: "north",
      reason: "conversation",
    });
  });
  it("never moves thread history into a different explicitly selected club", () => {
    expect(
      resolveClubDestination({
        destinations,
        conversationId: "north-thread",
        selectedOrganizationId: "south",
      }),
    ).toMatchObject({ status: "clarify", reason: "conflicting-context" });
  });
  it("uses a selected authorized club before a name in prose", () => {
    expect(
      resolveClubDestination({
        destinations,
        selectedOrganizationId: "north",
        message: "South Beach Club",
      }),
    ).toMatchObject({
      status: "routed",
      organizationId: "north",
      reason: "selection",
    });
  });
  it("recognizes a whole unambiguous club name", () => {
    expect(
      resolveClubDestination({
        destinations,
        message: "Question for NORTH BEACH CLUB: lessons?",
      }),
    ).toMatchObject({
      status: "routed",
      organizationId: "north",
      reason: "named-club",
    });
  });
  it.each([
    "Move her Tuesday lesson",
    "North Beach Club or South Beach Club?",
    "North Beach Clubhouse",
  ])("withholds ambiguous or partial name request: %s", (message) => {
    const result = resolveClubDestination({ destinations, message });
    expect(result.status).toBe("clarify");
    expect(result).not.toHaveProperty("organizationId");
  });
  it("requires clarification even for one historic club", () => {
    expect(
      resolveClubDestination({
        destinations: destinations.slice(0, 1),
        message: "Move her lesson",
      }).status,
    ).toBe("clarify");
  });
  it("fails closed on stale/revoked or forged context", () => {
    expect(
      resolveClubDestination({
        destinations,
        conversationId: "revoked",
        selectedOrganizationId: "north",
      }),
    ).toMatchObject({ status: "clarify", reason: "unavailable-context" });
    expect(
      resolveClubDestination({
        destinations,
        selectedOrganizationId: "unknown",
      }),
    ).toMatchObject({ status: "clarify", reason: "unavailable-context" });
  });
  it("never exposes clubs not supplied by the authorization layer", () => {
    expect(
      resolveClubDestination({ destinations: [], message: "North Beach Club" }),
    ).toEqual({ status: "clarify", reason: "choose-club", choices: [] });
  });
});
