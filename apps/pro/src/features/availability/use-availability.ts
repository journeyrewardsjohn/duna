/**
 * My availability page and the writes a member may make on themselves
 * (M-R5): `operator.teamAvailability.staff` (read, kept on the device),
 * `upsertSchedule`, `transitionSchedule`, `addBlackout`, `removeBlackout`,
 * `requestTimeOff` and `decideTimeOff` (cancel only: deciding is a
 * manager's). Writes are never queued (they need a connection); each one
 * reloads the page so what is shown is what Duna holds, including the
 * sessions it now lists as needing cover.
 *
 * Preview builds start from the demo coach's page and change it in memory.
 */
import type { TeamAvailabilityStaff } from "@duna/api";
import { teamAvailabilityDemoStaffPage } from "@duna/core/demo/team-availability";
import { log } from "@duna/observability";
import { useCallback, useMemo } from "react";
import { useProRuntime } from "../../../runtime";
import type { WindowInput } from "./week-model";
import {
  keptKey,
  useCachedLoad,
  type CachedLoad,
  type MyTeam,
} from "./use-my-team";

export type StaffPage = TeamAvailabilityStaff;
export type ScheduleOut = StaffPage["schedules"][number];
export type BlackoutOut = StaffPage["blackouts"][number];
export type TimeOffOut = StaffPage["timeOff"][number];

export interface UpsertInput {
  readonly scheduleId?: string;
  readonly name: string;
  readonly effectiveFrom: string;
  readonly effectiveTo?: string;
  readonly timezone: string;
  readonly windows: readonly WindowInput[];
}

export interface AvailabilityWrites {
  readonly upsertSchedule: (input: UpsertInput) => Promise<ScheduleOut>;
  readonly transitionSchedule: (
    scheduleId: string,
    to: "active" | "fallback" | "archived",
  ) => Promise<ScheduleOut>;
  readonly addBlackout: (input: {
    readonly startsAt: string;
    readonly endsAt: string;
    readonly reason?: string;
  }) => Promise<BlackoutOut>;
  readonly removeBlackout: (blackoutId: string) => Promise<void>;
  readonly requestTimeOff: (input: {
    readonly startsAt: string;
    readonly endsAt: string;
    readonly reason?: string;
  }) => Promise<TimeOffOut>;
  readonly cancelTimeOff: (timeOffId: string) => Promise<TimeOffOut>;
}

export interface AvailabilityData {
  readonly load: CachedLoad<StaffPage>;
  readonly writes: AvailabilityWrites;
}

let previewCounter = 0;
const previewId = () => {
  previewCounter += 1;
  return `00000000-0000-4000-8000-${String(900_000 + previewCounter).padStart(12, "0")}`;
};

export function useAvailability(team: MyTeam | null): AvailabilityData {
  const runtime = useProRuntime();
  const client = runtime.client;
  const staffProfileId = team?.me.staffProfileId;
  const preview = team?.preview ?? false;

  const fetcher = useCallback(async (): Promise<StaffPage> => {
    if (preview || !client || !staffProfileId) {
      return {
        ...teamAvailabilityDemoStaffPage,
        schedules: [...teamAvailabilityDemoStaffPage.schedules],
        blackouts: [...teamAvailabilityDemoStaffPage.blackouts],
        timeOff: [...teamAvailabilityDemoStaffPage.timeOff],
      } as StaffPage;
    }
    return client.operator.teamAvailability.staff.query({ staffProfileId });
  }, [client, preview, staffProfileId]);

  const load = useCachedLoad<StaffPage>(
    team
      ? keptKey(team, preview ? "availability-preview" : "availability")
      : null,
    fetcher,
    "pro.availability.load_failed",
  );

  const page = load.data;
  const writes = useMemo<AvailabilityWrites>(() => {
    const live = () => {
      if (!client || !staffProfileId)
        throw new Error("Duna is not connected for this club.");
      return { client, staffProfileId };
    };
    const after = async <T>(event: string, value: T): Promise<T> => {
      log.info(event, { preview });
      if (!preview) await load.reload();
      return value;
    };
    const now = () => new Date().toISOString();
    return {
      upsertSchedule: async (input) => {
        if (preview && page) {
          const existing = page.schedules.find(
            (s) => s.id === input.scheduleId,
          );
          const saved: ScheduleOut = {
            id: existing?.id ?? previewId(),
            staffProfileId: page.staff.staffProfileId,
            name: input.name,
            status: existing?.status ?? "draft",
            effectiveFrom: input.effectiveFrom,
            ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
            timezone: input.timezone,
            windows: input.windows.map((window) => ({
              ...window,
              id: previewId(),
            })),
            updatedAt: now(),
          };
          load.replace({
            ...page,
            schedules: [
              ...page.schedules.filter((s) => s.id !== saved.id),
              saved,
            ],
          });
          return after("pro.availability.schedule_saved", saved);
        }
        const { client: api, staffProfileId: id } = live();
        const saved = await api.operator.teamAvailability.upsertSchedule.mutate(
          {
            ...(input.scheduleId ? { scheduleId: input.scheduleId } : {}),
            staffProfileId: id,
            name: input.name,
            effectiveFrom: input.effectiveFrom,
            ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
            timezone: input.timezone,
            windows: [...input.windows],
          },
        );
        return after("pro.availability.schedule_saved", saved);
      },
      transitionSchedule: async (scheduleId, to) => {
        if (preview && page) {
          const target = page.schedules.find((s) => s.id === scheduleId);
          if (!target) throw new Error("This schedule was not found.");
          const dayBefore = (date: string) => {
            const value = new Date(`${date}T12:00:00.000Z`);
            value.setUTCDate(value.getUTCDate() - 1);
            return value.toISOString().slice(0, 10);
          };
          const schedules = page.schedules.map((s) => {
            if (s.id === scheduleId)
              return { ...s, status: to, updatedAt: now() };
            if (to === "fallback" && s.status === "fallback")
              return { ...s, status: "archived" as const };
            if (
              to === "active" &&
              s.status === "active" &&
              s.effectiveFrom < target.effectiveFrom &&
              (!s.effectiveTo || s.effectiveTo >= target.effectiveFrom)
            )
              return { ...s, effectiveTo: dayBefore(target.effectiveFrom) };
            return s;
          });
          load.replace({ ...page, schedules });
          return after(
            "pro.availability.schedule_transitioned",
            schedules.find((s) => s.id === scheduleId)!,
          );
        }
        const { client: api } = live();
        const saved =
          await api.operator.teamAvailability.transitionSchedule.mutate({
            scheduleId,
            to,
          });
        return after("pro.availability.schedule_transitioned", saved);
      },
      addBlackout: async (input) => {
        if (preview && page) {
          const row: BlackoutOut = {
            id: previewId(),
            staffProfileId: page.staff.staffProfileId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            ...(input.reason ? { reason: input.reason } : {}),
            sessionsNeedingCover: 0,
          };
          load.replace({ ...page, blackouts: [row, ...page.blackouts] });
          return after("pro.availability.blackout_added", row);
        }
        const { client: api, staffProfileId: id } = live();
        const row = await api.operator.teamAvailability.addBlackout.mutate({
          staffProfileId: id,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          ...(input.reason ? { reason: input.reason } : {}),
        });
        return after("pro.availability.blackout_added", row);
      },
      removeBlackout: async (blackoutId) => {
        if (preview && page) {
          load.replace({
            ...page,
            blackouts: page.blackouts.filter((row) => row.id !== blackoutId),
          });
          await after("pro.availability.blackout_removed", null);
          return;
        }
        const { client: api } = live();
        await api.operator.teamAvailability.removeBlackout.mutate({
          blackoutId,
        });
        await after("pro.availability.blackout_removed", null);
      },
      requestTimeOff: async (input) => {
        if (preview && page) {
          const row: TimeOffOut = {
            id: previewId(),
            staffProfileId: page.staff.staffProfileId,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            ...(input.reason ? { reason: input.reason } : {}),
            status: "requested",
            requestedAt: now(),
            sessionsNeedingCover: 0,
          };
          load.replace({ ...page, timeOff: [row, ...page.timeOff] });
          return after("pro.availability.time_off_requested", row);
        }
        const { client: api, staffProfileId: id } = live();
        const row = await api.operator.teamAvailability.requestTimeOff.mutate({
          staffProfileId: id,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          ...(input.reason ? { reason: input.reason } : {}),
        });
        return after("pro.availability.time_off_requested", row);
      },
      cancelTimeOff: async (timeOffId) => {
        if (preview && page) {
          const timeOff = page.timeOff.map((row) =>
            row.id === timeOffId
              ? { ...row, status: "cancelled" as const }
              : row,
          );
          load.replace({ ...page, timeOff });
          return after(
            "pro.availability.time_off_cancelled",
            timeOff.find((row) => row.id === timeOffId)!,
          );
        }
        const { client: api } = live();
        const row = await api.operator.teamAvailability.decideTimeOff.mutate({
          timeOffId,
          decision: "cancelled",
        });
        return after("pro.availability.time_off_cancelled", row);
      },
    };
  }, [client, load, page, preview, staffProfileId]);

  return { load, writes };
}
