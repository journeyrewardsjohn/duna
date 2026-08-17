"use client";

import type { OperatorWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  updateStaffProfileAction,
  type OperatorActionState,
} from "@/app/actions";
import { AddressEntry } from "./place-address-fields";

type StaffProfile = OperatorWorkspace["staff"][number];

interface AvailabilityBlock {
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
}

interface BlackoutDate {
  readonly startsOn: string;
  readonly endsOn?: string;
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

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
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

function normalizeBlackouts(
  value: StaffProfile["availability"],
): BlackoutDate[] {
  return value.flatMap((entry) => {
    const startsOn = typeof entry.startsOn === "string" ? entry.startsOn : "";
    const endsOn = typeof entry.endsOn === "string" ? entry.endsOn : undefined;
    return entry.kind === "blackout" && /^\d{4}-\d{2}-\d{2}$/.test(startsOn)
      ? [{ startsOn, ...(endsOn ? { endsOn } : {}) }]
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
  const [compensationModel, setCompensationModel] = useState(
    person.compensationModel,
  );
  const [availability, setAvailability] = useState<AvailabilityBlock[]>(
    normalizeAvailability(person.availability),
  );
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>(
    normalizeBlackouts(person.availability),
  );
  const [blackoutStart, setBlackoutStart] = useState("");
  const [blackoutEnd, setBlackoutEnd] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const availabilityByDay = useMemo(
    () => new Map(availability.map((block) => [block.weekday, block] as const)),
    [availability],
  );

  function toggleDay(weekday: number, enabled: boolean) {
    setAvailability((current) =>
      enabled
        ? current.some((block) => block.weekday === weekday)
          ? current
          : [...current, { weekday, startsAt: "09:00", endsAt: "17:00" }]
        : current.filter((block) => block.weekday !== weekday),
    );
  }

  function updateDay(
    weekday: number,
    field: "startsAt" | "endsAt",
    value: string,
  ) {
    setAvailability((current) =>
      current.map((block) =>
        block.weekday === weekday ? { ...block, [field]: value } : block,
      ),
    );
  }

  function addBlackout() {
    if (!blackoutStart || (blackoutEnd && blackoutEnd < blackoutStart)) return;
    setBlackouts((current) => [
      ...current,
      {
        startsOn: blackoutStart,
        ...(blackoutEnd ? { endsOn: blackoutEnd } : {}),
      },
    ]);
    setBlackoutStart("");
    setBlackoutEnd("");
  }

  const monthDays = useMemo(() => {
    const start = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth(),
      1,
    );
    const end = new Date(
      calendarMonth.getFullYear(),
      calendarMonth.getMonth() + 1,
      0,
    );
    const leading = Array.from(
      { length: start.getDay() },
      () => undefined as Date | undefined,
    );
    const days = Array.from(
      { length: end.getDate() },
      (_, index) => new Date(start.getFullYear(), start.getMonth(), index + 1),
    );
    return [...leading, ...days];
  }, [calendarMonth]);
  const activeCoaches = workspace.staff.filter(
    (candidate) =>
      candidate.active &&
      candidate.role === "coach" &&
      candidate.personId !== person.personId,
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
      <input name="personId" type="hidden" value={person.personId} />
      <input
        name="availability"
        type="hidden"
        value={JSON.stringify(availability)}
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
            <label className="operator-field--wide">
              <span>Public display name</span>
              <input
                defaultValue={person.displayName}
                maxLength={80}
                minLength={2}
                name="displayName"
                placeholder="Coach Ticao"
                required
                type="text"
              />
              <small>
                This is the name players see on coach profiles, services, and
                schedules.
              </small>
            </label>
            <label>
              <span>Role</span>
              <select defaultValue={person.role} name="role">
                <option value="coach">Coach</option>
                <option value="director">Director</option>
                <option value="manager">Manager</option>
                <option value="front-desk">Front desk</option>
                <option value="accountant">Accountant</option>
              </select>
            </label>
            <label>
              <span>Worker classification</span>
              <select
                defaultValue={person.workerClassification}
                name="workerClassification"
              >
                <option value="not-set">Not set yet</option>
                <option value="1099-contractor">1099 contractor</option>
                <option value="w2-employee">W-2 employee</option>
              </select>
            </label>
            <label className="operator-field--wide">
              <span>Status</span>
              <select
                defaultValue={person.active ? "true" : "false"}
                name="active"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
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
            <label className="operator-field--wide">
              <span>Compensation model</span>
              <select
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
              </select>
            </label>
            {(compensationModel === "hourly" ||
              compensationModel === "hourly-plus-profit-share") && (
              <label>
                <span>Hourly rate</span>
                <input
                  defaultValue={
                    person.hourlyRateMinor === undefined
                      ? ""
                      : (person.hourlyRateMinor / 100).toFixed(2)
                  }
                  inputMode="decimal"
                  min="0"
                  name="hourlyRate"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
            )}
            {(compensationModel === "profit-share" ||
              compensationModel === "hourly-plus-profit-share") && (
              <label>
                <span>Profit share · %</span>
                <input
                  defaultValue={
                    person.profitShareBps === undefined
                      ? ""
                      : (person.profitShareBps / 100).toFixed(2)
                  }
                  inputMode="decimal"
                  max="100"
                  min="0"
                  name="profitSharePercent"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
            )}
            <label>
              <span>Income goal</span>
              <input
                defaultValue={
                  person.incomeGoalMinor === undefined
                    ? ""
                    : (person.incomeGoalMinor / 100).toFixed(2)
                }
                inputMode="decimal"
                min="0"
                name="incomeGoal"
                step="0.01"
                type="number"
              />
            </label>
            <label>
              <span>Goal period</span>
              <select
                defaultValue={person.incomeGoalPeriod ?? ""}
                name="incomeGoalPeriod"
              >
                <option value="">No period</option>
                <option value="week">Weekly</option>
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Annual</option>
              </select>
            </label>
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
          <div className="team-availability-calendar">
            <header>
              <div>
                <span className="team-calendar-icon">
                  <CalendarDays aria-hidden size={17} />
                </span>
                <span>
                  <strong>
                    {new Intl.DateTimeFormat("en-US", {
                      month: "long",
                      year: "numeric",
                    }).format(calendarMonth)}
                  </strong>
                  <small>
                    Coverage is based on other active coaches’ recurring
                    availability.
                  </small>
                </span>
              </div>
              <span className="team-calendar-controls">
                <button
                  aria-label="Previous month"
                  onClick={() =>
                    setCalendarMonth(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() - 1,
                          1,
                        ),
                    )
                  }
                  type="button"
                >
                  <ChevronLeft aria-hidden size={17} />
                </button>
                <button
                  aria-label="Next month"
                  onClick={() =>
                    setCalendarMonth(
                      (current) =>
                        new Date(
                          current.getFullYear(),
                          current.getMonth() + 1,
                          1,
                        ),
                    )
                  }
                  type="button"
                >
                  <ChevronRight aria-hidden size={17} />
                </button>
              </span>
            </header>
            <div className="team-calendar-weekdays">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <span key={day}>{day}</span>
              ))}
            </div>
            <div className="team-calendar-grid">
              {monthDays.map((date, index) => {
                if (!date)
                  return (
                    <span
                      className="team-calendar-blank"
                      key={`blank-${index}`}
                    />
                  );
                const dateKey = localDateKey(date);
                const blackout = dateIsBlackout(dateKey, blackouts);
                const tone = coverageTone(date);
                return (
                  <button
                    className={`team-calendar-day team-calendar-day--${tone}${blackout ? " team-calendar-day--blackout" : ""}`}
                    key={dateKey}
                    onClick={() =>
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
                            { startsOn: dateKey },
                          ])
                    }
                    title={blackout ? "Remove blackout" : "Add blackout"}
                    type="button"
                  >
                    <span>{date.getDate()}</span>
                    {blackout ? <X aria-hidden size={13} /> : <i />}
                  </button>
                );
              })}
            </div>
            <footer>
              <span>
                <i className="team-calendar-legend__quiet" />
                Well covered
              </span>
              <span>
                <i className="team-calendar-legend__balanced" />
                Balanced
              </span>
              <span>
                <i className="team-calendar-legend__needed" />
                Coverage needed
              </span>
              <span>
                <i className="team-calendar-legend__blackout" />
                Blackout
              </span>
            </footer>
          </div>
          <section className="team-blackouts">
            <header>
              <div>
                <span className="hq-eyebrow">Blackout dates</span>
                <h3>Protect dates they cannot cover</h3>
                <p>
                  Add a single date or a date range. Click a calendar day for a
                  quick one-day blackout.
                </p>
              </div>
              <Badge tone="neutral">{blackouts.length} saved</Badge>
            </header>
            <div className="team-blackouts__form">
              <label>
                <span>From</span>
                <input
                  onChange={(event) => setBlackoutStart(event.target.value)}
                  type="date"
                  value={blackoutStart}
                />
              </label>
              <label>
                <span>
                  Through <em>optional</em>
                </span>
                <input
                  min={blackoutStart || undefined}
                  onChange={(event) => setBlackoutEnd(event.target.value)}
                  type="date"
                  value={blackoutEnd}
                />
              </label>
              <button
                className="hq-button hq-button--secondary"
                disabled={
                  !blackoutStart ||
                  Boolean(blackoutEnd && blackoutEnd < blackoutStart)
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
              <span className="hq-eyebrow">Recurring rhythm</span>
              <h3>Usual weekly availability</h3>
            </header>
            <div className="team-availability">
              {days.map((day, weekday) => {
                const block = availabilityByDay.get(weekday);
                return (
                  <div className="team-availability__day" key={day}>
                    <label className="team-availability__toggle">
                      <input
                        checked={Boolean(block)}
                        onChange={(event) =>
                          toggleDay(weekday, event.target.checked)
                        }
                        type="checkbox"
                      />
                      <strong>{day}</strong>
                    </label>
                    {block ? (
                      <span className="team-availability__times">
                        <input
                          aria-label={`${day} start`}
                          onChange={(event) =>
                            updateDay(weekday, "startsAt", event.target.value)
                          }
                          type="time"
                          value={block.startsAt}
                        />
                        <small>to</small>
                        <input
                          aria-label={`${day} end`}
                          onChange={(event) =>
                            updateDay(weekday, "endsAt", event.target.value)
                          }
                          type="time"
                          value={block.endsAt}
                        />
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
