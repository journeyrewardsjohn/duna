import { loadEnvFile } from "node:process";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  auditLog,
  getDatabase,
  guardianConsents,
  guardianships,
  people,
} from "../packages/db/src";
import {
  addDependent,
  assertSubjectAuthority,
  IdentityError,
  loadGuardianReviewQueue,
  reviewGuardianship,
  scopesForRoles,
  type ApiActor,
} from "../packages/api/src";

try {
  loadEnvFile(".env.local");
} catch {
  // CI and deployment checks may provide configuration through the environment.
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const database = getDatabase();
  const now = new Date();
  const suffix = crypto.randomUUID();
  const guardianId = crypto.randomUUID();
  const adminId = crypto.randomUUID();
  const personIds = [guardianId, adminId];
  const guardian: ApiActor = {
    personId: guardianId,
    displayName: "Guardian Review Parent",
    roles: ["player", "guardian"],
    scopes: scopesForRoles(["player", "guardian"]),
    ageBand: "adult",
    isDemo: true,
  };
  const admin: ApiActor = {
    personId: adminId,
    displayName: "Guardian Review Admin",
    roles: ["admin"],
    scopes: scopesForRoles(["admin"]),
    ageBand: "adult",
    isDemo: true,
  };

  try {
    await database.insert(people).values([
      {
        id: guardianId,
        email: `guardian-review-${suffix}@example.invalid`,
        displayName: guardian.displayName,
        handle: `guardian-review-${suffix}`.slice(0, 48),
        ageBand: "adult",
        isMinor: false,
        profileVisibility: "private",
      },
      {
        id: adminId,
        email: `guardian-admin-${suffix}@example.invalid`,
        displayName: admin.displayName,
        handle: `guardian-admin-${suffix}`.slice(0, 48),
        ageBand: "adult",
        isMinor: false,
        profileVisibility: "private",
      },
    ]);
    const approvedDependent = await addDependent({
      actor: guardian,
      displayName: "Guardian Review Junior",
      birthDate: "2014-02-12",
      relationship: "Parent",
      emergencyContact: true,
      canApproveSpending: true,
      consentConfirmed: true,
      requestId: crypto.randomUUID(),
      now,
    });
    const rejectedDependent = await addDependent({
      actor: guardian,
      displayName: "Guardian Review Teen",
      birthDate: "2010-08-20",
      relationship: "Legal guardian",
      emergencyContact: false,
      canApproveSpending: false,
      consentConfirmed: true,
      requestId: crypto.randomUUID(),
      now,
    });
    personIds.push(approvedDependent.personId, rejectedDependent.personId);

    const pending = await loadGuardianReviewQueue();
    assert(
      pending.some(
        (item) =>
          item.guardianId === guardianId &&
          item.minorId === approvedDependent.personId &&
          item.consent?.granted,
      ) &&
        pending.some(
          (item) =>
            item.guardianId === guardianId &&
            item.minorId === rejectedDependent.personId,
        ),
      "Pending guardian review queue omitted connected relationships",
    );

    const verified = await reviewGuardianship({
      actor: admin,
      guardianId,
      minorId: approvedDependent.personId,
      decision: "verified",
      reason:
        "Verified government identity and matching relationship evidence.",
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 1_000),
    });
    const rejected = await reviewGuardianship({
      actor: admin,
      guardianId,
      minorId: rejectedDependent.personId,
      decision: "rejected",
      reason: "Relationship evidence did not match the dependent record.",
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 2_000),
    });
    assert(
      verified.status === "verified" && rejected.status === "rejected",
      "Admin decisions were not returned",
    );

    await assertSubjectAuthority({
      actor: guardian,
      subjectPersonId: approvedDependent.personId,
    });
    let rejectedAuthorityBlocked = false;
    try {
      await assertSubjectAuthority({
        actor: guardian,
        subjectPersonId: rejectedDependent.personId,
      });
    } catch {
      rejectedAuthorityBlocked = true;
    }
    assert(
      rejectedAuthorityBlocked,
      "Rejected relationship retained guardian authority",
    );

    let repeatedReviewBlocked = false;
    try {
      await reviewGuardianship({
        actor: admin,
        guardianId,
        minorId: approvedDependent.personId,
        decision: "verified",
        reason: "A repeated review must not mutate an immutable decision.",
        requestId: crypto.randomUUID(),
        now: new Date(now.getTime() + 3_000),
      });
    } catch (error) {
      repeatedReviewBlocked =
        error instanceof IdentityError &&
        error.code === "GUARDIANSHIP_ALREADY_REVIEWED";
    }
    assert(repeatedReviewBlocked, "Repeated review was not blocked");

    const [approvedRow, rejectedRow, decisionAudit, remainingPending] =
      await Promise.all([
        database.query.guardianships.findFirst({
          where: and(
            eq(guardianships.guardianId, guardianId),
            eq(guardianships.minorId, approvedDependent.personId),
          ),
        }),
        database.query.guardianships.findFirst({
          where: and(
            eq(guardianships.guardianId, guardianId),
            eq(guardianships.minorId, rejectedDependent.personId),
          ),
        }),
        database
          .select()
          .from(auditLog)
          .where(
            and(
              eq(auditLog.actorPersonId, adminId),
              inArray(auditLog.action, [
                "guardianship.verified",
                "guardianship.rejected",
              ]),
            ),
          ),
        loadGuardianReviewQueue(),
      ]);
    assert(
      approvedRow?.verified &&
        approvedRow.reviewStatus === "verified" &&
        approvedRow.reviewedByPersonId === adminId &&
        !rejectedRow?.verified &&
        rejectedRow?.reviewStatus === "rejected" &&
        decisionAudit.length === 2,
      "Guardian decisions or their immutable audit evidence were not persisted",
    );
    assert(
      !remainingPending.some(
        (item) =>
          item.guardianId === guardianId && personIds.includes(item.minorId),
      ),
      "Reviewed relationships remained in the pending queue",
    );

    console.log(
      JSON.stringify(
        {
          pendingRelationshipsFound: 2,
          consentPrerequisiteEnforced: true,
          verifiedAuthorityGranted: true,
          rejectedAuthorityBlocked,
          immutableReviewBlocked: repeatedReviewBlocked,
          decisionAuditEvents: decisionAudit.length,
          pendingQueueCleared: true,
        },
        null,
        2,
      ),
    );
  } finally {
    await database.delete(auditLog).where(
      or(
        inArray(auditLog.actorPersonId, [guardianId, adminId]),
        inArray(
          auditLog.entityId,
          personIds.map((personId) => `${guardianId}:${personId}`),
        ),
      ),
    );
    await database
      .delete(guardianConsents)
      .where(eq(guardianConsents.guardianId, guardianId));
    await database
      .delete(guardianships)
      .where(eq(guardianships.guardianId, guardianId));
    await database.delete(people).where(inArray(people.id, personIds));
  }
}

void main();
