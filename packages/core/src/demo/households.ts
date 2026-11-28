/**
 * Demo fixtures: households (owner: FAM). Mara Lewis (the demo player) and
 * her household: a co-guardian, a managed 11-year-old (Remy, account held
 * by Mara) and a 15-year-old (Sky) — the same children as the Health
 * fixtures (`healthDemoIds`) — invitations in every status, consents in
 * every kind, decision and method. Fictional people only.
 */
import { demoPeople, demoPlayer } from "../demo";
import { healthDemoIds } from "./health";
import { demoId } from "./ids";

const ref = (personId: string, displayName: string) => ({
  personId,
  displayName,
});
const mara = ref(demoPlayer.id, demoPlayer.displayName);
const coGuardian = ref(demoPeople[1]!.id, demoPeople[1]!.displayName);
const sky = ref(healthDemoIds.teen, "Sky Lewis");
const remy = ref(healthDemoIds.child, "Remy Lewis");
const formerMember = ref(demoId("households", 90), "Jules Lewis");

export const householdsDemoIds = {
  household: demoId("households", 1),
  pendingInvitation: demoId("households", 30),
  maraMember: demoId("households", 10),
  remyMember: demoId("households", 12),
} as const;

export const householdsDemoMembers = [
  {
    id: householdsDemoIds.maraMember,
    person: mara,
    role: "guardian" as const,
    ageBand: "adult" as const,
    managed: false,
    status: "active" as const,
    joinedAt: "2026-09-01T17:00:00.000Z",
  },
  {
    id: demoId("households", 11),
    person: coGuardian,
    role: "adult" as const,
    ageBand: "adult" as const,
    managed: false,
    status: "active" as const,
    joinedAt: "2026-09-03T17:00:00.000Z",
  },
  {
    id: householdsDemoIds.remyMember,
    person: remy,
    role: "child" as const,
    ageBand: "under-13" as const,
    managed: true,
    accountHolder: mara,
    status: "active" as const,
    joinedAt: "2026-09-01T17:05:00.000Z",
  },
  {
    id: demoId("households", 13),
    person: sky,
    role: "teen" as const,
    ageBand: "teen" as const,
    managed: false,
    status: "active" as const,
    joinedAt: "2026-09-02T17:00:00.000Z",
  },
  {
    id: demoId("households", 14),
    person: formerMember,
    role: "child" as const,
    ageBand: "unknown" as const,
    managed: true,
    accountHolder: mara,
    status: "removed" as const,
    joinedAt: "2026-09-01T17:10:00.000Z",
    removedAt: "2026-11-25T17:00:00.000Z",
    deletionScheduledAt: "2026-12-02T17:00:00.000Z",
  },
];

const invitation = (
  n: number,
  role: "guardian" | "adult" | "teen",
  status: "pending" | "accepted" | "declined" | "expired" | "cancelled",
  extra: Record<string, unknown> = {},
) => ({
  id: demoId("households", 30 + n),
  role,
  invitedBy: mara,
  contactHint: "a••••@example.com",
  status,
  expiresAt: "2026-12-04T17:00:00.000Z",
  createdAt: "2026-11-27T17:00:00.000Z",
  ...(status === "pending" ? {} : { respondedAt: "2026-11-27T19:00:00.000Z" }),
  ...extra,
});

export const householdsDemoInvitations = [
  invitation(0, "guardian", "pending", { concerns: remy }),
  invitation(1, "adult", "accepted", { acceptedBy: coGuardian }),
  invitation(2, "teen", "declined"),
  invitation(3, "guardian", "expired", {
    expiresAt: "2026-11-20T17:00:00.000Z",
  }),
  invitation(4, "adult", "cancelled"),
];

export const householdsDemoGuardianLinks = [
  {
    guardian: mara,
    minor: remy,
    relationship: "Parent or legal guardian",
    reviewStatus: "verified" as const,
  },
  {
    guardian: mara,
    minor: sky,
    relationship: "Parent or legal guardian",
    reviewStatus: "verified" as const,
  },
  {
    guardian: coGuardian,
    minor: remy,
    relationship: "Parent or legal guardian",
    reviewStatus: "pending" as const,
  },
  {
    guardian: formerMember,
    minor: sky,
    relationship: "Aunt",
    reviewStatus: "rejected" as const,
  },
];

const hash = (seed: string) => seed.repeat(64).slice(0, 64);
const consent = (
  n: number,
  child: { personId: string; displayName: string },
  kind:
    | "account"
    | "verifiable-parental-consent"
    | "public-profile"
    | "video"
    | "messaging"
    | "location",
  decision: "granted" | "denied" | "withdrawn",
  method:
    | "checkbox-attestation"
    | "card-verification"
    | "signed-attestation"
    | "identity-provider"
    | "admin-review",
) => ({
  id: demoId("households", 50 + n),
  guardian: mara,
  child,
  kind,
  decision,
  method,
  disclosureVersion: "1.0-draft",
  disclosureTextHash: hash(String(n % 10)),
  occurredAt: `2026-11-${String(10 + n).padStart(2, "0")}T17:00:00.000Z`,
});

export const householdsDemoConsents = [
  consent(1, remy, "account", "granted", "checkbox-attestation"),
  consent(
    2,
    remy,
    "verifiable-parental-consent",
    "granted",
    "card-verification",
  ),
  consent(3, remy, "public-profile", "denied", "checkbox-attestation"),
  consent(4, remy, "video", "granted", "signed-attestation"),
  consent(5, sky, "messaging", "granted", "identity-provider"),
  consent(6, sky, "location", "withdrawn", "checkbox-attestation"),
  consent(7, remy, "messaging", "granted", "admin-review"),
];

export const householdsDemoHousehold = {
  id: householdsDemoIds.household,
  name: "Lewis household",
  createdBy: mara,
  members: householdsDemoMembers,
  invitations: householdsDemoInvitations,
  guardianLinks: householdsDemoGuardianLinks,
  createdAt: "2026-09-01T17:00:00.000Z",
};

export const householdsDemoInvitationPreview = {
  householdName: householdsDemoHousehold.name,
  invitedBy: mara,
  role: "guardian" as const,
  concerns: remy,
  status: "pending" as const,
  expiresAt: "2026-12-04T17:00:00.000Z",
};

/** Share links carry a placeholder token in demo mode. */
export const householdsDemoShareUrl =
  "https://duna.example/household/join?token=demo-invitation-token";

export const householdsDemo = {
  domain: "households",
  household: householdsDemoHousehold,
  consents: householdsDemoConsents,
  invitationPreview: householdsDemoInvitationPreview,
  shareUrl: householdsDemoShareUrl,
} as const;
