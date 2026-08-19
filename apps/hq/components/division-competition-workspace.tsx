"use client";

import type { OperatorDivisionDetail } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Banknote,
  Check,
  CircleAlert,
  Gift,
  MapPin,
  Play,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  addManualDivisionEntryAction,
  expandDivisionFieldAction,
  launchDivisionTournamentAction,
  persistDivisionBracketAction,
  reconcileDivisionSelectionAction,
  setTeamSelectionAction,
  updateDivisionMatchScheduleAction,
  type OperatorActionState,
} from "@/app/actions";
import { PlayerCombobox, type PlayerComboboxOption } from "./player-combobox";

const initialState: OperatorActionState = { status: "idle", message: "" };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function venueLocalInput(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function Notice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`operator-action-notice operator-action-notice--${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.status === "success" ? (
        <Check aria-hidden size={14} />
      ) : (
        <CircleAlert aria-hidden size={14} />
      )}
      {state.message}
    </p>
  );
}

function TeamMoveControl({
  team,
}: {
  readonly team: OperatorDivisionDetail["teams"][number];
}) {
  const [state, action, pending] = useActionState(
    setTeamSelectionAction,
    initialState,
  );
  const nextStatus =
    team.selectionStatus === "confirmed" ? "waitlisted" : "confirmed";
  return (
    <form action={action} className="division-team-move">
      <input name="teamEntryId" type="hidden" value={team.id} />
      <input name="selectionStatus" type="hidden" value={nextStatus} />
      <input name="confirmed" type="hidden" value="true" />
      <input
        aria-label="Seed"
        defaultValue={team.seed}
        min={1}
        name="seed"
        placeholder="Seed"
        type="number"
      />
      <input
        name="reason"
        type="hidden"
        value={`Manual ${nextStatus} override from division operations.`}
      />
      <button disabled={pending} type="submit">
        {pending
          ? "Saving…"
          : nextStatus === "confirmed"
            ? "Move into field"
            : "Move to waitlist"}
      </button>
      <Notice state={state} />
    </form>
  );
}

function MatchScheduleControl({
  detail,
  match,
}: {
  readonly detail: OperatorDivisionDetail;
  readonly match: OperatorDivisionDetail["matches"][number];
}) {
  const [state, action, pending] = useActionState(
    updateDivisionMatchScheduleAction,
    initialState,
  );
  return (
    <form action={action} className="division-match-schedule">
      <input name="matchId" type="hidden" value={match.id} />
      <input name="timezone" type="hidden" value={detail.session.timezone} />
      <input name="confirmed" type="hidden" value="true" />
      <input
        name="reason"
        type="hidden"
        value="Updated by the event organizer."
      />
      <label>
        <span>Time</span>
        <input
          defaultValue={
            match.scheduledAt
              ? venueLocalInput(match.scheduledAt, detail.session.timezone)
              : undefined
          }
          name="localScheduledAt"
          type="datetime-local"
        />
      </label>
      <label>
        <span>Court</span>
        <select defaultValue={match.courtId ?? ""} name="courtId">
          <option value="">Unassigned</option>
          {detail.courts.map((court) => (
            <option key={court.id} value={court.id}>
              {court.name}
            </option>
          ))}
        </select>
      </label>
      <button disabled={pending} type="submit">
        {pending ? "Saving…" : "Save assignment"}
      </button>
      <Notice state={state} />
    </form>
  );
}

function ManualTeamEntryControl({
  detail,
}: {
  readonly detail: OperatorDivisionDetail;
}) {
  const [state, action, pending] = useActionState(
    addManualDivisionEntryAction,
    initialState,
  );
  const [payment, setPayment] = useState<"complimentary" | "cash">(
    "complimentary",
  );
  const people = useMemo<readonly PlayerComboboxOption[]>(() => {
    const options = detail.teams.flatMap((team) =>
      team.roster.flatMap((member) =>
        member.personId
          ? [
              {
                id: member.personId,
                displayName: member.displayName,
                handle: member.displayName.toLowerCase().replace(/\s+/g, "-"),
                rating: member.ratingDisplay,
              },
            ]
          : [],
      ),
    );
    return [...new Map(options.map((option) => [option.id, option])).values()];
  }, [detail.teams]);
  return (
    <details className="division-manual-entry">
      <summary>
        <UserPlus aria-hidden size={17} /> Add a team manually
        <small>Complimentary or verified cash</small>
      </summary>
      <form action={action}>
        <input name="divisionId" type="hidden" value={detail.division.id} />
        <div className="division-manual-entry__players">
          {Array.from({ length: detail.division.teamSize }, (_, index) => (
            <PlayerCombobox
              initialOptions={people}
              key={index}
              label={index === 0 ? "Captain" : `Player ${index + 1}`}
              name="playerIds"
              placeholder={
                index === 0 ? "Find the captain…" : `Find player ${index + 1}…`
              }
            />
          ))}
        </div>
        <fieldset>
          <legend>Entry treatment</legend>
          <label>
            <input
              checked={payment === "complimentary"}
              name="payment"
              onChange={() => setPayment("complimentary")}
              type="radio"
              value="complimentary"
            />
            <Gift aria-hidden size={16} /> Complimentary
            <small>Added as a director-granted entry.</small>
          </label>
          <label>
            <input
              checked={payment === "cash"}
              name="payment"
              onChange={() => setPayment("cash")}
              type="radio"
              value="cash"
            />
            <Banknote aria-hidden size={16} /> Cash verified
            <small>Record what was received at the desk.</small>
          </label>
        </fieldset>
        {payment === "cash" && (
          <div className="division-manual-entry__cash">
            <label>
              <span>Cash received</span>
              <input
                defaultValue={
                  detail.division.entryFeeMinor
                    ? (detail.division.entryFeeMinor / 100).toFixed(2)
                    : undefined
                }
                inputMode="decimal"
                min="0.01"
                name="cashAmount"
                placeholder="0.00"
                required
                step="0.01"
                type="number"
              />
            </label>
            <label>
              <span>Receipt or desk reference</span>
              <input name="cashReference" placeholder="Optional" />
            </label>
          </div>
        )}
        <label className="division-manual-entry__reason">
          <span>Why is this entry being added?</span>
          <input
            defaultValue={
              payment === "cash"
                ? "Cash received and verified at tournament desk."
                : "Director-granted complimentary entry."
            }
            name="reason"
            required
          />
        </label>
        <label className="division-manual-entry__confirm">
          <input name="confirmed" required type="checkbox" value="true" />I
          verified this roster and its entry treatment.
        </label>
        <button disabled={pending} type="submit">
          {pending ? "Adding team…" : "Add to confirmed field"}
        </button>
        <Notice state={state} />
      </form>
    </details>
  );
}

function TournamentLaunchControl({
  detail,
}: {
  readonly detail: OperatorDivisionDetail;
}) {
  const [state, action, pending] = useActionState(
    launchDivisionTournamentAction,
    initialState,
  );
  const live =
    detail.session.status === "live" || Boolean(detail.bracket?.liveAt);
  return (
    <section className={`tournament-launch-control${live ? " is-live" : ""}`}>
      <span className="tournament-launch-control__mark" aria-hidden>
        <Play size={20} />
      </span>
      <div>
        <small>{live ? "Tournament live" : "Ready to operate"}</small>
        <strong>
          {live
            ? "Courts are running on the official draw."
            : "Launch the tournament when the field is final."}
        </strong>
        <p>
          {live
            ? "Score entries and schedule changes now operate against this versioned field."
            : detail.bracket
              ? "Duna will make this bracket version the live operational source of truth."
              : "Build pools or a bracket first. You can still refine teams and seeds before launch."}
        </p>
      </div>
      {!live && (
        <form action={action}>
          <input name="divisionId" type="hidden" value={detail.division.id} />
          <input
            name="reason"
            type="hidden"
            value="Director launched tournament operations."
          />
          <input name="confirmed" type="hidden" value="true" />
          <button disabled={!detail.bracket || pending} type="submit">
            <Play aria-hidden size={16} />{" "}
            {pending ? "Launching…" : "Launch tournament"}
          </button>
        </form>
      )}
      <Notice state={state} />
    </section>
  );
}

export function DivisionCompetitionWorkspace({
  detail,
}: {
  readonly detail: OperatorDivisionDetail;
}) {
  const [seedState, seedAction, seedPending] = useActionState(
    reconcileDivisionSelectionAction,
    initialState,
  );
  const [expandState, expandAction, expandPending] = useActionState(
    expandDivisionFieldAction,
    initialState,
  );
  const [bracketState, bracketAction, bracketPending] = useActionState(
    persistDivisionBracketAction,
    initialState,
  );
  const confirmedTeams = detail.teams
    .filter((team) => team.selectionStatus === "confirmed")
    .sort(
      (left, right) =>
        (left.seed ?? Number.MAX_SAFE_INTEGER) -
        (right.seed ?? Number.MAX_SAFE_INTEGER),
    );
  const waitlistedTeams = detail.teams
    .filter((team) => team.selectionStatus === "waitlisted")
    .sort(
      (left, right) =>
        (left.seed ?? Number.MAX_SAFE_INTEGER) -
        (right.seed ?? Number.MAX_SAFE_INTEGER),
    );
  const pendingTeams = detail.teams.filter(
    (team) => team.selectionStatus === "pending",
  );
  const defaultFormat = detail.division.poolPlay?.enabled
    ? "pool-play"
    : detail.session.kind === "league"
      ? "round-robin"
      : detail.division.tournamentFormat === "double-elimination-true"
        ? "double-elimination-true-reset"
        : detail.division.tournamentFormat === "double-elimination-crossover"
          ? "double-elimination-crossover"
          : "single-elimination";
  const bracketStructure = detail.bracket?.structure as
    | {
        readonly teams?: readonly {
          readonly id: string;
          readonly seed: number;
          readonly name: string;
        }[];
        readonly pools?: Readonly<Record<string, readonly string[]>>;
      }
    | undefined;
  const bracketTeamById = new Map(
    (bracketStructure?.teams ?? []).map((team) => [team.id, team] as const),
  );
  const poolAssignments = Object.entries(bracketStructure?.pools ?? {});
  return (
    <main className="hq-page division-competition-page">
      <Link
        className="member-profile-back"
        href={`/events/${detail.session.id}`}
      >
        <ArrowLeft aria-hidden size={16} /> Event operations
      </Link>
      <header className="division-competition-hero">
        <span>
          <small>{detail.session.title}</small>
          <h1>{detail.division.name}</h1>
          <p>
            {detail.division.seeding.replaceAll("-", " ")} qualification ·{" "}
            {detail.division.teamSize}-player teams ·{" "}
            {detail.division.discipline}
          </p>
        </span>
        <span className="division-competition-hero__metrics">
          <Badge tone="positive">{confirmedTeams.length} confirmed</Badge>
          <Badge tone={waitlistedTeams.length ? "warning" : "neutral"}>
            {waitlistedTeams.length} waitlisted
          </Badge>
          <Badge>{detail.matches.length} matches</Badge>
        </span>
      </header>

      <TournamentLaunchControl detail={detail} />

      <section className="division-control-grid">
        <form action={seedAction} className="hq-card division-control-card">
          <RefreshCw aria-hidden size={21} />
          <span>
            <small>Qualification + seeding</small>
            <strong>Recalculate the field</strong>
            <p>
              Fully paid teams are ranked by{" "}
              {detail.division.seeding.replaceAll("-", " ")}. Rating
              qualification finalizes automatically at registration close.
              Locked organizer overrides remain in place.
            </p>
          </span>
          <input name="divisionId" type="hidden" value={detail.division.id} />
          <input name="force" type="hidden" value="false" />
          <input name="confirmed" type="hidden" value="true" />
          <button disabled={seedPending} type="submit">
            {seedPending ? "Recalculating…" : "Recalculate seeds"}
          </button>
          <Notice state={seedState} />
        </form>
        <form action={expandAction} className="hq-card division-control-card">
          <UsersRound aria-hidden size={21} />
          <span>
            <small>Field capacity</small>
            <strong>Expand and promote</strong>
            <p>
              Increasing the field immediately promotes the next eligible, fully
              paid teams from the waitlist.
            </p>
          </span>
          <input name="divisionId" type="hidden" value={detail.division.id} />
          <input name="confirmed" type="hidden" value="true" />
          <input
            defaultValue={
              detail.division.maximumTeams ??
              Math.floor(detail.division.capacity / detail.division.teamSize)
            }
            min={2}
            name="maximumTeams"
            required
            type="number"
          />
          <input
            name="reason"
            type="hidden"
            value="Organizer expanded the published field."
          />
          <button disabled={expandPending} type="submit">
            {expandPending ? "Expanding…" : "Expand field"}
          </button>
          <Notice state={expandState} />
        </form>
      </section>

      <section className="hq-card division-registration-board">
        <header>
          <span>
            <small>Player-facing registration order</small>
            <h2>Confirmed seeds + waitlist</h2>
          </span>
          {detail.division.registrationClosesAt && (
            <span>
              <CalendarClock aria-hidden size={15} /> Closes{" "}
              {new Intl.DateTimeFormat("en-US", {
                timeZone: detail.session.timezone,
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(detail.division.registrationClosesAt))}
            </span>
          )}
        </header>
        <div className="division-registration-board__columns">
          <section>
            <h3>Confirmed</h3>
            {confirmedTeams.map((team) => (
              <article key={team.id}>
                <b>{team.seed ?? "—"}</b>
                <span className="division-team-avatars">
                  {team.roster.slice(0, 2).map((member, index) => (
                    <i key={`${team.id}:${index}`}>
                      {member.avatarUrl ? (
                        <img alt="" src={member.avatarUrl} />
                      ) : (
                        initials(member.displayName)
                      )}
                    </i>
                  ))}
                </span>
                <span>
                  <strong>{team.name}</strong>
                  <small>
                    Rating {team.averageRating?.toFixed(2) ?? "—"} ·{" "}
                    {team.fullyPaid ? "fully paid" : "payment incomplete"}
                  </small>
                </span>
                <TeamMoveControl team={team} />
              </article>
            ))}
            {confirmedTeams.length === 0 && (
              <p className="hq-empty">No confirmed teams yet.</p>
            )}
          </section>
          <section>
            <h3>Waitlist</h3>
            {waitlistedTeams.map((team, index) => (
              <article key={team.id}>
                <b>W{index + 1}</b>
                <span className="division-team-avatars">
                  {team.roster.slice(0, 2).map((member, avatarIndex) => (
                    <i key={`${team.id}:${avatarIndex}`}>
                      {member.avatarUrl ? (
                        <img alt="" src={member.avatarUrl} />
                      ) : (
                        initials(member.displayName)
                      )}
                    </i>
                  ))}
                </span>
                <span>
                  <strong>{team.name}</strong>
                  <small>
                    Rating {team.averageRating?.toFixed(2) ?? "—"} ·{" "}
                    {team.fullyPaid ? "eligible to move up" : "not fully paid"}
                  </small>
                </span>
                <TeamMoveControl team={team} />
              </article>
            ))}
            {waitlistedTeams.length === 0 && (
              <p className="hq-empty">No teams are waiting.</p>
            )}
          </section>
        </div>
        {pendingTeams.length > 0 && (
          <footer>
            <CircleAlert aria-hidden size={15} /> {pendingTeams.length} team
            {pendingTeams.length === 1 ? " is" : "s are"} still assembling or
            awaiting full payment and cannot qualify yet.
          </footer>
        )}
        <ManualTeamEntryControl detail={detail} />
      </section>

      <section className="hq-card division-bracket-builder">
        <header>
          <span>
            <small>Versioned competition structure</small>
            <h2>Pool play, bracket + league matchups</h2>
          </span>
          {detail.bracket && (
            <Badge>
              v{detail.bracket.version} · {detail.bracket.format}
            </Badge>
          )}
        </header>
        <form action={bracketAction}>
          <input name="divisionId" type="hidden" value={detail.division.id} />
          <input name="confirmed" type="hidden" value="true" />
          <label>
            <span>Competition format</span>
            <select defaultValue={defaultFormat} name="format">
              <option value="pool-play">Pool play</option>
              <option value="round-robin">Round robin / league</option>
              <option value="single-elimination">Single elimination</option>
              <option value="double-elimination-true-reset">
                True double elimination
              </option>
              <option value="double-elimination-modified">
                Modified double elimination
              </option>
              <option value="double-elimination-crossover">
                Crossover double elimination
              </option>
            </select>
          </label>
          <label>
            <span>Pool count</span>
            <input defaultValue={2} min={2} name="poolCount" type="number" />
          </label>
          <label>
            <span>Reason for the new version</span>
            <input
              defaultValue={
                detail.bracket
                  ? "Updated after field or format changes."
                  : "Initial competition structure."
              }
              name="reason"
              required
            />
          </label>
          <button disabled={bracketPending} type="submit">
            <Trophy aria-hidden size={15} />{" "}
            {bracketPending
              ? "Generating…"
              : detail.bracket
                ? "Create new version"
                : "Generate matches"}
          </button>
          <Notice state={bracketState} />
        </form>
        <p className="division-bracket-builder__safety">
          <ShieldCheck aria-hidden size={15} /> Existing bracket versions and
          match history are preserved. Only the newest version is operational.
        </p>
      </section>

      {poolAssignments.length > 0 && (
        <section className="hq-card division-pool-board">
          <header>
            <span>
              <small>Preliminary round</small>
              <h2>Pool assignments</h2>
            </span>
            <Badge>{poolAssignments.length} pools</Badge>
          </header>
          <div>
            {poolAssignments.map(([poolName, teamIds]) => (
              <article key={poolName}>
                <h3>Pool {poolName}</h3>
                <ol>
                  {teamIds.map((teamId) => {
                    const team = bracketTeamById.get(teamId);
                    return (
                      <li key={teamId}>
                        <b>{team?.seed ?? "—"}</b>
                        <span>{team?.name ?? "Team to be assigned"}</span>
                      </li>
                    );
                  })}
                </ol>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="division-match-grid" aria-label="Division matches">
        {detail.matches.map((match) => (
          <article className="hq-card division-match-card" key={match.id}>
            <header>
              <small>{match.label}</small>
              <Badge>{match.status}</Badge>
            </header>
            <div>
              <strong>{match.teamAName ?? "Winner / team TBD"}</strong>
              <i>vs</i>
              <strong>{match.teamBName ?? "Winner / team TBD"}</strong>
            </div>
            <p>
              <CalendarClock aria-hidden size={14} />
              {match.scheduledAt
                ? new Intl.DateTimeFormat("en-US", {
                    timeZone: detail.session.timezone,
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(match.scheduledAt))
                : "Time unassigned"}
              <MapPin aria-hidden size={14} />
              {match.courtName ?? "Court unassigned"}
            </p>
            <MatchScheduleControl detail={detail} match={match} />
          </article>
        ))}
        {detail.matches.length === 0 && (
          <div className="hq-card division-match-empty">
            <Trophy aria-hidden size={24} />
            <strong>
              Generate the competition structure when seeds are ready.
            </strong>
            <span>
              Duna will create preliminary pools, bracket rounds, or recurring
              league matchups from the confirmed teams.
            </span>
          </div>
        )}
      </section>
      <Link
        className="division-return-link"
        href={`/events/${detail.session.id}`}
      >
        Return to event roster and refunds <ArrowRight aria-hidden size={15} />
      </Link>
    </main>
  );
}
