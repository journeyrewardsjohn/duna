import { describe, expect, it } from "vitest";
import {
  STANDARD_BEACH_COURT,
  buildCourtHeatmap,
  buildVolleyballPerformance,
  confidenceBand,
  evaluateBeachVolleyballRules,
  formatSessionTimeUs,
  isSessionTimeUs,
} from "./video-analysis";

describe("Duna Vision analysis primitives", () => {
  it("keeps only visible, calibrated court observations in a heatmap", () => {
    const heatmap = buildCourtHeatmap({
      court: STANDARD_BEACH_COURT,
      observations: [
        {
          xMeters: 1,
          yMeters: 2,
          observed: "visible",
          confidence: 0.94,
        },
        {
          xMeters: 1.2,
          yMeters: 2.1,
          observed: "visible",
          source: "human",
        },
        {
          xMeters: 7.9,
          yMeters: 15.8,
          observed: "edge",
          confidence: 0.99,
        },
        {
          xMeters: 10,
          yMeters: 3,
          observed: "visible",
          confidence: 0.99,
        },
      ],
    });

    expect(heatmap.observedCount).toBe(2);
    expect(heatmap.cells[0]).toMatchObject({
      column: 0,
      row: 1,
      count: 2,
      confidence: "verified",
    });
    expect(heatmap.summary).toContain("2 visible ball landings");
  });

  it("keeps time and confidence claims bounded", () => {
    expect(isSessionTimeUs(43_200_000_000)).toBe(true);
    expect(isSessionTimeUs(43_200_000_001)).toBe(false);
    expect(confidenceBand(0.95)).toBe("high");
    expect(confidenceBand(0.75)).toBe("medium");
    expect(confidenceBand(undefined)).toBe("unavailable");
    expect(formatSessionTimeUs(3_661_000_000)).toBe("1:01:01");
  });

  it("derives volleyball-native rates only from qualified observations", () => {
    const rallyId = crypto.randomUUID();
    const report = buildVolleyballPerformance([
      {
        eventType: "rally-ended",
        sessionTimeUs: 20_000_000,
        durationUs: 8_000_000,
        confidence: 0.94,
        source: "model",
        payload: { rallyId },
      },
      {
        eventType: "ball-contact",
        sessionTimeUs: 12_000_000,
        confidence: 0.93,
        source: "model",
        payload: {
          rallyId,
          contactKind: "serve",
          outcome: "ace",
          side: "a",
          speedKph: 78.4,
        },
      },
      {
        eventType: "ball-contact",
        sessionTimeUs: 16_000_000,
        confidence: 0.91,
        source: "model",
        payload: {
          rallyId,
          contactKind: "attack",
          outcome: "kill",
          side: "a",
        },
      },
      {
        eventType: "ball-contact",
        sessionTimeUs: 17_000_000,
        confidence: 0.3,
        source: "model",
        payload: {
          rallyId,
          contactKind: "attack",
          outcome: "error",
          side: "a",
        },
      },
      {
        eventType: "ball-contact",
        sessionTimeUs: 18_000_000,
        source: "human",
        payload: {
          rallyId,
          contactKind: "dig",
          outcome: "positive",
          side: "b",
        },
      },
    ]);

    expect(report).toMatchObject({
      rallyCount: 1,
      averageRallySeconds: 8,
      longestRallySeconds: 8,
      averageContactsPerRally: 3,
      contactObservations: 3,
      attributedContacts: 3,
      verifiedObservations: 1,
      needsReview: 1,
      maxServeSpeedKph: 78.4,
    });
    expect(report.sides.find((side) => side.side === "a")).toMatchObject({
      serves: 1,
      aces: 1,
      attacks: 1,
      kills: 1,
      attackErrors: 0,
      attackEfficiency: 1,
      aceRate: 1,
    });
  });

  it("does not convert absent model evidence into zero-performance claims", () => {
    const report = buildVolleyballPerformance([]);

    expect(report.contactObservations).toBe(0);
    expect(report.averageRallySeconds).toBeUndefined();
    expect(report.maxAttackSpeedKph).toBeUndefined();
    expect(report.summary).toContain("not available");
  });

  it("keeps beach rules unavailable without complete trusted evidence", () => {
    const rallyId = crypto.randomUUID();
    const findings = evaluateBeachVolleyballRules([
      {
        eventType: "ball-contact",
        sessionTimeUs: 1_000_000,
        confidence: 0.94,
        source: "model",
        payload: { rallyId, contactKind: "serve", side: "a" },
      },
    ]);

    expect(
      findings.find((finding) => finding.ruleId === "three-team-contacts"),
    ).toMatchObject({ verdict: "unavailable" });
    expect(
      findings.find(
        (finding) => finding.ruleId === "consecutive-player-contact",
      ),
    ).toMatchObject({ verdict: "unavailable" });
  });

  it("evaluates bounded trusted 2s contacts without inferring 3D height", () => {
    const rallyId = crypto.randomUUID();
    const contact = (
      sessionTimeUs: number,
      playerId: string,
      kind: "serve" | "reception" | "set",
    ) => ({
      eventType: "ball-contact" as const,
      sessionTimeUs,
      confidence: 0.96,
      source: "model" as const,
      payload: {
        rallyId,
        rallySequenceComplete: true,
        contactKind: kind,
        side: sessionTimeUs === 1_000_000 ? ("a" as const) : ("b" as const),
        playerId,
        contactQuality: {
          evidenceVersion: "duna-contact-evidence-v1" as const,
          evidence: "visible-2d" as const,
        },
      },
    });
    const findings = evaluateBeachVolleyballRules([
      contact(1_000_000, crypto.randomUUID(), "serve"),
      contact(2_000_000, crypto.randomUUID(), "reception"),
      contact(3_000_000, crypto.randomUUID(), "set"),
    ]);

    expect(
      findings.find((finding) => finding.ruleId === "serve-starts-rally"),
    ).toMatchObject({ verdict: "pass" });
    expect(
      findings.find((finding) => finding.ruleId === "three-team-contacts"),
    ).toMatchObject({ verdict: "pass" });
  });
});
