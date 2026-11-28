import { householdsDemo } from "@duna/core/demo/households";
import {
  householdConsentDecisions,
  householdConsentKinds,
  householdConsentMethods,
  householdInvitationStatuses,
  householdMemberRoles,
  householdMemberStatuses,
} from "@duna/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiContext, createDemoActor } from "../context";
import { createCaller } from "../router";
import { isNotImplementedYet } from "../routers/not-implemented";
import {
  householdsConsentSchema,
  householdsGuardianLinkStatusSchema,
  householdsHouseholdSchema,
  householdsInvitationPreviewSchema,
} from "./households";
import { expectCoverage } from "./w3-test-support";

const dataSource = vi.hoisted(() => ({ demo: true }));
vi.mock("../services/data-source", () => ({
  usesDemoData: () => dataSource.demo,
}));

describe("households contract and demo fixtures (W3-0)", () => {
  it("every fixture parses against its contract", () => {
    householdsHouseholdSchema.parse(householdsDemo.household);
    householdsInvitationPreviewSchema.parse(householdsDemo.invitationPreview);
    for (const consent of householdsDemo.consents)
      householdsConsentSchema.parse(consent);
  });

  it("covers every state", () => {
    const { members, invitations, guardianLinks } = householdsDemo.household;
    expectCoverage(
      householdMemberRoles,
      members.map((m) => m.role),
    );
    expectCoverage(
      householdMemberStatuses,
      members.map((m) => m.status),
    );
    expectCoverage(
      householdInvitationStatuses,
      invitations.map((i) => i.status),
    );
    expectCoverage(
      householdConsentKinds,
      householdsDemo.consents.map((c) => c.kind),
    );
    expectCoverage(
      householdConsentDecisions,
      householdsDemo.consents.map((c) => c.decision),
    );
    expectCoverage(
      householdConsentMethods,
      householdsDemo.consents.map((c) => c.method),
    );
    expectCoverage(
      householdsGuardianLinkStatusSchema.options,
      guardianLinks.map((l) => l.reviewStatus),
    );
  });

  it("gives every child profile a guardian account holder", () => {
    for (const member of householdsDemo.household.members) {
      if (member.role === "child") {
        expect(member.managed).toBe(true);
        expect("accountHolder" in member && member.accountHolder).toBeTruthy();
      }
    }
  });
});

describe("player.households in demo mode and connected mode (W3-0 stubs)", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    dataSource.demo = true;
  });

  const caller = () =>
    createCaller(createApiContext({ actor: createDemoActor() })).player
      .households;

  it("serves fixtures in demo mode", async () => {
    const households = caller();
    const household = await households.mine();
    expect(household?.members.length).toBeGreaterThan(3);
    const invite = await households.invite({
      role: "guardian",
      contact: { email: "co-guardian@example.com" },
    });
    expect(JSON.stringify(invite.invitation)).not.toContain(
      "co-guardian@example.com",
    );
    const card = await households.recordConsent({
      childPersonId: household!.members[2]!.person.personId,
      kind: "verifiable-parental-consent",
      decision: "granted",
      method: "card-verification",
      disclosureVersion: "1.0-draft",
      disclosureTextHash: "a".repeat(64),
    });
    expect(card.state).toBe("provider-not-configured");
  });

  it("says 'not implemented yet' outside demo mode", async () => {
    dataSource.demo = false;
    const error = await caller()
      .mine()
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(isNotImplementedYet(error)).toBe(true);
  });
});
