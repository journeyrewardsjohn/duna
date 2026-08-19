import { describe, expect, it } from "vitest";
import {
  generateBookableSessionOccurrences,
  type SessionDeliveryConfiguration,
} from "./session-delivery";

const configuration: SessionDeliveryConfiguration = {
  durationMinutes: 60,
  deliveryMode: "online",
  coachAssignmentMode: "selected",
  coachPersonIds: ["coach-1"],
  requiredCoachCount: 1,
  customerCoachSelection: true,
  virtualDelivery: {
    provider: "google-meet",
    createMeetingOnPurchase: true,
    inviteCoach: true,
    invitePlayer: true,
    autoRecord: true,
    autoTranscribe: true,
    generateAiSummary: true,
    recordingConsentRequired: true,
  },
  sessionSchedule: {
    mode: "recurring",
    timezone: "America/New_York",
    startsOn: "2026-08-17",
    endsOn: "2026-09-30",
    weekly: [{ weekday: 2, startsAt: "17:00" }],
    oneOff: [],
    blackoutDates: ["2026-08-25"],
  },
};

describe("generateBookableSessionOccurrences", () => {
  it("overlays recurrence, blackouts, coach availability, and busy time", () => {
    const occurrences = generateBookableSessionOccurrences({
      configuration,
      coaches: [
        {
          personId: "coach-1",
          displayName: "Coach One",
          availability: [
            { weekday: 2, startsAt: "16:00", endsAt: "20:00" },
            {
              kind: "blackout",
              startsOn: "2026-09-08",
              startsAt: "00:00",
              endsAt: "23:59",
            },
          ],
          busyRanges: [
            {
              startsAt: "2026-09-15T20:30:00.000Z",
              endsAt: "2026-09-15T22:00:00.000Z",
            },
          ],
        },
      ],
      now: new Date("2026-08-18T12:00:00.000Z"),
    });

    expect(occurrences.map((occurrence) => occurrence.localDate)).toEqual([
      "2026-08-18",
      "2026-09-01",
      "2026-09-22",
      "2026-09-29",
    ]);
    expect(occurrences[0]?.startsAt).toBe("2026-08-18T21:00:00.000Z");
  });

  it("hides a session when fewer than the required coaches are available", () => {
    const occurrences = generateBookableSessionOccurrences({
      configuration: { ...configuration, requiredCoachCount: 2 },
      coaches: [
        {
          personId: "coach-1",
          displayName: "Coach One",
          availability: [{ weekday: 2, startsAt: "16:00", endsAt: "20:00" }],
        },
      ],
      now: new Date("2026-08-18T12:00:00.000Z"),
    });
    expect(occurrences).toEqual([]);
  });
});
