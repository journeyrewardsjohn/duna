"use client";

import type { OperatorWorkspace } from "@duna/api";
import {
  findRecurringScheduleConflicts,
  parseNaturalLanguageSchedule,
  type NaturalLanguageScheduleDraft,
} from "@duna/scheduling";
import { Badge, Field, Input, Select } from "@duna/ui";
import {
  Bot,
  Check,
  CircleAlert,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  transferOrganizationOwnershipAction,
  updateStaffProfileAction,
  type OperatorActionState,
} from "@/app/actions";
import { AddressEntry } from "./place-address-fields";
import { AvailabilityCalendar } from "./availability-calendar";
import { DunaDateTimePicker } from "./duna-date-time-picker";

type StaffProfile = OperatorWorkspace["staff"][number];

interface AvailabilityBlock {
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly scheduleId?: string;
  readonly scheduleName?: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
}

interface AvailabilitySchedule {
  readonly id: string;
  readonly name: string;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string;
  readonly blocks: readonly AvailabilityBlock[];
}

interface BlackoutDate {
  readonly startsOn: string;
  readonly startsAt: string;
  readonly endsOn?: string;
  readonly endsAt: string;
}

const initialState: OperatorActionState = { status: "idle", message: "" };
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

function displayTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  const time = new Date(2026, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(time);
}

function minuteTime(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function dateIsBlackout(
  value: string,
  blackouts: readonly BlackoutDate[],
): boolean {
  return blackouts.some(
    (block) =>
      value >= block.startsOn && value <= (block.endsOn ?? block.startsOn),
  );
}

function normalizeAvailability(
  value: StaffProfile["availability"],
): AvailabilityBlock[] {
  return value.flatMap((entry) => {
    const weekday = Number(entry.weekday);
    const startsAt = String(entry.startsAt ?? "");
    const endsAt = String(entry.endsAt ?? "");
    return Number.isInteger(weekday) &&
      weekday >= 0 &&
      weekday <= 6 &&
      /^\d{2}:\d{2}$/.test(startsAt) &&
      /^\d{2}:\d{2}$/.test(endsAt)
      ? [{ weekday, startsAt, endsAt }]
      : [];
  });
}

function normalizeSchedules(
  value: StaffProfile["availability"],
): AvailabilitySchedule[] {
  const schedules = new Map<string, AvailabilitySchedule>();
  for (const entry of value) {
    if (entry.kind === "blackout") continue;
    const weekday = Number(entry.weekday);
    const startsAt = String(entry.startsAt ?? "");
    const endsAt = String(entry.endsAt ?? "");
    if (
      !Number.isInteger(weekday) ||
      weekday < 0 ||
      weekday > 6 ||
      !/^\d{2}:\d{2}$/.test(startsAt) ||
      !/^\d{2}:\d{2}$/.test(endsAt)
    )
      continue;
    const scheduleId =
      typeof entry.scheduleId === "string" && entry.scheduleId
        ? entry.scheduleId
        : "usual";
    const current = schedules.get(scheduleId) ?? {
      id: scheduleId,
      name:
        typeof entry.scheduleName === "string" && entry.scheduleName.trim()
          ? entry.scheduleName
          : "Usual availability",
      effectiveFrom:
        typeof entry.effectiveFrom === "string"
          ? entry.effectiveFrom
          : undefined,
      effectiveTo:
        typeof entry.effectiveTo === "string" ? entry.effectiveTo : undefined,
      blocks: [],
    };
    schedules.set(scheduleId, {
      ...current,
      blocks: [
        ...current.blocks,
        {
          weekday,
          startsAt,
          endsAt,
          scheduleId,
          scheduleName: current.name,
          effectiveFrom: current.effectiveFrom,
          effectiveTo: current.effectiveTo,
        },
      ],
    });
  }
  return schedules.size
    ? [...schedules.values()]
    : [{ id: "usual", name: "Usual availability", blocks: [] }];
}

function normalizeBlackouts(
  value: StaffProfile["availability"],
): BlackoutDate[] {
  return value.flatMap((entry) => {
    const startsOn = typeof entry.startsOn === "string" ? entry.startsOn : "";
    const endsOn = typeof entry.endsOn === "string" ? entry.endsOn : undefined;
    const startsAt =
      typeof entry.startsAt === "string" && /^\d{2}:\d{2}$/.test(entry.startsAt)
        ? entry.startsAt
        : "00:00";
    const endsAt =
      typeof entry.endsAt === "string" && /^\d{2}:\d{2}$/.test(entry.endsAt)
        ? entry.endsAt
        : "23:59";
    return entry.kind === "blackout" && /^\d{4}-\d{2}-\d{2}$/.test(startsOn)
      ? [{ startsOn, startsAt, endsAt, ...(endsOn ? { endsOn } : {}) }]
      : [];
  });
}

export function TeamMemberEditor({
  person,
  workspace,
}: {
  readonly person: StaffProfile;
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    updateStaffProfileAction,
    initialState,
  );
  const [ownershipState, ownershipAction, ownershipPending] = useActionState(
    transferOrganizationOwnershipAction,
    initialState,
  );
  const [compensationModel, setCompensationModel] = useState(
    person.compensationModel,
  );
  const [schedules, setSchedules] = useState<AvailabilitySchedule[]>(() =>
    normalizeSchedules(person.availability),
  );
  const [activeScheduleId, setActiveScheduleId] = useState(
    () => normalizeSchedules(person.availability)[0]?.id ?? "usual",
  );
  const [schedulePrompt, setSchedulePrompt] = useState("");
  const [scheduleDraft, setScheduleDraft] =
    useState<NaturalLanguageScheduleDraft>();
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>(
    normalizeBlackouts(person.availability),
  );
  const [blackoutStart, setBlackoutStart] = useState("");
  const [blackoutEnd, setBlackoutEnd] = useState("");
  const [blackoutStartTime, setBlackoutStartTime] = useState("09:00");
  const [blackoutEndTime, setBlackoutEndTime] = useState("17:00");
  const activeSchedule =
    schedules.find((schedule) => schedule.id === activeScheduleId) ??
    schedules[0];
  const canTransferOwnership =
    workspace.teamAccess.canTransferOwnership &&
    person.active &&
    person.role === "director" &&
    !person.isOwner;

  function updateSchedule(
    scheduleId: string,
    updater: (schedule: AvailabilitySchedule) => AvailabilitySchedule,
  ) {
    setSchedules((current) =>
      current.map((schedule) =>
        schedule.id === scheduleId ? updater(schedule) : schedule,
      ),
    );
  }

  function toggleDay(weekday: number, enabled: boolean) {
    if (!activeSchedule) return;
    updateSchedule(activeSchedule.id, (schedule) => ({
      ...schedule,
      blocks: enabled
        ? schedule.blocks.some((block) => block.weekday === weekday)
          ? schedule.blocks
          : [
              ...schedule.blocks,
              { weekday, startsAt: "09:00", endsAt: "17:00" },
            ]
        : schedule.blocks.filter((block) => block.weekday !== weekday),
    }));
  }

  function updateBlock(
    index: number,
    weekday: number,
    field: "startsAt" | "endsAt",
    value: string,
  ) {
    if (!activeSchedule) return;
    updateSchedule(activeSchedule.id, (schedule) => ({
      ...schedule,
      blocks: schedule.blocks.map((block, blockIndex) =>
        block.weekday === weekday && blockIndex === index
          ? { ...block, [field]: value }
          : block,
      ),
    }));
  }

  function reviewSchedulePrompt() {
    setScheduleDraft(parseNaturalLanguageSchedule(schedulePrompt));
  }

  function applyScheduleDraft() {
    if (!scheduleDraft || scheduleDraft.status !== "ready") return;
    const id = crypto.randomUUID();
    const name = scheduleDraft.summary;
    setSchedules((current) => [
      ...current,
      {
        id,
        name,
        blocks: scheduleDraft.blocks.map((block) => ({
          weekday: block.weekday,
          startsAt: minuteTime(block.startsAtMinute),
          endsAt: minuteTime(block.endsAtMinute),
        })),
      },
    ]);
    setActiveScheduleId(id);
    setSchedulePrompt("");
    setScheduleDraft(undefined);
  }

  function addBlackout() {
    if (
      !blackoutStart ||
      (blackoutEnd && blackoutEnd < blackoutStart) ||
      (blackoutEnd === blackoutStart && blackoutEndTime <= blackoutStartTime)
    )
      return;
    setBlackouts((current) => [
      ...current,
      {
        startsOn: blackoutStart,
        startsAt: blackoutStartTime,
        endsAt: blackoutEndTime,
        ...(blackoutEnd ? { endsOn: blackoutEnd } : {}),
      },
    ]);
    setBlackoutStart("");
    setBlackoutEnd("");
  }

  const activeCoaches = workspace.staff.filter(
    (candidate) =>
      candidate.active &&
      candidate.role === "coach" &&
      candidate.personId !== person.personId,
  );
  const scheduleDraftConflicts = useMemo(
    () =>
      scheduleDraft
        ? findRecurringScheduleConflicts({
            proposed: scheduleDraft.blocks,
            existing: schedules.flatMap((schedule) =>
              schedule.blocks.map((block) => ({
                weekday: block.weekday,
                startsAtMinute:
                  Number(block.startsAt.slice(0, 2)) * 60 +
                  Number(block.startsAt.slice(3, 5)),
                endsAtMinute:
                  Number(block.endsAt.slice(0, 2)) * 60 +
                  Number(block.endsAt.slice(3, 5)),
                scheduleId: schedule.id,
                scheduleName: schedule.name,
              })),
            ),
          })
        : [],
    [scheduleDraft, schedules],
  );

  function coverageTone(date: Date): "quiet" | "balanced" | "needed" {
    const weekday = date.getDay();
    const covered = activeCoaches.filter((coach) =>
      normalizeAvailability(coach.availability).some(
        (block) => block.weekday === weekday,
      ),
    ).length;
    if (covered === 0) return "needed";
    if (covered === 1) return "balanced";
    return "quiet";
  }

  return (
    <form action={action} className="team-member-editor">
      {canTransferOwnership && (
        <section className="hq-card operator-control-card team-member-editor__ownership">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Organization ownership</span>
              <h2>Make {person.displayName} the Owner</h2>
              <p>
                This person is already an active Director. Ownership moves to
                them immediately, while the current Owner remains an active
                Director.
              </p>
            </div>
            <ShieldCheck aria-hidden size={22} />
          </header>
          <div className="operator-form">
            <label className="operator-confirmation">
              <input
                name="ownershipConfirmed"
                required
                type="checkbox"
                value="true"
              />
              <span>
                <strong>I approve this ownership transfer.</strong>
                <small>
                  The current Owner will keep Director access and cannot be
                  restored automatically.
                </small>
              </span>
            </label>
            {ownershipState.status !== "idle" && (
              <p
                className={`operator-action-notice operator-action-notice--${ownershipState.status}`}
                role={ownershipState.status === "error" ? "alert" : "status"}
              >
                {ownershipState.status === "success" ? (
                  <Check aria-hidden size={16} />
                ) : (
                  <CircleAlert aria-hidden size={16} />
                )}
                {ownershipState.message}
              </p>
            )}
            <button
              className="hq-button hq-button--secondary"
              disabled={ownershipPending}
              formAction={ownershipAction}
              formNoValidate
              type="submit"
            >
              {ownershipPending ? "Transferring…" : "Transfer ownership"}
            </button>
          </div>
        </section>
      )}
      <input name="personId" type="hidden" value={person.personId} />
      <input
        name="availability"
        type="hidden"
        value={JSON.stringify(
          schedules.flatMap((schedule) =>
            schedule.blocks.map((block) => ({
              ...block,
              scheduleId: schedule.id,
              scheduleName: schedule.name,
              effectiveFrom: schedule.effectiveFrom,
              effectiveTo: schedule.effectiveTo,
            })),
          ),
        )}
      />
      <input
        name="blackoutDates"
        type="hidden"
        value={JSON.stringify(blackouts)}
      />

      <section className="hq-card team-member-editor__hero">
        <div>
          <span className="hq-eyebrow">Team profile</span>
          <h1>{person.displayName}</h1>
          <p>
            Keep the day-to-day setup simple while preserving a reviewable
            organization record for role, compensation, and worker status.
          </p>
        </div>
        <div className="team-member-editor__identity">
          <span className="avatar">
            {person.avatarUrl ? (
              <img alt="" src={person.avatarUrl} />
            ) : (
              person.displayName
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()
            )}
          </span>
          <span>
            <strong>
              {person.email ?? person.phoneE164 ?? "Duna identity"}
            </strong>
            <small>
              {person.sessionsRun30d} sessions in 30 days ·{" "}
              {person.upcomingSessions} upcoming
            </small>
          </span>
          <Badge tone={person.active ? "positive" : "neutral"}>
            {person.active ? "active" : "inactive"}
          </Badge>
          {person.isOwner && <Badge tone="warning">Owner</Badge>}
        </div>
      </section>

      <section
        className="team-profile-performance"
        aria-label="Team member performance"
      >
        <article>
          <small>Sessions · 30 days</small>
          <strong>{person.sessionsRun30d}</strong>
          <span>{person.upcomingSessions} upcoming on the schedule</span>
        </article>
        <article>
          <small>Earnings · MTD</small>
          <strong>—</strong>
          <span>Posted earnings will appear here</span>
        </article>
        <article>
          <small>Earnings · YTD</small>
          <strong>—</strong>
          <span>Payroll tracking is not connected</span>
        </article>
        <article>
          <small>Earnings · TTM</small>
          <strong>—</strong>
          <span>Set compensation to prepare reporting</span>
        </article>
      </section>

      <div className="team-member-editor__grid">
        <section className="hq-card operator-control-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Access + classification</span>
              <h2>Organization-controlled details</h2>
              <p>
                Only an administrator can change these fields. Duna records the
                decision but does not determine employment status.
              </p>
            </div>
            <ShieldCheck aria-hidden size={22} />
          </header>
          <div className="operator-form-grid operator-form-grid--two">
            <Field
              className="operator-field--wide"
              htmlFor="team-display-name"
              hint="This is the name players see on coach profiles, services, and schedules."
              label="Public display name"
              required
            >
              <Input
                defaultValue={person.displayName}
                id="team-display-name"
                maxLength={80}
                minLength={2}
                name="displayName"
                placeholder="Coach Ticao"
                required
                type="text"
              />
            </Field>
            <Field htmlFor="team-role" label="Role">
              {person.isOwner ? (
                <>
                  <input name="role" type="hidden" value="director" />
                  <Select
                    defaultValue="director"
                    disabled
                    id="team-role"
                    name="ownerRole"
                  >
                    <option value="director">Director · Owner</option>
                  </Select>
                </>
              ) : (
                <Select defaultValue={person.role} id="team-role" name="role">
                  <option value="coach">Coach</option>
                  {(workspace.teamAccess.canInviteDirector ||
                    person.role === "director") && (
                    <option value="director">Director</option>
                  )}
                  <option value="manager">Manager</option>
                  <option value="front-desk">Front desk</option>
                  <option value="accountant">Accountant</option>
                </Select>
              )}
            </Field>
            <Field
              htmlFor="team-worker-classification"
              label="Worker classification"
            >
              <Select
                defaultValue={person.workerClassification}
                id="team-worker-classification"
                name="workerClassification"
              >
                <option value="not-set">Not set yet</option>
                <option value="1099-contractor">1099 contractor</option>
                <option value="w2-employee">W-2 employee</option>
              </Select>
            </Field>
            <Field
              className="operator-field--wide"
              htmlFor="team-status"
              label="Status"
            >
              {person.isOwner ? (
                <>
                  <input name="active" type="hidden" value="true" />
                  <Select
                    defaultValue="true"
                    disabled
                    id="team-status"
                    name="ownerStatus"
                  >
                    <option value="true">Active · ownership protected</option>
                  </Select>
                </>
              ) : (
                <Select
                  defaultValue={person.active ? "true" : "false"}
                  id="team-status"
                  name="active"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </Select>
              )}
            </Field>
            {person.isOwner && (
              <p className="operator-form-hint operator-field--wide">
                This is the organization Owner. Transfer ownership to another
                active Director before changing this role or deactivating them.
              </p>
            )}
          </div>
        </section>

        <section className="hq-card operator-control-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Compensation + goals</span>
              <h2>Track the agreement clearly</h2>
              <p>
                Payroll is coming soon. These records support session
                performance and goal tracking without moving money.
              </p>
            </div>
          </header>
          <div className="operator-form-grid operator-form-grid--two">
            <Field
              className="operator-field--wide"
              htmlFor="team-compensation-model"
              label="Compensation model"
            >
              <Select
                id="team-compensation-model"
                name="compensationModel"
                onChange={(event) =>
                  setCompensationModel(
                    event.target.value as StaffProfile["compensationModel"],
                  )
                }
                value={compensationModel}
              >
                <option value="not-set">Not set</option>
                <option value="hourly">Hourly</option>
                <option value="profit-share">Profit share</option>
                <option value="hourly-plus-profit-share">
                  Hourly + profit share
                </option>
              </Select>
            </Field>
            {(compensationModel === "hourly" ||
              compensationModel === "hourly-plus-profit-share") && (
              <Field htmlFor="team-hourly-rate" label="Hourly rate" required>
                <Input
                  defaultValue={
                    person.hourlyRateMinor === undefined
                      ? ""
                      : (person.hourlyRateMinor / 100).toFixed(2)
                  }
                  id="team-hourly-rate"
                  inputMode="decimal"
                  min="0"
                  name="hourlyRate"
                  required
                  step="0.01"
                  type="number"
                />
              </Field>
            )}
            {(compensationModel === "profit-share" ||
              compensationModel === "hourly-plus-profit-share") && (
              <Field
                htmlFor="team-profit-share"
                label="Profit share · %"
                required
              >
                <Input
                  defaultValue={
                    person.profitShareBps === undefined
                      ? ""
                      : (person.profitShareBps / 100).toFixed(2)
                  }
                  id="team-profit-share"
                  inputMode="decimal"
                  max="100"
                  min="0"
                  name="profitSharePercent"
                  required
                  step="0.01"
                  type="number"
                />
              </Field>
            )}
            <Field htmlFor="team-income-goal" label="Income goal">
              <Input
                defaultValue={
                  person.incomeGoalMinor === undefined
                    ? ""
                    : (person.incomeGoalMinor / 100).toFixed(2)
                }
                id="team-income-goal"
                inputMode="decimal"
                min="0"
                name="incomeGoal"
                step="0.01"
                type="number"
              />
            </Field>
            <Field htmlFor="team-goal-period" label="Goal period">
              <Select
                defaultValue={person.incomeGoalPeriod ?? ""}
                id="team-goal-period"
                name="incomeGoalPeriod"
              >
                <option value="">No period</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Annual</option>
              </Select>
            </Field>
          </div>
        </section>

        <section className="hq-card operator-control-card team-member-editor__wide">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Availability</span>
              <h2>Availability and coverage</h2>
              <p>
                Set the recurring rhythm, then protect exceptions with blackout
                dates. Coverage colors show where the rest of the coaching team
                is lightest before you schedule this person.
              </p>
            </div>
          </header>
          <AvailabilityCalendar
            description="Coverage is based on the other active coaches’ recurring availability. Select a day to reserve it as an all-day blackout."
            getDay={(date, dateKey) => {
              const blackout = dateIsBlackout(dateKey, blackouts);
              const available = schedules.some(
                (schedule) =>
                  (!schedule.effectiveFrom ||
                    dateKey >= schedule.effectiveFrom) &&
                  (!schedule.effectiveTo || dateKey <= schedule.effectiveTo) &&
                  schedule.blocks.some(
                    (block) => block.weekday === date.getDay(),
                  ),
              );
              return {
                available,
                selected: blackout,
                tone: coverageTone(date),
                title: blackout
                  ? "Remove all-day blackout"
                  : available
                    ? "Coach is available. Add an all-day blackout"
                    : "Coach is unavailable. Add an all-day blackout",
              };
            }}
            legend={[
              {
                className: "team-calendar-legend__quiet",
                label: "Well covered",
              },
              {
                className: "team-calendar-legend__balanced",
                label: "Balanced",
              },
              {
                className: "team-calendar-legend__available",
                label: "Coach available",
              },
              {
                className: "team-calendar-legend__unavailable",
                label: "Coach unavailable",
              },
              {
                className: "team-calendar-legend__needed",
                label: "Coverage needed",
              },
              {
                className: "team-calendar-legend__blackout",
                label: "Blackout",
              },
            ]}
            onToggle={(dateKey, blackout) =>
              blackout
                ? setBlackouts((current) =>
                    current.filter(
                      (block) =>
                        !(
                          dateKey >= block.startsOn &&
                          dateKey <= (block.endsOn ?? block.startsOn)
                        ),
                    ),
                  )
                : setBlackouts((current) => [
                    ...current,
                    {
                      startsOn: dateKey,
                      startsAt: "00:00",
                      endsAt: "23:59",
                    },
                  ])
            }
            title="Plan the next four months"
          />
          <section className="team-blackouts">
            <header>
              <div>
                <span className="hq-eyebrow">Blackout dates</span>
                <h3>Protect dates they cannot cover</h3>
                <p>
                  Add a single date or a date range, with the precise time it
                  applies. Click a calendar day for a quick all-day blackout.
                </p>
              </div>
              <Badge tone="neutral">{blackouts.length} saved</Badge>
            </header>
            <div className="team-blackouts__form">
              <DunaDateTimePicker
                label="From"
                onChange={(value) => {
                  setBlackoutStart(value.date);
                  setBlackoutStartTime(value.time);
                }}
                value={{ date: blackoutStart, time: blackoutStartTime }}
              />
              <span aria-hidden className="team-blackouts__through">
                to
              </span>
              <DunaDateTimePicker
                label="Through · optional"
                minDate={blackoutStart || undefined}
                minTime={
                  blackoutEnd === blackoutStart ? blackoutStartTime : undefined
                }
                onChange={(value) => {
                  setBlackoutEnd(value.date);
                  setBlackoutEndTime(value.time);
                }}
                value={{ date: blackoutEnd, time: blackoutEndTime }}
              />
              <button
                className="hq-button hq-button--secondary"
                disabled={
                  !blackoutStart ||
                  Boolean(
                    (blackoutEnd && blackoutEnd < blackoutStart) ||
                    (blackoutEnd === blackoutStart &&
                      blackoutEndTime <= blackoutStartTime),
                  )
                }
                onClick={addBlackout}
                type="button"
              >
                <Plus aria-hidden size={16} /> Add blackout
              </button>
            </div>
            {blackouts.length > 0 && (
              <div className="team-blackouts__list">
                {blackouts.map((blackout, index) => (
                  <article key={`${blackout.startsOn}-${index}`}>
                    <span>
                      <small>
                        {blackout.endsOn ? "Date range" : "One day"}
                      </small>
                      <strong>
                        {displayDate(blackout.startsOn)}
                        {blackout.endsOn
                          ? ` – ${displayDate(blackout.endsOn)}`
                          : ""}
                      </strong>
                      <small className="team-blackouts__times">
                        {displayTime(blackout.startsAt)} –{" "}
                        {displayTime(blackout.endsAt)}
                      </small>
                    </span>
                    <button
                      aria-label={`Remove blackout starting ${displayDate(blackout.startsOn)}`}
                      onClick={() =>
                        setBlackouts((current) =>
                          current.filter(
                            (_, candidateIndex) => candidateIndex !== index,
                          ),
                        )
                      }
                      type="button"
                    >
                      <X aria-hidden size={15} />
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="team-recurring-availability">
            <header>
              <span>
                <span className="hq-eyebrow">Availability schedules</span>
                <h3>Named shifts, seasons, and split days</h3>
              </span>
              <button
                className="hq-button hq-button--secondary hq-button--compact"
                onClick={() => {
                  const id = crypto.randomUUID();
                  setSchedules((current) => [
                    ...current,
                    { id, name: "New schedule", blocks: [] },
                  ]);
                  setActiveScheduleId(id);
                }}
                type="button"
              >
                <Plus aria-hidden size={15} /> New schedule
              </button>
            </header>
            <div className="team-schedule-ai">
              <Bot aria-hidden size={19} />
              <span>
                <strong>Draft with Duna AI</strong>
                <small>
                  Describe days and hours naturally. Duna will show the result
                  and check it against every existing schedule before you use
                  it.
                </small>
              </span>
              <input
                onChange={(event) => {
                  setSchedulePrompt(event.target.value);
                  setScheduleDraft(undefined);
                }}
                placeholder="Every Friday, 8am until 2pm EST"
                value={schedulePrompt}
              />
              <button
                className="hq-button hq-button--secondary hq-button--compact"
                disabled={!schedulePrompt.trim()}
                onClick={reviewSchedulePrompt}
                type="button"
              >
                <Sparkles aria-hidden size={15} /> Review draft
              </button>
              {scheduleDraft && (
                <div className="team-schedule-ai__review" role="status">
                  <div>
                    <span
                      className={`team-schedule-ai__status team-schedule-ai__status--${scheduleDraft.status}`}
                    >
                      {scheduleDraft.status === "ready"
                        ? "Ready to review"
                        : "Needs a detail"}
                    </span>
                    <strong>{scheduleDraft.summary}</strong>
                    <small>
                      {scheduleDraft.blocks.length} weekly block
                      {scheduleDraft.blocks.length === 1 ? "" : "s"} found
                    </small>
                  </div>
                  {scheduleDraft.warnings.length > 0 && (
                    <ul>
                      {scheduleDraft.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  )}
                  {scheduleDraft.status === "ready" && (
                    <div className="team-schedule-ai__conflicts">
                      {scheduleDraftConflicts.length > 0 ? (
                        <>
                          <CircleAlert aria-hidden size={16} />
                          <span>
                            <strong>
                              {scheduleDraftConflicts.length} overlap
                              {scheduleDraftConflicts.length === 1 ? "" : "s"}
                            </strong>
                            Review overlapping schedules:{" "}
                            {[
                              ...new Set(
                                scheduleDraftConflicts.map(
                                  (conflict) =>
                                    conflict.existing.scheduleName ??
                                    "Existing schedule",
                                ),
                              ),
                            ].join(", ")}
                            .
                          </span>
                        </>
                      ) : (
                        <>
                          <Check aria-hidden size={16} />
                          <span>
                            <strong>No schedule conflicts</strong>
                            This draft does not overlap the current weekly
                            schedules.
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  <div className="team-schedule-ai__actions">
                    <button
                      className="hq-button hq-button--secondary hq-button--compact"
                      onClick={() => setScheduleDraft(undefined)}
                      type="button"
                    >
                      Keep editing
                    </button>
                    {scheduleDraft.status === "ready" && (
                      <button
                        className="hq-button hq-button--primary hq-button--compact"
                        onClick={applyScheduleDraft}
                        type="button"
                      >
                        <Check aria-hidden size={15} /> Use this draft
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="team-schedule-tabs" role="tablist">
              {schedules.map((schedule) => (
                <button
                  aria-selected={schedule.id === activeSchedule?.id}
                  className={
                    schedule.id === activeSchedule?.id ? "active" : undefined
                  }
                  key={schedule.id}
                  onClick={() => setActiveScheduleId(schedule.id)}
                  role="tab"
                  type="button"
                >
                  <strong>{schedule.name}</strong>
                  <small>
                    {schedule.effectiveFrom
                      ? `${displayDate(schedule.effectiveFrom)}${schedule.effectiveTo ? ` – ${displayDate(schedule.effectiveTo)}` : " onward"}`
                      : "No date range"}
                  </small>
                </button>
              ))}
            </div>
            {activeSchedule && (
              <div className="team-schedule-details">
                <label>
                  <span>Schedule name</span>
                  <input
                    onChange={(event) =>
                      updateSchedule(activeSchedule.id, (schedule) => ({
                        ...schedule,
                        name: event.target.value,
                      }))
                    }
                    value={activeSchedule.name}
                  />
                </label>
                <DunaDateTimePicker
                  dateOnly
                  label="Applies from · optional"
                  onChange={(value) =>
                    updateSchedule(activeSchedule.id, (schedule) => ({
                      ...schedule,
                      effectiveFrom: value.date || undefined,
                    }))
                  }
                  value={{
                    date: activeSchedule.effectiveFrom ?? "",
                    time: "00:00",
                  }}
                />
                <DunaDateTimePicker
                  dateOnly
                  label="Through · optional"
                  minDate={activeSchedule.effectiveFrom}
                  onChange={(value) =>
                    updateSchedule(activeSchedule.id, (schedule) => ({
                      ...schedule,
                      effectiveTo: value.date || undefined,
                    }))
                  }
                  value={{
                    date: activeSchedule.effectiveTo ?? "",
                    time: "23:59",
                  }}
                />
              </div>
            )}
            <div className="team-availability">
              {days.map((day, weekday) => {
                const blocks =
                  activeSchedule?.blocks
                    .map((block, index) => ({ block, index }))
                    .filter(({ block }) => block.weekday === weekday) ?? [];
                return (
                  <div className="team-availability__day" key={day}>
                    <label className="team-availability__toggle">
                      <input
                        checked={blocks.length > 0}
                        onChange={(event) =>
                          toggleDay(weekday, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <strong>{day}</strong>
                    </label>
                    {blocks.length > 0 ? (
                      <span className="team-availability__times">
                        {blocks.map(({ block, index }) => (
                          <span
                            className="team-availability__block"
                            key={`${weekday}-${index}`}
                          >
                            <input
                              aria-label={`${day} block ${index + 1} start`}
                              onChange={(event) =>
                                updateBlock(
                                  index,
                                  weekday,
                                  "startsAt",
                                  event.target.value,
                                )
                              }
                              type="time"
                              value={block.startsAt}
                            />
                            <small>to</small>
                            <input
                              aria-label={`${day} block ${index + 1} end`}
                              onChange={(event) =>
                                updateBlock(
                                  index,
                                  weekday,
                                  "endsAt",
                                  event.target.value,
                                )
                              }
                              type="time"
                              value={block.endsAt}
                            />
                            <button
                              aria-label={`Remove ${day} block ${index + 1}`}
                              onClick={() =>
                                updateSchedule(
                                  activeSchedule!.id,
                                  (schedule) => ({
                                    ...schedule,
                                    blocks: schedule.blocks.filter(
                                      (candidate, candidateIndex) =>
                                        candidateIndex !== index,
                                    ),
                                  }),
                                )
                              }
                              type="button"
                            >
                              <X aria-hidden size={14} />
                            </button>
                          </span>
                        ))}
                        <button
                          className="team-availability__add-block"
                          onClick={() =>
                            updateSchedule(activeSchedule!.id, (schedule) => ({
                              ...schedule,
                              blocks: [
                                ...schedule.blocks,
                                {
                                  weekday,
                                  startsAt: "13:00",
                                  endsAt: "17:00",
                                },
                              ],
                            }))
                          }
                          type="button"
                        >
                          <Plus aria-hidden size={14} /> Add block
                        </button>
                      </span>
                    ) : (
                      <small>Unavailable</small>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </section>

        <section className="hq-card operator-control-card team-member-editor__wide">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Residence + payroll readiness</span>
              <h2>Keep the address complete</h2>
              <p>
                Search with Google Places so state and country reporting remain
                structured. The team member can maintain this information after
                accepting their invitation.
              </p>
            </div>
          </header>
          <AddressEntry
            initial={{
              googlePlaceId: person.googlePlaceId,
              addressLine1: person.addressLine1,
              addressLine2: person.addressLine2,
              locality: person.locality,
              administrativeArea: person.administrativeArea,
              postalCode: person.postalCode,
              countryCode: person.countryCode,
              latitude: person.latitude,
              longitude: person.longitude,
            }}
            label="Search home address"
          />
        </section>
      </div>

      <section className="hq-card team-member-editor__save">
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I reviewed this team profile.</strong>
            <small>
              Role, classification, compensation, and status changes are
              audited.
            </small>
          </span>
        </label>
        {state.status !== "idle" && (
          <p
            className={`operator-action-notice operator-action-notice--${state.status}`}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.status === "success" ? (
              <Check aria-hidden size={16} />
            ) : (
              <CircleAlert aria-hidden size={16} />
            )}
            {state.message}
          </p>
        )}
        <button
          className="hq-button hq-button--primary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Saving…" : "Save team profile"}
        </button>
      </section>
    </form>
  );
}
