"use client";

/**
 * Host a pickup (`/app/pickup/new`) and change one (`/app/pickup/[slug]/edit`):
 * one short form (what, where, when, level, group size with the shared rule
 * sentence, who can see it, who to invite), then a review of exactly what
 * players will see before it is published. Core details lock at the start
 * time; until then only the host can publish edits.
 */
import {
  participationRuleSentence,
  type ParticipationRuleWords,
} from "@duna/core";
import { report } from "@duna/observability";
import {
  AddPlayers,
  Button,
  Card,
  Chip,
  Field,
  Input,
  MoneyInput,
  Notice,
  NumberInput,
  Rise,
  Segmented,
  Select,
  Switch,
  Textarea,
  useConfirm,
  useOnline,
  type PlayerSummary,
} from "@duna/ui/tideline";
import { useEffect, useMemo, useState } from "react";
import type { WhereChoice } from "@/components/site/search/search-query";
import { WherePicker } from "@/components/site/search/where-picker";
import { unwrap } from "../action-result";
import { OfflineNotice } from "../states";
import {
  publishPickupAction,
  searchPickupPlayersAction,
  updatePickupAction,
} from "./actions";

type PickupFormat = "2s" | "3s" | "4s" | "6s" | "king-queen";

const FORMATS: readonly {
  value: PickupFormat;
  label: string;
  spots: number;
}[] = [
  { value: "2s", label: "2 v 2", spots: 4 },
  { value: "3s", label: "3 v 3", spots: 6 },
  { value: "4s", label: "4 v 4", spots: 8 },
  { value: "6s", label: "6 v 6", spots: 12 },
  { value: "king-queen", label: "King / Queen", spots: 12 },
];

const GENDERS = [
  { value: "open", label: "All players" },
  { value: "mixed", label: "Mixed" },
  { value: "womens", label: "Women" },
  { value: "mens", label: "Men" },
] as const;

const DECIDE = [
  { value: "0", label: "When it starts" },
  { value: "60", label: "1 hour before" },
  { value: "360", label: "6 hours before" },
  { value: "720", label: "12 hours before" },
  { value: "1440", label: "24 hours before" },
] as const;

const DURATIONS = [
  { value: "60", label: "1 hour" },
  { value: "90", label: "1½ hours" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
] as const;

function omit(
  record: Readonly<Record<string, string>>,
  key: string,
): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

export interface PickupPlace {
  readonly label: string;
  readonly venueId?: string;
  readonly address?: string;
  readonly placeId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly confidence: "confirmed" | "approximate";
}

export interface PickupFormInitial {
  readonly title: string;
  readonly day: string;
  readonly time: string;
  readonly durationMinutes: number;
  readonly place?: PickupPlace;
  readonly capacity: number;
  readonly note: string;
  readonly visibility: "public" | "unlisted";
  readonly approvalRequired: boolean;
  readonly waitlistEnabled: boolean;
}

export type PickupFormProps =
  | {
      readonly mode: "new";
      readonly hostId: string;
      readonly courtBookingId?: string;
      readonly initial: PickupFormInitial;
      readonly suggestions: readonly PlayerSummary[];
    }
  | {
      readonly mode: "edit";
      readonly pickupSessionId: string;
      readonly slug: string;
      readonly confirmedCount: number;
      readonly initial: PickupFormInitial;
    };

function localIso(day: string, time: string): string | null {
  const instant = new Date(`${day}T${time}`);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

export function PickupForm(props: PickupFormProps) {
  const online = useOnline();
  const confirm = useConfirm();
  const editing = props.mode === "edit";
  const initial = props.initial;
  const [stage, setStage] = useState<"form" | "review" | "done">("form");
  const [title, setTitle] = useState(initial.title);
  const [place, setPlace] = useState<PickupPlace | undefined>(initial.place);
  const [day, setDay] = useState(initial.day);
  const [time, setTime] = useState(initial.time);
  const [duration, setDuration] = useState(String(initial.durationMinutes));
  const [format, setFormat] = useState<PickupFormat>("4s");
  const [matchType, setMatchType] = useState<"competitive" | "casual">(
    "competitive",
  );
  const [gender, setGender] =
    useState<(typeof GENDERS)[number]["value"]>("open");
  const [anyLevel, setAnyLevel] = useState(true);
  const [ratingMin, setRatingMin] = useState(3.5);
  const [ratingMax, setRatingMax] = useState(5);
  const [capacity, setCapacity] = useState(initial.capacity);
  const [minimumOn, setMinimumOn] = useState(false);
  const [minimum, setMinimum] = useState(4);
  const [decide, setDecide] = useState("60");
  const [waitlist, setWaitlist] = useState(initial.waitlistEnabled);
  const [lateCancel, setLateCancel] = useState(false);
  const [approval, setApproval] = useState(initial.approvalRequired);
  const [visibility, setVisibility] = useState(initial.visibility);
  const [record, setRecord] = useState(true);
  const [priceMinor, setPriceMinor] = useState<number | null>(0);
  const [note, setNote] = useState(initial.note);
  const [invited, setInvited] = useState<PlayerSummary[]>([]);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [published, setPublished] = useState<{ slug: string; title: string }>();
  const minCapacity = editing ? Math.max(2, props.confirmedCount) : 2;

  useEffect(() => {
    if (editing) return;
    setCapacity(FORMATS.find((option) => option.value === format)?.spots ?? 8);
  }, [format, editing]);

  const rule: ParticipationRuleWords = {
    unit: "player",
    minParticipants: minimumOn ? Math.min(minimum, capacity) : 1,
    maxParticipants: capacity,
    minimumPolicy: "cancel",
    lockMinutesBeforeStart: Number(decide),
    waitlist,
    tiers: [],
  };
  const sentence = participationRuleSentence(rule, { capacity });
  const startsAt = localIso(day, time);
  const endsAt = startsAt
    ? new Date(Date.parse(startsAt) + Number(duration) * 60_000).toISOString()
    : null;
  const when = useMemo(
    () =>
      startsAt
        ? new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(startsAt))
        : "",
    [startsAt],
  );

  const validate = () => {
    const problems: Record<string, string> = {};
    if (title.trim().length < 2) problems.title = "Give it a name.";
    if (!place) problems.place = "Choose where you’ll play.";
    if (!startsAt || Date.parse(startsAt) <= Date.now())
      problems.time = "Choose a future start time.";
    if (capacity < minCapacity)
      problems.capacity = `At least ${minCapacity}: ${editing ? "that many have already joined" : "a pickup needs two players"}.`;
    if (!editing && !anyLevel && ratingMin > ratingMax)
      problems.level = "The lowest level is above the highest.";
    return problems;
  };

  const review = () => {
    const problems = validate();
    setErrors(problems);
    if (Object.keys(problems).length === 0) setStage("review");
  };

  const publish = () => {
    if (!startsAt || !endsAt || !place) return;
    const inviteNames = invited.map((person) => person.name);
    void confirm
      .run({
        tier: "confirm",
        title: editing
          ? `Publish the changes to ${title}?`
          : `Publish ${title}?`,
        description: editing
          ? "Players see the new details at once."
          : visibility === "public"
            ? "It goes live in Find for players near you, and anyone with the link can join."
            : "Only people with the link can find it and join.",
        ...(!editing && inviteNames.length > 0
          ? {
              affected: `${inviteNames.join(", ")} ${inviteNames.length === 1 ? "is" : "are"} invited and told by Duna.`,
            }
          : {}),
        verb: editing ? "Publish changes" : "Publish pickup",
        cancelLabel: "Keep editing",
        agentConfirm: editing
          ? `Publishes changes to the pickup ${title}`
          : `Publishes the pickup ${title}${inviteNames.length ? ` and invites ${inviteNames.length} players` : ""}`,
        perform: async ({ idempotencyKey }) => {
          const location = {
            venueName: place.label,
            ...(place.address ? { address: place.address } : {}),
            ...(place.placeId ? { googlePlaceId: place.placeId } : {}),
            ...(place.latitude !== undefined
              ? { latitude: place.latitude }
              : {}),
            ...(place.longitude !== undefined
              ? { longitude: place.longitude }
              : {}),
            locationConfidence: place.confidence,
          };
          if (props.mode === "edit") {
            unwrap(
              await updatePickupAction({
                pickupSessionId: props.pickupSessionId,
                title: title.trim(),
                startsAt,
                endsAt,
                ...location,
                capacity,
                ...(note.trim() ? { note: note.trim() } : {}),
                approvalRequired: approval,
                waitlistEnabled: waitlist,
                visibility,
                idempotencyKey,
              }),
            );
            return { slug: props.slug, title: title.trim() };
          }
          return unwrap(
            await publishPickupAction({
              title: title.trim(),
              startsAt,
              endsAt,
              ...location,
              ...(place.venueId ? { venueId: place.venueId } : {}),
              ...(props.courtBookingId
                ? { courtBookingId: props.courtBookingId }
                : {}),
              capacity,
              format,
              matchType,
              genderPreference: gender,
              ...(note.trim() ? { note: note.trim() } : {}),
              visibility,
              approvalRequired: approval,
              smartRules: {
                waitlistEnabled: waitlist,
                allowLateCancellation: lateCancel,
                minimumNoticeMinutes: Number(decide),
                autoCancelLowAttendance: minimumOn,
                minimumAttendance: minimumOn ? Math.min(minimum, capacity) : 2,
              },
              costMinor: priceMinor ?? 0,
              currency: "USD",
              recordMatches: record,
              ...(anyLevel
                ? {}
                : { ratingMinimum: ratingMin, ratingMaximum: ratingMax }),
              participantPersonIds: invited.map((person) => person.id),
              idempotencyKey,
            }),
          );
        },
        success: editing ? "Changes published" : "Pickup published",
        report: (error) =>
          report(error, { event: "web.pickup.publish_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setPublished(outcome.result);
          setStage("done");
        }
      });
  };

  if (stage === "done" && published) {
    const link =
      typeof window === "undefined"
        ? `/events/${published.slug}`
        : `${window.location.origin}/events/${published.slug}`;
    return (
      <Rise>
        <Card className="pp-done">
          <h2 className="td-display pp-title">
            {editing
              ? `${published.title} is updated.`
              : `${published.title} is live.`}
          </h2>
          <p className="td-lead">
            {editing
              ? "Players see the new details now."
              : "Share the link yourself, in your own words. Duna doesn’t send it for you."}
          </p>
          <Input aria-label="Link to the pickup" readOnly value={link} />
          <div className="pp-row-actions">
            <Button
              onClick={() =>
                void navigator.clipboard?.writeText(link).catch(() => undefined)
              }
              variant="primary"
            >
              Copy link
            </Button>
            <Button href={`/events/${published.slug}`} variant="secondary">
              Open the pickup
            </Button>
            <Button href="/app/play" variant="ghost">
              Your plans
            </Button>
          </div>
        </Card>
      </Rise>
    );
  }

  if (stage === "review") {
    return (
      <Rise>
        <div className="pp-form">
          <OfflineNotice />
          <Card className="pp-preview">
            <p className="pp-eyebrow">Player preview</p>
            <h2 className="pp-h2">{title}</h2>
            <p className="td-num">{when}</p>
            <p>{place?.label}</p>
            <p className="pp-chips">
              {!editing ? (
                <>
                  <Chip kind="taxonomy">
                    {FORMATS.find((option) => option.value === format)?.label}
                  </Chip>
                  <Chip kind="taxonomy">
                    {matchType === "competitive" ? "Competitive" : "Casual"}
                  </Chip>
                  <Chip kind="taxonomy">
                    {GENDERS.find((option) => option.value === gender)?.label}
                  </Chip>
                  <Chip kind="taxonomy">
                    {anyLevel
                      ? "Any level"
                      : `Sand Rating ${ratingMin.toFixed(1)}–${ratingMax.toFixed(1)}`}
                  </Chip>
                </>
              ) : null}
              <Chip kind="taxonomy">
                {visibility === "public" ? "Public in Find" : "Unlisted link"}
              </Chip>
            </p>
            <p>{sentence}</p>
            {!editing ? (
              <p className="td-meta">
                {(priceMinor ?? 0) > 0
                  ? `$${((priceMinor ?? 0) / 100).toFixed(2)} a player`
                  : "Free to join"}
                {approval ? " · You approve each player" : ""}
              </p>
            ) : null}
            {note.trim() ? <p className="td-meta">“{note.trim()}”</p> : null}
            {invited.length > 0 ? (
              <p className="td-meta">
                Invited: {invited.map((person) => person.name).join(", ")}
              </p>
            ) : null}
            <Notice tone="info">
              Core details lock at the start time. Until then, only the creator
              can publish edits.
            </Notice>
          </Card>
          <div className="pp-submit">
            <Button onClick={() => setStage("form")} variant="secondary">
              Back to edit
            </Button>
            <Button disabled={!online} onClick={publish} variant="primary">
              {editing ? "Publish changes" : "Publish pickup"}
            </Button>
          </div>
          {confirm.dialog}
        </div>
      </Rise>
    );
  }

  return (
    <div className="pp-form">
      <OfflineNotice />
      <section aria-labelledby="pp-what" className="pp-step">
        <h2 className="pp-h2" id="pp-what">
          What
        </h2>
        <Field error={errors.title} label="Name your run">
          <Input
            maxLength={140}
            onValueChange={(value) => setTitle(String(value ?? ""))}
            value={title}
          />
        </Field>
        {!editing ? (
          <>
            <div className="pp-control">
              <span className="pp-label" id="pp-format">
                Format
              </span>
              <Segmented
                aria-labelledby="pp-format"
                onValueChange={(value) =>
                  value && setFormat(value as PickupFormat)
                }
                options={FORMATS.map(({ value, label }) => ({ value, label }))}
                value={format}
              />
            </div>
            <div className="pp-fieldrow">
              <div className="pp-control">
                <span className="pp-label" id="pp-kind">
                  Style
                </span>
                <Segmented
                  aria-labelledby="pp-kind"
                  onValueChange={(value) =>
                    value && setMatchType(value as "competitive" | "casual")
                  }
                  options={[
                    { value: "competitive", label: "Competitive" },
                    { value: "casual", label: "Casual" },
                  ]}
                  value={matchType}
                />
              </div>
              <Field label="Who it’s for">
                <Select
                  onValueChange={(value) =>
                    value &&
                    setGender(value as (typeof GENDERS)[number]["value"])
                  }
                  options={GENDERS}
                  value={gender}
                />
              </Field>
            </div>
            <p className="td-meta">
              {matchType === "competitive"
                ? "Competitive results can move Sand Ratings once both sides confirm."
                : "Casual games are for fun: results stay out of Sand Ratings."}
            </p>
          </>
        ) : null}
      </section>

      <section aria-labelledby="pp-where-when" className="pp-step">
        <h2 className="pp-h2" id="pp-where-when">
          Where and when
        </h2>
        <WherePicker
          label="Where"
          mode="flow"
          onAddPlace={(text) =>
            setPlace({ label: text.slice(0, 120), confidence: "approximate" })
          }
          onChoose={(choice: WhereChoice) => {
            if (choice.kind !== "place") return;
            setPlace({
              label: choice.label,
              ...(choice.venueId ? { venueId: choice.venueId } : {}),
              ...(choice.address ? { address: choice.address } : {}),
              ...(choice.placeId ? { placeId: choice.placeId } : {}),
              latitude: choice.latitude,
              longitude: choice.longitude,
              confidence: "confirmed",
            });
            setErrors((current) => omit(current, "place"));
          }}
          placeholder="A Duna club, a beach or a park"
        />
        {place ? (
          <p className="td-meta">
            {place.label}
            {place.confidence === "approximate"
              ? " (players see it as an approximate place)"
              : ""}
          </p>
        ) : null}
        {errors.place ? (
          <p className="pp-error" role="alert">
            {errors.place}
          </p>
        ) : null}
        <div className="pp-fieldrow">
          <Field label="Day">
            <Input
              onValueChange={(value) => setDay(String(value ?? ""))}
              type="date"
              value={day}
            />
          </Field>
          <Field error={errors.time} label="Start time">
            <Input
              onValueChange={(value) => setTime(String(value ?? ""))}
              type="time"
              value={time}
            />
          </Field>
          <Field label="How long">
            <Select
              onValueChange={(value) => value && setDuration(value)}
              options={DURATIONS}
              value={duration}
            />
          </Field>
        </div>
      </section>

      {!editing ? (
        <section aria-labelledby="pp-level" className="pp-step">
          <h2 className="pp-h2" id="pp-level">
            Level
          </h2>
          <Switch
            checked={anyLevel}
            label="Any level"
            onCheckedChange={(checked) => setAnyLevel(checked === true)}
          />
          {!anyLevel ? (
            <div className="pp-fieldrow">
              <Field label="Lowest Sand Rating">
                <NumberInput
                  max={7}
                  min={1}
                  onValueChange={(value) => setRatingMin(Number(value ?? 1))}
                  step={0.5}
                  value={ratingMin}
                />
              </Field>
              <Field error={errors.level} label="Highest Sand Rating">
                <NumberInput
                  max={7}
                  min={1}
                  onValueChange={(value) => setRatingMax(Number(value ?? 7))}
                  step={0.5}
                  value={ratingMax}
                />
              </Field>
            </div>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="pp-group" className="pp-step">
        <h2 className="pp-h2" id="pp-group">
          Group size
        </h2>
        <Field error={errors.capacity} label="Players, you included">
          <NumberInput
            max={100}
            min={minCapacity}
            onValueChange={(value) => setCapacity(Number(value ?? minCapacity))}
            value={capacity}
          />
        </Field>
        {!editing ? (
          <>
            <Switch
              checked={minimumOn}
              label="Call it off if too few join"
              onCheckedChange={(checked) => setMinimumOn(checked === true)}
            />
            {minimumOn ? (
              <div className="pp-fieldrow">
                <Field label="At least">
                  <NumberInput
                    max={capacity}
                    min={2}
                    onValueChange={(value) => setMinimum(Number(value ?? 2))}
                    value={Math.min(minimum, capacity)}
                  />
                </Field>
                <Field label="Decide">
                  <Select
                    onValueChange={(value) => value && setDecide(value)}
                    options={DECIDE}
                    value={decide}
                  />
                </Field>
              </div>
            ) : null}
          </>
        ) : null}
        <Switch
          checked={waitlist}
          label="Keep a waitlist when it’s full"
          onCheckedChange={(checked) => setWaitlist(checked === true)}
        />
        <p className="pp-sentence" aria-live="polite">
          {sentence}
        </p>
      </section>

      <section aria-labelledby="pp-who" className="pp-step">
        <h2 className="pp-h2" id="pp-who">
          Who can join
        </h2>
        <div className="pp-control">
          <span className="pp-label" id="pp-visibility">
            Who can see it
          </span>
          <Segmented
            aria-labelledby="pp-visibility"
            onValueChange={(value) =>
              value && setVisibility(value as "public" | "unlisted")
            }
            options={[
              { value: "public", label: "Everyone in Find" },
              { value: "unlisted", label: "Only with the link" },
            ]}
            value={visibility}
          />
        </div>
        <Switch
          checked={approval}
          description="You say yes to each player before they’re in."
          label="Approve each player"
          onCheckedChange={(checked) => setApproval(checked === true)}
        />
        {!editing ? (
          <>
            <Switch
              checked={lateCancel}
              description={`Players can still drop out after the decision time${minimumOn ? "" : " (an hour before)"}.`}
              label="Allow late cancellations"
              onCheckedChange={(checked) => setLateCancel(checked === true)}
            />
            <Switch
              checked={record}
              label="Keep score for each game"
              onCheckedChange={(checked) => setRecord(checked === true)}
            />
            <Field
              hint="Leave at $0 for a free game."
              label="Price for each player"
            >
              <MoneyInput
                currency="USD"
                onValueChange={(value) => setPriceMinor(value)}
                value={priceMinor}
              />
            </Field>
            <div className="pp-side">
              <AddPlayers
                capacity={Math.max(1, capacity - 1)}
                labels={{
                  slots: "Invited",
                  contacts: "People you play with",
                  noContacts: "People you play with show here.",
                  search: "Search Duna players to invite",
                }}
                onSelectedChange={(next) => setInvited(next)}
                searchPlayers={async (query) =>
                  (await searchPickupPlayersAction(query)).map((person) => ({
                    ...person,
                  }))
                }
                selected={invited}
                contacts={props.mode === "new" ? props.suggestions : []}
              />
            </div>
          </>
        ) : null}
        <Field label="A note for the group" optional>
          <Textarea
            maxLength={2000}
            onChange={(event) => setNote(event.currentTarget.value)}
            rows={3}
            value={note}
          />
        </Field>
      </section>

      {Object.keys(errors).length > 0 ? (
        <Notice role="alert" tone="danger">
          {Object.keys(errors).length === 1
            ? "One answer needs attention."
            : `${Object.keys(errors).length} answers need attention.`}
        </Notice>
      ) : null}
      <div className="pp-submit">
        <Button onClick={review} size="lg" variant="primary">
          Review
        </Button>
      </div>
    </div>
  );
}
