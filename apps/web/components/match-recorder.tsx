"use client";

import type { PersonSummary, VenueSummary } from "@duna/core";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Clock3,
  History,
  Plus,
  Radio,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import {
  recordCompletedMatchAction,
  startMatchAction,
} from "@/app/app/score/actions";

type TeamSide = "A" | "B";
type RecordingMode = "completed" | "live";
type MatchType = "competitive" | "friendly";
type TeamSize = 1 | 2 | 3 | 4 | 5 | 6;
type PlayerTarget =
  | {
      readonly kind: "team";
      readonly side: TeamSide;
      readonly index: number;
    }
  | {
      readonly kind: "serve";
      readonly side: TeamSide;
      readonly index: number;
    };

const teamSizes: readonly TeamSize[] = [1, 2, 3, 4, 6];

function scoringDeviceId(): string {
  const key = "duna-scoring-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = `duna-web-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, created);
  return created;
}

function localDateTime(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function personLabel(person: PersonSummary | undefined): string {
  return person?.displayName ?? "Add player";
}

function PlayerAvatar({
  person,
  size = "regular",
}: {
  readonly person?: PersonSummary;
  readonly size?: "regular" | "small";
}) {
  return (
    <span
      className={`match-recorder__avatar match-recorder__avatar--${size}`}
      style={
        person?.avatarUrl
          ? { backgroundImage: `url("${person.avatarUrl}")` }
          : undefined
      }
    >
      {!person?.avatarUrl &&
        (person?.initials ?? <Plus aria-hidden size={17} />)}
    </span>
  );
}

export function MatchRecorder({
  currentPlayer,
  initialWatchScores = [],
  players,
  venues,
}: {
  readonly currentPlayer: PersonSummary;
  readonly initialWatchScores?: readonly {
    readonly a: number;
    readonly b: number;
  }[];
  readonly players: readonly PersonSummary[];
  readonly venues: readonly VenueSummary[];
}) {
  const [mode, setMode] = useState<RecordingMode>("completed");
  const [matchType, setMatchType] = useState<MatchType>("competitive");
  const [teamSize, setTeamSizeValue] = useState<TeamSize>(2);
  const [teamAIds, setTeamAIds] = useState<string[]>([currentPlayer.id, ""]);
  const [teamBIds, setTeamBIds] = useState<string[]>(["", ""]);
  const [venueId, setVenueId] = useState("");
  const [playedAt, setPlayedAt] = useState(localDateTime);
  const [matchLength, setMatchLength] = useState<"single" | "best-of-3">(
    initialWatchScores.length === 1 ? "single" : "best-of-3",
  );
  const [thirdSet, setThirdSet] = useState(initialWatchScores.length >= 3);
  const [setScores, setSetScores] = useState(() =>
    Array.from({ length: 3 }, (_, index) => ({
      a:
        initialWatchScores[index] === undefined
          ? ""
          : String(initialWatchScores[index]!.a),
      b:
        initialWatchScores[index] === undefined
          ? ""
          : String(initialWatchScores[index]!.b),
    })),
  );
  const [scoringSystem, setScoringSystem] = useState<"rally" | "sideout">(
    "rally",
  );
  const [serviceOrderA, setServiceOrderA] = useState<string[]>(teamAIds);
  const [serviceOrderB, setServiceOrderB] = useState<string[]>(teamBIds);
  const [initialServerPersonId, setInitialServerPersonId] = useState(
    currentPlayer.id,
  );
  const [agreed, setAgreed] = useState(false);
  const [target, setTarget] = useState<PlayerTarget>();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string>();
  const [isPending, startTransition] = useTransition();

  const playerById = useMemo(
    () => new Map(players.map((player) => [player.id, player] as const)),
    [players],
  );
  const teamAKey = teamAIds.join("|");
  const teamBKey = teamBIds.join("|");

  useEffect(() => {
    setServiceOrderA(teamAIds.filter(Boolean));
    setServiceOrderB(teamBIds.filter(Boolean));
  }, [teamAKey, teamBKey]);

  useEffect(() => {
    const choices = [serviceOrderA[0], serviceOrderB[0]].filter(
      (personId): personId is string => Boolean(personId),
    );
    if (!choices.includes(initialServerPersonId)) {
      setInitialServerPersonId(choices[0] ?? "");
    }
  }, [initialServerPersonId, serviceOrderA, serviceOrderB]);

  const setTeamSize = (next: TeamSize) => {
    setTeamSizeValue(next);
    setTeamAIds((current) => [
      currentPlayer.id,
      ...current.slice(1, next),
      ...Array(Math.max(0, next - current.length)).fill(""),
    ]);
    setTeamBIds((current) => [
      ...current.slice(0, next),
      ...Array(Math.max(0, next - current.length)).fill(""),
    ]);
  };

  const teamIds = (side: TeamSide) => (side === "A" ? teamAIds : teamBIds);
  const setTeamIds = (side: TeamSide, next: string[]) => {
    if (side === "A") setTeamAIds(next);
    else setTeamBIds(next);
  };
  const serviceOrder = (side: TeamSide) =>
    side === "A" ? serviceOrderA : serviceOrderB;
  const setServiceOrder = (side: TeamSide, next: string[]) => {
    if (side === "A") setServiceOrderA(next);
    else setServiceOrderB(next);
  };

  const openPicker = (nextTarget: PlayerTarget) => {
    setSearch("");
    setTarget(nextTarget);
  };

  const choosePlayer = (personId: string) => {
    if (!target) return;
    if (target.kind === "serve") {
      const current = [...serviceOrder(target.side)];
      const existingIndex = current.indexOf(personId);
      if (existingIndex >= 0) {
        [current[target.index], current[existingIndex]] = [
          current[existingIndex]!,
          current[target.index]!,
        ];
      }
      setServiceOrder(target.side, current);
    } else {
      const current = [...teamIds(target.side)];
      current[target.index] = personId;
      setTeamIds(target.side, current);
    }
    setTarget(undefined);
  };

  const pickerPlayers = useMemo(() => {
    if (!target) return [];
    const normalizedSearch = search.trim().toLowerCase();
    const pool =
      target.kind === "serve"
        ? serviceOrder(target.side)
            .map((personId) => playerById.get(personId))
            .filter((person): person is PersonSummary => Boolean(person))
        : players.filter((person) => {
            const occupied = [...teamAIds, ...teamBIds].filter(Boolean);
            const currentId = teamIds(target.side)[target.index];
            return person.id === currentId || !occupied.includes(person.id);
          });
    return pool.filter((person) =>
      [person.displayName, person.handle, person.homeMarket]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedSearch)),
    );
  }, [
    playerById,
    players,
    search,
    serviceOrderA,
    serviceOrderB,
    target,
    teamAIds,
    teamBIds,
  ]);

  const visibleScoreCount = matchLength === "single" ? 1 : thirdSet ? 3 : 2;
  const teamsComplete =
    teamAIds.length === teamSize &&
    teamBIds.length === teamSize &&
    [...teamAIds, ...teamBIds].every(Boolean) &&
    new Set([...teamAIds, ...teamBIds]).size === teamSize * 2;
  const ratingImpact =
    matchType === "competitive" && teamSize === 2
      ? "This result can move Sand Rating after one player from the other side confirms it."
      : matchType === "friendly"
        ? "This stays in everyone’s match history and does not move Sand Rating."
        : "This competitive result stays in match history. Sand Rating support for this team size is coming.";

  const scoreInput = (setIndex: number, side: "a" | "b", label: string) => (
    <label>
      <span className="sr-only">{label}</span>
      <input
        aria-label={label}
        inputMode="numeric"
        max={99}
        min={0}
        onChange={(event) => {
          const next = [...setScores];
          next[setIndex] = {
            ...next[setIndex]!,
            [side]: event.target.value.replace(/\D/g, "").slice(0, 2),
          };
          setSetScores(next);
        }}
        placeholder="—"
        value={setScores[setIndex]?.[side] ?? ""}
      />
    </label>
  );

  const submit = () => {
    setError(undefined);
    if (!teamsComplete) {
      setError(`Add ${teamSize * 2} different players before continuing.`);
      return;
    }
    if (!agreed) {
      setError("Confirm that every player agreed to have this match recorded.");
      return;
    }
    if (mode === "completed") {
      const scores = setScores.slice(0, visibleScoreCount).map((set) => ({
        a: Number(set.a),
        b: Number(set.b),
      }));
      if (
        setScores
          .slice(0, visibleScoreCount)
          .some((set) => set.a === "" || set.b === "")
      ) {
        setError("Enter the score for every set played.");
        return;
      }
      startTransition(async () => {
        const response = await recordCompletedMatchAction({
          teamAIds,
          teamBIds,
          venueId: venueId || undefined,
          playedAt: new Date(playedAt).toISOString(),
          setScores: scores,
          matchType,
          allPlayersAgreedToRecord: true,
          deviceId: scoringDeviceId(),
        });
        if (!response.ok) {
          setError(response.error);
          return;
        }
        window.location.assign(`/app/matches/${response.scoring.matchId}`);
      });
      return;
    }
    if (
      serviceOrderA.length !== teamSize ||
      serviceOrderB.length !== teamSize ||
      !initialServerPersonId
    ) {
      setError("Finish the serving order before opening live scoring.");
      return;
    }
    startTransition(async () => {
      const response = await startMatchAction({
        teamAIds,
        teamBIds,
        venueId: venueId || undefined,
        scoringSystem,
        matchType,
        allPlayersAgreedToRecord: true,
        serviceOrder: { A: serviceOrderA, B: serviceOrderB },
        initialServerPersonId,
        deviceId: scoringDeviceId(),
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      window.location.assign(`/app/score?match=${response.scoring.matchId}`);
    });
  };

  const renderTeam = (side: TeamSide) => {
    const ids = teamIds(side);
    return (
      <article className="match-recorder__team">
        <header>
          <span>Team {side}</span>
          <small>
            {side === "A" ? "Your side" : "Other side"} · {teamSize}{" "}
            {teamSize === 1 ? "player" : "players"}
          </small>
        </header>
        <div>
          {ids.map((personId, index) => {
            const person = playerById.get(personId);
            const locked = side === "A" && index === 0;
            return (
              <button
                className={person ? "is-filled" : undefined}
                disabled={locked}
                key={`${side}-${index}`}
                onClick={() => openPicker({ kind: "team", side, index })}
                type="button"
              >
                <PlayerAvatar person={person} />
                <span>
                  <strong>{personLabel(person)}</strong>
                  <small>
                    {locked
                      ? "You"
                      : person
                        ? `${person.rating.display.toFixed(2)} · ${person.homeMarket ?? "Duna player"}`
                        : "Search Duna players"}
                  </small>
                </span>
                {!locked && <ChevronRight aria-hidden size={18} />}
              </button>
            );
          })}
        </div>
      </article>
    );
  };

  const renderServiceOrder = (side: TeamSide) => {
    const order = serviceOrder(side);
    if (order.length !== teamSize) return null;
    return (
      <article className="match-recorder__serve-team">
        <header>
          <span>Team {side}</span>
          <small>Rotation</small>
        </header>
        <div>
          {order.slice(0, Math.max(1, teamSize - 1)).map((personId, index) => {
            if (teamSize === 1 && index > 0) return null;
            const person = playerById.get(personId);
            return (
              <button
                key={`${side}-serve-${index}`}
                onClick={() =>
                  teamSize > 1 && openPicker({ kind: "serve", side, index })
                }
                type="button"
              >
                <span>{index + 1}</span>
                <PlayerAvatar person={person} size="small" />
                <strong>{person?.displayName.split(" ")[0]}</strong>
                {teamSize > 1 && <ChevronRight aria-hidden size={15} />}
              </button>
            );
          })}
          {teamSize > 1 && (
            <div>
              <span>{teamSize}</span>
              <PlayerAvatar
                person={playerById.get(order[teamSize - 1]!)}
                size="small"
              />
              <strong>
                {
                  playerById
                    .get(order[teamSize - 1]!)
                    ?.displayName.split(" ")[0]
                }
              </strong>
              <small>inferred</small>
            </div>
          )}
        </div>
      </article>
    );
  };

  return (
    <main className="match-recorder">
      <header className="match-recorder__top">
        <Link href="/app/matches">
          <ArrowLeft aria-hidden size={19} /> Matches
        </Link>
        <span>Record a match</span>
        <span aria-hidden />
      </header>

      <section className="match-recorder__intro">
        <span className="page-eyebrow">Your match history</span>
        <h1>How did you play?</h1>
        <p>
          Add a finished score in a minute. Live scoring is here when you want
          it, but it never gets in the way.
        </p>
      </section>

      {initialWatchScores.length > 0 && (
        <aside className="match-recorder__watch-draft">
          <span aria-hidden>⌚</span>
          <div>
            <strong>Score captured on Apple Watch</strong>
            <small>
              The sets are filled in. Add the players and confirm consent before
              this result is submitted from your signed-in account.
            </small>
          </div>
          <b>
            {initialWatchScores.map((set) => `${set.a}–${set.b}`).join("  ")}
          </b>
        </aside>
      )}

      <section className="match-recorder__mode" aria-label="Recording mode">
        <button
          className={mode === "completed" ? "is-selected" : undefined}
          onClick={() => setMode("completed")}
          type="button"
        >
          <span>
            <History aria-hidden size={22} />
          </span>
          <strong>Add a finished result</strong>
          <small>Most matches start here</small>
          {mode === "completed" && <Check aria-hidden size={19} />}
        </button>
        <button
          className={mode === "live" ? "is-selected" : undefined}
          onClick={() => setMode("live")}
          type="button"
        >
          <span>
            <Radio aria-hidden size={22} />
          </span>
          <strong>Score it live</strong>
          <small>Optional point-by-point scoring</small>
          {mode === "live" && <Check aria-hidden size={19} />}
        </button>
      </section>

      <section className="match-recorder__card">
        <header className="match-recorder__section-heading">
          <span>1</span>
          <div>
            <h2>Set the match</h2>
            <p>Choose what this game meant and how many played.</p>
          </div>
        </header>
        <div className="match-recorder__choice-grid">
          <button
            className={matchType === "competitive" ? "is-selected" : undefined}
            onClick={() => setMatchType("competitive")}
            type="button"
          >
            <ShieldCheck aria-hidden size={21} />
            <span>
              <strong>Competitive</strong>
              <small>Performance counts when the format is rated</small>
            </span>
            <i />
          </button>
          <button
            className={matchType === "friendly" ? "is-selected" : undefined}
            onClick={() => setMatchType("friendly")}
            type="button"
          >
            <Users aria-hidden size={21} />
            <span>
              <strong>Friendly</strong>
              <small>Save the memory without moving ratings</small>
            </span>
            <i />
          </button>
        </div>
        <div className="match-recorder__format">
          <span>Players per side</span>
          <div>
            {teamSizes.map((size) => (
              <button
                className={teamSize === size ? "is-selected" : undefined}
                key={size}
                onClick={() => setTeamSize(size)}
                type="button"
              >
                {size}v{size}
              </button>
            ))}
          </div>
        </div>
        <p className="match-recorder__impact">
          <ShieldCheck aria-hidden size={17} />
          {ratingImpact}
        </p>
      </section>

      <section className="match-recorder__card">
        <header className="match-recorder__section-heading">
          <span>2</span>
          <div>
            <h2>Add the players</h2>
            <p>Search profiles and place each player on the right side.</p>
          </div>
        </header>
        <div className="match-recorder__teams">
          {renderTeam("A")}
          <span>VS</span>
          {renderTeam("B")}
        </div>
      </section>

      <section className="match-recorder__card">
        <header className="match-recorder__section-heading">
          <span>3</span>
          <div>
            <h2>
              {mode === "completed" ? "Add the result" : "Set up live scoring"}
            </h2>
            <p>
              {mode === "completed"
                ? "Only the final set scores are needed."
                : "Duna will keep the score and serving rotation for you."}
            </p>
          </div>
        </header>

        <div className="match-recorder__details">
          <label>
            <span>Where</span>
            <select
              onChange={(event) => setVenueId(event.target.value)}
              value={venueId}
            >
              <option value="">Location not recorded</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{mode === "completed" ? "Played" : "Starts"}</span>
            <input
              max={mode === "completed" ? localDateTime() : undefined}
              onChange={(event) => setPlayedAt(event.target.value)}
              type="datetime-local"
              value={playedAt}
            />
          </label>
        </div>

        {mode === "completed" ? (
          <>
            <div className="match-recorder__length">
              <span>Match length</span>
              <div>
                <button
                  className={
                    matchLength === "single" ? "is-selected" : undefined
                  }
                  onClick={() => {
                    setMatchLength("single");
                    setThirdSet(false);
                  }}
                  type="button"
                >
                  Single set
                </button>
                <button
                  className={
                    matchLength === "best-of-3" ? "is-selected" : undefined
                  }
                  onClick={() => setMatchLength("best-of-3")}
                  type="button"
                >
                  Best of 3
                </button>
              </div>
            </div>
            <div className="match-recorder__scores">
              <header>
                <span />
                <strong>Team A</strong>
                <strong>Team B</strong>
              </header>
              {Array.from({ length: visibleScoreCount }, (_, setIndex) => (
                <div key={`set-${setIndex}`}>
                  <span>Set {setIndex + 1}</span>
                  {scoreInput(
                    setIndex,
                    "a",
                    `Team A score for set ${setIndex + 1}`,
                  )}
                  {scoreInput(
                    setIndex,
                    "b",
                    `Team B score for set ${setIndex + 1}`,
                  )}
                </div>
              ))}
            </div>
            {matchLength === "best-of-3" && (
              <button
                className="match-recorder__third-set"
                onClick={() => setThirdSet((current) => !current)}
                type="button"
              >
                {thirdSet ? (
                  <X aria-hidden size={16} />
                ) : (
                  <Plus aria-hidden size={16} />
                )}
                {thirdSet
                  ? "Remove deciding set"
                  : "They played a deciding set"}
              </button>
            )}
          </>
        ) : (
          <>
            <div className="match-recorder__length">
              <span>Scoring system</span>
              <div>
                <button
                  className={
                    scoringSystem === "rally" ? "is-selected" : undefined
                  }
                  onClick={() => setScoringSystem("rally")}
                  type="button"
                >
                  Rally scoring
                </button>
                <button
                  className={
                    scoringSystem === "sideout" ? "is-selected" : undefined
                  }
                  onClick={() => setScoringSystem("sideout")}
                  type="button"
                >
                  Sideout
                </button>
              </div>
            </div>
            {teamsComplete && (
              <div className="match-recorder__service">
                <header>
                  <div>
                    <strong>Serving order</strong>
                    <small>
                      Choose{" "}
                      {teamSize === 1
                        ? "the server"
                        : `the first ${teamSize - 1}`}
                      . Duna infers the rest of each rotation.
                    </small>
                  </div>
                </header>
                <div>
                  {renderServiceOrder("A")}
                  {renderServiceOrder("B")}
                </div>
                <fieldset>
                  <legend>Who serves first in the match?</legend>
                  {[serviceOrderA[0], serviceOrderB[0]]
                    .filter((personId): personId is string => Boolean(personId))
                    .map((personId) => {
                      const person = playerById.get(personId);
                      return (
                        <label key={`first-${personId}`}>
                          <input
                            checked={initialServerPersonId === personId}
                            name="initial-server"
                            onChange={() => setInitialServerPersonId(personId)}
                            type="radio"
                          />
                          <PlayerAvatar person={person} size="small" />
                          <span>
                            <strong>{person?.displayName}</strong>
                            <small>
                              Team {teamAIds.includes(personId) ? "A" : "B"}
                            </small>
                          </span>
                        </label>
                      );
                    })}
                </fieldset>
              </div>
            )}
          </>
        )}
      </section>

      <section className="match-recorder__consent">
        <label>
          <input
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Everyone agreed to record this match</strong>
            <small>
              I confirmed the players, score, and permission to add this result
              to each participant’s history.
            </small>
          </span>
        </label>
      </section>

      {error && (
        <p className="match-recorder__error" role="alert">
          {error}
        </p>
      )}
      <footer className="match-recorder__submit">
        <div>
          <Clock3 aria-hidden size={18} />
          <span>
            <strong>
              {mode === "completed" ? "About one minute" : "Ready courtside"}
            </strong>
            <small>
              {mode === "completed"
                ? "The other side confirms before ratings move."
                : "Scores save to this device if the connection drops."}
            </small>
          </span>
        </div>
        <button disabled={isPending} onClick={submit} type="button">
          {mode === "completed" ? (
            <History aria-hidden size={18} />
          ) : (
            <Radio aria-hidden size={18} />
          )}
          {isPending
            ? mode === "completed"
              ? "Recording…"
              : "Opening court…"
            : mode === "completed"
              ? "Record this match"
              : "Start live scoring"}
        </button>
      </footer>

      {target && (
        <div
          className="player-picker"
          onMouseDown={() => setTarget(undefined)}
          role="presentation"
        >
          <section
            aria-labelledby="player-picker-title"
            aria-modal="true"
            className="player-picker__panel"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header>
              <div>
                <span className="page-eyebrow">
                  {target.kind === "serve"
                    ? "Serving order"
                    : `Team ${target.side}`}
                </span>
                <h2 id="player-picker-title">
                  {target.kind === "serve"
                    ? `Choose server ${target.index + 1}`
                    : "Add a player"}
                </h2>
              </div>
              <button
                aria-label="Close player search"
                onClick={() => setTarget(undefined)}
                type="button"
              >
                <X aria-hidden size={21} />
              </button>
            </header>
            <label className="player-picker__search">
              <Search aria-hidden size={20} />
              <input
                autoFocus
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, handle, or home market"
                value={search}
              />
            </label>
            <div className="player-picker__results">
              <span>
                {search
                  ? "Search results"
                  : target.kind === "serve"
                    ? "This team"
                    : "Suggested players"}
              </span>
              {pickerPlayers.length ? (
                pickerPlayers.map((person) => (
                  <button
                    key={person.id}
                    onClick={() => choosePlayer(person.id)}
                    type="button"
                  >
                    <PlayerAvatar person={person} />
                    <span>
                      <strong>{person.displayName}</strong>
                      <small>
                        @{person.handle} · {person.homeMarket ?? "Duna player"}
                      </small>
                    </span>
                    <span>
                      <strong>{person.rating.display.toFixed(2)}</strong>
                      <small>Sand Rating</small>
                    </span>
                    <Plus aria-hidden size={18} />
                  </button>
                ))
              ) : (
                <div className="player-picker__empty">
                  <Search aria-hidden size={22} />
                  <strong>No matching player yet</strong>
                  <small>Try a different name or handle.</small>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
