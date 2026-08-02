"use client";

import type { OperatorWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import { Check, CircleAlert, ShieldCheck } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import {
  updateStaffProfileAction,
  type OperatorActionState,
} from "@/app/actions";
import { PlaceAddressFields } from "./place-address-fields";

type StaffProfile = OperatorWorkspace["staff"][number];

interface AvailabilityBlock {
  readonly weekday: number;
  readonly startsAt: string;
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

export function TeamMemberEditor({
  person,
}: {
  readonly person: StaffProfile;
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

  return (
    <form action={action} className="team-member-editor">
      <input name="personId" type="hidden" value={person.personId} />
      <input
        name="availability"
        type="hidden"
        value={JSON.stringify(availability)}
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
            <label>
              <span>Role</span>
              <select defaultValue={person.role} name="role">
                <option value="coach">Coach</option>
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
              <h2>When can they coach?</h2>
              <p>
                Availability informs scheduling. Assigned sessions and synced
                calendar conflicts still take precedence.
              </p>
            </div>
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
          <PlaceAddressFields
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
