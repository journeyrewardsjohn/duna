"use client";

import {
  ANY_COACH,
  type BookingAction,
  type BookingCatalog,
  bookingLineItems,
  bookingReducer,
  type BookingState,
  BookingSummary,
  bookingTotalCents,
  canContinueBooking,
  ChoiceCardGroup,
  CoachPicker,
  dayRange,
  DayStrip,
  formatIsoDate,
  formatMoney,
  formatTimeRange,
  initialBookingState,
  type LessonSlot,
  openDays,
  PriceChoiceCard,
  SlotList,
  slotsForDay,
  Switch,
  toast,
  Toaster,
  useDelayedLoading,
  useOptimisticAction,
} from "@duna/ui/tideline";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "../gallery.module.css";
import { useLab } from "../interactions";

/** The first day on offer. Fixed, so server and browser render the same page. */
const FIRST_DAY = "2026-11-26";
const DAYS = dayRange(FIRST_DAY, 14);

/** Demo data only: neutral names, no real people, club or prices. */
const catalog: BookingCatalog = {
  formats: [
    {
      id: "private",
      name: "Private",
      meta: "1 athlete · 60 min",
      priceCents: 15000,
      unit: "per session",
    },
    {
      id: "group",
      name: "Group",
      meta: "2–4 players · 90 min",
      priceCents: 10000,
      unit: "per player",
    },
    {
      id: "large",
      name: "Large group",
      meta: "5–8 players · 90 min",
      priceCents: 5000,
      unit: "per player",
    },
  ],
  coaches: [
    { id: "rowan", name: "Coach Rowan", credential: "Head coach · 12 seasons" },
    {
      id: "imani",
      name: "Coach Imani",
      credential: "Certified strength trainer",
    },
  ],
  addOns: [
    {
      id: "membership",
      name: "Club membership",
      detail: "Annual · renews automatically on Nov 25, 2027",
      priceCents: 10000,
    },
  ],
  // Sundays are closed; group formats run on fewer days.
  slots: DAYS.flatMap((date, index): LessonSlot[] => {
    if (new Date(`${date}T00:00:00Z`).getUTCDay() === 0) return [];
    const day: LessonSlot[] = [
      {
        id: `${date}-a`,
        date,
        start: "15:00",
        end: "16:00",
        coachId: "imani",
        formatIds: ["private"],
      },
      {
        id: `${date}-b`,
        date,
        start: "16:00",
        end: "17:00",
        coachId: "rowan",
        formatIds: ["private"],
        booked: index % 3 === 0,
      },
    ];
    if (index % 2 === 1) {
      day.push({
        id: `${date}-c`,
        date,
        start: "17:30",
        end: "19:00",
        coachId: "rowan",
        formatIds: ["group", "large"],
      });
    }
    if (index % 4 === 2) {
      day.push({
        id: `${date}-d`,
        date,
        start: "09:00",
        end: "10:30",
        coachId: "imani",
        formatIds: ["group"],
      });
    }
    return day;
  }),
};

const coachName = (id: string) =>
  catalog.coaches.find((coach) => coach.id === id)?.name ?? "";

export function BookLesson() {
  const lab = useLab();
  const [state, setState] = useState<BookingState>(() =>
    initialBookingState(catalog, { addOnIds: ["membership"] }),
  );
  const dispatch = (action: BookingAction) =>
    setState((current) => bookingReducer(catalog, current, action));

  // The day's sessions "load": the request is simulated, the data is local.
  const dayKey = `${state.formatId}|${state.coachId}|${state.date}`;
  const [loadedKey, setLoadedKey] = useState(dayKey);
  const [shown, setShown] = useState(() => slotsForDay(catalog, state));
  const latest = useRef(state);
  latest.current = state;
  // Changing the simulated latency must not refetch the day.
  const request = useRef(lab.request);
  request.current = lab.request;
  useEffect(() => {
    const controller = new AbortController();
    request
      .current(() => slotsForDay(catalog, latest.current), controller.signal)
      .then(
        (slots) => {
          setShown(slots);
          setLoadedKey(dayKey);
        },
        () => {
          if (controller.signal.aborted) return;
          setLoadedKey(dayKey);
          toast.error(
            "Could not load that day. Showing the last times we had.",
          );
        },
      );
    return () => controller.abort();
  }, [dayKey]);
  const loading = useDelayedLoading(loadedKey !== dayKey);

  // Choosing a time holds it at once; if the hold fails, it is taken back.
  const hold = useOptimisticAction<[slotId: string]>({
    apply: (slotId) => {
      const before = latest.current.slotId;
      dispatch({ type: "slot", id: slotId });
      return () => dispatch({ type: "slot", id: before });
    },
    commit: () => lab.request(() => true),
    messages: { error: () => "That time was just taken. Pick another." },
  });

  const open = useMemo(() => openDays(catalog, state), [state]);
  const items = bookingLineItems(catalog, state, (slot) =>
    slot
      ? `${formatIsoDate(slot.date, "en", { weekday: "short", month: "short", day: "numeric" })} · ${formatTimeRange(slot.start, slot.end)} · ${coachName(slot.coachId)}`
      : "Choose a day and time",
  );
  const membership = catalog.addOns![0]!;

  return (
    <div className={styles.book}>
      <div className={styles.bookMain}>
        <header className={styles.bookHead}>
          <h1 className="td-display">Book a lesson.</h1>
          <p className="td-lead">
            Choose a format, pick a time, and you&apos;re on the sand.
          </p>
        </header>

        <section className={styles.bookSection}>
          <h2 className="td-headline" id="book-format">
            Choose a format.
          </h2>
          <ChoiceCardGroup
            aria-labelledby="book-format"
            onValueChange={(id) => id && dispatch({ type: "format", id })}
            value={state.formatId}
          >
            {catalog.formats.map((format) => (
              <PriceChoiceCard
                key={format.id}
                meta={format.meta}
                price={formatMoney(format.priceCents, { wholeUnits: true })}
                title={format.name}
                unit={format.unit}
                value={format.id}
              />
            ))}
          </ChoiceCardGroup>
        </section>

        <section className={styles.bookSection}>
          <h2 className="td-headline" id="book-coach">
            Choose your coach.
          </h2>
          <CoachPicker
            anyValue={ANY_COACH}
            aria-labelledby="book-coach"
            coaches={catalog.coaches}
            onValueChange={(id) => id && dispatch({ type: "coach", id })}
            value={state.coachId}
          />
        </section>

        <section className={styles.bookSection}>
          <div className={styles.bookSectionHead}>
            <h2 className="td-headline" id="book-day">
              Pick a day.
            </h2>
            <span className={styles.bookNote}>Next two weeks</span>
          </div>
          <DayStrip
            aria-describedby="book-day-help"
            aria-labelledby="book-day"
            count={DAYS.length}
            onValueChange={(date) => date && dispatch({ type: "day", date })}
            start={FIRST_DAY}
            today={FIRST_DAY}
            unavailable={DAYS.filter((day) => !open.includes(day))}
            unavailableLabel="no open sessions"
            value={state.date}
          />
          <p className="td-body" id="book-day-help">
            Faded days have no open sessions for this format.
          </p>
        </section>

        <section className={styles.bookSection}>
          <h2
            className="td-headline"
            data-testid="slots-heading"
            id="book-slots"
          >
            {state.date
              ? `${formatIsoDate(state.date, "en", { weekday: "long", month: "short", day: "numeric" })}.`
              : "No open days."}
          </h2>
          <SlotList
            aria-labelledby="book-slots"
            loading={loading}
            onValueChange={(id) => {
              if (id) void hold.run(id);
            }}
            slots={shown.map((slot) => ({
              id: slot.id,
              time: formatTimeRange(slot.start, slot.end),
              coach: { name: coachName(slot.coachId) },
              status: slot.booked ? "booked" : "available",
            }))}
            value={state.slotId}
          />
        </section>
      </div>

      <div className={styles.bookAside}>
        <BookingSummary
          actionLabel="Continue"
          addOn={
            <Switch
              checked={state.addOnIds.includes(membership.id)}
              label={`Add ${membership.name.toLowerCase()} · ${formatMoney(membership.priceCents)}`}
              onCheckedChange={(on) =>
                dispatch({ type: "addOn", id: membership.id, on })
              }
            />
          }
          disabledReason={
            canContinueBooking(catalog, state)
              ? undefined
              : "Choose a time to continue."
          }
          items={items.map((item) => ({
            id: item.id,
            name: item.name,
            detail: item.detail,
            price: formatMoney(item.priceCents),
          }))}
          onAction={() =>
            lab
              .request(() => true)
              .then(
                () => {
                  toast.success("Lesson held. Next: payment.");
                },
                () => {
                  toast.error("Could not continue. Nothing was charged.");
                },
              )
          }
          total={formatMoney(bookingTotalCents(catalog, state))}
          trustLine="Secure checkout powered by Duna"
        />
      </div>
      <Toaster side="top" />
    </div>
  );
}
