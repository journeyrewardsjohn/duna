/**
 * Demo fixtures for `operator.people.*` (PEOPLE-API), so HQ's demo screens
 * work without a database. People ids are the demo workspace's (Maya Chen,
 * Jordan Smith); no real person, price or policy is implied. Writes return
 * what the real procedure would, change nothing and send nothing.
 */
import type {
  PeopleDocument,
  PeopleHousehold,
  PeopleImportPreview,
  PeopleImportResult,
  PeopleMembershipChangePreview,
  PeopleMergePreview,
  PeopleNote,
} from "../../contracts/people";
import { normalizeImportRow } from "./import";
import {
  NO_PRORATION_REASON,
  NO_RENEWAL_SWITCH_REASON,
} from "./membership-change";

export const peopleDemoIds = {
  maya: "10000000-0000-4000-8000-000000000201",
  jordan: "10000000-0000-4000-8000-000000000202",
  coach: "10000000-0000-4000-8000-000000000901",
  junior: "10000000-0000-4000-8000-000000000203",
  guardian: "10000000-0000-4000-8000-000000000204",
  note: "10000000-0000-4000-8000-000000000a01",
  waiver: "10000000-0000-4000-8000-000000000a02",
  importPreview: "10000000-0000-4000-8000-000000000a03",
  mergePreview: "10000000-0000-4000-8000-000000000a04",
  draft: "10000000-0000-4000-8000-000000000a05",
  invitation: "10000000-0000-4000-8000-000000000a06",
  tierFrom: "10000000-0000-4000-8000-000000000a07",
  tierTo: "10000000-0000-4000-8000-000000000a08",
} as const;

const DEMO_AT = "2026-11-20T16:00:00.000Z";

export function demoNotes(personId: string): { notes: PeopleNote[] } {
  return {
    notes: [
      {
        id: peopleDemoIds.note,
        personId,
        body: "Prefers evening sessions. Ask about the spring league.",
        author: {
          personId: peopleDemoIds.coach,
          displayName: "Coach Alex Rivera",
        },
        createdAt: DEMO_AT,
      },
    ],
  };
}

export function demoNote(
  personId: string,
  body: string,
  authorId: string,
  authorName: string,
  now: Date,
): PeopleNote {
  return {
    id: peopleDemoIds.note,
    personId,
    body,
    author: { personId: authorId, displayName: authorName },
    createdAt: now.toISOString(),
  };
}

export function demoTags(personId?: string) {
  return {
    tags: [
      { tag: "Beginner clinic", count: 4 },
      { tag: "League", count: 7 },
    ],
    personTags: personId ? ["League"] : undefined,
  };
}

export function demoHousehold(personId: string): PeopleHousehold {
  if (personId === peopleDemoIds.junior) {
    return {
      personId,
      guardians: [
        {
          personId: peopleDemoIds.guardian,
          displayName: "Sam Rivera",
          juniorPersonId: personId,
          relationship: "parent",
          reviewStatus: "verified",
          canApproveSpending: true,
          pays: true,
          contacted: true,
        },
      ],
      juniors: [],
      payer: { personId: peopleDemoIds.guardian, displayName: "Sam Rivera" },
      contact: { personId: peopleDemoIds.guardian, displayName: "Sam Rivera" },
    };
  }
  return {
    personId,
    guardians: [],
    juniors: [],
    contact: { personId, displayName: "Club member" },
  };
}

export function demoDocuments(): { documents: PeopleDocument[] } {
  return {
    documents: [
      {
        documentId: peopleDemoIds.waiver,
        title: "Club participation waiver",
        kind: "waiver",
        versionSigned: 2,
        currentVersion: 3,
        signedAt: "2026-03-02T15:00:00.000Z",
        signedBy: {
          personId: peopleDemoIds.maya,
          displayName: "Maya Chen",
          role: "self",
        },
        expiresAt: "2027-03-02T15:00:00.000Z",
        status: "superseded",
        required: true,
      },
    ],
  };
}

export function demoImportPreview(
  rows: readonly Readonly<Record<string, string>>[],
  mapping: Parameters<typeof normalizeImportRow>[1],
  now: Date,
): PeopleImportPreview {
  const planned = rows.map((raw, index) => {
    const row = normalizeImportRow(raw, mapping, index + 1, now);
    return {
      row: row.row,
      action: row.problems.length ? ("problem" as const) : ("create" as const),
      displayName: row.displayName,
      isMinor: row.isMinor,
      problems: row.problems,
    };
  });
  const create = planned.filter((row) => row.action === "create");
  return {
    previewId: peopleDemoIds.importPreview,
    expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
    counts: {
      total: planned.length,
      create: create.length,
      update: 0,
      duplicate: 0,
      problem: planned.length - create.length,
      juniors: create.filter((row) => row.isMinor).length,
      guardians: create.filter((row) => row.isMinor).length,
    },
    rows: planned,
  };
}

export function demoImportResult(): PeopleImportResult {
  return {
    previewId: peopleDemoIds.importPreview,
    status: "completed",
    processed: 0,
    total: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    guardiansLinked: 0,
    messagesSent: 0,
  };
}

export function demoMergePreview(
  keepId: string,
  mergeId: string,
  now: Date,
): PeopleMergePreview {
  return {
    previewId: peopleDemoIds.mergePreview,
    expiresAt: new Date(now.getTime() + 15 * 60_000).toISOString(),
    keep: { personId: keepId, displayName: "Maya Chen" },
    merge: { personId: mergeId, displayName: "Maya C." },
    canMerge: true,
    kept: [
      "Name, contact details and profile of the record you keep",
      "Its sign-in account, if it has one",
      "Every payment and waiver record (re-pointed, never deleted)",
    ],
    moves: {
      bookings: 2,
      attendance: 1,
      memberships: 0,
      credits: 0,
      payments: 1,
      waivers: 1,
      familyLinks: 0,
      notes: 0,
      tags: 1,
    },
    blockers: [],
  };
}

export function demoMembershipPreview(input: {
  readonly membershipId: string;
  readonly toTierId: string;
  readonly timing: "now" | "at-renewal";
}): PeopleMembershipChangePreview {
  return {
    previewId: `demo:${input.membershipId}:${input.toTierId}:${input.timing}`,
    status: "unavailable",
    reason:
      input.timing === "now" ? NO_PRORATION_REASON : NO_RENEWAL_SWITCH_REASON,
    kind: "upgrade",
    from: {
      tierId: peopleDemoIds.tierFrom,
      name: "Monthly membership",
      priceMinor: 6_500,
      currency: "USD",
      interval: "month",
    },
    to: {
      tierId: input.toTierId,
      name: "Unlimited membership",
      priceMinor: 9_500,
      currency: "USD",
      interval: "month",
    },
    timing: input.timing,
    chargeNowMinor: 0,
    creditNowMinor: 0,
    nextCharge: { amountMinor: 6_500, at: "2026-12-15T00:00:00.000Z" },
    billedThroughDuna: true,
    wording:
      "Monthly membership renews on 2026-12-15 at $65.00. Unlimited membership costs $95.00 per month. Nothing changes.",
  };
}
