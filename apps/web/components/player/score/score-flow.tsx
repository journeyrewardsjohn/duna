"use client";

/**
 * Add a result, signed in (`/app/score`): the parts of `/add-score` (the
 * Where picker, the format and day, the set steppers with the live NetScore,
 * the "doesn't look finished" check, the agreement box and what this result
 * would do) with the players chosen from Duna (recent partners first, then a
 * search) or added by name. It saves one unverified result and opens it.
 */
import { report } from "@duna/observability";
import { Icon } from "@duna/ui/icons";
import {
  AddPlayers,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  NetScore,
  Notice,
  NumberInput,
  Segmented,
  useConfirm,
  useOnline,
  type PlayerSummary,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  FORMAT_OPTIONS,
  todayIso,
} from "@/app/(next)/(site)/add-score/flow-model";
import type { WhereChoice } from "@/components/site/search/search-query";
import { WherePicker } from "@/components/site/search/where-picker";
import { unwrap } from "../action-result";
import {
  AGREEMENT_LABEL,
  AGREEMENT_REQUIRED,
  looksUnfinished,
  scoreShape,
  SOFT_UNFINISHED_WARNING,
  whatThisResultWouldDo,
  type EnteredSet,
} from "../result-copy";
import { OfflineNotice } from "../states";
import {
  saveResultAction,
  searchResultPlayersAction,
  type ResultPlayer,
} from "./actions";

type Format = 2 | 3 | 4 | 6;

interface Added extends PlayerSummary {
  readonly givenName?: string;
  readonly familyName?: string;
  readonly contact?: string;
}

const NEW_PREFIX = "new:";

function deviceId(): string {
  try {
    const known = window.localStorage.getItem("duna-score-device");
    if (known) return known;
    const fresh = `web-${crypto.randomUUID()}`;
    window.localStorage.setItem("duna-score-device", fresh);
    return fresh;
  } catch {
    return `web-${crypto.randomUUID()}`;
  }
}

function contactOf(value: string | undefined): {
  email?: string;
  phoneE164?: string;
} {
  const text = value?.trim();
  if (!text) return {};
  if (text.includes("@")) return { email: text };
  return { phoneE164: text.replace(/[\s()-]/g, "") };
}

function omit(
  record: Readonly<Record<string, string>>,
  key: string,
): Record<string, string> {
  const next = { ...record };
  delete next[key];
  return next;
}

export interface ScoreFlowProps {
  readonly me: PlayerSummary;
  /** People played with most, most first. */
  readonly partners: readonly PlayerSummary[];
  /** People played against most, most first. */
  readonly opponents: readonly PlayerSummary[];
  readonly initialSets?: readonly EnteredSet[];
  readonly initialType?: "competitive" | "friendly";
}

export function ScoreFlow({
  me,
  partners,
  opponents,
  initialSets,
  initialType,
}: ScoreFlowProps) {
  const router = useRouter();
  const online = useOnline();
  const confirm = useConfirm();
  const [where, setWhere] = useState<Extract<WhereChoice, { kind: "place" }>>();
  const [typedPlace, setTypedPlace] = useState<string>();
  const [format, setFormat] = useState<Format>(2);
  const [matchType, setMatchType] = useState<"competitive" | "friendly">(
    initialType ?? "competitive",
  );
  const [playedOn, setPlayedOn] = useState("");
  const [maxDay, setMaxDay] = useState<string>();
  const [sets, setSets] = useState<EnteredSet[]>(
    initialSets && initialSets.length > 0
      ? [...initialSets]
      : [
          { you: 21, them: 18 },
          { you: 19, them: 21 },
          { you: 15, them: 12 },
        ],
  );
  const [mine, setMine] = useState<Added[]>([me]);
  const [theirs, setTheirs] = useState<Added[]>([]);
  const [adding, setAdding] = useState<"A" | "B" | null>(null);
  const [newPerson, setNewPerson] = useState({
    first: "",
    last: "",
    contact: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    const today = todayIso(new Date());
    setMaxDay(today);
    setPlayedOn((current) => current || today);
  }, []);

  useEffect(() => {
    setMine((rows) => rows.slice(0, format));
    setTheirs((rows) => rows.slice(0, format));
  }, [format]);

  const shape = scoreShape(sets);
  const unfinished = shape.ok && looksUnfinished(sets);
  const teams = useMemo(
    () =>
      [
        { players: mine.map((person) => person.name) },
        {
          players:
            theirs.length > 0
              ? theirs.map((person) => person.name)
              : ["Their side"],
        },
      ] as const,
    [mine, theirs],
  );

  const search = async (query: string) =>
    (await searchResultPlayersAction(query)).map((person) => ({ ...person }));

  const addByName = () => {
    const first = newPerson.first.trim();
    const last = newPerson.last.trim();
    if (!first || !last) {
      setErrors({
        newPerson: "Add a first name and a last name or an initial.",
      });
      return;
    }
    const contact = newPerson.contact.trim();
    if (
      contact &&
      !contact.includes("@") &&
      !/^\+[1-9][\d\s()-]{7,18}$/.test(contact)
    ) {
      setErrors({
        newPerson: "Use the full number with its country code, or an email.",
      });
      return;
    }
    const person: Added = {
      id: `${NEW_PREFIX}${crypto.randomUUID()}`,
      name: `${first} ${last}`,
      detail: contact
        ? "Not on Duna yet · gets a link to confirm"
        : "Not on Duna yet",
      givenName: first,
      familyName: last,
      ...(contact ? { contact } : {}),
    };
    if (adding === "A") setMine((rows) => [...rows, person].slice(0, format));
    else setTheirs((rows) => [...rows, person].slice(0, format));
    setNewPerson({ first: "", last: "", contact: "" });
    setAdding(null);
    setErrors({});
  };

  const validate = (): Record<string, string> => {
    const problems: Record<string, string> = {};
    if (!where && !typedPlace) problems.place = "Choose where you played.";
    if (!playedOn) problems.playedOn = "Choose the day you played.";
    if (!shape.ok) problems.sets = shape.problem;
    if (mine.length !== format)
      problems.mine = `Add ${format - mine.length} more on your side.`;
    if (theirs.length !== format)
      problems.theirs = `Add ${format - theirs.length} more on the other side.`;
    if (!agreed) problems.agreed = AGREEMENT_REQUIRED;
    return problems;
  };

  const toPlayer = (person: Added): ResultPlayer =>
    person.id.startsWith(NEW_PREFIX)
      ? {
          name: person.name,
          givenName: person.givenName ?? person.name,
          familyName: person.familyName ?? "",
          ...contactOf(person.contact),
        }
      : { personId: person.id, name: person.name };

  const save = () => {
    const problems = validate();
    setErrors(problems);
    if (Object.keys(problems).length > 0 || !shape.ok) {
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(".pp-form [role='alert']")
          ?.scrollIntoView({ block: "center" }),
      );
      return;
    }
    const linked = [...mine, ...theirs].filter((person) => person.contact);
    void confirm
      .run({
        tier: "confirm",
        title: "Save this result?",
        description: `${mine.map((person) => person.name.split(" ")[0]).join(" / ")} v ${theirs.map((person) => person.name.split(" ")[0]).join(" / ")}, ${sets.map((set) => `${set.you}–${set.them}`).join(", ")}. Your side is confirmed by saving it; someone on the other side confirms it next.`,
        ...(linked.length > 0
          ? {
              affected: `${linked.map((person) => person.name).join(" and ")} ${linked.length === 1 ? "gets" : "get"} a link to confirm it.`,
            }
          : {}),
        verb: "Save result",
        cancelLabel: "Keep editing",
        agentConfirm: "Saves this match result for the other side to confirm",
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await saveResultAction({
              teamA: mine.map(toPlayer),
              teamB: theirs.map(toPlayer),
              ...(where?.source === "duna" && where.venueId
                ? { venueId: where.venueId }
                : {}),
              location: where
                ? {
                    label: where.label,
                    ...(where.placeId ? { googlePlaceId: where.placeId } : {}),
                    name: where.label,
                    ...(where.address ? { address: where.address } : {}),
                    latitude: where.latitude,
                    longitude: where.longitude,
                  }
                : { label: typedPlace!, name: typedPlace! },
              playedOn,
              setsToWin: shape.shape.setsToWin,
              sets: sets.map((set) => ({ a: set.you, b: set.them })),
              matchType,
              agreed: true,
              deviceId: deviceId(),
              idempotencyKey,
            }),
          ),
        success: "Saved. Waiting on the other side.",
        report: (error) => report(error, { event: "web.score.save_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          router.push(`/app/matches/${outcome.result.matchId}`);
        }
      });
  };

  const sideLabel = (side: "A" | "B") =>
    side === "A" ? "your side" : "the other side";

  return (
    <div className="pp-form">
      <OfflineNotice />
      <section aria-labelledby="pp-where" className="pp-step">
        <h2 className="pp-h2" id="pp-where">
          Where did you play?
        </h2>
        <WherePicker
          label="Where did you play"
          mode="flow"
          onAddPlace={(text) => {
            setTypedPlace(text.slice(0, 80));
            setWhere(undefined);
          }}
          onChoose={(choice) => {
            if (choice.kind !== "place") return;
            setWhere(choice);
            setTypedPlace(undefined);
            setErrors((current) => omit(current, "place"));
          }}
          placeholder="A beach, park, gym or city"
        />
        {where || typedPlace ? (
          <p className="td-meta">
            {where
              ? where.label
              : `${typedPlace} (a place Duna doesn’t list yet)`}
          </p>
        ) : null}
        {errors.place ? (
          <p className="pp-error" role="alert">
            {errors.place}
          </p>
        ) : null}
      </section>

      <section aria-labelledby="pp-score" className="pp-step">
        <h2 className="pp-h2" id="pp-score">
          What was the score?
        </h2>
        <div className="pp-control">
          <span className="pp-label" id="pp-format">
            Format
          </span>
          <Segmented
            aria-labelledby="pp-format"
            block
            onValueChange={(value) =>
              value && setFormat(Number(value) as Format)
            }
            options={FORMAT_OPTIONS}
            value={String(format)}
          />
        </div>
        <div className="pp-fieldrow">
          <Field error={errors.playedOn} label="Day played">
            <Input
              max={maxDay}
              onValueChange={(value) => setPlayedOn(String(value ?? ""))}
              type="date"
              value={playedOn}
            />
          </Field>
          <div className="pp-control">
            <span className="pp-label" id="pp-type">
              Match
            </span>
            <Segmented
              aria-labelledby="pp-type"
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
        <p className="td-meta">
          {matchType === "competitive" && format === 2
            ? "Competitive doubles matches count toward a Sand Rating."
            : matchType === "friendly"
              ? "Friendly matches are saved to your history but don’t move a Sand Rating."
              : "Only two-on-two matches move a Sand Rating for now. This one is saved to your history."}
        </p>
        <fieldset className="pp-sets">
          <legend className="pp-label">Sets</legend>
          <div aria-hidden="true" className="pp-sets__head">
            <span />
            <span>Your side</span>
            <span>Their side</span>
            <span />
          </div>
          {sets.map((set, index) => (
            <div className="pp-sets__row" key={index}>
              <span className="pp-sets__label">Set {index + 1}</span>
              <NumberInput
                aria-label={`Set ${index + 1}, your side`}
                decrementLabel={`One less for your side, set ${index + 1}`}
                incrementLabel={`One more for your side, set ${index + 1}`}
                max={99}
                min={0}
                onValueChange={(value) =>
                  setSets((rows) =>
                    rows.map((row, at) =>
                      at === index ? { ...row, you: Number(value ?? 0) } : row,
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
                      at === index ? { ...row, them: Number(value ?? 0) } : row,
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
            <p className="pp-error" role="alert">
              {errors.sets}
            </p>
          ) : null}
        </fieldset>
        <div className="pp-live">
          <span className="pp-label">As you enter it</span>
          <NetScore
            announce={false}
            layout="auto"
            sets={sets.map((set) => [set.you, set.them] as const)}
            size="sm"
            status="pending-verification"
            teams={teams}
          />
        </div>
        {unfinished ? (
          <Notice role="status" tone="warning">
            {SOFT_UNFINISHED_WARNING}
          </Notice>
        ) : null}
      </section>

      <section aria-labelledby="pp-who" className="pp-step">
        <h2 className="pp-h2" id="pp-who">
          Who played?
        </h2>
        {(["A", "B"] as const).map((side) => (
          <div className="pp-side" key={side}>
            <AddPlayers
              capacity={format}
              contacts={(side === "A"
                ? [...partners, ...opponents]
                : [...opponents, ...partners]
              ).filter(
                (person, index, all) =>
                  all.findIndex((other) => other.id === person.id) === index &&
                  !(side === "A" ? theirs : mine).some(
                    (taken) => taken.id === person.id,
                  ),
              )}
              labels={{
                slots: side === "A" ? "Your side" : "The other side",
                contacts: "People you’ve played with",
                noContacts: "People you play with show here.",
                search: `Search Duna players for ${sideLabel(side)}`,
                searchPlaceholder: "Search by name",
              }}
              lockedIds={side === "A" ? [me.id] : []}
              onSelectedChange={(next) => {
                const other = side === "A" ? theirs : mine;
                const clean = next.filter(
                  (person) => !other.some((taken) => taken.id === person.id),
                );
                if (side === "A") setMine(clean as Added[]);
                else setTheirs(clean as Added[]);
                setErrors((current) => omit(omit(current, "mine"), "theirs"));
              }}
              searchPlayers={(query) => search(query)}
              selected={side === "A" ? mine : theirs}
            />
            {(side === "A" ? mine : theirs).length < format ? (
              adding === side ? (
                <Card className="pp-newperson" variant="flat">
                  <p className="pp-label">Someone not on Duna</p>
                  <div className="pp-fieldrow">
                    <Field label="First name">
                      <Input
                        autoComplete="off"
                        maxLength={40}
                        onValueChange={(value) =>
                          setNewPerson((person) => ({
                            ...person,
                            first: String(value ?? ""),
                          }))
                        }
                        value={newPerson.first}
                      />
                    </Field>
                    <Field label="Last name or initial">
                      <Input
                        autoComplete="off"
                        maxLength={40}
                        onValueChange={(value) =>
                          setNewPerson((person) => ({
                            ...person,
                            last: String(value ?? ""),
                          }))
                        }
                        value={newPerson.last}
                      />
                    </Field>
                  </div>
                  <Field
                    hint="Only to send them the link to confirm. Leave it empty to share the link yourself."
                    label="Phone or email"
                    optional
                  >
                    <Input
                      autoComplete="off"
                      onValueChange={(value) =>
                        setNewPerson((person) => ({
                          ...person,
                          contact: String(value ?? ""),
                        }))
                      }
                      value={newPerson.contact}
                    />
                  </Field>
                  {errors.newPerson ? (
                    <p className="pp-error" role="alert">
                      {errors.newPerson}
                    </p>
                  ) : null}
                  <div className="pp-row-actions">
                    <Button onClick={addByName} size="sm" variant="primary">
                      Add {newPerson.first.trim() || "them"}
                    </Button>
                    <Button
                      onClick={() => setAdding(null)}
                      size="sm"
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                  </div>
                </Card>
              ) : (
                <Button
                  icon={<Icon name="user-plus" size="inline" />}
                  onClick={() => {
                    setAdding(side);
                    setErrors({});
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Add someone not on Duna
                </Button>
              )
            ) : null}
            {errors[side === "A" ? "mine" : "theirs"] ? (
              <p className="pp-error" role="alert">
                {errors[side === "A" ? "mine" : "theirs"]}
              </p>
            ) : null}
          </div>
        ))}
        <Checkbox
          checked={agreed}
          label={AGREEMENT_LABEL}
          onCheckedChange={(checked) => {
            setAgreed(checked === true);
            setErrors((current) => omit(current, "agreed"));
          }}
        />
        {errors.agreed ? (
          <p className="pp-error" role="alert">
            {errors.agreed}
          </p>
        ) : null}
      </section>

      <Card className="pp-would">
        <p className="pp-eyebrow">What this result would do</p>
        <p>{whatThisResultWouldDo({ teamSize: format, matchType })}</p>
      </Card>

      <div className="pp-submit">
        <Button disabled={!online} onClick={save} size="lg" variant="primary">
          Save result
        </Button>
      </div>
      {confirm.dialog}
    </div>
  );
}
