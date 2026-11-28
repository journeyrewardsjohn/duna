"use client";

/**
 * Add a score without an account (docs/design/website.md 2.5): Where, Score,
 * Players, then what the result would do and one clear next step: save it to
 * your name. Each step is saved as you leave it (the draft lives on Duna for
 * 7 days, found by an HTTP-only cookie), so coming back resumes it.
 */
import type {
  AddScoreDraftData,
  AddScoreDraftView,
  AddScoreFormat,
  AddScorePlace,
  AddScorePreview,
  AddScoreSet,
} from "@duna/api";
import {
  Button,
  Checkbox,
  ClubMark,
  Field,
  Icon,
  Input,
  NetScore,
  Notice,
  NumberInput,
  OfflineBanner,
  RatingRing,
  ReferenceLine,
  Segmented,
  Select,
  useAction,
  useOnline,
} from "@duna/ui/tideline";
import { useEffect, useMemo, useRef, useState } from "react";
import { WherePicker } from "@/components/site/search/where-picker";
import type { WhereChoice } from "@/components/site/search/search-query";
import {
  type AddScoreFailure,
  discardAddScore,
  forgetExpiredAddScore,
  previewAddScore,
  saveAddScoreStep,
} from "./actions";
import {
  ADD_SCORE_STEP_TITLES,
  claimHref,
  firstIncompleteStep,
  FORMAT_OPTIONS,
  focusFirstProblem,
  formatDay,
  nameRows,
  resultSentence,
  SURFACE_OPTIONS,
  todayIso,
  type NameRow,
} from "./flow-model";

type Surface = (typeof SURFACE_OPTIONS)[number]["value"];

interface NewCourt {
  name: string;
  address: string;
  latitude?: number;
  longitude?: number;
  surface: Surface;
  nets: number;
}

type FlowNoticeState =
  | { kind: "failure"; failure: AddScoreFailure }
  | { kind: "resumed"; startedAt: string; expiresAt: string }
  | { kind: "expired" }
  | { kind: "discarded" };

export interface AddScoreFlowProps {
  readonly initial?: AddScoreDraftView;
  readonly arrivedExpired?: boolean;
  readonly prefillWhere?: string;
  readonly signedIn: boolean;
}

function placeFromChoice(
  choice: Extract<WhereChoice, { kind: "place" }>,
): AddScorePlace | undefined {
  if (choice.source === "duna" && choice.venueId) {
    return { kind: "duna", venueId: choice.venueId, name: choice.label };
  }
  if (choice.source === "places" && choice.placeId) {
    return {
      kind: "places",
      placeId: choice.placeId,
      name: choice.label,
      address: choice.address,
      latitude: choice.latitude,
      longitude: choice.longitude,
    };
  }
  return undefined;
}

export function AddScoreFlow({
  initial,
  arrivedExpired,
  prefillWhere,
  signedIn,
}: AddScoreFlowProps) {
  const online = useOnline();
  const data: AddScoreDraftData = initial?.data ?? {};
  const [draft, setDraft] = useState<AddScoreDraftView | undefined>(initial);
  const [step, setStep] = useState(() =>
    initial ? firstIncompleteStep(initial.completed) : 0,
  );
  const [notice, setNotice] = useState<FlowNoticeState | undefined>(() =>
    arrivedExpired
      ? { kind: "expired" }
      : initial
        ? {
            kind: "resumed",
            startedAt: initial.startedAt,
            expiresAt: initial.expiresAt,
          }
        : undefined,
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  // Where
  const [place, setPlace] = useState<AddScorePlace | undefined>(data.place);
  const [newCourt, setNewCourt] = useState<NewCourt | undefined>(() =>
    data.place?.kind === "described"
      ? {
          name: data.place.name,
          address: data.place.address ?? "",
          latitude: data.place.latitude,
          longitude: data.place.longitude,
          surface: data.place.surface ?? "beach-sand",
          nets: data.place.nets ?? 2,
        }
      : undefined,
  );
  const [locating, setLocating] = useState(false);

  // Score
  const [format, setFormat] = useState<AddScoreFormat>(data.format ?? 2);
  const [matchType, setMatchType] = useState<"competitive" | "friendly">(
    data.matchType ?? "competitive",
  );
  const [playedOn, setPlayedOn] = useState(data.playedOn ?? "");
  const [maxDay, setMaxDay] = useState<string>();
  const [sets, setSets] = useState<AddScoreSet[]>(
    data.sets ?? [
      { you: 21, them: 18 },
      { you: 19, them: 21 },
      { you: 15, them: 12 },
    ],
  );

  // Players
  const [yourName, setYourName] = useState(data.you?.firstName ?? "");
  const [teammates, setTeammates] = useState<NameRow[]>(() =>
    nameRows(data.teammates, (data.format ?? 2) - 1),
  );
  const [opponents, setOpponents] = useState<NameRow[]>(() =>
    nameRows(data.opponents, data.format ?? 2),
  );
  const [agreed, setAgreed] = useState(data.agreed === true);

  // Result
  const [preview, setPreview] = useState<AddScorePreview>();
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    // The calendar day is the visitor's own: set after hydration.
    const today = todayIso(new Date());
    setMaxDay(today);
    setPlayedOn((current) => current || today);
    if (arrivedExpired) void forgetExpiredAddScore();
  }, [arrivedExpired]);

  useEffect(() => {
    if (Object.keys(errors).length > 0) focusFirstProblem(mainRef.current);
  }, [errors]);

  useEffect(() => {
    setTeammates((rows) => nameRows(rows, format - 1));
    setOpponents((rows) => nameRows(rows, format));
  }, [format]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: false });
  }, [step]);

  const loadPreview = useAction(async () => {
    const answer = await previewAddScore();
    if (!answer.ok) {
      setNotice({ kind: "failure", failure: answer });
      return;
    }
    if (answer.result.state === "ready") {
      setPreview(answer.result.preview);
      return;
    }
    if (answer.result.state === "not-ready") {
      setStep(firstIncompleteStep(draft?.completed ?? []));
      return;
    }
    setNotice({ kind: "expired" });
    setStep(0);
  });

  useEffect(() => {
    // Resuming a finished draft: show what it would do straight away.
    if (step === 3 && !preview && !loadPreview.pending) void loadPreview.run();
  }, [step]);

  function apply(failure: AddScoreFailure) {
    if (failure.kind === "invalid") {
      setErrors(failure.fieldErrors ?? {});
      setNotice(undefined);
      return;
    }
    setNotice({ kind: "failure", failure });
    if (failure.kind === "expired" || failure.kind === "claimed") {
      setDraft(undefined);
      setStep(0);
    }
  }

  function currentPlace(): AddScorePlace | undefined {
    if (!newCourt) return place;
    return {
      kind: "described",
      name: newCourt.name.trim(),
      address: newCourt.address.trim() || undefined,
      latitude: newCourt.latitude,
      longitude: newCourt.longitude,
      surface: newCourt.surface,
      nets: newCourt.nets,
    };
  }

  function stepData(index: number): AddScoreDraftData {
    if (index === 0) return { place: currentPlace() };
    if (index === 1) return { format, matchType, playedOn, sets };
    const named = (rows: NameRow[]) =>
      rows
        .filter((row) => row.firstName.trim())
        .map((row) => ({
          firstName: row.firstName.trim(),
          lastInitial: row.lastInitial.trim() || undefined,
        }));
    return {
      you: yourName.trim() ? { firstName: yourName.trim() } : {},
      teammates: named(teammates),
      opponents: named(opponents),
      agreed,
    };
  }

  /** Checks that need no server first, then the single-flight save. */
  function next(index: number) {
    const local = localErrors(index);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }
    void save.run(index);
  }

  function clearError(key: string) {
    setErrors((current) => {
      if (!(key in current)) return current;
      const rest = { ...current };
      delete rest[key];
      return rest;
    });
  }

  const save = useAction(async (_context, index: number) => {
    const stepName = (["where", "score", "players"] as const)[index]!;
    const answer = await saveAddScoreStep(stepName, stepData(index));
    if (!answer.ok) {
      apply(answer);
      return;
    }
    setErrors({});
    setDraft(answer.draft);
    if (notice?.kind !== "resumed") setNotice(undefined);
    if (index === 2) {
      setPreview(undefined);
      setStep(3);
      await loadPreview.run();
      return;
    }
    setStep(index + 1);
  });

  const startOver = useAction(async () => {
    const answer = await discardAddScore();
    if (!answer.ok) {
      setNotice({ kind: "failure", failure: answer });
      return;
    }
    setDraft(undefined);
    setPlace(undefined);
    setNewCourt(undefined);
    setSets([
      { you: 21, them: 18 },
      { you: 19, them: 21 },
      { you: 15, them: 12 },
    ]);
    setTeammates(nameRows([], format - 1));
    setOpponents(nameRows([], format));
    setAgreed(false);
    setPreview(undefined);
    setConfirmingStartOver(false);
    setErrors({});
    setNotice({ kind: "discarded" });
    setStep(0);
  });

  /** Checks that need no server: say them at once, in place. */
  function localErrors(index: number): Record<string, string> {
    const out: Record<string, string> = {};
    if (index === 0) {
      if (newCourt) {
        if (newCourt.name.trim().length < 2)
          out["place.name"] = "Give the new court a name.";
        if (!newCourt.address.trim() && newCourt.latitude === undefined)
          out["place.address"] =
            "Add an address or use where you are now, so we can find the court.";
      } else if (!place) {
        out.place = "Pick where you played, or add it as a new court.";
      }
    }
    if (index === 2) {
      if (!opponents.some((row) => row.firstName.trim()))
        out["opponents.0.firstName"] =
          "Add at least one name from the other side.";
      if (!agreed)
        out.agreed =
          "Everyone on court needs to agree before a match is recorded.";
    }
    return out;
  }

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setErrors({
        "place.address":
          "This browser can’t share a location. Type the address instead.",
      });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        setNewCourt((court) =>
          court
            ? {
                ...court,
                latitude: Number(position.coords.latitude.toFixed(6)),
                longitude: Number(position.coords.longitude.toFixed(6)),
              }
            : court,
        );
      },
      () => {
        setLocating(false);
        setErrors({
          "place.address":
            "Location is off for Duna in this browser. Type the address instead.",
        });
      },
      { maximumAge: 300_000, timeout: 10_000 },
    );
  }

  const busy = save.pending || startOver.pending || loadPreview.pending;
  const teams = useMemo<readonly [string, string]>(() => {
    const ours = [
      yourName.trim() || "You",
      ...teammates.map((r) => r.firstName.trim()).filter(Boolean),
    ];
    const theirs = opponents.map((r) => r.firstName.trim()).filter(Boolean);
    return [ours.join(" / "), theirs.length ? theirs.join(" / ") : "Them"];
  }, [yourName, teammates, opponents]);

  return (
    <div className="as-flow">
      <div className="as-flow__main" ref={mainRef}>
        <ol aria-label="Progress" className="as-progress">
          {ADD_SCORE_STEP_TITLES.map((title, index) => (
            <li
              aria-current={index === step ? "step" : undefined}
              data-state={
                index < step ? "done" : index === step ? "current" : undefined
              }
              key={title}
            >
              <span aria-hidden="true" className="as-progress__bar" />
              {title}
              <span className="td-sr">
                {index < step
                  ? ", done"
                  : index === step
                    ? ", current step"
                    : ""}
              </span>
            </li>
          ))}
        </ol>
        <OfflineBanner writes="refused" />
        <FlowNotice
          notice={notice}
          onDismiss={() => setNotice(undefined)}
          onStartOver={() => setConfirmingStartOver(true)}
        />

        {step === 0 ? (
          <section
            aria-labelledby="as-where"
            className="as-panel td-rise"
            key="where"
          >
            <h2
              className="as-panel__title"
              id="as-where"
              ref={headingRef}
              tabIndex={-1}
            >
              Where did you play?
            </h2>
            <p className="as-hint">
              No account needed. We keep this score for this browser for 7 days,
              then delete it. Nobody else sees it unless you save it to your
              name.
            </p>
            {place && !newCourt ? (
              <div className="as-picked">
                <span aria-hidden="true" className="as-picked__mark">
                  {place.kind === "duna" ? (
                    <ClubMark decorative name={place.name} size={40} />
                  ) : (
                    <Icon name="pin" size="control" />
                  )}
                </span>
                <span className="as-picked__text">
                  <strong>{place.name}</strong>
                  <span>
                    {place.kind === "duna"
                      ? "On Duna"
                      : draft?.place?.isNew === false
                        ? "On Duna"
                        : (place.address ?? "Place")}
                  </span>
                </span>
                <Button
                  onClick={() => {
                    setPlace(undefined);
                    setErrors({});
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Change
                </Button>
              </div>
            ) : null}
            {!place && !newCourt ? (
              <div className="as-where">
                <WherePicker
                  initialText={prefillWhere}
                  label="Where did you play"
                  mode="flow"
                  onAddPlace={(text) => {
                    setNewCourt({
                      name: text.slice(0, 80),
                      address: "",
                      surface: "beach-sand",
                      nets: 2,
                    });
                    setErrors({});
                  }}
                  onChoose={(choice) => {
                    if (choice.kind !== "place") return;
                    const picked = placeFromChoice(choice);
                    if (picked) {
                      setPlace(picked);
                      setErrors({});
                    }
                  }}
                  placeholder="A beach, park, gym or city"
                />
                {errors.place ? (
                  <p className="as-error" role="alert">
                    {errors.place}
                  </p>
                ) : null}
              </div>
            ) : null}
            {newCourt ? (
              <div className="as-newcourt">
                <div className="as-newcourt__head">
                  <strong>Add this court</strong>
                  <Button
                    onClick={() => {
                      setNewCourt(undefined);
                      setErrors({});
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Search again
                  </Button>
                </div>
                <Field error={errors["place.name"]} label="Court name">
                  <Input
                    maxLength={80}
                    onValueChange={(value) => {
                      clearError("place.name");
                      setNewCourt((court) =>
                        court ? { ...court, name: String(value ?? "") } : court,
                      );
                    }}
                    placeholder="North Lot courts"
                    value={newCourt.name}
                  />
                </Field>
                <Field
                  error={errors["place.address"]}
                  hint={
                    newCourt.latitude !== undefined
                      ? "Pin set where you are now. An address helps too."
                      : "A street, a landmark or the area. Or use where you are now."
                  }
                  label="Address or area"
                  optional={newCourt.latitude !== undefined}
                >
                  <Input
                    autoComplete="off"
                    maxLength={200}
                    onValueChange={(value) => {
                      clearError("place.address");
                      setNewCourt((court) =>
                        court
                          ? { ...court, address: String(value ?? "") }
                          : court,
                      );
                    }}
                    placeholder="Behind the north parking lot"
                    value={newCourt.address}
                  />
                </Field>
                <div>
                  <Button
                    icon={<Icon name="locate" />}
                    loading={locating}
                    onClick={useMyLocation}
                    size="sm"
                    variant="secondary"
                  >
                    {newCourt.latitude !== undefined
                      ? "Pin set · update it"
                      : "Use where I am now"}
                  </Button>
                </div>
                <div className="as-field-row">
                  <Field label="Surface">
                    <Select
                      onValueChange={(value) =>
                        setNewCourt((court) =>
                          court && value
                            ? { ...court, surface: value as Surface }
                            : court,
                        )
                      }
                      options={SURFACE_OPTIONS}
                      value={newCourt.surface}
                    />
                  </Field>
                  <Field label="Nets">
                    <NumberInput
                      max={40}
                      min={1}
                      onValueChange={(value) =>
                        setNewCourt((court) =>
                          court
                            ? {
                                ...court,
                                nets: Math.max(
                                  1,
                                  Math.min(40, Number(value ?? 1)),
                                ),
                              }
                            : court,
                        )
                      }
                      value={newCourt.nets}
                    />
                  </Field>
                </div>
                <p className="as-hint">
                  We check new courts before they’re listed for everyone. You
                  can still add your score now.
                </p>
              </div>
            ) : null}
            <div className="as-actions">
              <span />
              <Button
                disabled={!online}
                loading={save.showPending}
                onClick={() => next(0)}
                variant="primary"
              >
                Next: the score
              </Button>
            </div>
          </section>
        ) : null}

        {step === 1 ? (
          <section
            aria-labelledby="as-score"
            className="as-panel td-rise"
            key="score"
          >
            <h2
              className="as-panel__title"
              id="as-score"
              ref={headingRef}
              tabIndex={-1}
            >
              What was the score?
            </h2>
            <div className="as-control">
              <span className="as-control__label" id="as-format">
                Format
              </span>
              <Segmented
                aria-labelledby="as-format"
                block
                onValueChange={(value) =>
                  value && setFormat(Number(value) as AddScoreFormat)
                }
                options={FORMAT_OPTIONS}
                value={String(format)}
              />
            </div>
            <div className="as-field-row">
              <Field error={errors.playedOn} label="Day played">
                <Input
                  max={maxDay}
                  onValueChange={(value) => setPlayedOn(String(value ?? ""))}
                  type="date"
                  value={playedOn}
                />
              </Field>
              <div className="as-control">
                <span className="as-control__label" id="as-type">
                  Match
                </span>
                <Segmented
                  aria-labelledby="as-type"
                  onValueChange={(value) =>
                    value && setMatchType(value as "competitive" | "friendly")
                  }
                  options={[
                    { value: "competitive", label: "Competitive" },
                    { value: "friendly", label: "Friendly" },
                  ]}
                  value={matchType}
                />
              </div>
            </div>
            <p className="as-hint">
              {matchType === "competitive" && format === 2
                ? "Competitive doubles matches count toward a Sand Rating."
                : matchType === "friendly"
                  ? "Friendly matches are saved to your history but don’t move a Sand Rating."
                  : "Only two-on-two matches move a Sand Rating for now. This one is saved to your history."}
            </p>
            <fieldset className="as-sets">
              <legend className="as-control__label">Sets</legend>
              <div aria-hidden="true" className="as-sets__head">
                <span />
                <span>Your side</span>
                <span>Their side</span>
                <span />
              </div>
              {sets.map((set, index) => (
                <div className="as-sets__row" key={index}>
                  <span className="as-sets__label">Set {index + 1}</span>
                  <NumberInput
                    aria-label={`Set ${index + 1}, your side`}
                    decrementLabel={`One less for your side, set ${index + 1}`}
                    incrementLabel={`One more for your side, set ${index + 1}`}
                    max={99}
                    min={0}
                    onValueChange={(value) =>
                      setSets((rows) =>
                        rows.map((row, at) =>
                          at === index
                            ? { ...row, you: Number(value ?? 0) }
                            : row,
                        ),
                      )
                    }
                    value={set.you}
                  />
                  <NumberInput
                    aria-label={`Set ${index + 1}, their side`}
                    decrementLabel={`One less for their side, set ${index + 1}`}
                    incrementLabel={`One more for their side, set ${index + 1}`}
                    max={99}
                    min={0}
                    onValueChange={(value) =>
                      setSets((rows) =>
                        rows.map((row, at) =>
                          at === index
                            ? { ...row, them: Number(value ?? 0) }
                            : row,
                        ),
                      )
                    }
                    value={set.them}
                  />
                  {sets.length > 1 ? (
                    <Button
                      aria-label={`Remove set ${index + 1}`}
                      icon={<Icon name="close" />}
                      onClick={() =>
                        setSets((rows) => rows.filter((_, at) => at !== index))
                      }
                      size="sm"
                      variant="ghost"
                    />
                  ) : (
                    <span />
                  )}
                </div>
              ))}
              {sets.length < 5 ? (
                <div>
                  <Button
                    icon={<Icon name="plus" />}
                    onClick={() =>
                      setSets((rows) => [...rows, { you: 0, them: 0 }])
                    }
                    size="sm"
                    variant="secondary"
                  >
                    Add a set
                  </Button>
                </div>
              ) : null}
              {errors.sets ? (
                <p className="as-error" role="alert">
                  {errors.sets}
                </p>
              ) : null}
            </fieldset>
            <div className="as-live">
              <span className="as-control__label">As you enter it</span>
              <NetScore
                announce={false}
                layout="auto"
                sets={sets.map((set) => [set.you, set.them] as const)}
                size="sm"
                status="pending-verification"
                teams={teams}
              />
            </div>
            <SoftCheck sets={sets} />
            <div className="as-actions">
              <Button onClick={() => setStep(0)} variant="secondary">
                Back
              </Button>
              <Button
                disabled={!online}
                loading={save.showPending}
                onClick={() => next(1)}
                variant="primary"
              >
                Next: who played
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section
            aria-labelledby="as-players"
            className="as-panel td-rise"
            key="players"
          >
            <h2
              className="as-panel__title"
              id="as-players"
              ref={headingRef}
              tabIndex={-1}
            >
              Who played?
            </h2>
            <p className="as-hint">
              First names or initials are enough. Nobody else sees them: they
              set up the match when you save it to your name.
            </p>
            <fieldset className="as-side">
              <legend className="as-control__label">Your side</legend>
              <Field label="Your first name" optional>
                <Input
                  autoComplete="given-name"
                  maxLength={40}
                  onValueChange={(value) => setYourName(String(value ?? ""))}
                  value={yourName}
                />
              </Field>
              {teammates.map((row, index) => (
                <NameFields
                  error={errors[`teammates.${index}.firstName`]}
                  key={`t${index}`}
                  label={
                    format === 2 ? "Your partner" : `Teammate ${index + 1}`
                  }
                  onChange={(row) =>
                    setTeammates((rows) =>
                      rows.map((item, at) => (at === index ? row : item)),
                    )
                  }
                  row={row}
                />
              ))}
            </fieldset>
            <fieldset className="as-side">
              <legend className="as-control__label">The other side</legend>
              {opponents.map((row, index) => (
                <NameFields
                  error={errors[`opponents.${index}.firstName`]}
                  key={`o${index}`}
                  label={`Player ${index + 1}`}
                  onChange={(row) => {
                    clearError(`opponents.${index}.firstName`);
                    setOpponents((rows) =>
                      rows.map((item, at) => (at === index ? row : item)),
                    );
                  }}
                  optional={index > 0}
                  row={row}
                />
              ))}
            </fieldset>
            <Checkbox
              checked={agreed}
              label="Everyone on court agreed to record this match."
              onCheckedChange={(checked) => {
                clearError("agreed");
                setAgreed(checked === true);
              }}
            />
            {errors.agreed ? (
              <p className="as-error" role="alert">
                {errors.agreed}
              </p>
            ) : null}
            <div className="as-actions">
              <Button onClick={() => setStep(1)} variant="secondary">
                Back
              </Button>
              <Button
                disabled={!online}
                loading={save.showPending}
                onClick={() => next(2)}
                variant="primary"
              >
                See what it would do
              </Button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section
            aria-busy={loadPreview.pending || undefined}
            aria-labelledby="as-result"
            className="as-panel td-rise"
            key="result"
          >
            <p className="site-label">Saved for this browser for 7 days</p>
            <h2
              className="as-panel__title"
              id="as-result"
              ref={headingRef}
              tabIndex={-1}
            >
              Here’s what this result would do.
            </h2>
            {preview ? (
              <ResultView
                draft={draft}
                preview={preview}
                sets={sets}
                signedIn={signedIn}
                teams={teams}
              />
            ) : (
              <p className="as-hint" role="status">
                {loadPreview.showPending ? "Working it out…" : " "}
              </p>
            )}
            <div className="as-actions">
              <Button onClick={() => setStep(2)} variant="secondary">
                Edit the score
              </Button>
              <Button
                onClick={() => setConfirmingStartOver(true)}
                variant="ghost"
              >
                Start over
              </Button>
            </div>
          </section>
        ) : null}

        {confirmingStartOver ? (
          <div
            className="as-confirm"
            role="alertdialog"
            aria-labelledby="as-confirm-title"
          >
            <p id="as-confirm-title">
              <strong>Delete this score?</strong> It’s removed from Duna now and
              can’t be brought back.
            </p>
            <div className="as-actions">
              <Button
                onClick={() => setConfirmingStartOver(false)}
                variant="secondary"
              >
                Keep it
              </Button>
              <Button {...startOver.buttonProps} variant="danger">
                Delete and start over
              </Button>
            </div>
          </div>
        ) : null}
        {busy ? (
          <span className="td-sr" role="status">
            Saving…
          </span>
        ) : null}
      </div>

      <aside aria-label="About adding a score" className="as-aside">
        <div className="as-note">
          <p className="site-label">What we keep</p>
          <p>
            Where you played, the score, the day and the first names you type.
            No email or phone: you add those only if you save it to your name.
            Kept for 7 days, then deleted.
          </p>
        </div>
        <div className="as-note">
          <p className="site-label">Who sees it</p>
          <p>
            Nobody else, until you save it to your name. Then the other side
            gets one link to confirm it. New courts are checked by Duna before
            they’re listed for everyone.
          </p>
        </div>
        <div className="as-note">
          <p className="site-label">Why we ask</p>
          <p>
            Scores from real courts make the Sand Rating fair for everyone. A
            score counts only when both sides agree on it. Adding a score
            without an account is for players 13 and over.
          </p>
        </div>
      </aside>
    </div>
  );
}

function FlowNotice({
  notice,
  onDismiss,
  onStartOver,
}: {
  readonly notice?: FlowNoticeState;
  readonly onDismiss: () => void;
  readonly onStartOver: () => void;
}) {
  if (!notice) return null;
  if (notice.kind === "resumed") {
    return (
      <Notice
        action={
          <Button onClick={onStartOver} size="sm" variant="ghost">
            Start over
          </Button>
        }
        role="status"
        title="Welcome back"
        tone="info"
      >
        We kept the score you started on {formatDay(notice.startedAt)}. It’s
        deleted on {formatDay(notice.expiresAt)} unless you save it.
      </Notice>
    );
  }
  if (notice.kind === "expired") {
    return (
      <Notice role="status" title="That score is gone" tone="info">
        It was more than 7 days old, so we deleted it. Start again: it takes a
        minute.
      </Notice>
    );
  }
  if (notice.kind === "discarded") {
    return (
      <Notice role="status" tone="info">
        Deleted. Start a new score whenever you like.
      </Notice>
    );
  }
  const { failure } = notice;
  return (
    <Notice
      action={
        <Button onClick={onDismiss} size="sm" variant="ghost">
          OK
        </Button>
      }
      role={failure.kind === "error" ? "alert" : "status"}
      tone={
        failure.kind === "error"
          ? "danger"
          : failure.kind === "rate-limited"
            ? "warning"
            : "info"
      }
    >
      {failure.message}
      {failure.reference ? (
        <ReferenceLine reference={failure.reference} />
      ) : null}
    </Notice>
  );
}

function NameFields({
  row,
  label,
  error,
  optional,
  onChange,
}: {
  readonly row: NameRow;
  readonly label: string;
  readonly error?: string;
  readonly optional?: boolean;
  readonly onChange: (row: NameRow) => void;
}) {
  return (
    <div className="as-name">
      <Field error={error} label={label} optional={optional}>
        <Input
          autoComplete="off"
          maxLength={40}
          onValueChange={(value) =>
            onChange({ ...row, firstName: String(value ?? "") })
          }
          placeholder="First name"
          value={row.firstName}
        />
      </Field>
      <Field
        label={
          <>
            Initial<span className="td-sr"> of {label}’s last name</span>
          </>
        }
        optional
      >
        <Input
          autoComplete="off"
          className="as-name__initial"
          maxLength={2}
          onValueChange={(value) =>
            onChange({ ...row, lastInitial: String(value ?? "") })
          }
          value={row.lastInitial}
        />
      </Field>
    </div>
  );
}

/**
 * The soft check, live as you type (never blocks): sets go to 21, a deciding
 * set to 15 (the server says the same in `draft.warnings`).
 */
function SoftCheck({ sets }: { readonly sets: readonly AddScoreSet[] }) {
  const won = sets.filter((set) => set.you > set.them).length;
  const most = Math.max(won, sets.length - won);
  // The deciding set is the last one a best-of match can need.
  const deciderAt = most > 1 ? most * 2 - 2 : -1;
  const unfinished = sets.some(
    (set, index) =>
      Math.max(set.you, set.them) < (index === deciderAt ? 15 : 21),
  );
  if (!unfinished) return null;
  return (
    <Notice role="status" tone="warning">
      One set doesn’t look finished (sets go to 21, or 15 in a third set, won by
      2). You can still save it if that’s how you played.
    </Notice>
  );
}

function ResultView({
  preview,
  draft,
  sets,
  teams,
  signedIn,
}: {
  readonly preview: AddScorePreview;
  readonly draft?: AddScoreDraftView;
  readonly sets: readonly AddScoreSet[];
  readonly teams: readonly [string, string];
  readonly signedIn: boolean;
}) {
  const what = preview.whatItWouldDo;
  return (
    <div className="as-result">
      <div className="as-result__cards">
        <NetScore
          announce={false}
          layout="net"
          sets={(draft?.data.sets ?? sets).map(
            (set) => [set.you, set.them] as const,
          )}
          status="pending-verification"
          teams={teams}
        />
        <div className="as-would">
          <RatingRing
            label="Sand Rating"
            matchesLeft={what?.matchesUntilShown ?? 5}
            reliability={1}
            size="card"
            value={null}
          />
          <div className="as-would__text">
            <p className="site-label">What this result would do</p>
            <p>{resultSentence(preview)}</p>
            {what ? (
              <p className="as-hint">
                One match is a small sample, so your Sand Rating shows as a dash
                until {what.matchesUntilShown} confirmed matches. It moves only
                when someone on the other side confirms, and everyone in the
                match has a Duna profile.
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <dl className="as-summary">
        <div>
          <dt>Where</dt>
          <dd>
            {draft?.place?.label ?? "—"}
            {draft?.place?.isNew ? (
              <span className="as-chip">New court</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd className="as-num">
            {preview.result === "won" ? "Won " : "Lost "}
            {(draft?.data.sets ?? sets)
              .map((set) => `${set.you}–${set.them}`)
              .join(", ")}
          </dd>
        </div>
        <div>
          <dt>Played</dt>
          <dd>{draft?.data.playedOn ? formatDay(draft.data.playedOn) : "—"}</dd>
        </div>
        <div>
          <dt>Counts toward a Sand Rating</dt>
          <dd>
            {preview.counts
              ? "After the other side confirms"
              : preview.reason === "friendly"
                ? "No, it’s friendly"
                : "No, two-on-two only for now"}
          </dd>
        </div>
      </dl>
      <div className="as-claim">
        <h3 className="as-claim__title">Save it to your name</h3>
        <ol className="as-claim__steps">
          <li>
            {signedIn
              ? "Save it to your account."
              : "Make a free account, or sign in."}
          </li>
          <li>
            Add a phone or email for the other side if you have one: we send
            them one link to confirm the score. Nothing else.
          </li>
          <li>When someone on the other side confirms, your rating moves.</li>
        </ol>
        <div className="as-actions as-actions--start">
          {signedIn ? (
            <Button href={claimHref.claim} variant="primary">
              Save to my account
            </Button>
          ) : (
            <>
              <Button href={claimHref.signUp} variant="primary">
                Create my account
              </Button>
              <Button href={claimHref.signIn} variant="secondary">
                I have an account
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
