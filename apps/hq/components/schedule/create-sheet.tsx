"use client";

import { hqHref } from "@duna/core/hq-routes";
import { addCalendarDays, localDateOf } from "@duna/scheduling";
import {
  Button,
  Checkbox,
  Combobox,
  ConfirmSlot,
  DatePicker,
  Field,
  Input,
  MoneyInput,
  Notice,
  RadioGroup,
  RadioOption,
  ReferenceLine,
  Select,
  Sheet,
  SheetContent,
  successToast,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useMemo, useState } from "react";
import {
  createItemAction,
  previewBookingAction,
} from "@/app/(next)/(hq)/schedule/actions";
import {
  conflictSentence,
  mobileProblem,
  normalisedMobile,
  type BookingCreated,
  type BookingPreview,
  type PaymentIntent,
} from "./schedule-desk";
import {
  clock,
  durationWords,
  explainConflicts,
  longDate,
  minuteOfPlaceDay,
  MINUTE_MS,
  money,
  nearestAlternatives,
  placeDay,
  type CourtFacts,
  type ScheduleItem,
} from "./schedule-model";
import { act, reportError, useSheetSide } from "./schedule-parts";
import { previewData, previewIsCurrent, usePreview } from "./use-preview";

export interface CreateDraft {
  readonly startsAt: string;
  readonly endsAt: string;
  readonly courtId?: string;
  readonly coachId?: string;
  readonly kind?: CreateKind;
}

type CreateKind = "booking" | "block";

const lengths = [30, 45, 60, 90, 120, 180, 240];

export interface CreatePermissions {
  /** Court bookings can be made here (capability switch). */
  readonly book: boolean;
  /** Sees amounts. */
  readonly money: boolean;
  /** Staff prices and free bookings of paid time (payments:write). */
  readonly setPrice: boolean;
}

/**
 * Create in place: a short sheet opened from an empty slot (or "New
 * booking"). A court booking for a member or a walk-in, how it is paid
 * (at the desk, by a payment link, or free) and the court's own price,
 * all checked by the server's preview as the person chooses; or blocked
 * time. A conflict is explained in words with the nearest free time one
 * tap away. Booking asks once, restating the price; a payment link is
 * shown to copy or hand to Inbox: nothing is sent from here.
 */
export function CreateSheet({
  draft,
  onClose,
  onCreated,
  courts,
  people,
  items,
  timeZone,
  nowMs,
  permissions,
}: {
  readonly permissions: CreatePermissions;
  readonly draft: CreateDraft | null;
  readonly onClose: () => void;
  readonly onCreated: () => void;
  readonly courts: readonly CourtFacts[];
  readonly people: readonly { readonly id: string; readonly name: string }[];
  readonly items: readonly ScheduleItem[];
  readonly timeZone: string;
  readonly nowMs: number;
}) {
  const side = useSheetSide();
  const confirm = useConfirm({ presentation: "inline" });
  return (
    <Sheet
      side={side}
      {...confirm.hostProps}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={draft !== null}
    >
      {draft ? (
        <SheetContent
          description={longDate(
            localDateOf(Date.parse(draft.startsAt), timeZone),
          )}
          title="Add to the schedule"
        >
          <ConfirmSlot confirm={confirm}>
            <CreateForm
              confirm={confirm}
              courts={courts}
              draft={draft}
              items={items}
              key={`${draft.startsAt}:${draft.courtId ?? ""}:${draft.coachId ?? ""}`}
              nowMs={nowMs}
              onClose={onClose}
              onCreated={onCreated}
              people={people}
              permissions={permissions}
              timeZone={timeZone}
            />
          </ConfirmSlot>
        </SheetContent>
      ) : null}
    </Sheet>
  );
}

function CreateForm({
  draft,
  courts,
  people,
  items,
  timeZone,
  nowMs,
  onCreated,
  onClose,
  permissions,
  confirm,
}: {
  readonly permissions: CreatePermissions;
  readonly draft: CreateDraft;
  readonly courts: readonly CourtFacts[];
  readonly people: readonly { readonly id: string; readonly name: string }[];
  readonly items: readonly ScheduleItem[];
  readonly timeZone: string;
  readonly nowMs: number;
  readonly onCreated: () => void;
  readonly onClose: () => void;
  readonly confirm: ReturnType<typeof useConfirm>;
}) {
  const date = localDateOf(Date.parse(draft.startsAt), timeZone);
  const day = useMemo(() => placeDay(date, timeZone), [date, timeZone]);
  const [kind, setKind] = useState<CreateKind>(
    !permissions.book ? "block" : (draft.kind ?? "booking"),
  );
  const [courtId, setCourtId] = useState(draft.courtId ?? courts[0]?.id ?? "");
  const [start, setStart] = useState(minuteOfPlaceDay(draft.startsAt, day));
  const [length, setLength] = useState(
    Math.max(
      15,
      (Date.parse(draft.endsAt) - Date.parse(draft.startsAt)) / MINUTE_MS,
    ),
  );
  const [whoMode, setWhoMode] = useState<"member" | "walk-in">("member");
  const [personId, setPersonId] = useState<string | null>(null);
  const [walkIn, setWalkIn] = useState("");
  const [mobile, setMobile] = useState("");
  const [paymentIntent, setPaymentIntent] =
    useState<PaymentIntent>("pay-at-desk");
  const [staffPrice, setStaffPrice] = useState(false);
  const [price, setPrice] = useState<number | null>(null);
  const [priceReason, setPriceReason] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"blocked" | "maintenance">("blocked");
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [made, setMade] = useState<{
    readonly booking: BookingCreated;
    readonly who: string;
    readonly personId?: string;
  } | null>(null);

  const startsAt = new Date(day.startMs + start * MINUTE_MS).toISOString();
  const endsAt = new Date(
    day.startMs + (start + length) * MINUTE_MS,
  ).toISOString();
  const court = courts.find((candidate) => candidate.id === courtId);
  const request = {
    startsAt,
    endsAt,
    timeZone,
    ...(court ? { court } : {}),
  };
  const conflicts = explainConflicts(request, items);
  const alternatives =
    conflicts.length > 0
      ? nearestAlternatives(request, items, courts, 15, nowMs)
      : [];
  const personName = people.find((person) => person.id === personId)?.name;
  const walkInName = walkIn.trim();
  const who = whoMode === "member" ? personName : walkInName || undefined;
  const mobileError = whoMode === "walk-in" ? mobileProblem(mobile) : undefined;
  const phoneE164 =
    whoMode === "walk-in" && !mobileError
      ? normalisedMobile(mobile)
      : undefined;

  const slot = {
    courtId,
    startsAt,
    endsAt,
    ...(whoMode === "member" && personId ? { personId } : {}),
    ...(whoMode === "walk-in" && walkInName
      ? { walkIn: { name: walkInName, ...(phoneE164 ? { phoneE164 } : {}) } }
      : {}),
    paymentIntent,
  };
  // What the price and the rule depend on: a walk-in's name only counts
  // once there is one (typing it doesn't ask again).
  const previewKey =
    kind === "booking" && courtId
      ? JSON.stringify({
          ...slot,
          walkIn: slot.walkIn ? { phoneE164: slot.walkIn.phoneE164 } : null,
        })
      : null;
  const preview = usePreview<BookingPreview>(previewKey, () =>
    previewBookingAction(slot),
  );
  const current = previewIsCurrent(preview, previewKey);
  const answer = previewData(preview);
  const quote = answer?.price;
  const currency = quote?.currency ?? "USD";
  // Paid time given away, or a different price: the money permission's.
  const paidTime = (quote?.rateMinor ?? 0) > 0 || !permissions.money;
  const freeAllowed = permissions.setPrice || (permissions.money && !paidTime);
  const linkAllowed = answer?.paymentLinkAvailable ?? false;
  const usingStaffPrice =
    staffPrice && permissions.setPrice && paymentIntent !== "free";
  const total =
    paymentIntent === "free"
      ? 0
      : usingStaffPrice
        ? (price ?? undefined)
        : quote?.totalMinor;
  const serverConflicts =
    answer && !answer.available ? answer.conflicts : ([] as const);

  const timeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let minute = 0; minute < day.minutes; minute += 15) {
      options.push({
        value: String(minute),
        label: clock(day.startMs + minute * MINUTE_MS, timeZone),
      });
    }
    return options;
  }, [day, timeZone]);

  const block = useAction(
    async ({ idempotencyKey }) =>
      act(
        createItemAction({
          kind: "block",
          title: mode === "maintenance" ? "Maintenance" : "Blocked",
          startsAt,
          endsAt,
          timeZone,
          ...(courtId ? { courtId } : {}),
          who: reason.trim() || undefined,
          reason: reason.trim() || undefined,
          mode,
          ...(repeatUntil ? { repeatUntil } : {}),
          idempotencyKey,
        }),
      ),
    {
      report: reportError,
      onSuccess: () => {
        successToast(
          `${court?.name ?? "Time"} blocked ${clock(startsAt, timeZone)}–${clock(endsAt, timeZone)}${repeatUntil ? " every week" : ""}`,
        );
        onCreated();
      },
    },
  );

  const paymentWords =
    paymentIntent === "free"
      ? "Free: no payment is due."
      : paymentIntent === "send-payment-link"
        ? `The court is held while ${who ?? "they"} pay${who ? "s" : ""} by the link you hand over; unpaid, it is released.`
        : "Paid at the desk: the booking shows as Unpaid until you record the payment.";

  const book = () => {
    const where = court?.name ?? "the court";
    const amount =
      total !== undefined && permissions.money
        ? money(total, currency)
        : undefined;
    const strong = usingStaffPrice || (paymentIntent === "free" && paidTime);
    void confirm
      .run({
        tier: strong ? "strong" : "confirm",
        title: `Book ${where} for ${who}?`,
        description: `${longDate(date)}, ${clock(startsAt, timeZone)}–${clock(endsAt, timeZone)}. ${paymentWords}`,
        affected: "Nothing is sent to anyone from here.",
        ...(strong
          ? {
              amount: amount ?? money(0, currency),
              recipients: who,
              consequence: usingStaffPrice
                ? `A staff price instead of the court's rate, recorded with your reason: “${priceReason.trim()}”.`
                : "Paid time given away for free, recorded under your name.",
            }
          : {}),
        verb:
          paymentIntent === "free"
            ? "Book for free"
            : amount
              ? `Book for ${amount}`
              : "Book the court",
        cancelLabel: "Not yet",
        agentConfirm: `Books ${where} at ${clock(startsAt, timeZone)} for ${who}${amount ? `, ${amount}` : ""}`,
        perform: ({ idempotencyKey }) =>
          act(
            createItemAction({
              kind: "booking",
              title: "Court hire",
              startsAt,
              endsAt,
              timeZone,
              courtId,
              ...(who ? { who } : {}),
              ...(whoMode === "member" && personId ? { personId } : {}),
              ...(whoMode === "walk-in" && walkInName
                ? {
                    walkIn: {
                      name: walkInName,
                      ...(phoneE164 ? { phoneE164 } : {}),
                    },
                  }
                : {}),
              paymentIntent,
              currency,
              ...(usingStaffPrice && price !== null
                ? { priceMinor: price, priceReason: priceReason.trim() }
                : {}),
              // A staff price by the link adds fees the preview didn't price.
              ...(total !== undefined &&
              !(usingStaffPrice && paymentIntent === "send-payment-link")
                ? { expectedTotalMinor: total }
                : {}),
              idempotencyKey,
            }),
          ),
        success: `Booking added: ${where} ${clock(startsAt, timeZone)}`,
        report: reportError,
      })
      .then((outcome) => {
        if (outcome.status !== "done") return;
        const booking = outcome.result.booking;
        if (booking?.paymentLink) {
          setMade({
            booking,
            who: who ?? "the booker",
            ...(whoMode === "member" && personId ? { personId } : {}),
          });
          return;
        }
        onCreated();
      });
  };

  const submit = () => {
    if (conflicts.length > 0 || serverConflicts.length > 0) {
      setProblem("Choose a free time or court first.");
      return;
    }
    if (kind === "block") {
      setProblem(null);
      void block.run();
      return;
    }
    if (!who) {
      setProblem(
        whoMode === "member"
          ? "Choose who the booking is for."
          : "Type the walk-in's name.",
      );
      return;
    }
    if (mobileError) {
      setProblem(mobileError);
      return;
    }
    if (Date.parse(startsAt) < nowMs - 15 * MINUTE_MS) {
      setProblem("That time has passed. Choose a later time.");
      return;
    }
    if (usingStaffPrice && (price === null || priceReason.trim().length < 3)) {
      setProblem(
        "Give the price and say why it differs from the court's rate.",
      );
      return;
    }
    // The price restated is the one for the choices on screen.
    if (preview.state === "error" || !answer || !current) {
      setProblem(
        preview.state === "error"
          ? "The court couldn't be checked. Try again."
          : "Checking the court and the price…",
      );
      return;
    }
    setProblem(null);
    book();
  };

  if (made) {
    const link = made.booking.paymentLink!;
    return (
      <PaymentLinkHandover
        expiresAt={link.expiresAt}
        onDone={onCreated}
        personId={made.personId}
        timeZone={timeZone}
        url={link.url}
        who={made.who}
      />
    );
  }

  return (
    <form
      aria-label="Add to the schedule"
      className="sch-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {permissions.book ? (
        <RadioGroup
          aria-label="What"
          inline
          onValueChange={(value: unknown) => setKind(value as CreateKind)}
          value={kind}
        >
          <RadioOption label="Court booking" value="booking" />
          <RadioOption label="Block time" value="block" />
        </RadioGroup>
      ) : null}

      <div className="sch-form__row">
        <Field label="Court">
          <Select
            onValueChange={(value) => setCourtId(value ?? "")}
            options={courts.map((option) => ({
              value: option.id,
              label: option.name,
            }))}
            value={courtId}
          />
        </Field>
      </div>

      <div className="sch-form__row">
        <Field label="Starts">
          <Select
            onValueChange={(value) => value && setStart(Number(value))}
            options={timeOptions}
            value={String(start)}
          />
        </Field>
        <Field label="How long">
          <Select
            onValueChange={(value) => value && setLength(Number(value))}
            options={[...new Set([...lengths, length])]
              .sort((left, right) => left - right)
              .map((minutes) => ({
                value: String(minutes),
                label: durationWords(minutes),
              }))}
            value={String(length)}
          />
        </Field>
      </div>

      {kind === "block" ? (
        <>
          <Field
            label="Why"
            hint="Shown on the calendar, for example “Sand grooming”"
          >
            <Input
              onChange={(event) => setReason(event.currentTarget.value)}
              value={reason}
            />
          </Field>
          <RadioGroup
            aria-label="Block type"
            inline
            onValueChange={(value: unknown) =>
              setMode(value as "blocked" | "maintenance")
            }
            value={mode}
          >
            <RadioOption label="Unavailable" value="blocked" />
            <RadioOption label="Maintenance" value="maintenance" />
          </RadioGroup>
          <Field
            hint="Leave empty for this day only"
            label="Repeat every week until"
            optional
          >
            <DatePicker
              min={addCalendarDays(date, 7)}
              onValueChange={(value) => setRepeatUntil(value)}
              value={repeatUntil}
            />
          </Field>
        </>
      ) : (
        <>
          <RadioGroup
            aria-label="Who"
            inline
            onValueChange={(value: unknown) =>
              setWhoMode(value as "member" | "walk-in")
            }
            value={whoMode}
          >
            <RadioOption label="A member" value="member" />
            <RadioOption label="A walk-in" value="walk-in" />
          </RadioGroup>
          {whoMode === "member" ? (
            <Field label="Booked for">
              <Combobox
                emptyText="Nobody by that name. Add them as a walk-in."
                onValueChange={(value) => setPersonId(value)}
                options={people.map((person) => ({
                  value: person.id,
                  label: person.name,
                }))}
                placeholder="Search members"
                value={personId}
              />
            </Field>
          ) : (
            <>
              <Field label="Walk-in's name">
                <Input
                  autoComplete="off"
                  onChange={(event) => setWalkIn(event.currentTarget.value)}
                  value={walkIn}
                />
              </Field>
              <Field
                error={mobile.trim() ? mobileError : undefined}
                hint="Kept on this booking only"
                label="Mobile"
                optional
              >
                <Input
                  autoComplete="off"
                  inputMode="tel"
                  onChange={(event) => setMobile(event.currentTarget.value)}
                  placeholder="+13105550100"
                  value={mobile}
                />
              </Field>
            </>
          )}

          <RadioGroup
            aria-label="How it is paid"
            onValueChange={(value: unknown) =>
              setPaymentIntent(value as PaymentIntent)
            }
            value={paymentIntent}
          >
            <RadioOption
              description="Shows as Unpaid until you record the payment."
              label="Pay at the desk"
              value="pay-at-desk"
            />
            <RadioOption
              description={
                linkAllowed
                  ? "You copy the link or hand it to Inbox; nothing is sent from here."
                  : "Needs Duna Pay set up, and a member or a walk-in's mobile."
              }
              disabled={!linkAllowed}
              label="Send a payment link"
              value="send-payment-link"
            />
            <RadioOption
              description={
                freeAllowed
                  ? "No payment is due."
                  : "Giving paid time away needs the money permission (the club's owner)."
              }
              disabled={!freeAllowed}
              label="Free"
              value="free"
            />
          </RadioGroup>

          <PriceLine
            permissions={permissions}
            preview={preview.state}
            quote={quote}
            unavailable={answer?.priceUnavailable}
            intent={paymentIntent}
            total={total}
          />

          {permissions.setPrice && paymentIntent !== "free" ? (
            <>
              <Checkbox
                checked={staffPrice}
                label="Use a different price"
                onCheckedChange={(checked) => setStaffPrice(checked === true)}
              />
              {staffPrice ? (
                <div className="sch-form__row">
                  <Field label="Price">
                    <MoneyInput
                      currency={currency}
                      onValueChange={setPrice}
                      value={price}
                    />
                  </Field>
                  <Field
                    error={
                      priceReason.length > 0 && priceReason.trim().length < 3
                        ? "Say why in a few words."
                        : undefined
                    }
                    label="Why it differs"
                  >
                    <Input
                      onChange={(event) =>
                        setPriceReason(event.currentTarget.value)
                      }
                      value={priceReason}
                    />
                  </Field>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}

      {conflicts.length > 0 || serverConflicts.length > 0 ? (
        <Notice role="status" title="That time isn't free" tone="warning">
          <ul className="sch-conflicts">
            {conflicts.length > 0
              ? conflicts.map((conflict) => (
                  <li key={conflict.subject}>{conflict.sentence}.</li>
                ))
              : serverConflicts.map((conflict) => (
                  <li key={`${conflict.what}:${conflict.startsAt}`}>
                    {conflictSentence(
                      conflict,
                      court?.name ?? "The court",
                      timeZone,
                    )}
                    .
                  </li>
                ))}
          </ul>
          {alternatives.length > 0 ? (
            <div className="sch-actions">
              {alternatives.map((alternative) => (
                <Button
                  key={alternative.label}
                  onClick={() => {
                    if (alternative.court) setCourtId(alternative.court.id);
                    setStart(minuteOfPlaceDay(alternative.startsAt, day));
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Use {alternative.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="sch-quiet">
              Nothing nearby is free; try another time or day.
            </p>
          )}
        </Notice>
      ) : (
        <p className="sch-quiet" role="status">
          {court?.name ?? "The court"} is free {clock(startsAt, timeZone)}–
          {clock(endsAt, timeZone)}.
        </p>
      )}

      {kind === "booking" && preview.state === "error" ? (
        <Notice
          role="alert"
          title={
            preview.denied
              ? "You can't book courts"
              : "The court couldn't be checked"
          }
          tone="danger"
        >
          <p>{preview.message}</p>
          {preview.reference ? (
            <ReferenceLine reference={preview.reference} />
          ) : null}
        </Notice>
      ) : null}

      {problem ? (
        <Notice role="alert" tone="danger">
          {problem}
        </Notice>
      ) : null}

      <div className="sch-actions sch-actions--end">
        <Button onClick={onClose} variant="ghost">
          Close
        </Button>
        <Button
          disabled={kind === "booking" && preview.state !== "error" && !current}
          loading={kind === "block" ? block.showPending : false}
          type="submit"
          variant="primary"
        >
          {kind === "block" ? "Block this time" : "Review the booking"}
        </Button>
      </div>
    </form>
  );
}

/** The price as the court's rule answers it, in the API's own words. */
function PriceLine({
  permissions,
  preview,
  quote,
  unavailable,
  intent,
  total,
}: {
  readonly permissions: CreatePermissions;
  readonly preview: "idle" | "loading" | "ready" | "error";
  readonly quote: BookingPreview["price"];
  readonly unavailable?: string;
  readonly intent: PaymentIntent;
  readonly total?: number;
}) {
  let words: string;
  if (intent === "free") {
    words = "Free: no payment is due.";
  } else if (!permissions.money) {
    words =
      "The court's own rate applies. Amounts show to staff with a money permission.";
  } else if (quote && total !== undefined) {
    const rate = money(quote.rateMinor, quote.currency);
    words =
      total === quote.totalMinor
        ? intent === "send-payment-link" && quote.totalMinor !== quote.rateMinor
          ? `${money(total, quote.currency)} by the link: ${quote.ratePlanName} ${rate}, plus the online booking fee.`
          : `${money(total, quote.currency)}: ${quote.ratePlanName}.`
        : `${money(total, quote.currency)}, a staff price (the court's rate is ${rate}).`;
  } else if (unavailable) {
    words = unavailable;
  } else {
    words =
      preview === "loading" || preview === "idle"
        ? "Checking the court's price…"
        : "The price couldn't be read.";
  }
  return (
    <p aria-live="polite" className="sch-price" data-testid="booking-price">
      <span className="sch-price__label">Price</span>
      <span>{words}</span>
    </p>
  );
}

/**
 * A payment link, after the booking: shown to copy or hand to Inbox.
 * Nothing has been sent, and the screen says so.
 */
function PaymentLinkHandover({
  url,
  expiresAt,
  who,
  personId,
  timeZone,
  onDone,
}: {
  readonly url: string;
  readonly expiresAt: string;
  readonly who: string;
  readonly personId?: string;
  readonly timeZone: string;
  readonly onDone: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="sch-form" data-testid="payment-link">
      <Notice
        role="status"
        title={`Court held for ${who} until ${clock(expiresAt, timeZone)}`}
        tone="positive"
      >
        Hand them this link to pay. Nothing has been sent; unpaid by then, the
        court is released.
      </Notice>
      <Field label="Payment link">
        <Input
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          value={url}
        />
      </Field>
      <div className="sch-actions">
        <Button
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => setCopied(true))
              .catch(() => setCopied(false));
          }}
          variant="secondary"
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        {personId ? (
          <Button
            href={`${hqHref("inboxCreate")}?recipient=${encodeURIComponent(personId)}`}
            variant="secondary"
          >
            Write to {who.split(" ")[0]} in Inbox
          </Button>
        ) : null}
        <Button onClick={onDone} variant="primary">
          Done
        </Button>
      </div>
    </div>
  );
}
