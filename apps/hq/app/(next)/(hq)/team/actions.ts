"use server";

import type {
  TeamAvailabilityStaff,
  teamAvailabilityCoverageActionInputSchema,
  teamPayAdjustLineInputSchema,
  teamPayCreatePeriodInputSchema,
  teamPaySetCompensationInputSchema,
  teamPaySetIncomeGoalInputSchema,
} from "@duna/api";
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { MoneyActionResult } from "@/components/money/money-action-result";
import { isNotConfigured } from "@/components/team/team-data";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";

/**
 * Team's changes (H-TEAM). Each is a person's confirmed action on a Team
 * screen. Every call answers a result instead of throwing, so the dialog
 * can say what happened with the reference support needs; sends, pay
 * changes, approvals and exports carry the idempotency key the confirming
 * control created (reused on retry). Nothing here moves money.
 */
type Result<T> = MoneyActionResult<T>;

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

const plainCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
]);

async function run<T>(
  action: string,
  perform: () => Promise<T>,
): Promise<Result<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    revalidatePath("/team", "layout");
    log.info("hq.team.action_succeeded", { action });
    return { ok: true, data };
  } catch (error) {
    const code = codeOf(error);
    if (isPermissionDenied(error)) {
      log.info("hq.team.action_denied", { action });
      return {
        ok: false,
        code: "denied",
        message:
          "You don't have permission to do this here. Nothing was changed.",
        reference: requestId,
      };
    }
    if (isNotConfigured(error)) {
      log.info("hq.team.action_not_configured", { action });
      return {
        ok: false,
        code: "not-configured",
        message:
          action === "exportPayRun"
            ? "That export isn't configured yet in this environment. Nothing was exported."
            : "This isn't configured yet in this environment (it needs Duna Database). Nothing was sent or changed.",
        reference: requestId,
      };
    }
    log.warn("hq.team.action_failed", { action, code: code ?? "unknown" });
    return {
      ok: false,
      code: "failed",
      message:
        code && plainCodes.has(code) && error instanceof Error && error.message
          ? `${error.message} Nothing was changed.`
          : "Something went wrong on our side. Nothing was changed; try again.",
      reference: requestId,
    };
  }
}

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : crypto.randomUUID();

type StaffRole = "coach" | "director" | "manager" | "front-desk" | "accountant";

/* ----------------------------------------------------------- invitations */

export async function inviteTeamMemberAction(input: {
  readonly name: string;
  readonly email?: string;
  readonly phoneE164?: string;
  readonly role: StaffRole;
  readonly classification: "1099-contractor" | "w2-employee";
  readonly idempotencyKey: string;
}) {
  return run("invite", async () => {
    const caller = await getServerCaller();
    const send = Boolean(input.email || input.phoneE164);
    const created = await caller.operator.createStaffInvitation({
      invitedName: input.name.trim(),
      ...(input.email ? { invitedEmail: input.email } : {}),
      ...(input.phoneE164 ? { invitedPhoneE164: input.phoneE164 } : {}),
      role: input.role,
      workerClassification: input.classification,
      ...(send
        ? {
            preferredChannel: input.email
              ? ("email" as const)
              : ("sms" as const),
          }
        : {}),
      deliveryMode: send ? "send" : "link-only",
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
    return {
      id: created.id,
      status: created.status,
      link: created.privateClaimLink,
    };
  });
}

/* ------------------------------------------------- profile and access */

/**
 * Changes a member's name, role, classification, status or address. The
 * profile procedure takes the whole record, so the rest is the backend's
 * own current view of it, read here (never from the browser).
 */
export async function updateMemberAction(input: {
  readonly personId: string;
  readonly displayName?: string;
  readonly role?: StaffRole;
  readonly active?: boolean;
  readonly workerClassification?: "not-set" | "1099-contractor" | "w2-employee";
  readonly address?: {
    readonly addressLine1?: string;
    readonly addressLine2?: string;
    readonly locality?: string;
    readonly administrativeArea?: string;
    readonly postalCode?: string;
    readonly countryCode: string;
  };
  readonly idempotencyKey: string;
}) {
  return run("updateMember", async () => {
    const caller = await getServerCaller();
    const workspace = await caller.operator.workspace();
    const current = workspace.staff.find(
      (row) => row.personId === input.personId,
    );
    if (!current) {
      throw Object.assign(new Error("That team member wasn't found."), {
        code: "NOT_FOUND",
      });
    }
    const windows = current.availability.filter(
      (entry) => entry.kind !== "blackout" && typeof entry.weekday === "number",
    ) as {
      weekday: number;
      startsAt: string;
      endsAt: string;
      scheduleId?: string;
      scheduleName?: string;
      effectiveFrom?: string;
      effectiveTo?: string;
    }[];
    const blackouts = current.availability.filter(
      (entry) => entry.kind === "blackout",
    ) as {
      startsOn: string;
      startsAt: string;
      endsOn?: string;
      endsAt: string;
    }[];
    if (windows.length > 28 || blackouts.length > 52) {
      // The profile procedure takes at most 28 windows and 52 blackouts;
      // sending fewer would drop hours, so refuse instead.
      throw Object.assign(
        new Error(
          "This member has more weekly hours or blackouts than this change can carry.",
        ),
        { code: "BAD_REQUEST" },
      );
    }
    const address = input.address ?? {
      addressLine1: current.addressLine1,
      addressLine2: current.addressLine2,
      locality: current.locality,
      administrativeArea: current.administrativeArea,
      postalCode: current.postalCode,
      countryCode: current.countryCode,
    };
    return caller.operator.updateStaffProfile({
      personId: current.personId,
      displayName: input.displayName?.trim() || current.displayName,
      role: input.role ?? current.role,
      workerClassification:
        input.workerClassification ?? current.workerClassification,
      compensationModel: current.compensationModel,
      hourlyRateMinor: current.hourlyRateMinor,
      profitShareBps: current.profitShareBps,
      addressLine1: address.addressLine1 || undefined,
      addressLine2: address.addressLine2 || undefined,
      locality: address.locality || undefined,
      administrativeArea: address.administrativeArea || undefined,
      postalCode: address.postalCode || undefined,
      countryCode: (address.countryCode || "US").toUpperCase().slice(0, 2),
      googlePlaceId: input.address ? undefined : current.googlePlaceId,
      latitude: input.address ? undefined : current.latitude,
      longitude: input.address ? undefined : current.longitude,
      availability: windows,
      blackoutDates: blackouts,
      incomeGoalMinor: current.incomeGoalMinor,
      incomeGoalPeriod: current.incomeGoalPeriod,
      active: input.active ?? current.active,
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

export async function transferOwnershipAction(input: {
  readonly personId: string;
  readonly idempotencyKey: string;
}) {
  return run("transferOwnership", async () => {
    const caller = await getServerCaller();
    return caller.operator.transferOrganizationOwnership({
      personId: input.personId,
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

/* --------------------------------------------------------- availability */

type ScheduleWindow = {
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly kind: "coaching" | "early" | "juniors" | "office" | "other";
  readonly label?: string;
};

export async function saveScheduleAction(input: {
  readonly scheduleId?: string;
  readonly staffProfileId: string;
  readonly name: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly timezone: string;
  readonly sourceText?: string;
  readonly windows: readonly ScheduleWindow[];
}) {
  return run("saveSchedule", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamAvailability.upsertSchedule({
      ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
      staffProfileId: input.staffProfileId,
      name: input.name.trim() || "Weekly hours",
      effectiveFrom: input.effectiveFrom,
      ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
      timezone: input.timezone,
      ...(input.sourceText ? { sourceText: input.sourceText } : {}),
      windows: input.windows.map((window) => ({ ...window })),
    });
  });
}

export async function transitionScheduleAction(input: {
  readonly scheduleId: string;
  readonly to: "active" | "fallback" | "archived";
}) {
  return run("transitionSchedule", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamAvailability.transitionSchedule(input);
  });
}

export async function addAwayAction(input: {
  readonly kind: "blackout" | "time-off";
  readonly staffProfileId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly reason?: string;
}) {
  return run(
    input.kind === "blackout" ? "addBlackout" : "requestTimeOff",
    async () => {
      const caller = await getServerCaller();
      const body = {
        staffProfileId: input.staffProfileId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
      };
      if (input.kind === "blackout") {
        const row = await caller.operator.teamAvailability.addBlackout(body);
        return {
          kind: "blackout" as const,
          sessionsNeedingCover: row.sessionsNeedingCover,
        };
      }
      const row = await caller.operator.teamAvailability.requestTimeOff(body);
      return {
        kind: "time-off" as const,
        sessionsNeedingCover: row.sessionsNeedingCover,
      };
    },
  );
}

export async function removeBlackoutAction(input: {
  readonly blackoutId: string;
}) {
  return run("removeBlackout", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamAvailability.removeBlackout(input);
  });
}

export async function decideTimeOffAction(input: {
  readonly timeOffId: string;
  readonly decision: "approved" | "declined" | "cancelled";
  readonly note?: string;
}) {
  return run("decideTimeOff", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamAvailability.decideTimeOff({
      timeOffId: input.timeOffId,
      decision: input.decision,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
  });
}

/** The availability page again, after a change (for the verdict sentence). */
export async function reloadAvailabilityAction(input: {
  readonly staffProfileId: string;
}): Promise<Result<TeamAvailabilityStaff>> {
  const caller = await getServerCaller();
  const { requestId } = await getServerContext();
  try {
    return {
      ok: true,
      data: await caller.operator.teamAvailability.staff(input),
    };
  } catch {
    return {
      ok: false,
      code: "failed",
      message: "The saved hours couldn't be read back. Reload the page.",
      reference: requestId,
    };
  }
}

/* -------------------------------------------------------------- coverage */

export async function coverageAction(
  input: z.infer<typeof teamAvailabilityCoverageActionInputSchema>,
) {
  return run(`coverage.${input.action}`, async () => {
    const caller = await getServerCaller();
    return caller.operator.teamAvailability.coverageAction(input);
  });
}

/* ------------------------------------------------------------------- pay */

export async function setCompensationAction(
  input: z.infer<typeof teamPaySetCompensationInputSchema>,
) {
  return run("setCompensation", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.setCompensation(input);
  });
}

export async function setIncomeGoalAction(
  input: z.infer<typeof teamPaySetIncomeGoalInputSchema>,
) {
  return run("setIncomeGoal", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.setIncomeGoal(input);
  });
}

export async function createPayPeriodAction(
  input: z.infer<typeof teamPayCreatePeriodInputSchema>,
) {
  return run("createPayPeriod", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.createPayPeriod(input);
  });
}

export async function computePayRunAction(input: {
  readonly payPeriodId: string;
  readonly idempotencyKey: string;
}) {
  return run("computePayRun", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.computePayRun(input);
  });
}

export async function adjustLineAction(
  input: z.infer<typeof teamPayAdjustLineInputSchema>,
) {
  return run("adjustLine", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.adjustLine(input);
  });
}

export async function approvePayRunAction(input: {
  readonly payRunId: string;
  readonly idempotencyKey: string;
}) {
  return run("approvePayRun", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.approvePayRun(input);
  });
}

export async function exportPayRunAction(input: {
  readonly payRunId: string;
  readonly format: "csv" | "gusto" | "adp" | "quickbooks";
}) {
  return run("exportPayRun", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.exportPayRun(input);
  });
}

export async function cancelPayRunAction(input: { readonly payRunId: string }) {
  return run("cancelPayRun", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.cancelPayRun(input);
  });
}

/** The run again after a line changes, for the backend's new totals. */
export async function reloadPayRunAction(input: { readonly payRunId: string }) {
  return run("reloadPayRun", async () => {
    const caller = await getServerCaller();
    return caller.operator.teamPay.payRun(input);
  });
}
