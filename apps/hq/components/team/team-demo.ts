import type { PersonRole } from "@duna/core";
import { demoPeople, demoPlayer } from "@duna/core/demo";
import {
  teamPayDemoCompensation,
  teamPayDemoStaff,
} from "@duna/core/demo/team-pay";
import type { StaffMember } from "./team-model";

/**
 * Demo mode only. The demo workspace has no staff records, but the team
 * procedures answer for the backend's demo coaches (`@duna/core/demo/
 * team-availability`, `team-pay`, `team-payouts`). This builds the roster
 * from those same fixtures so the screens can be walked end to end; live
 * clubs read `operator.workspace().staff`. Roles follow the fixtures' notes
 * (the salaried W-2 profile is the front-desk lead); the signed-in demo
 * person is on the team with the role the persona switch gave them.
 */
const legacyModel: Record<string, StaffMember["compensationModel"]> = {
  hourly: "hourly",
  "hourly-plus-share": "hourly-plus-profit-share",
  "revenue-share": "profit-share",
};

function member(input: {
  readonly staffProfileId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly role: StaffMember["role"];
  readonly isOwner?: boolean;
  readonly sessionsRun30d: number;
}): StaffMember {
  const person = [demoPlayer, ...demoPeople].find(
    (candidate) => candidate.id === input.personId,
  );
  const pay = teamPayDemoCompensation.find(
    (row) => row.staffProfileId === input.staffProfileId && !row.effectiveTo,
  );
  return {
    id: input.staffProfileId,
    personId: input.personId,
    displayName: input.displayName,
    handle: (person?.handle ?? input.displayName).toLowerCase(),
    ...(person?.avatarUrl ? { avatarUrl: person.avatarUrl } : {}),
    profileVisibility: "members",
    role: input.role,
    isOwner: input.isOwner ?? false,
    workerClassification: pay?.classification ?? "not-set",
    compensationModel: pay ? (legacyModel[pay.model] ?? "hourly") : "not-set",
    currency: "USD",
    addressComplete: false,
    countryCode: "US",
    availability: [],
    sessionsRun30d: input.sessionsRun30d,
    upcomingSessions: 0,
    active: true,
  };
}

function demoRoleFor(roles: readonly PersonRole[]): {
  role: StaffMember["role"];
  isOwner: boolean;
} {
  if (roles.includes("owner")) return { role: "director", isOwner: true };
  if (roles.includes("manager")) return { role: "manager", isOwner: false };
  if (roles.includes("front-desk"))
    return { role: "front-desk", isOwner: false };
  if (roles.includes("accountant"))
    return { role: "accountant", isOwner: false };
  return { role: "coach", isOwner: false };
}

/**
 * The demo team, for the signed-in demo person's roles. The fixtures' first
 * staff profile is the demo person (Mara) herself, so the coach persona has
 * her own schedules, time off and pay to look at.
 */
export function demoTeam(roles: readonly PersonRole[]): StaffMember[] {
  const { theo: self, noa, sam, elena } = teamPayDemoStaff;
  const own = demoRoleFor(roles);
  return [
    member({
      ...self,
      role: own.role,
      isOwner: own.isOwner,
      sessionsRun30d: 9,
    }),
    member({ ...noa, role: "coach", sessionsRun30d: 9 }),
    member({ ...sam, role: "coach", sessionsRun30d: 0 }),
    member({ ...elena, role: "front-desk", sessionsRun30d: 0 }),
  ].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
