import type { ConversationSummary } from "@duna/messaging-client";
import { describe, expect, it } from "vitest";
import {
  eligibleInitialRecipient,
  filterInbox,
  parseInboxFilter,
} from "./inbox-filters";
const conversations = [
  {
    id: "family",
    title: "Rivera family",
    unreadCount: 2,
    participants: [{ displayName: "Mia Rivera" }],
    safety: { minorPresent: true },
    context: { type: "lesson", label: "Junior lessons" },
  },
  {
    id: "league",
    title: "Summer league",
    unreadCount: 0,
    participants: [],
    safety: { minorPresent: false },
    context: { type: "league", label: "Adults" },
  },
  {
    id: "adult",
    title: "Private question",
    unreadCount: 0,
    participants: [],
    safety: { minorPresent: false },
  },
] as ConversationSummary[];
describe("operator inbox views", () => {
  it("combines activity, unread and family views with search", () => {
    expect(filterInbox(conversations, "unread").map((row) => row.id)).toEqual([
      "family",
    ]);
    expect(
      filterInbox(conversations, "families", "MIA").map((row) => row.id),
    ).toEqual(["family"]);
    expect(
      filterInbox(conversations, "activities").map((row) => row.id),
    ).toEqual(["family", "league"]);
    expect(filterInbox(conversations, "activities", "missing")).toEqual([]);
  });
  it("defaults unknown views to all", () => {
    expect(parseInboxFilter("forged")).toBe("all");
  });
  it("preselects only a current eligible recipient", () => {
    expect(eligibleInitialRecipient([{ personId: "allowed" }], "allowed")).toBe(
      "allowed",
    );
    expect(
      eligibleInitialRecipient([{ personId: "allowed" }], "revoked"),
    ).toBeUndefined();
  });
});
