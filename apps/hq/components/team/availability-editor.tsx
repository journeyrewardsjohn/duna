"use client";

import type { TeamAvailabilityStaff } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import {
  addCalendarDays,
  localDateOf,
  parseNaturalLanguageSchedule,
  wallTimeToInstant,
} from "@duna/scheduling";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  Field,
  FilterChip,
  IconButton,
  Input,
  Notice,
  RadioGroup,
  RadioOption,
  Rise,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  addAwayAction,
  decideTimeOffAction,
  reloadAvailabilityAction,
  removeBlackoutAction,
  saveScheduleAction,
  transitionScheduleAction,
} from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import {
  availabilitySummary,
  dateSpanWords,
  firstName,
  localSpan,
  minuteOf,
  type ScheduleRow,
  scheduleStatusCopy,
  timeOf,
  timeOffStatusCopy,
  weekdayLong,
  weekdayShort,
  weekOrder,
  windowKindLabels,
  windowLabel,
  type WindowRow,
} from "./team-model";
import { reportFailure } from "./team-report";

type Page = TeamAvailabilityStaff;
type Kind = WindowRow["kind"];
interface DraftWindow {
  readonly key: string;
  readonly weekday: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly kind: Kind;
  readonly label?: string;
}
interface Draft {
  readonly scheduleId?: string;
  readonly name: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly sourceText?: string;
  readonly windows: readonly DraftWindow[];
}

const presets = [
  { id: "morning", label: "Morning", startsAt: "08:00", endsAt: "12:00" },
  { id: "afternoon", label: "Afternoon", startsAt: "12:00", endsAt: "17:00" },
  { id: "evening", label: "Evening", startsAt: "17:00", endsAt: "21:00" },
] as const;

/** The timeline a day's bar draws: 6:00 to 23:00. */
const DAY_START = 6 * 60;
const DAY_END = 23 * 60;

let keySeed = 0;
const nextKey = () => `w${(keySeed += 1)}`;

function draftFrom(schedule: ScheduleRow | undefined, today: string): Draft {
  return schedule
    ? {
        scheduleId: schedule.id,
        name: schedule.name,
        effectiveFrom: schedule.effectiveFrom,
        effectiveTo: schedule.effectiveTo ?? "",
        sourceText: schedule.sourceText,
        windows: schedule.windows.map((window) => ({
          key: nextKey(),
          weekday: window.weekday,
          startsAt: window.startsAt.slice(0, 5),
          endsAt: window.endsAt.slice(0, 5),
          kind: window.kind,
          ...(window.label ? { label: window.label } : {}),
        })),
      }
    : {
        name: "Weekly hours",
        effectiveFrom: today,
        effectiveTo: "",
        windows: [],
      };
}

/** Two windows on a day that overlap, in words, or undefined. */
function overlapProblem(windows: readonly DraftWindow[]): string | undefined {
  for (const weekday of weekOrder) {
    const day = windows
      .filter((window) => window.weekday === weekday)
      .map((window) => ({
        start: minuteOf(window.startsAt),
        end:
          minuteOf(window.endsAt) <= minuteOf(window.startsAt)
            ? minuteOf(window.endsAt) + 1440
            : minuteOf(window.endsAt),
      }))
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < day.length; index += 1) {
      if (day[index]!.start < day[index - 1]!.end) {
        return `${weekdayLong[weekday]} has two windows that overlap. Join them or change one.`;
      }
    }
  }
  return undefined;
}

function dayBar(windows: readonly DraftWindow[]) {
  const span = DAY_END - DAY_START;
  return windows.map((window) => {
    const start = Math.max(DAY_START, minuteOf(window.startsAt));
    const rawEnd = minuteOf(window.endsAt);
    const end = Math.min(
      DAY_END,
      rawEnd <= minuteOf(window.startsAt) ? DAY_END : rawEnd,
    );
    return {
      key: window.key,
      left: `${((start - DAY_START) / span) * 100}%`,
      width: `${(Math.max(0, end - start) / span) * 100}%`,
    };
  });
}

/**
 * A member's availability (TM-Availability): the rule's verdict in words;
 * their named schedules; a weekly grid that is quick on a phone (tap
 * Morning / Afternoon / Evening to add a block, copy a day to other days,
 * or describe the week in a sentence); and time away (blackouts need no
 * approval, time off is asked for and decided). Saving a new schedule keeps
 * it a draft until someone chooses to use it.
 */
export function AvailabilityEditor({
  staffProfileId,
  displayName,
  timeZone,
  initial,
  now,
  canEdit,
  canDecide,
  isSelf,
}: {
  readonly staffProfileId: string;
  readonly displayName: string;
  readonly timeZone: string;
  readonly initial: Page;
  readonly now: string;
  /** The member themselves, or a manager. */
  readonly canEdit: boolean;
  /** May approve or decline time off (a manager, never for their own). */
  readonly canDecide: boolean;
  readonly isSelf: boolean;
}) {
  const confirm = useConfirm();
  const [page, setPage] = useState<Page>(initial);
  const today = localDateOf(Date.parse(now), timeZone);
  const first = isSelf ? "you" : firstName(displayName);
  const owner = isSelf ? "Your" : `${firstName(displayName)}'s`;
  const visible = page.schedules.filter((row) => row.status !== "archived");
  const archived = page.schedules.filter((row) => row.status === "archived");
  const [editing, setEditing] = useState<Draft | undefined>(() =>
    canEdit && page.schedules.length === 0
      ? draftFrom(undefined, today)
      : undefined,
  );
  const [copyFrom, setCopyFrom] = useState<number>();
  const [copyTo, setCopyTo] = useState<number[]>([]);
  const [custom, setCustom] = useState<{
    weekday: number;
    startsAt: string;
    endsAt: string;
  }>();
  const [sentence, setSentence] = useState("");
  const [touched, setTouched] = useState(false);
  const [justSaved, setJustSaved] = useState<ScheduleRow>();

  const summary = useMemo(
    () =>
      availabilitySummary({
        schedules: page.schedules,
        blackouts: page.blackouts,
        timeOff: page.timeOff,
        now,
        timeZone,
      }),
    [now, page, timeZone],
  );

  /**
   * Reads the page again after a change (time away gets its ids and the
   * sessions it uncovers; activating a schedule may end another). A
   * schedule this screen just saved stays if the read doesn't have it yet.
   */
  const reload = async () => {
    const fresh = await reloadAvailabilityAction({ staffProfileId });
    if (!fresh.ok) return;
    setPage((current) => ({
      ...fresh.data,
      schedules: [
        ...fresh.data.schedules,
        ...current.schedules.filter(
          (row) => !fresh.data.schedules.some((item) => item.id === row.id),
        ),
      ],
    }));
  };
  const replaceSchedule = (saved: ScheduleRow) =>
    setPage((current) => ({
      ...current,
      schedules: [
        saved,
        ...current.schedules.filter((row) => row.id !== saved.id),
      ],
    }));

  const parsed = useMemo(
    () =>
      sentence.trim() ? parseNaturalLanguageSchedule(sentence) : undefined,
    [sentence],
  );

  const problem = editing
    ? !editing.name.trim()
      ? "Give the schedule a name, like Winter term."
      : !/^\d{4}-\d{2}-\d{2}$/.test(editing.effectiveFrom)
        ? "Choose the first day it applies."
        : editing.effectiveTo && editing.effectiveTo < editing.effectiveFrom
          ? "The last day is before the first day."
          : editing.windows.length === 0
            ? "Add at least one block of time."
            : overlapProblem(editing.windows)
    : undefined;

  const save = useAction(
    async () => {
      if (!editing) throw new Error("Nothing to save.");
      return unwrap(
        await saveScheduleAction({
          ...(editing.scheduleId ? { scheduleId: editing.scheduleId } : {}),
          staffProfileId,
          name: editing.name,
          effectiveFrom: editing.effectiveFrom,
          ...(editing.effectiveTo ? { effectiveTo: editing.effectiveTo } : {}),
          timezone: timeZone,
          ...(editing.sourceText ? { sourceText: editing.sourceText } : {}),
          windows: editing.windows.map((window) => ({
            weekday: window.weekday,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            kind: window.kind,
            ...(window.label ? { label: window.label } : {}),
          })),
        }),
      );
    },
    {
      messages: {
        success: (saved) =>
          saved.status === "draft"
            ? `${saved.name} saved as a draft`
            : `${saved.name} saved`,
        error: "The hours weren't saved. Nothing changed.",
      },
      report: reportFailure("hq.team.schedule_save_failed"),
      onSuccess: (saved) => {
        setJustSaved(saved);
        setEditing(undefined);
        replaceSchedule(saved);
      },
    },
  );

  const setWindows = (
    update: (windows: readonly DraftWindow[]) => DraftWindow[],
  ) =>
    setEditing((current) =>
      current ? { ...current, windows: update(current.windows) } : current,
    );

  const addWindow = (weekday: number, startsAt: string, endsAt: string) =>
    setWindows((windows) => [
      ...windows,
      { key: nextKey(), weekday, startsAt, endsAt, kind: "coaching" },
    ]);

  const applyCopy = () => {
    if (copyFrom === undefined) return;
    setWindows((windows) => {
      const source = windows.filter((window) => window.weekday === copyFrom);
      return [
        ...windows.filter((window) => !copyTo.includes(window.weekday)),
        ...copyTo.flatMap((weekday) =>
          source.map((window) => ({ ...window, key: nextKey(), weekday })),
        ),
      ];
    });
    setCopyFrom(undefined);
    setCopyTo([]);
  };

  const transition = (
    schedule: ScheduleRow,
    to: "active" | "fallback" | "archived",
  ) => {
    const words =
      to === "active"
        ? {
            title: `Use ${schedule.name} from ${dateSpanWords(schedule.effectiveFrom, schedule.effectiveFrom)}?`,
            description: `From that day Duna books ${first} only inside these hours. A schedule still running then ends the day before.`,
            affected:
              "Sessions already booked outside these hours are listed under Coverage for someone to cover.",
            verb: `Use ${schedule.name}`,
          }
        : to === "fallback"
          ? {
              title: `Make ${schedule.name} the fallback?`,
              description: `Duna uses it whenever no other schedule covers a date.`,
              affected: undefined,
              verb: "Make it the fallback",
            }
          : {
              title: `Archive ${schedule.name}?`,
              description: `It stops counting. It is kept for history.`,
              affected:
                "Sessions already booked in these hours are listed under Coverage if no other schedule covers them.",
              verb: `Archive ${schedule.name}`,
            };
    void confirm
      .run({
        tier: "confirm",
        destructive: to === "archived",
        title: words.title,
        description: words.description,
        affected: words.affected,
        verb: words.verb,
        cancelLabel: "Not now",
        agentConfirm: `${words.verb} for ${displayName}`,
        perform: async () =>
          unwrap(
            await transitionScheduleAction({ scheduleId: schedule.id, to }),
          ),
        success:
          to === "archived"
            ? `${schedule.name} archived`
            : `${schedule.name} is in use`,
      })
      .then(async (outcome) => {
        if (outcome.status === "done") {
          setJustSaved(undefined);
          replaceSchedule(outcome.result as ScheduleRow);
          await reload();
        }
      });
  };

  /* ---------------------------------------------------------- time away */
  const [awayKind, setAwayKind] = useState<"blackout" | "time-off">("blackout");
  const [awayFrom, setAwayFrom] = useState("");
  const [awayTo, setAwayTo] = useState("");
  const [awayReason, setAwayReason] = useState("");
  const [awayTouched, setAwayTouched] = useState(false);
  const awayProblem = !/^\d{4}-\d{2}-\d{2}$/.test(awayFrom)
    ? "Choose the first day."
    : awayTo && awayTo < awayFrom
      ? "The last day is before the first day."
      : undefined;

  const addAway = () => {
    setAwayTouched(true);
    if (awayProblem) return;
    const last = awayTo || awayFrom;
    const startsAt = new Date(
      wallTimeToInstant(awayFrom, 0, timeZone),
    ).toISOString();
    const endsAt = new Date(
      wallTimeToInstant(addCalendarDays(last, 1), 0, timeZone),
    ).toISOString();
    const span = dateSpanWords(awayFrom, last);
    void confirm
      .run({
        tier: "confirm",
        title:
          awayKind === "blackout"
            ? `Mark ${first} as unable to work ${span}?`
            : `Ask for time off ${span}?`,
        description:
          awayKind === "blackout"
            ? `Duna won't book ${first} on those days. No approval is needed.`
            : `A manager approves or declines it. Until then nothing changes.`,
        affected:
          awayKind === "blackout"
            ? "Sessions already booked then are listed under Coverage for someone to cover."
            : "If it is approved, sessions booked then are listed under Coverage.",
        verb: awayKind === "blackout" ? "Add the days" : "Ask for time off",
        cancelLabel: "Not now",
        agentConfirm:
          awayKind === "blackout"
            ? `Marks ${displayName} unavailable ${span}`
            : `Asks for time off for ${displayName} ${span}`,
        perform: async () =>
          unwrap(
            await addAwayAction({
              kind: awayKind,
              staffProfileId,
              startsAt,
              endsAt,
              reason: awayReason,
            }),
          ),
        success: (result: { sessionsNeedingCover: number }) =>
          result.sessionsNeedingCover > 0
            ? `Added. ${result.sessionsNeedingCover} booked ${result.sessionsNeedingCover === 1 ? "session needs" : "sessions need"} cover.`
            : "Added. No booked sessions are affected.",
      })
      .then(async (outcome) => {
        if (outcome.status === "done") {
          setAwayFrom("");
          setAwayTo("");
          setAwayReason("");
          setAwayTouched(false);
          await reload();
        }
      });
  };

  const removeBlackout = (blackout: Page["blackouts"][number]) => {
    const span = localSpan(blackout.startsAt, blackout.endsAt, timeZone);
    void confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: `Remove the days ${dateSpanWords(span.from, span.to)}?`,
        description: `${first === "you" ? "You" : firstName(displayName)} can be booked on those days again.`,
        verb: "Remove the days",
        cancelLabel: "Keep them",
        agentConfirm: `Removes ${displayName}'s blackout ${dateSpanWords(span.from, span.to)}`,
        perform: async () =>
          unwrap(await removeBlackoutAction({ blackoutId: blackout.id })),
        success: "Removed",
      })
      .then(async (outcome) => {
        if (outcome.status === "done") await reload();
      });
  };

  const decide = (
    row: Page["timeOff"][number],
    decision: "approved" | "declined" | "cancelled",
  ) => {
    const span = localSpan(row.startsAt, row.endsAt, timeZone);
    const when = dateSpanWords(span.from, span.to);
    void confirm
      .run({
        tier: "confirm",
        destructive: decision !== "approved",
        title:
          decision === "approved"
            ? `Approve time off ${when}?`
            : decision === "declined"
              ? `Decline time off ${when}?`
              : `Cancel the time off ${when}?`,
        description:
          decision === "approved"
            ? `${firstName(displayName)} isn't booked on those days.`
            : decision === "declined"
              ? `${firstName(displayName)} stays bookable on those days.`
              : "It no longer counts.",
        affected:
          decision === "approved" && row.sessionsNeedingCover > 0
            ? `${row.sessionsNeedingCover} booked ${row.sessionsNeedingCover === 1 ? "session goes" : "sessions go"} to Coverage for someone to cover.`
            : undefined,
        verb:
          decision === "approved"
            ? "Approve time off"
            : decision === "declined"
              ? "Decline time off"
              : "Cancel time off",
        cancelLabel: "Not now",
        agentConfirm: `${decision === "approved" ? "Approves" : decision === "declined" ? "Declines" : "Cancels"} ${displayName}'s time off ${when}`,
        perform: async () =>
          unwrap(await decideTimeOffAction({ timeOffId: row.id, decision })),
        success:
          decision === "approved"
            ? "Time off approved"
            : decision === "declined"
              ? "Time off declined"
              : "Time off cancelled",
      })
      .then(async (outcome) => {
        if (outcome.status === "done") await reload();
      });
  };

  const awayRows = [
    ...page.blackouts.map((row) => ({ kind: "blackout" as const, row })),
    ...page.timeOff.map((row) => ({ kind: "time-off" as const, row })),
  ].sort((a, b) => a.row.startsAt.localeCompare(b.row.startsAt));

  return (
    <div className="team-availability">
      <section aria-label="In words" className="team-verdict">
        <Icon name="schedule" size="control" />
        <p>
          <strong>{summary}.</strong>{" "}
          <span className="team-quiet">
            Duna books {first} only inside these hours and never during time
            away or another session.
          </span>
        </p>
      </section>

      {justSaved?.status === "draft" ? (
        <Rise from="top">
          <Notice
            action={
              <Button
                onClick={() => transition(justSaved, "active")}
                size="sm"
                variant="primary"
              >
                {`Use it from ${dateSpanWords(justSaved.effectiveFrom, justSaved.effectiveFrom)}`}
              </Button>
            }
            role="status"
            title={`${justSaved.name} is saved as a draft`}
            tone="info"
          >
            A draft doesn&apos;t change who is free until you use it.
          </Notice>
        </Rise>
      ) : null}

      <section aria-labelledby="schedules-title" className="hqs-section">
        <div className="hqs-section__head">
          <h2 className="hqs-section__title" id="schedules-title">
            Schedules
          </h2>
          {canEdit && !editing ? (
            <div className="hqs-section__aside">
              <Button
                onClick={() => {
                  setJustSaved(undefined);
                  setEditing(draftFrom(undefined, today));
                }}
                size="sm"
                variant="secondary"
              >
                New schedule
              </Button>
            </div>
          ) : null}
        </div>
        <div className="hqs-section__body">
          {visible.length === 0 && !editing ? (
            <p className="team-quiet">{`No schedule yet. ${canEdit ? "Add the hours " + first + " can work." : ""}`}</p>
          ) : (
            <ul className="team-list" aria-label="Schedules">
              {visible.map((schedule) => {
                const status = scheduleStatusCopy(schedule.status);
                return (
                  <li className="team-schedule" key={schedule.id}>
                    <div className="team-row__who">
                      <span className="team-row__name">{schedule.name}</span>
                      <span className="team-quiet">
                        {schedule.effectiveTo
                          ? `${dateSpanWords(schedule.effectiveFrom, schedule.effectiveTo)}`
                          : `From ${dateSpanWords(schedule.effectiveFrom, schedule.effectiveFrom)}`}
                        {` · ${schedule.windows.length} ${schedule.windows.length === 1 ? "block" : "blocks"} a week`}
                      </span>
                      {schedule.sourceText ? (
                        <span className="team-quiet">
                          “{schedule.sourceText}”
                        </span>
                      ) : null}
                    </div>
                    <Chip tone={status.tone}>{status.label}</Chip>
                    {canEdit ? (
                      <div className="team-row__actions">
                        <Button
                          onClick={() => {
                            setJustSaved(undefined);
                            setEditing(draftFrom(schedule, today));
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          Edit
                        </Button>
                        {schedule.status === "draft" ? (
                          <>
                            <Button
                              onClick={() => transition(schedule, "active")}
                              size="sm"
                              variant="secondary"
                            >
                              Use it
                            </Button>
                            <Button
                              onClick={() => transition(schedule, "fallback")}
                              size="sm"
                              variant="ghost"
                            >
                              Make fallback
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() => transition(schedule, "archived")}
                            size="sm"
                            variant="ghost"
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {archived.length > 0 ? (
            <p className="team-quiet">
              {`Archived: ${archived.map((row) => row.name).join(", ")}.`}
            </p>
          ) : null}
        </div>
      </section>

      {editing ? (
        <Rise from="top">
          <section
            aria-labelledby="week-title"
            className="hqs-section team-week"
          >
            <div className="hqs-section__head">
              <h2 className="hqs-section__title" id="week-title">
                {editing.scheduleId ? `Edit ${editing.name}` : "New schedule"}
              </h2>
            </div>
            <div className="hqs-section__body">
              <div className="team-week__meta">
                <Field label="Name">
                  <Input
                    maxLength={80}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEditing((current) =>
                        current ? { ...current, name: value } : current,
                      );
                    }}
                    value={editing.name}
                  />
                </Field>
                <Field label="First day">
                  <Input
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEditing((current) =>
                        current
                          ? { ...current, effectiveFrom: value }
                          : current,
                      );
                    }}
                    type="date"
                    value={editing.effectiveFrom}
                  />
                </Field>
                <Field
                  hint="Leave empty to keep it going."
                  label="Last day"
                  optional
                >
                  <Input
                    min={editing.effectiveFrom}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setEditing((current) =>
                        current ? { ...current, effectiveTo: value } : current,
                      );
                    }}
                    type="date"
                    value={editing.effectiveTo}
                  />
                </Field>
              </div>

              <div className="team-describe">
                <Field
                  hint="Say it like you would to a colleague: “Mon and Wed 3 to 8, Saturday mornings”."
                  label="Describe the week"
                  optional
                >
                  <Input
                    onChange={(event) => setSentence(event.currentTarget.value)}
                    placeholder="Mon and Wed 3 to 8, Sat 9 to 12"
                    value={sentence}
                  />
                </Field>
                {parsed ? (
                  <div aria-live="polite" className="team-describe__result">
                    {parsed.status === "ready" ? (
                      <>
                        <span className="team-chips">
                          {parsed.blocks.map((block) => (
                            <Chip
                              key={`${block.weekday}-${block.startsAtMinute}`}
                              kind="taxonomy"
                            >
                              {`${weekdayShort[block.weekday]} ${windowLabel(timeOf(block.startsAtMinute), timeOf(block.endsAtMinute))}`}
                            </Chip>
                          ))}
                        </span>
                        <Button
                          onClick={() => {
                            setEditing((current) =>
                              current
                                ? {
                                    ...current,
                                    sourceText: sentence.trim(),
                                    windows: parsed.blocks.map((block) => ({
                                      key: nextKey(),
                                      weekday: block.weekday,
                                      startsAt: timeOf(block.startsAtMinute),
                                      endsAt: timeOf(block.endsAtMinute),
                                      kind: "coaching" as const,
                                    })),
                                  }
                                : current,
                            );
                            setSentence("");
                          }}
                          size="sm"
                          variant="secondary"
                        >
                          Use these hours
                        </Button>
                      </>
                    ) : (
                      <span className="team-quiet">
                        {parsed.warnings[0] ?? parsed.reason}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>

              <ol aria-label="The week" className="team-days">
                {weekOrder.map((weekday) => {
                  const windows = editing.windows
                    .filter((window) => window.weekday === weekday)
                    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
                  return (
                    <li className="team-day" key={weekday}>
                      <div className="team-day__head">
                        <span className="team-day__name">
                          <abbr title={weekdayLong[weekday]}>
                            {weekdayShort[weekday]}
                          </abbr>
                        </span>
                        <span aria-hidden="true" className="team-day__bar">
                          {dayBar(windows).map((bar) => (
                            <i
                              key={bar.key}
                              style={{ left: bar.left, width: bar.width }}
                            />
                          ))}
                        </span>
                      </div>
                      <div className="team-day__windows">
                        {windows.length === 0 ? (
                          <span className="team-quiet">Not available</span>
                        ) : (
                          windows.map((window) => (
                            <span className="team-window" key={window.key}>
                              <span className="team-num">
                                {windowLabel(window.startsAt, window.endsAt)}
                              </span>
                              {window.kind !== "coaching" || window.label ? (
                                <span className="team-quiet">
                                  {window.label ??
                                    windowKindLabels[window.kind]}
                                </span>
                              ) : null}
                              <IconButton
                                label={`Remove ${weekdayLong[weekday]} ${windowLabel(window.startsAt, window.endsAt)}`}
                                onClick={() =>
                                  setWindows((all) =>
                                    all.filter(
                                      (item) => item.key !== window.key,
                                    ),
                                  )
                                }
                                size="sm"
                                variant="ghost"
                              >
                                <Icon name="close" size="inline" />
                              </IconButton>
                            </span>
                          ))
                        )}
                      </div>
                      <div className="team-day__add">
                        {presets.map((preset) => (
                          <Button
                            aria-label={`Add ${weekdayLong[weekday]} ${preset.label.toLocaleLowerCase()}`}
                            key={preset.id}
                            onClick={() =>
                              addWindow(weekday, preset.startsAt, preset.endsAt)
                            }
                            size="sm"
                            variant="ghost"
                          >
                            <Icon name="plus" size="chip" />
                            {preset.label}
                          </Button>
                        ))}
                        <Button
                          aria-label={`Add custom hours on ${weekdayLong[weekday]}`}
                          onClick={() =>
                            setCustom({
                              weekday,
                              startsAt: "09:00",
                              endsAt: "12:00",
                            })
                          }
                          size="sm"
                          variant="ghost"
                        >
                          Custom
                        </Button>
                        {windows.length > 0 ? (
                          <Button
                            aria-label={`Copy ${weekdayLong[weekday]} to other days`}
                            onClick={() => {
                              setCopyFrom(weekday);
                              setCopyTo([]);
                            }}
                            size="sm"
                            variant="ghost"
                          >
                            Copy day
                          </Button>
                        ) : null}
                      </div>
                      {custom?.weekday === weekday ? (
                        <div className="team-day__custom">
                          <Field label="From">
                            <Input
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setCustom((current) =>
                                  current
                                    ? { ...current, startsAt: value }
                                    : current,
                                );
                              }}
                              type="time"
                              value={custom.startsAt}
                            />
                          </Field>
                          <Field label="To">
                            <Input
                              onChange={(event) => {
                                const value = event.currentTarget.value;
                                setCustom((current) =>
                                  current
                                    ? { ...current, endsAt: value }
                                    : current,
                                );
                              }}
                              type="time"
                              value={custom.endsAt}
                            />
                          </Field>
                          <Button
                            onClick={() => {
                              addWindow(
                                weekday,
                                custom.startsAt,
                                custom.endsAt,
                              );
                              setCustom(undefined);
                            }}
                            size="sm"
                            variant="secondary"
                          >
                            Add
                          </Button>
                          <Button
                            onClick={() => setCustom(undefined)}
                            size="sm"
                            variant="ghost"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                      {copyFrom === weekday ? (
                        <div className="team-day__copy">
                          <span className="team-quiet">{`Copy ${weekdayShort[weekday]} to:`}</span>
                          <div
                            aria-label={`Days to copy ${weekdayLong[weekday]} to`}
                            className="team-chips"
                            role="group"
                          >
                            {weekOrder
                              .filter((day) => day !== weekday)
                              .map((day) => (
                                <FilterChip
                                  key={day}
                                  onPressedChange={(pressed) =>
                                    setCopyTo((current) =>
                                      pressed
                                        ? [...current, day]
                                        : current.filter(
                                            (item) => item !== day,
                                          ),
                                    )
                                  }
                                  pressed={copyTo.includes(day)}
                                >
                                  {weekdayShort[day]}
                                </FilterChip>
                              ))}
                          </div>
                          <Button
                            disabled={copyTo.length === 0}
                            onClick={applyCopy}
                            size="sm"
                            variant="secondary"
                          >
                            Copy
                          </Button>
                          <Button
                            onClick={() => setCopyFrom(undefined)}
                            size="sm"
                            variant="ghost"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>

              {touched && problem ? (
                <Notice role="alert" tone="attention">
                  {problem}
                </Notice>
              ) : null}
              <div className="team-form__actions">
                <Button onClick={() => setEditing(undefined)} variant="ghost">
                  Cancel
                </Button>
                <Button
                  loading={save.showPending}
                  onClick={() => {
                    setTouched(true);
                    if (!problem) void save.run();
                  }}
                  variant="primary"
                >
                  {editing.scheduleId ? "Save changes" : "Save as a draft"}
                </Button>
              </div>
            </div>
          </section>
        </Rise>
      ) : null}

      <section aria-labelledby="away-title" className="hqs-section">
        <div className="hqs-section__head">
          <h2 className="hqs-section__title" id="away-title">
            Time away
          </h2>
        </div>
        <div className="hqs-section__body">
          {awayRows.length === 0 ? (
            <p className="team-quiet">No time away coming up.</p>
          ) : (
            <ul className="team-list" aria-label="Time away">
              {awayRows.map(({ kind, row }) => {
                const span = localSpan(row.startsAt, row.endsAt, timeZone);
                const status =
                  kind === "blackout"
                    ? { label: "Can't work", tone: "neutral" as const }
                    : timeOffStatusCopy(
                        (row as Page["timeOff"][number]).status,
                      );
                const timeOff =
                  kind === "time-off"
                    ? (row as Page["timeOff"][number])
                    : undefined;
                return (
                  <li className="team-schedule" key={row.id}>
                    <div className="team-row__who">
                      <span className="team-row__name">
                        {dateSpanWords(span.from, span.to)}
                      </span>
                      <span className="team-quiet">
                        {kind === "blackout" ? "Blackout" : "Time off"}
                        {row.reason ? ` · ${row.reason}` : ""}
                        {timeOff?.decisionNote
                          ? ` · ${timeOff.decisionNote}`
                          : ""}
                      </span>
                      {row.sessionsNeedingCover > 0 &&
                      (kind === "blackout" ||
                        timeOff?.status === "approved") ? (
                        <Link
                          className="team-link"
                          href={hqHref("teamCoverage")}
                        >
                          {`${row.sessionsNeedingCover} ${row.sessionsNeedingCover === 1 ? "session needs" : "sessions need"} cover`}
                        </Link>
                      ) : null}
                    </div>
                    <Chip tone={status.tone}>{status.label}</Chip>
                    <div className="team-row__actions">
                      {kind === "blackout" && canEdit ? (
                        <Button
                          onClick={() =>
                            removeBlackout(row as Page["blackouts"][number])
                          }
                          size="sm"
                          variant="ghost"
                        >
                          Remove
                        </Button>
                      ) : null}
                      {timeOff?.status === "requested" && canDecide ? (
                        <>
                          <Button
                            onClick={() => decide(timeOff, "approved")}
                            size="sm"
                            variant="secondary"
                          >
                            Approve
                          </Button>
                          <Button
                            onClick={() => decide(timeOff, "declined")}
                            size="sm"
                            variant="ghost"
                          >
                            Decline
                          </Button>
                        </>
                      ) : null}
                      {timeOff &&
                      (timeOff.status === "requested" ||
                        timeOff.status === "approved") &&
                      (isSelf || canDecide) ? (
                        <Button
                          onClick={() => decide(timeOff, "cancelled")}
                          size="sm"
                          variant="ghost"
                        >
                          Cancel it
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {canEdit ? (
            <form
              aria-label="Add time away"
              className="team-away-form"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                addAway();
              }}
            >
              <RadioGroup
                aria-label="What kind"
                inline
                onValueChange={(value) =>
                  setAwayKind(value as "blackout" | "time-off")
                }
                value={awayKind}
              >
                <RadioOption
                  description="No approval needed"
                  label={
                    isSelf
                      ? "I can't work"
                      : `${firstName(displayName)} can't work`
                  }
                  value="blackout"
                />
                <RadioOption
                  description="A manager decides"
                  label="Ask for time off"
                  value="time-off"
                />
              </RadioGroup>
              <div className="team-week__meta">
                <Field
                  error={awayTouched ? awayProblem : undefined}
                  label="First day"
                >
                  <Input
                    min={today}
                    onChange={(event) => setAwayFrom(event.currentTarget.value)}
                    type="date"
                    value={awayFrom}
                  />
                </Field>
                <Field
                  hint="Leave empty for one day."
                  label="Last day"
                  optional
                >
                  <Input
                    min={awayFrom || today}
                    onChange={(event) => setAwayTo(event.currentTarget.value)}
                    type="date"
                    value={awayTo}
                  />
                </Field>
                <Field label="Reason" optional>
                  <Input
                    maxLength={500}
                    onChange={(event) =>
                      setAwayReason(event.currentTarget.value)
                    }
                    placeholder="Tournament travel"
                    value={awayReason}
                  />
                </Field>
              </div>
              <div className="team-form__actions team-form__actions--start">
                <Button type="submit" variant="secondary">
                  {awayKind === "blackout"
                    ? "Add the days"
                    : "Ask for time off"}
                </Button>
              </div>
            </form>
          ) : (
            <p className="team-quiet">{`${owner} time away is changed by them or a manager.`}</p>
          )}
        </div>
      </section>
      {confirm.dialog}
    </div>
  );
}
