import type { SetupProposal, SetupReadiness, SetupRun } from "@duna/api";
import {
  setupDemoFailureReasons,
  setupDemoProposals,
  setupDemoReadiness,
  setupDemoRuns,
} from "@duna/core/demo/setup";
import { describe, expect, it } from "vitest";
import {
  applyLine,
  applySummary,
  appliedEntityLink,
  checkColour,
  decisionLabel,
  editFields,
  groupProposals,
  hoursSummary,
  isRunActive,
  nextPrerequisite,
  normaliseWebsiteInput,
  pageName,
  prerequisites,
  proposalConfidence,
  proposalQuotes,
  proposalValue,
  provenance,
  readPath,
  reviewGroupOf,
  runCopy,
  runNextLabels,
  setupFailureReasons,
  valueText,
  writePath,
} from "./setup-model";

const proposals = setupDemoProposals as SetupProposal[];
const runs = setupDemoRuns as SetupRun[];

const proposal = (over: Partial<SetupProposal>): SetupProposal => ({
  id: "00000000-0000-4000-8000-000000000001",
  runId: "00000000-0000-4000-8000-000000000002",
  category: "identity",
  fieldKey: "identity.name",
  label: "Club name",
  payload: { value: "Sunset Beach Club" },
  candidates: [],
  sourcePages: ["/"],
  needsCheck: false,
  decision: "pending",
  ...over,
});

describe("proposal grouping", () => {
  it("groups in review order and puts hours with contact, not places", () => {
    const groups = groupProposals(proposals);
    expect(groups.map((g) => g.key)).toEqual([
      "identity",
      "contact",
      "places",
      "offerings",
      "team",
      "policies",
    ]);
    const hours = proposals.find((p) => p.fieldKey === "places.hours")!;
    expect(reviewGroupOf(hours)).toBe("contact");
    expect(groups.find((g) => g.key === "contact")!.proposals).toContain(hours);
    expect(groups.find((g) => g.key === "places")!.proposals).not.toContain(
      hours,
    );
  });

  it("hides superseded proposals and counts each decision", () => {
    const groups = groupProposals(proposals);
    const all = groups.flatMap((g) => g.proposals);
    expect(all.some((p) => p.decision === "superseded")).toBe(false);
    const identity = groups.find((g) => g.key === "identity")!;
    expect(identity.applied).toBe(1);
    expect(identity.accepted).toBe(1);
  });

  it("says why Keep all leaves a conflict for the person", () => {
    const contact = groupProposals(proposals).find((g) => g.key === "contact")!;
    const phone = proposals.find((p) => p.fieldKey === "contact.phone")!;
    expect(contact.held).toEqual([
      { id: phone.id, why: expect.stringContaining("more than one value") },
    ]);
  });

  it("never calls a pending proposal kept or confirmed", () => {
    expect(decisionLabel("pending").text).toBe("Proposed");
    expect(decisionLabel("pending").text).not.toMatch(/kept|confirm|added/i);
    expect(decisionLabel("applied").text).toBe("Added to your club");
  });
});

describe("proposal values", () => {
  it("strips the description (confidence, quotes, before) from the value", () => {
    const p = proposal({
      payload: {
        value: "Sunset",
        confidence: "stated",
        quotes: [{ page: "/about", text: "Welcome to Sunset" }],
        before: "Old",
      },
    });
    expect(proposalValue(p)).toEqual({ value: "Sunset" });
    expect(proposalQuotes(p)).toEqual([
      { page: "/about", text: "Welcome to Sunset" },
    ]);
    expect(proposalValue({ ...p, editedPayload: { value: "Edited" } })).toEqual(
      { value: "Edited" },
    );
  });

  it("marks policies and model summaries as inferred", () => {
    expect(
      proposalConfidence(
        proposal({ payload: { value: "x", confidence: "inferred" } }),
      ),
    ).toBe("inferred");
    expect(
      proposalConfidence(
        proposal({
          fieldKey: "policies.cancellation",
          category: "policies",
          payload: {},
        }),
      ),
    ).toBe("inferred");
    expect(proposalConfidence(proposal({}))).toBe("stated");
  });

  it("writes each kind of value in plain words", () => {
    expect(valueText("identity.sports", { values: ["beach", "indoor"] })).toBe(
      "Beach volleyball and Indoor volleyball",
    );
    expect(
      valueText("offerings.item", {
        title: "Private lesson",
        kind: "service/private-lesson",
        durationMinutes: 60,
        price: { amountMinor: 15000, currency: "USD", per: "hour" },
      }),
    ).toBe("Private lesson · 60 min · $150.00 per hour");
    expect(
      valueText("offerings.item", { title: "Juniors", price: null }),
    ).toContain("No price yet");
    expect(valueText("places.venue", { name: "North", courtCount: 1 })).toBe(
      "North · 1 court",
    );
    expect(
      valueText("policies.cancellation", {
        summary: "24 hours notice",
        refundBeforeMinutes: 1440,
      }),
    ).toBe("24 hours notice · 1 day before");
  });

  it("summarises opening hours by runs of days", () => {
    const week = [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      opens: "08:00",
      closes: "21:00",
    }));
    expect(hoursSummary(week)).toBe("Mon–Fri 8:00 AM – 9:00 PM");
    expect(
      hoursSummary(
        [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          opens: "08:00",
          closes: "21:00",
        })),
      ),
    ).toBe("Every day 8:00 AM – 9:00 PM");
    expect(hoursSummary([])).toBe("No opening hours yet");
  });

  it("names pages the way people do", () => {
    expect(pageName("/")).toBe("Home page");
    expect(pageName("/contact-us")).toBe("Contact us page");
    expect(pageName("footer")).toBe("Site footer");
  });

  it("gives every field the same form a person fills", () => {
    for (const p of proposals)
      expect(editFields(p.fieldKey).length).toBeGreaterThan(0);
    const value = writePath(
      { name: "North" },
      "address.locality",
      "Santa Monica",
    );
    expect(readPath(value, "address.locality")).toBe("Santa Monica");
    expect(writePath(value, "name", "")).not.toHaveProperty("name");
  });
});

describe("run states and failure reasons", () => {
  it("has words and a next step for every run in the demo, every status and outcome", () => {
    for (const run of runs) {
      const copy = runCopy(run);
      expect(copy.title, run.id).toBeTruthy();
      expect(copy.body, run.id).toBeTruthy();
      expect(copy.next.length, run.id).toBeGreaterThan(0);
      for (const step of copy.next) expect(runNextLabels[step]).toBeTruthy();
    }
  });

  it("gives every failure reason its own plain message and a way forward", () => {
    expect([...setupFailureReasons].sort()).toEqual(
      [...setupDemoFailureReasons].sort(),
    );
    const titles = new Set<string>();
    for (const reason of setupFailureReasons) {
      const copy = runCopy({
        ...runs[0]!,
        status: "failed",
        failureReason: reason,
      });
      titles.add(copy.title);
      expect(copy.tone).toBe("warning");
      expect(
        copy.next.some((s) => s === "by-hand" || s === "try-another-address"),
      ).toBe(true);
      expect(copy.body).not.toMatch(
        /firecrawl|openai|anthropic|vercel|gateway/i,
      );
    }
    expect(titles.size).toBe(setupFailureReasons.length);
    const unknown = runCopy({
      ...runs[0]!,
      status: "failed",
      failureReason: "something-new",
    });
    expect(unknown.next).toContain("by-hand");
  });

  it("offers a stop while reading and a review once found", () => {
    const reading = runs.find((r) => r.status === "reading")!;
    expect(isRunActive(reading)).toBe(true);
    expect(runCopy(reading).next).toEqual(["cancel"]);
    const little = runs.find((r) => r.outcome === "found-very-little")!;
    expect(runCopy(little).next).toEqual(["review", "by-hand"]);
    const cancelled = runs.find((r) => r.status === "cancelled")!;
    expect(runCopy(cancelled).body).toMatch(/nothing it found was kept/i);
  });

  it("accepts the ways people write their address", () => {
    expect(normaliseWebsiteInput("club.example")).toBe("https://club.example/");
    expect(normaliseWebsiteInput("http://www.club.example/about")).toBe(
      "http://www.club.example/about",
    );
    expect(normaliseWebsiteInput("not a site")).toBeUndefined();
    expect(normaliseWebsiteInput("ftp://club.example")).toBeUndefined();
    expect(normaliseWebsiteInput("localhost")).toBeUndefined();
  });
});

describe("apply", () => {
  it("lists exactly what Apply writes, by group, and asks for the strong confirm for prices and policies", () => {
    const kept = proposals.map((p) =>
      p.decision === "pending" && p.candidates.length <= 1
        ? { ...p, decision: "kept" as const }
        : p,
    );
    const summary = applySummary(kept);
    expect(summary.count).toBe(
      kept.filter((p) => p.decision === "kept" || p.decision === "edited")
        .length,
    );
    expect(summary.strong).toBe(true);
    expect(summary.lines.find((l) => l.group === "offerings")?.text).toMatch(
      /draft offering.*not on sale/,
    );
    expect(summary.lines.find((l) => l.group === "policies")?.text).toMatch(
      /inactive draft refund policy/,
    );
    const identityOnly = applySummary(
      kept.filter((p) => p.category === "identity"),
    );
    expect(identityOnly.strong).toBe(false);
  });

  it("never says a live price changes or anyone is invited", () => {
    const existing = proposal({
      category: "offerings",
      fieldKey: "offerings.item",
      label: "Private lesson",
      payload: {
        title: "Private lesson",
        price: { amountMinor: 9000, currency: "USD" },
        before: { amountMinor: 8000 },
      },
    });
    expect(applyLine(existing)).toMatch(/live price is not changed/);
    expect(
      applyLine(
        proposal({
          category: "team",
          fieldKey: "team.member",
          payload: { displayName: "Ana" },
        }),
      ),
    ).toMatch(/nobody is invited/);
  });

  it("links each created thing to where it lives", () => {
    expect(appliedEntityLink({ type: "venue", id: "abc" })?.href).toBe(
      "/setup/places/abc",
    );
    expect(appliedEntityLink({ type: "catalog_item", id: "item" })?.href).toBe(
      "/offerings/item",
    );
    expect(
      appliedEntityLink({ type: "organization_refund_policy", id: "x" })?.href,
    ).toBe("/money/refund-policies");
    expect(appliedEntityLink(undefined)).toBeUndefined();
  });
});

describe("prerequisites on the setup home", () => {
  const readiness = setupDemoReadiness as SetupReadiness;

  it("lists the real steps in order with one next action each", () => {
    const list = prerequisites(readiness, {
      venues: 1,
      courts: 6,
      offerings: 4,
      liveOfferings: 0,
    });
    expect(list.map((i) => i.key)).toEqual([
      "identity",
      "places",
      "duna-pay",
      "offerings",
      "team",
      "website",
      "policies",
    ]);
    for (const item of list)
      expect(item.action.href.startsWith("/")).toBe(true);
    expect(
      list.filter((i) => i.state === "optional").map((i) => i.key),
    ).toEqual(["team", "policies"]);
  });

  it("says identity needs you when contact needs attention, and starts there", () => {
    const list = prerequisites(readiness, {
      venues: 1,
      courts: 6,
      offerings: 4,
      liveOfferings: 0,
    });
    const identity = list.find((i) => i.key === "identity")!;
    expect(identity.state).toBe("needs-you");
    expect(identity.detail).toBe("Pick a phone");
    expect(nextPrerequisite(list)?.key).toBe("identity");
  });

  it("links an offering that cannot go on sale straight to Duna Pay", () => {
    const list = prerequisites(readiness, {
      venues: 0,
      courts: 0,
      offerings: 0,
      liveOfferings: 0,
    });
    const offerings = list.find((i) => i.key === "offerings")!;
    expect(offerings.blockedBy).toEqual({
      key: "duna-pay",
      label: "Goes on sale once Duna Pay is ready",
      href: "/money/duna-pay",
    });
    expect(list.find((i) => i.key === "places")!.action.href).toBe(
      "/setup/places/create",
    );
  });

  it("is done when everything is complete", () => {
    const complete: SetupReadiness = {
      ...readiness,
      sections: readiness.sections.map((s) => ({
        ...s,
        state: "complete" as const,
      })),
    };
    const list = prerequisites(complete, {
      venues: 1,
      courts: 2,
      offerings: 1,
      liveOfferings: 1,
    });
    expect(list.every((i) => i.state === "done")).toBe(true);
    expect(nextPrerequisite(list)).toBeUndefined();
  });
});

describe("identity", () => {
  it("says where a value came from", () => {
    const profile = {
      websiteLastReadAt: "2026-11-28T10:00:00.000Z",
      fieldSources: {
        phoneE164: {
          source: "website" as const,
          page: "/contact",
          confirmed: false,
        },
        email: { source: "website" as const, confirmed: true },
        hours: { source: "person" as const, confirmed: true },
      },
    };
    expect(provenance(profile, "phoneE164")).toBe(
      "From your website on 28 Nov",
    );
    expect(provenance(profile, "email")).toBe("You confirmed this");
    expect(provenance(profile, "hours")).toBe("You edited this");
    expect(provenance(profile, "tagline")).toBeUndefined();
  });

  it("checks a club colour's contrast and keeps it away from the live colour", () => {
    expect(checkColour("#0E1A22").passesText).toBe(true);
    expect(checkColour("#F2542D").nearLive).toBe(true);
    expect(checkColour("nope").valid).toBe(false);
    expect(checkColour("#ffff00").verdict).toMatch(/:1/);
  });
});
