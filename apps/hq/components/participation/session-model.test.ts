import { participationDemo } from "@duna/core/demo/participation";
import { renderParticipationDisplay } from "@duna/core";
import { describe, expect, it } from "vitest";
import {
  DEMO_NOW,
  demoOccurrences,
  demoSessionIds,
} from "../offerings/offerings-demo";
import {
  attendanceOpen,
  cancelRefunds,
  mergeOptions,
  outcomeForState,
  sessionFromAtRisk,
  sessionFromOccurrence,
  sessionMatches,
} from "./session-model";

const now = new Date(DEMO_NOW);
const views = demoOccurrences.map((occurrence) =>
  sessionFromOccurrence(occurrence, {
    now,
    clubName: "South Bay Volleyball Club",
  }),
);
const byId = (id: string) => views.find((view) => view.id === id)!;

describe("a session's state in the shared words", () => {
  it("says the same thing the apps say, for every display state", () => {
    for (const quote of participationDemo.quotes.filter(
      (candidate) => candidate.hasGroupRule,
    )) {
      const view = byId(quote.subjectId);
      expect(view.state).toBe(quote.displayState);
      expect(view.status).toBe(quote.copy.status);
      expect(view.staff).toBe(renderParticipationDisplay(quote.display).staff);
    }
  });

  it("maps the server's state to the outcome the display derives it from", () => {
    expect(outcomeForState("confirmed")).toBe("minimum-met");
    expect(outcomeForState("running-small")).toBe("run-under-minimum");
    expect(outcomeForState("cancelled-low")).toBe("cancel-under-minimum");
    expect(outcomeForState("cancelled-club")).toBe("cancelled-by-club");
    expect(outcomeForState("needs-players")).toBeUndefined();
  });

  it("reads an at-risk row the same way", () => {
    const row = participationDemo.atRisk.sessions[0]!;
    const view = sessionFromAtRisk(row, { now });
    expect(view.status).toBe("Needs 1 more");
    expect(view.staff).toMatch(/^At risk · needs 1 by /);
    expect(view.bookings).toBeNull();
  });

  it("filters by what the owner looks for", () => {
    const semi = byId(demoSessionIds.semiPrivate);
    expect(sessionMatches(semi, "at-risk")).toBe(true);
    expect(sessionMatches(semi, "confirmed")).toBe(false);
    expect(
      views.filter((view) => sessionMatches(view, "cancelled")).length,
    ).toBeGreaterThan(0);
  });
});

describe("what the club's actions would do", () => {
  it("restates who gets what back on a cancellation", () => {
    const clinic = byId(demoSessionIds.thursdayClinic);
    const refunds = cancelRefunds(clinic);
    expect(refunds.people).toBe(clinic.bookings!.length);
    const credits = clinic
      .bookings!.filter((booking) => booking.method === "credit")
      .reduce((total, booking) => total + booking.reservedCredits, 0);
    expect(refunds.credits).toBe(credits);
    expect(refunds.lines[0]!.what).toMatch(
      /credits back to their wallet|card|released/,
    );
  });

  it("offers a merge with room, and refuses one that would raise a price", () => {
    const friday = byId(demoSessionIds.fridayClinic);
    const options = mergeOptions(friday, views, now);
    const thursday = options.find(
      (option) => option.into.id === demoSessionIds.thursdayClinic,
    )!;
    expect(thursday.refusal).toBeNull();
    expect(thursday.moving.length).toBe(friday.bookings!.length);
    const dearer = options.find(
      (option) => option.into.id === demoSessionIds.sundayMorningClinic,
    )!;
    expect(dearer.refusal).toMatch(/never makes anyone pay more/);
  });

  it("opens attendance once a session starts, never for a cancelled one", () => {
    expect(attendanceOpen(byId(demoSessionIds.mondayMorningClinic), now)).toBe(
      true,
    );
    expect(attendanceOpen(byId(demoSessionIds.semiPrivate), now)).toBe(false);
  });
});
