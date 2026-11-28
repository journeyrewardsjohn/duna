"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  ConditionsLine,
  DatePicker,
  EmptyFirstUse,
  EmptyState,
  errorToast,
  Field,
  FilterChip,
  Notice,
  OfflineBanner,
  Select,
  Sheet,
  SheetContent,
  TimeZoneNote,
  undoToast,
  useConfirm,
} from "@duna/ui/tideline";
import { localDateOf } from "@duna/scheduling";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checkInAction,
  coachAvailabilityAction,
  moveItemAction,
} from "@/app/(next)/(hq)/schedule/actions";
import { ClosureSheet, type ClosureDraft } from "./closure-sheet";
import { CreateSheet, type CreateDraft } from "./create-sheet";
import { ItemPanel } from "./item-panel";
import { NowAndNextStrip } from "./now-next";
import { ScheduleAgenda } from "./schedule-agenda";
import type { ScheduleData } from "./schedule-data";
import { ScheduleGrid, type Lane, type SlotDraft } from "./schedule-grid";
import {
  clock,
  clockRange,
  durationWords,
  explainConflicts,
  filterItems,
  itemKey,
  itemKinds,
  kindFilterLabels,
  longDate,
  MINUTE_MS,
  namesWords,
  placeDay,
  plural,
  scheduleHref,
  shortDate,
  stepDate,
  viewDays,
  weekDays,
  whoIsFree,
  type ItemKind,
  type ItemPerson,
  type ScheduleItem,
  type ScheduleQuery,
} from "./schedule-model";
import { act, reportError, useSheetSide } from "./schedule-parts";
import { PageHeader } from "../shell/page-header";

export type ScheduleIntent = "book" | "who" | "date" | "close" | "weather";

interface Override {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly courtId?: string;
  readonly courtName?: string;
}

/**
 * Schedule (H-SCHEDULE): the club's one calendar. Day or week, by court or
 * by coach, for one place or all; the agenda list on a phone. Everything
 * the view shows is in the address (date, view, place, court, coach, kind,
 * the open item), so it is shareable and Back works.
 */
export function ScheduleScreen({
  data,
  query,
  explicitView,
  intent,
}: {
  readonly data: ScheduleData;
  readonly query: ScheduleQuery;
  /** False when the address chose no view: the phone then shows the agenda. */
  readonly explicitView: boolean;
  readonly intent?: ScheduleIntent;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [nowMs, setNowMs] = useState(data.nowMs);
  const [viewerZone, setViewerZone] = useState<string>();
  const [phone, setPhone] = useState(false);
  const [overrides, setOverrides] = useState<ReadonlyMap<string, Override>>(
    new Map(),
  );
  const [checks, setChecks] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [closure, setClosure] = useState<ClosureDraft | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const { permissions, timeZone } = data;
  // Coaches' availability, read once when first needed (see ensureAvailability).
  const [availability, setAvailability] = useState<Readonly<
    Record<
      string,
      NonNullable<ScheduleData["coaches"][number]["availability"]> | null
    >
  > | null>(null);
  const coaches = useMemo(
    () =>
      data.coaches.map((coach) => {
        const loaded = coach.staffProfileId
          ? availability?.[coach.staffProfileId]
          : undefined;
        return loaded ? { ...coach, availability: loaded } : coach;
      }),
    [availability, data.coaches],
  );
  const availabilityMissing = availability
    ? data.coaches.filter(
        (coach) => !coach.staffProfileId || !availability[coach.staffProfileId],
      ).length
    : 0;
  const ensureAvailability = useCallback(async () => {
    if (availability) return availability;
    const ids = data.coaches.flatMap((coach) =>
      coach.staffProfileId ? [coach.staffProfileId] : [],
    );
    if (ids.length === 0) {
      setAvailability({});
      return {};
    }
    try {
      const loaded = await coachAvailabilityAction(ids);
      setAvailability(loaded);
      return loaded;
    } catch {
      setAvailability({});
      return {};
    }
  }, [availability, data.coaches]);

  useEffect(() => {
    setViewerZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      window.clearInterval(timer);
      media.removeEventListener("change", sync);
    };
  }, []);

  // Server data replaces local guesses once it arrives.
  useEffect(() => {
    setOverrides(new Map());
    setChecks(new Map());
    setPending(new Set());
  }, [data]);

  const go = useCallback(
    (patch: Partial<ScheduleQuery>, replace = false) => {
      // A chosen view stays in the address, so a phone keeps the day grid.
      const href = scheduleHref(
        query,
        patch,
        data.today,
        explicitView || patch.view !== undefined,
      );
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [data.today, explicitView, query, router],
  );

  const refresh = useCallback(() => router.refresh(), [router]);

  // A coach without write access sees their own day unless they choose otherwise.
  const effectiveQuery: ScheduleQuery = useMemo(
    () =>
      permissions.ownDayOnly && !query.coach && data.viewerId
        ? { ...query, coach: data.viewerId }
        : query,
    [data.viewerId, permissions.ownDayOnly, query],
  );

  const places = useMemo(
    () =>
      query.place
        ? data.places.filter((place) => place.id === query.place)
        : data.places,
    [data.places, query.place],
  );
  const courts = useMemo(
    () => places.flatMap((place) => place.courts),
    [places],
  );
  const allCourts = useMemo(
    () => data.places.flatMap((place) => place.courts),
    [data.places],
  );

  const items = useMemo(
    () =>
      data.items.map((item) => {
        const moved = overrides.get(item.id);
        const people = item.people.map((person) => {
          const checked = checks.get(`${item.id}:${person.id}`);
          return checked === undefined
            ? person
            : { ...person, checkedIn: checked };
        });
        return moved
          ? {
              ...item,
              startsAt: moved.startsAt,
              endsAt: moved.endsAt,
              ...(moved.courtId
                ? { courtId: moved.courtId, courtName: moved.courtName }
                : {}),
              people,
            }
          : { ...item, people };
      }),
    [checks, data.items, overrides],
  );

  const visible = useMemo(
    () => filterItems(items, effectiveQuery),
    [effectiveQuery, items],
  );
  const openItem = query.open
    ? (items.find((item) => itemKey(item) === query.open) ?? null)
    : null;

  const canCheckIn = useCallback(
    (item: ScheduleItem) =>
      permissions.change ||
      (permissions.checkIn &&
        item.coachId !== undefined &&
        item.coachId === data.viewerId),
    [data.viewerId, permissions.change, permissions.checkIn],
  );
  const canMove = useCallback(
    (item: ScheduleItem) =>
      permissions.change && item.movable && !item.cancelled,
    [permissions.change],
  );

  // Availability is read the first time something needs it.
  useEffect(() => {
    if (createDraft || whoOpen) void ensureAvailability();
  }, [createDraft, whoOpen, ensureAvailability]);

  // Intents from the command palette (`?intent=`), handled once.
  useEffect(() => {
    if (!intent) return;
    if (intent === "book") openCreate();
    if (intent === "who") setWhoOpen(true);
    if (intent === "date") setDateOpen(true);
    if (intent === "close" && permissions.change)
      setClosure({ date: query.date, weather: false });
    if (intent === "weather" && permissions.change)
      setClosure({ date: query.date, weather: true });
    router.replace(scheduleHref(query, {}, data.today, explicitView), {
      scroll: false,
    });
    // Only when an intent arrives.
  }, [intent]);

  function openCreate(kind?: CreateDraft["kind"]) {
    if (!permissions.change || allCourts.length === 0) return;
    const day = placeDay(query.date, timeZone);
    const quarter = 15 * MINUTE_MS;
    const start =
      query.date === data.today
        ? Math.ceil((nowMs + quarter) / quarter) * quarter
        : day.startMs +
          (day.hours.find((hour) => hour.hour >= 9)?.minute ?? 540) * MINUTE_MS;
    const startsAt = new Date(start).toISOString();
    setCreateDraft({
      startsAt,
      endsAt: new Date(start + 60 * MINUTE_MS).toISOString(),
      ...(query.court ? { courtId: query.court } : {}),
      ...(kind ? { kind } : {}),
    });
  }

  const onCreateSlot = (draft: SlotDraft) => {
    if (!permissions.change) return;
    setCreateDraft({
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      ...(draft.lane.courtId ? { courtId: draft.lane.courtId } : {}),
      ...(draft.lane.coachId ? { coachId: draft.lane.coachId } : {}),
    });
  };

  const onOpen = (item: ScheduleItem) => go({ open: itemKey(item) });

  const requestMove = async (
    item: ScheduleItem,
    next: { startsAt: string; endsAt: string; courtId?: string },
  ) => {
    if (!canMove(item)) {
      errorToast(`${item.title} can't be moved from here.`, {
        description: permissions.change
          ? "Only sessions can be moved on the calendar today."
          : "Your role can see the schedule but not change it.",
      });
      return;
    }
    const courtId = next.courtId ?? item.courtId;
    const court = allCourts.find((candidate) => candidate.id === courtId);
    const loaded = item.coachId ? await ensureAvailability() : null;
    const listed = data.coaches.find(
      (candidate) => candidate.id === item.coachId,
    );
    const coach =
      listed && loaded && listed.staffProfileId && loaded[listed.staffProfileId]
        ? { ...listed, availability: loaded[listed.staffProfileId]! }
        : listed;
    const [conflict] = explainConflicts(
      {
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        ...(court ? { court } : {}),
        ...(coach ? { coach } : {}),
        ignoreId: item.id,
        timeZone: item.timeZone,
      },
      items,
    );
    if (conflict) {
      errorToast(`${item.title} can't go there`, {
        description: `${conflict.sentence}. Nothing was moved.`,
      });
      return;
    }
    const zone = item.timeZone;
    const when = clock(next.startsAt, zone);
    const override: Override = {
      startsAt: next.startsAt,
      endsAt: next.endsAt,
      ...(court && court.id !== item.courtId
        ? { courtId: court.id, courtName: court.name }
        : {}),
    };
    const apply = () => {
      setOverrides((current) => new Map(current).set(item.id, override));
      return () =>
        setOverrides((current) => {
          const copy = new Map(current);
          copy.delete(item.id);
          return copy;
        });
    };
    const perform = ({ idempotencyKey }: { idempotencyKey: string }) =>
      act(
        moveItemAction({
          id: item.id,
          source: item.source,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
          ...(override.courtId ? { courtId: override.courtId } : {}),
          idempotencyKey,
        }),
      );
    const reverse = () =>
      act(
        moveItemAction({
          id: item.id,
          source: item.source,
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          ...(override.courtId && item.courtId
            ? { courtId: item.courtId }
            : {}),
          idempotencyKey: crypto.randomUUID(),
        }),
      );
    const where = override.courtName ? ` on ${override.courtName}` : "";
    const people = item.people.filter((person) => !person.noShow);
    if (people.length === 0) {
      await confirm.run({
        tier: "undo",
        title: `${item.title} moved to ${when}${where}`,
        undoneMessage: `${item.title} is back at ${clock(item.startsAt, zone)}`,
        optimistic: apply,
        perform,
        // The actions revalidate the schedule themselves; a refresh here
        // could land after Undo and show the old answer.
        reverse: () => reverse(),
        report: reportError,
      });
      return;
    }
    const names = people.map((person) => person.name);
    const outcome = await confirm.run({
      tier: "confirm",
      title: `Move ${item.title} to ${when}?`,
      description: `From ${clockRange(item.startsAt, item.endsAt, zone)}${item.courtName ? ` on ${item.courtName}` : ""} to ${clockRange(next.startsAt, next.endsAt, zone)}${override.courtName ? ` on ${override.courtName}` : item.courtName ? ` on ${item.courtName}` : ""}, ${longDate(localDateOf(Date.parse(next.startsAt), zone))}.`,
      affected: `${plural(people.length, "person", "people")} booked ${people.length === 1 ? "is" : "are"} sent the new time: ${namesWords(names)}.`,
      verb: `Move and tell ${plural(people.length, "person", "people")}`,
      cancelLabel: "Leave it where it was",
      agentConfirm: `Moves ${item.title} to ${when} and tells ${people.length} people`,
      perform,
      report: reportError,
    });
    if (outcome.status !== "done") return;
    const rollback = apply();
    undoToast(`${item.title} moved to ${when}`, {
      description: `${plural(people.length, "person", "people")} ${people.length === 1 ? "was" : "were"} sent the new time.`,
      onUndo: async () => {
        rollback();
        await reverse();
      },
    });
  };

  const checkIn = (item: ScheduleItem, person: ItemPerson) => {
    const key = `${item.id}:${person.id}`;
    void confirm.run({
      tier: "undo",
      title: `${person.name} checked in`,
      undoneMessage: `${person.name} is no longer checked in`,
      optimistic: () => {
        setChecks((current) => new Map(current).set(key, true));
        return () =>
          setChecks((current) => {
            const copy = new Map(current);
            copy.delete(key);
            return copy;
          });
      },
      perform: ({ idempotencyKey }) =>
        act(
          checkInAction({
            itemId: item.id,
            source: item.source,
            rowId: person.id,
            checkedIn: true,
            idempotencyKey,
          }),
        ),
      reverse: async () => {
        await act(
          checkInAction({
            itemId: item.id,
            source: item.source,
            rowId: person.id,
            checkedIn: false,
            idempotencyKey: crypto.randomUUID(),
          }),
        );
        // Shown as not checked in until the revalidated schedule arrives.
        setChecks((current) => new Map(current).set(key, false));
      },
      report: reportError,
    });
  };

  /* ------------------------------ lanes ------------------------------ */
  const days = viewDays(effectiveQuery).map((date) => placeDay(date, timeZone));
  const lanes: Lane[] = useMemo(() => {
    if (query.view === "week") {
      return days.map((day) => ({
        id: day.date,
        label: shortDate(day.date),
        ...(day.date === data.today ? { sublabel: "Today" } : {}),
        day,
        ...(effectiveQuery.court ? { courtId: effectiveQuery.court } : {}),
        ...(effectiveQuery.coach ? { coachId: effectiveQuery.coach } : {}),
      }));
    }
    const day = days[0]!;
    if (query.by === "coach") {
      return data.coaches
        .filter(
          (coach) => !effectiveQuery.coach || coach.id === effectiveQuery.coach,
        )
        .map((coach) => ({
          id: coach.id,
          label: coach.name,
          day,
          coachId: coach.id,
        }));
    }
    const result: Lane[] = courts
      .filter(
        (court) => !effectiveQuery.court || court.id === effectiveQuery.court,
      )
      .map((court) => ({
        id: court.id,
        label: court.name,
        sublabel: [
          places.length > 1 || data.places.length > 1
            ? data.places.find((place) => place.id === court.placeId)?.name
            : undefined,
          court.lit ? "Lit" : "No lights",
        ]
          .filter(Boolean)
          .join(" · "),
        day,
        courtId: court.id,
      }));
    if (!effectiveQuery.court && visible.some((item) => !item.courtId)) {
      result.push({
        id: "no-court",
        label: "No court",
        sublabel: "Not on a court yet",
        day,
        readonly: true,
      });
    }
    return result;
    // days is derived from the query.
  }, [
    courts,
    data.coaches,
    data.today,
    effectiveQuery,
    places.length,
    query.by,
    query.view,
    visible,
  ]);

  const laneItems = useCallback(
    (lane: Lane) =>
      visible.filter((item) => {
        if (query.view === "week") return true;
        if (lane.id === "no-court") return !item.courtId;
        if (query.by === "coach") return item.coachId === lane.coachId;
        return item.courtId === lane.courtId;
      }),
    [query.by, query.view, visible],
  );

  /* ---------------------------- the header --------------------------- */
  const conditions = data.conditions;
  const sunsetMs =
    conditions.state === "ready" && conditions.day.sun?.sunset
      ? conditions.day.sun.sunset
      : undefined;
  const dateLabel =
    query.view === "week"
      ? `Week of ${longDate(weekDays(query.date)[0]!)}`
      : longDate(query.date);
  const isToday = query.date === data.today;
  const placeName =
    places.length === 1
      ? places[0]!.name
      : places.length === 0
        ? data.organization
        : `${data.organization} · ${plural(places.length, "place")}`;

  const noCourts = allCourts.length === 0;
  const auto = !explicitView && query.view === "day";
  const coachView = permissions.ownDayOnly && !query.coach;
  // On a phone the unchosen view is the agenda, and the toggle says so.
  const shownView = auto && phone ? "list" : query.view;

  const conditionHour =
    conditions.state === "ready"
      ? (conditions.day.hours.reduce((best, hour) =>
          Math.abs(
            hour.at -
              (isToday
                ? nowMs
                : placeDay(query.date, timeZone).startMs + 12 * 60 * MINUTE_MS),
          ) <
          Math.abs(
            best.at -
              (isToday
                ? nowMs
                : placeDay(query.date, timeZone).startMs + 12 * 60 * MINUTE_MS),
          )
            ? hour
            : best,
        ) ?? null)
      : null;

  const kindToggle = (kind: ItemKind) =>
    go({
      kinds: query.kinds.includes(kind)
        ? query.kinds.filter((candidate) => candidate !== kind)
        : [...query.kinds, kind],
    });

  const emptyDay = permissions.change ? (
    <EmptyState
      actions={
        <Button onClick={() => openCreate()} variant="secondary">
          Add a booking
        </Button>
      }
      description="Press an empty slot on the calendar, or add one here."
      icon="schedule"
      title={`Nothing on ${longDate(query.date)}`}
    />
  ) : (
    <EmptyState icon="schedule" title={`Nothing on ${longDate(query.date)}`} />
  );

  return (
    <>
      {confirm.dialog}
      <PageHeader
        actions={
          <ScheduleActions
            canChange={permissions.change && !noCourts}
            hasCoaches={data.coaches.length > 0}
            onBlock={() => openCreate("block")}
            onClose={() => setClosure({ date: query.date, weather: false })}
            onNew={() => openCreate()}
            onWho={() => setWhoOpen(true)}
          />
        }
        description={`${dateLabel} · ${placeName}`}
        title="Schedule"
      />
      <OfflineBanner writes="refused" />
      <div
        className="sch-bar"
        role="toolbar"
        aria-label="Choose the day and view"
      >
        <div className="sch-bar__group">
          <Button
            aria-current={isToday ? "date" : undefined}
            disabled={isToday && query.view !== "week"}
            onClick={() => go({ date: data.today })}
            size="sm"
            variant="secondary"
          >
            Today
          </Button>
          <Button
            aria-label={
              query.view === "week" ? "Previous week" : "Previous day"
            }
            onClick={() => go({ date: stepDate(query, -1) })}
            size="sm"
            variant="ghost"
          >
            <Icon name="chevron-left" size="inline" />
          </Button>
          <Button
            aria-label={query.view === "week" ? "Next week" : "Next day"}
            onClick={() => go({ date: stepDate(query, 1) })}
            size="sm"
            variant="ghost"
          >
            <Icon name="chevron-right" size="inline" />
          </Button>
          <h2 className="sch-bar__date" aria-live="polite">
            {dateLabel}
          </h2>
          <Button
            onClick={() => setDateOpen((open) => !open)}
            size="sm"
            variant="ghost"
          >
            Go to date
          </Button>
        </div>
        <span className="sch-bar__spacer" />
        <div aria-label="View" className="sch-toggle" role="group">
          {(["day", "week", "list"] as const).map((view) => (
            <button
              aria-pressed={shownView === view}
              key={view}
              onClick={() => go({ view })}
              type="button"
            >
              {view === "day" ? "Day" : view === "week" ? "Week" : "List"}
            </button>
          ))}
        </div>
        {shownView === "day" ? (
          <div aria-label="Lanes" className="sch-toggle" role="group">
            {(["court", "coach"] as const).map((by) => (
              <button
                aria-pressed={query.by === by}
                key={by}
                onClick={() => go({ by })}
                type="button"
              >
                {by === "court" ? "Courts" : "Coaches"}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {dateOpen ? (
        <Field label="Go to date">
          <DatePicker
            onValueChange={(value) => {
              if (value) {
                setDateOpen(false);
                go({ date: value });
              }
            }}
            value={query.date}
          />
        </Field>
      ) : null}

      <div aria-label="Filters" className="sch-filters" role="group">
        {data.places.length > 1 ? (
          <Select
            aria-label="Place"
            onValueChange={(value) =>
              go({
                place: value === "all" ? undefined : (value ?? undefined),
                court: undefined,
              })
            }
            options={[
              { value: "all", label: "All places" },
              ...data.places.map((place) => ({
                value: place.id,
                label: place.name,
              })),
            ]}
            value={query.place ?? "all"}
          />
        ) : null}
        {courts.length > 1 ? (
          <Select
            aria-label="Court"
            onValueChange={(value) =>
              go({ court: value === "all" ? undefined : (value ?? undefined) })
            }
            options={[
              { value: "all", label: "All courts" },
              ...courts.map((court) => ({
                value: court.id,
                label: court.name,
              })),
            ]}
            value={query.court ?? "all"}
          />
        ) : null}
        {data.coaches.length > 0 ? (
          <Select
            aria-label="Coach"
            onValueChange={(value) =>
              go({ coach: value === "all" ? undefined : (value ?? undefined) })
            }
            options={[
              { value: "all", label: "All coaches" },
              ...data.coaches.map((coach) => ({
                value: coach.id,
                label: coach.name,
              })),
            ]}
            value={effectiveQuery.coach ?? "all"}
          />
        ) : null}
        {itemKinds.map((kind) => (
          <FilterChip
            key={kind}
            onPressedChange={() => kindToggle(kind)}
            pressed={query.kinds.includes(kind)}
          >
            {kindFilterLabels[kind]}
          </FilterChip>
        ))}
      </div>

      <div className="sch-line">
        {conditions.state === "ready" ? (
          <section
            aria-label={`Conditions for ${longDate(query.date)}`}
            className="sch-line"
          >
            <ConditionsLine
              call={conditions.day.alert?.level === "stop" ? "stop" : undefined}
              conditions={conditionHour}
              courtIsLit={conditions.day.litCourts > 0}
              now={nowMs}
              readAt={conditions.day.readAt}
              reason={
                conditions.day.alert?.level === "stop"
                  ? conditions.day.alert.headline
                  : undefined
              }
              status="ready"
              sun={conditions.day.sun}
              timeZone={timeZone}
            />
            {conditions.day.attribution ? (
              <span className="sch-quiet">{conditions.day.attribution}</span>
            ) : null}
          </section>
        ) : (
          <p className="sch-quiet">
            {conditions.state === "not-configured"
              ? "Weather and light aren't connected for this place yet."
              : conditions.state === "many-places"
                ? "Choose a place to see its weather and light."
                : query.view === "week"
                  ? "Weather and light show on the day view."
                  : "No forecast for this day yet."}
          </p>
        )}
        {viewerZone ? (
          <TimeZoneNote
            at={placeDay(query.date, timeZone).startMs + 12 * 60 * MINUTE_MS}
            timeZone={timeZone}
            viewerTimeZone={viewerZone}
          />
        ) : null}
        {data.demo ? (
          <p className="sch-demo">
            Demo club: your changes stay in this browser.
          </p>
        ) : null}
      </div>

      {conditions.state === "ready" &&
      conditions.day.alert?.level === "stop" &&
      permissions.change ? (
        <Notice
          action={
            <Button
              onClick={() =>
                setClosure({
                  date: query.date,
                  weather: true,
                  reason: conditions.day.alert?.headline.split("·")[0]?.trim(),
                })
              }
              size="sm"
              variant="secondary"
            >
              Stop play…
            </Button>
          }
          title={conditions.day.alert.headline}
          tone="warning"
        >
          Stop play on the courts affected and tell the people booked.
        </Notice>
      ) : null}

      {query.open && !openItem ? (
        <Notice tone="info" title="That isn't on the schedule">
          It may have been cancelled or moved to a day that isn't loaded.
          Nothing was changed.
        </Notice>
      ) : null}

      {coachView ? (
        <Notice tone="info">
          This is your day. Choose “All coaches” to see everyone; changes to
          other people's bookings are for the front desk.
        </Notice>
      ) : null}

      {isToday && query.view !== "week" && !noCourts ? (
        <NowAndNextStrip
          canCheckIn={canCheckIn}
          items={visible}
          nowMs={nowMs}
          onCheckIn={checkIn}
          onOpen={onOpen}
        />
      ) : null}

      {noCourts ? (
        <EmptyFirstUse
          action={
            permissions.change ? (
              <Button href={hqHref("places")} variant="primary">
                Add places and courts
              </Button>
            ) : (
              <Button href="/" variant="secondary">
                Back to Today
              </Button>
            )
          }
          description="The schedule is drawn by court. Add the club's places and courts in Club setup first."
          icon="court"
          title="No courts yet"
        />
      ) : (
        <>
          {query.view === "list" || auto ? (
            <ScheduleAgenda
              auto={auto}
              date={query.date}
              empty={emptyDay}
              items={visible}
              nowMs={nowMs}
              onDate={(date) => go({ date })}
              onOpen={onOpen}
              timeZone={timeZone}
              today={data.today}
            />
          ) : null}
          {query.view !== "list" ? (
            lanes.length === 0 ? (
              <EmptyState
                description={
                  query.by === "coach"
                    ? "Nobody on the team coaches yet. Invite coaches in Team."
                    : "No court matches the filters."
                }
                icon="coach"
                title={
                  query.by === "coach" ? "No coaches yet" : "No courts to show"
                }
              />
            ) : (
              <ScheduleGrid
                auto={auto}
                canCreate={permissions.change}
                canMove={canMove}
                items={laneItems}
                label={`${dateLabel}, ${query.view === "week" ? "by day" : query.by === "coach" ? "by coach" : "by court"}`}
                lanes={lanes}
                nowMs={nowMs}
                onCreate={onCreateSlot}
                onMove={(item, next) =>
                  void requestMove(item, {
                    startsAt: next.startsAt,
                    endsAt: next.endsAt,
                    ...(next.lane.courtId
                      ? { courtId: next.lane.courtId }
                      : {}),
                  })
                }
                onOpen={onOpen}
                onStepDay={(direction) =>
                  go({ date: stepDate(query, direction) })
                }
                pendingIds={pending}
                sunsetMs={query.view === "day" ? sunsetMs : undefined}
              />
            )
          ) : null}
          {query.by === "coach" && query.view === "day" ? (
            <p className="sch-quiet">
              Court bookings without a coach show in the Courts view.
            </p>
          ) : null}
          {availabilityMissing > 0 && data.coaches.length > 0 ? (
            <p className="sch-quiet">
              {plural(availabilityMissing, "coach has", "coaches have")} no
              availability on file, so their conflicts can't be checked.
            </p>
          ) : null}
        </>
      )}

      <ItemPanel
        courts={allCourts}
        inventory={data.inventory}
        item={openItem}
        members={data.people}
        nowMs={nowMs}
        onChanged={refresh}
        onCheckIn={(item, person) => {
          if (canCheckIn(item)) checkIn(item, person);
        }}
        onClose={() => go({ open: undefined }, true)}
        onMove={(item, next) => {
          go({ open: undefined }, true);
          void requestMove(item, next);
        }}
        permissions={{
          change: permissions.change,
          checkIn: openItem ? canCheckIn(openItem) : false,
          refund: permissions.refund,
        }}
      />
      <CreateSheet
        coaches={coaches}
        courts={courts.length > 0 ? courts : allCourts}
        draft={createDraft}
        items={items}
        nowMs={nowMs}
        onClose={() => setCreateDraft(null)}
        onCreated={() => {
          setCreateDraft(null);
          refresh();
        }}
        people={data.people}
        timeZone={timeZone}
      />
      <ClosureSheet
        courts={courts.length > 0 ? courts : allCourts}
        draft={closure}
        items={items}
        nowMs={nowMs}
        onClose={() => setClosure(null)}
        onDone={() => {
          setClosure(null);
          refresh();
        }}
        timeZone={timeZone}
      />
      <WhoIsFreeSheet
        checking={availability === null}
        coaches={coaches}
        date={query.date}
        items={items}
        onClose={() => setWhoOpen(false)}
        open={whoOpen}
        timeZone={timeZone}
      />
    </>
  );
}

/** The header's actions: one primary (New booking), the rest beside it. */
function ScheduleActions({
  canChange,
  hasCoaches,
  onNew,
  onBlock,
  onClose,
  onWho,
}: {
  readonly canChange: boolean;
  readonly hasCoaches: boolean;
  readonly onNew: () => void;
  readonly onBlock: () => void;
  readonly onClose: () => void;
  readonly onWho: () => void;
}) {
  return (
    <div aria-label="Schedule actions" className="sch-actions" role="group">
      {canChange ? (
        <>
          <Button onClick={onNew} variant="primary">
            New booking
          </Button>
          <Button onClick={onBlock} variant="secondary">
            Block time
          </Button>
          <Button onClick={onClose} variant="secondary">
            Close courts
          </Button>
        </>
      ) : null}
      {hasCoaches ? (
        <Button onClick={onWho} variant="ghost">
          Who is free…
        </Button>
      ) : null}
    </div>
  );
}

function WhoIsFreeSheet({
  checking,
  open,
  onClose,
  coaches,
  items,
  date,
  timeZone,
}: {
  readonly checking: boolean;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly coaches: ScheduleData["coaches"];
  readonly items: readonly ScheduleItem[];
  readonly date: string;
  readonly timeZone: string;
}) {
  const side = useSheetSide();
  const day = placeDay(date, timeZone);
  const [minute, setMinute] = useState(
    day.hours.find((hour) => hour.hour >= 17)?.minute ?? 1020,
  );
  const [length, setLength] = useState(60);
  const startsAt = new Date(day.startMs + minute * MINUTE_MS).toISOString();
  const endsAt = new Date(
    day.startMs + (minute + length) * MINUTE_MS,
  ).toISOString();
  const answer = whoIsFree(coaches, items, startsAt, endsAt);
  const options: { value: string; label: string }[] = [];
  for (let at = 0; at < day.minutes; at += 15) {
    options.push({
      value: String(at),
      label: clock(day.startMs + at * MINUTE_MS, timeZone),
    });
  }
  return (
    <Sheet side={side} onOpenChange={(next) => !next && onClose()} open={open}>
      {open ? (
        <SheetContent description={longDate(date)} title="Who is free">
          <div className="sch-form">
            <div className="sch-form__row">
              <Field label="At">
                <Select
                  onValueChange={(value) => value && setMinute(Number(value))}
                  options={options}
                  value={String(minute)}
                />
              </Field>
              <Field label="For">
                <Select
                  onValueChange={(value) => value && setLength(Number(value))}
                  options={[30, 60, 90, 120].map((value) => ({
                    value: String(value),
                    label: durationWords(value),
                  }))}
                  value={String(length)}
                />
              </Field>
            </div>
            <section aria-label="Free" aria-live="polite">
              <h3 className="td-field__label">
                Free {clockRange(startsAt, endsAt, timeZone)}
              </h3>
              {checking ? (
                <p className="sch-quiet">Checking the team's availability…</p>
              ) : answer.free.length === 0 ? (
                <p className="sch-quiet">Nobody is free for the whole time.</p>
              ) : (
                <ul className="sch-affected">
                  {answer.free.map((coach) => (
                    <li key={coach.id}>{coach.name}</li>
                  ))}
                </ul>
              )}
            </section>
            {answer.busy.length > 0 ? (
              <section aria-label="Not free">
                <h3 className="td-field__label">Not free</h3>
                <ul className="sch-affected">
                  {answer.busy.map(({ coach, sentence }) => (
                    <li key={coach.id}>{sentence}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {answer.unknown.length > 0 ? (
              <p className="sch-quiet">
                No availability on file for{" "}
                {namesWords(answer.unknown.map((coach) => coach.name))}.
              </p>
            ) : null}
            <Button href="/team" variant="ghost">
              Team availability
            </Button>
          </div>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}
