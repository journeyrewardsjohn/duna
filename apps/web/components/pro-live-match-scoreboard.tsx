"use client";

import type { PublicProMatchDetail } from "@duna/api";
import { Numeric } from "@duna/ui";
import {
  Activity,
  CircleCheck,
  Radio,
  RefreshCw,
  Trophy,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CountryCode } from "@/components/country-code";
import {
  parseVolleyballWorldGamedayEvent,
  volleyballWorldAnonymousToken,
  volleyballWorldBeachTopic,
  volleyballWorldLiveFeedHealth,
  volleyballWorldLiveFeedTiming,
  volleyballWorldReconnectDelay,
} from "@/lib/volleyball-world-gameday";
import { compactPlayerName } from "@/lib/player-name";

type Match = PublicProMatchDetail["match"];
type MatchTeam = Match["teamA"];
type LiveScore = NonNullable<Match["liveScore"]>;
type ConnectionState =
  "idle" | "connecting" | "websocket" | "polling" | "final";

const gamedayAuthUrl =
  "https://auth-api.volleyballworld.com/api/gameday/anonymous-token";
const gamedaySocketUrl = "wss://ws.gameday-prod.wvbl.mangodev.co.uk";
const setNumbers = [1, 2, 3] as const;

function setsWon(
  sets: readonly { readonly a: number; readonly b: number }[],
  side: "A" | "B",
) {
  return sets.filter((set) => (side === "A" ? set.a > set.b : set.b > set.a))
    .length;
}

function matchPoints(
  live: LiveScore | undefined,
  sets: readonly { readonly a: number; readonly b: number }[],
  side: "A" | "B",
) {
  if (live) return side === "A" ? live.matchPoints.a : live.matchPoints.b;
  return sets.length > 0 ? setsWon(sets, side) : undefined;
}

function normalizedWords(value: string): ReadonlySet<string> {
  return new Set(
    value
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 1),
  );
}

function matchingPlayer(name: string, team: MatchTeam) {
  const words = normalizedWords(name);
  const match = [...team.players]
    .map((player) => ({
      player,
      score: [...normalizedWords(player.name)].filter((word) => words.has(word))
        .length,
    }))
    .sort((left, right) => right.score - left.score)[0];
  return match?.score ? match.player : undefined;
}

function mergedSets(live: LiveScore | undefined, fallback: Match["sets"]) {
  const scores = new Map<number, { readonly a: number; readonly b: number }>();
  if (live) {
    live.sets.forEach((set) => scores.set(set.number, { a: set.a, b: set.b }));
  } else {
    fallback.forEach((set, index) =>
      scores.set(index + 1, { a: set.a, b: set.b }),
    );
  }
  if (live?.status === "live" && live.currentSetNo && live.currentSetPoints) {
    scores.set(live.currentSetNo, live.currentSetPoints);
  }
  return [...scores.entries()]
    .sort(([left], [right]) => left - right)
    .map(([number, score]) => ({ number, ...score }));
}

function updateFromGameday(previous: LiveScore, message: unknown): LiveScore {
  const update = parseVolleyballWorldGamedayEvent(message, previous.matchNo);
  if (!update) return previous;
  const scores = new Map(
    previous.sets.map((set) => [set.number, set] as const),
  );
  for (const set of update.sets) scores.set(set.number, set);
  return {
    ...previous,
    transport: "websocket",
    ...(update.status
      ? {
          status: update.status,
          statusLabel:
            update.status === "completed"
              ? "Final"
              : update.status === "live"
                ? "Live"
                : "Upcoming",
        }
      : {}),
    ...(update.matchPoints ? { matchPoints: update.matchPoints } : {}),
    sets: [...scores.values()].sort(
      (left, right) => left.number - right.number,
    ),
    ...(update.currentSetNo ? { currentSetNo: update.currentSetNo } : {}),
    ...(update.currentSetPoints
      ? { currentSetPoints: update.currentSetPoints }
      : {}),
    ...(update.statistics ? { statistics: update.statistics } : {}),
    syncedAt: new Date().toISOString(),
  };
}

function PlayerIdentity({
  player,
  countryCode,
  flagUrl,
}: {
  readonly player: MatchTeam["players"][number];
  readonly countryCode?: string;
  readonly flagUrl?: string;
}) {
  const content = (
    <>
      {player.avatarUrl ? (
        <img alt="" src={player.avatarUrl} />
      ) : countryCode ? (
        <CountryCode code={countryCode} fallback={player.name.slice(0, 2)} />
      ) : flagUrl ? (
        <img alt={`${countryCode ?? "Team"} flag`} src={flagUrl} />
      ) : (
        <CountryCode code={countryCode} fallback={player.name.slice(0, 2)} />
      )}
      <span>
        <strong>
          <span className="pro-live-scoreboard__name-full">{player.name}</span>
          <span className="pro-live-scoreboard__name-compact">
            {compactPlayerName(player.name)}
          </span>
        </strong>
        <small>
          {player.rating !== undefined ? (
            <>
              Sand Rating{" "}
              <Numeric tier="chip">{player.rating.toFixed(2)}</Numeric>
            </>
          ) : (
            "Sand Rating pending"
          )}
        </small>
      </span>
    </>
  );
  const href =
    player.publicPath ??
    (player.handle ? `/players/${player.handle}` : undefined);
  return href ? (
    <Link className="pro-live-scoreboard__player" href={href}>
      {content}
    </Link>
  ) : (
    <div className="pro-live-scoreboard__player">{content}</div>
  );
}

function TeamScoreRow({
  team,
  side,
  sets,
  live,
  winner,
}: {
  readonly team: MatchTeam;
  readonly side: "A" | "B";
  readonly sets: readonly {
    readonly number: number;
    readonly a: number;
    readonly b: number;
  }[];
  readonly live?: LiveScore;
  readonly winner: boolean;
}) {
  const players =
    team.players.length > 0 ? team.players : [{ name: team.label }];
  const scoreFor = (setNo: number) => {
    const set = sets.find((candidate) => candidate.number === setNo);
    return set ? (side === "A" ? set.a : set.b) : undefined;
  };
  return (
    <div
      className={`pro-live-scoreboard__team${winner ? " pro-live-scoreboard__team--winner" : ""}`}
    >
      <div className="pro-live-scoreboard__roster">
        {players.map((player, index) => (
          <PlayerIdentity
            countryCode={team.countryCode}
            flagUrl={team.flagUrl}
            key={`${player.name}-${index}`}
            player={player}
          />
        ))}
      </div>
      {setNumbers.map((setNo) => {
        const score = scoreFor(setNo);
        const other = sets.find((candidate) => candidate.number === setNo);
        const won = other
          ? side === "A"
            ? other.a > other.b
            : other.b > other.a
          : false;
        const current = live?.status === "live" && live.currentSetNo === setNo;
        return (
          <Numeric
            className={`pro-live-scoreboard__set${won ? " is-won" : ""}${current ? " is-current" : ""}`}
            key={setNo}
            tier="block"
          >
            {score ?? "—"}
          </Numeric>
        );
      })}
      <Numeric className="pro-live-scoreboard__match-points" tier="block">
        {matchPoints(live, sets, side) ?? "—"}
      </Numeric>
    </div>
  );
}

function PlayerStatCard({
  stat,
  team,
}: {
  readonly stat: NonNullable<LiveScore["statistics"]>["players"][number];
  readonly team: MatchTeam;
}) {
  const player = matchingPlayer(stat.name, team);
  const hittingEfficiency =
    stat.hittingEfficiency ?? (stat.efficiency || undefined);
  return (
    <article className="pro-live-stats__player">
      <div>
        {player?.avatarUrl ? (
          <img alt="" src={player.avatarUrl} />
        ) : team.countryCode ? (
          <CountryCode
            code={team.countryCode}
            fallback={stat.name.slice(0, 2)}
          />
        ) : team.flagUrl ? (
          <img alt={`${team.countryCode ?? "Team"} flag`} src={team.flagUrl} />
        ) : (
          <CountryCode
            code={team.countryCode}
            fallback={stat.name.slice(0, 2)}
          />
        )}
        <span>
          <strong>{player?.name ?? stat.name}</strong>
          <small>
            {player?.rating !== undefined ? (
              <>
                Sand Rating{" "}
                <Numeric tier="chip">{player.rating.toFixed(2)}</Numeric>
              </>
            ) : (
              team.label
            )}
          </small>
        </span>
      </div>
      <dl>
        <div>
          <dt>Total</dt>
          <dd>
            <Numeric tier="block">{stat.total}</Numeric>
          </dd>
        </div>
        <div>
          <dt>Kills</dt>
          <dd>
            <Numeric tier="block">{stat.attackPoints ?? stat.attack}</Numeric>
          </dd>
        </div>
        <div>
          <dt>Hit eff.</dt>
          <dd>
            <Numeric tier="block">
              {hittingEfficiency !== undefined
                ? `${hittingEfficiency.toFixed(1)}%`
                : "—"}
            </Numeric>
          </dd>
        </div>
        <div>
          <dt>Aces</dt>
          <dd>
            <Numeric tier="block">{stat.servePoints ?? stat.serve}</Numeric>
          </dd>
        </div>
        <div>
          <dt>Blocks</dt>
          <dd>
            <Numeric tier="block">{stat.blockPoints ?? stat.block}</Numeric>
          </dd>
        </div>
        <div>
          <dt>Digs</dt>
          <dd>
            <Numeric tier="block">{stat.digs ?? "—"}</Numeric>
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function ProLiveMatchScoreboard({
  eventName,
  genderCategory,
  initialLive,
  match,
}: {
  readonly eventName: string;
  readonly genderCategory: string;
  readonly initialLive?: LiveScore;
  readonly match: Match;
}) {
  const [live, setLive] = useState<LiveScore | undefined>(initialLive);
  const [connection, setConnection] = useState<ConnectionState>(
    initialLive?.status === "completed"
      ? "final"
      : initialLive
        ? "polling"
        : "idle",
  );
  const terminalReconciled = useRef(false);
  const displayStatus = live?.status ?? match.status;
  const sets = useMemo(() => mergedSets(live, match.sets), [live, match.sets]);

  useEffect(() => {
    if (!initialLive?.matchNo || live?.status === "completed") return;
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/pro-matches/${match.id}/live`, {
          cache: "no-store",
        });
        if (!response.ok) return;
        const next = (await response.json()) as LiveScore;
        if (!active) return;
        setLive(next);
        setConnection((current) =>
          next.status === "completed"
            ? "final"
            : current === "websocket"
              ? current
              : "polling",
        );
      } catch {
        if (active)
          setConnection((value) => (value === "websocket" ? value : "polling"));
      }
    };
    void refresh();
    const interval = window.setInterval(
      refresh,
      connection === "websocket"
        ? (initialLive.pollingMs ??
            volleyballWorldLiveFeedTiming.healthyPollingMs)
        : volleyballWorldLiveFeedTiming.fallbackPollingMs,
    );
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [
    connection,
    initialLive?.matchNo,
    initialLive?.pollingMs,
    live?.status,
    match.id,
  ]);

  useEffect(() => {
    if (
      live?.status !== "completed" ||
      live.transport !== "websocket" ||
      terminalReconciled.current
    ) {
      return;
    }
    terminalReconciled.current = true;
    let active = true;
    void fetch(`/api/pro-matches/${match.id}/live`, { cache: "no-store" })
      .then(async (response) =>
        response.ok ? ((await response.json()) as LiveScore) : undefined,
      )
      .then((official) => {
        if (active && official) setLive(official);
      })
      .finally(() => {
        if (active) setConnection("final");
      });
    return () => {
      active = false;
    };
  }, [live?.status, live?.transport, match.id]);

  useEffect(() => {
    const matchNo = initialLive?.matchNo;
    if (!matchNo || live?.status !== "live") return;
    const officialMatchNo = matchNo;
    let active = true;
    let socket: WebSocket | undefined;
    let heartbeat: number | undefined;
    let watchdog: number | undefined;
    let connectionTimeout: number | undefined;
    let reconnect: number | undefined;
    let attempts = 0;
    let lastMessageAt = Date.now();
    let lastMatchUpdateAt = 0;

    const clearSocketTimers = () => {
      if (heartbeat !== undefined) window.clearInterval(heartbeat);
      if (watchdog !== undefined) window.clearInterval(watchdog);
      if (connectionTimeout !== undefined)
        window.clearTimeout(connectionTimeout);
      heartbeat = undefined;
      watchdog = undefined;
      connectionTimeout = undefined;
    };

    const scheduleReconnect = () => {
      if (
        !active ||
        reconnect !== undefined ||
        attempts >= volleyballWorldLiveFeedTiming.maxReconnectAttempts
      ) {
        return;
      }
      attempts += 1;
      reconnect = window.setTimeout(() => {
        reconnect = undefined;
        void connect();
      }, volleyballWorldReconnectDelay(attempts));
    };

    async function connect() {
      if (!active) return;
      setConnection("connecting");
      try {
        const response = await fetch(gamedayAuthUrl, {
          method: "POST",
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Gameday token unavailable");
        const token = volleyballWorldAnonymousToken(await response.json());
        if (!token) throw new Error("Gameday token missing");
        socket = new WebSocket(
          `${gamedaySocketUrl}?token=${encodeURIComponent(token)}`,
        );
        connectionTimeout = window.setTimeout(
          () => socket?.close(),
          volleyballWorldLiveFeedTiming.connectionTimeoutMs,
        );
        socket.addEventListener("open", () => {
          if (!active || !socket) return;
          if (connectionTimeout !== undefined)
            window.clearTimeout(connectionTimeout);
          connectionTimeout = undefined;
          lastMessageAt = Date.now();
          socket.send(
            JSON.stringify({
              action: "subscribe",
              topics: [volleyballWorldBeachTopic],
            }),
          );
          heartbeat = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ action: "list" }));
            }
          }, volleyballWorldLiveFeedTiming.heartbeatMs);
          watchdog = window.setInterval(() => {
            const now = Date.now();
            const health = volleyballWorldLiveFeedHealth({
              now,
              lastMessageAt,
              lastMatchUpdateAt,
            });
            if (health.responseStale) {
              socket?.close();
              return;
            }
            if (health.matchStale) {
              setConnection((current) =>
                current === "final" ? current : "polling",
              );
            }
          }, 2_000);
        });
        socket.addEventListener("message", (event) => {
          lastMessageAt = Date.now();
          try {
            const message = JSON.parse(String(event.data)) as unknown;
            const update = parseVolleyballWorldGamedayEvent(
              message,
              officialMatchNo,
            );
            if (!update) return;
            lastMatchUpdateAt = Date.now();
            attempts = 0;
            setLive((previous) =>
              previous ? updateFromGameday(previous, message) : previous,
            );
            setConnection(
              update.status === "completed" ? "final" : "websocket",
            );
          } catch {
            // Subscription acknowledgements and non-JSON heartbeats are safe to ignore.
          }
        });
        socket.addEventListener("close", () => {
          clearSocketTimers();
          if (!active) return;
          setConnection((current) =>
            current === "final" ? current : "polling",
          );
          scheduleReconnect();
        });
        socket.addEventListener("error", () => socket?.close());
      } catch {
        if (active) {
          setConnection("polling");
          scheduleReconnect();
        }
      }
    }

    void connect();
    return () => {
      active = false;
      clearSocketTimers();
      if (reconnect !== undefined) window.clearTimeout(reconnect);
      socket?.close();
    };
  }, [initialLive?.matchNo, live?.status]);

  const winnerSide =
    match.winnerSide ??
    (displayStatus === "completed"
      ? matchPoints(live, sets, "A")! > matchPoints(live, sets, "B")!
        ? "A"
        : matchPoints(live, sets, "B")! > matchPoints(live, sets, "A")!
          ? "B"
          : undefined
      : undefined);
  const statusLabel =
    displayStatus === "live"
      ? "Live"
      : displayStatus === "completed"
        ? "Final"
        : match.time
          ? match.time
          : "Upcoming";
  const connectionLabel =
    connection === "websocket"
      ? "Live feed connected"
      : connection === "connecting"
        ? "Connecting live feed"
        : connection === "final"
          ? "Official final"
          : live
            ? "Official fallback · 15 sec refresh"
            : "Official feed pending";
  const stats = live?.statistics;

  return (
    <section
      aria-label={`${match.teamA.label} versus ${match.teamB.label}. ${statusLabel}.`}
      aria-live={displayStatus === "live" ? "polite" : undefined}
      className="pro-live-scoreboard"
      data-zone={displayStatus === "live" ? "live" : "athletic"}
    >
      <header className="pro-live-scoreboard__header">
        <div>
          <span
            className={`pro-live-scoreboard__status pro-live-scoreboard__status--${displayStatus}`}
          >
            {displayStatus === "live" && <Radio aria-hidden size={14} />}
            {statusLabel}
          </span>
          <strong>{genderCategory.toUpperCase()}</strong>
          <span>{match.roundLabel}</span>
          {match.court && <span>{match.court}</span>}
        </div>
        <div className={`pro-live-scoreboard__connection is-${connection}`}>
          {connection === "websocket" ? (
            <Wifi aria-hidden size={15} />
          ) : connection === "final" ? (
            <CircleCheck aria-hidden size={15} />
          ) : (
            <RefreshCw aria-hidden size={15} />
          )}
          <span>{connectionLabel}</span>
        </div>
      </header>

      {displayStatus === "live" && live?.currentSetPoints && (
        <div className="pro-live-scoreboard__now">
          <span>
            <i aria-hidden /> Point by point · Set{" "}
            <Numeric tier="chip">{live.currentSetNo ?? sets.length}</Numeric>
          </span>
          <strong>
            <Numeric tier="score">{live.currentSetPoints.a}</Numeric>
            <small>–</small>
            <Numeric tier="score">{live.currentSetPoints.b}</Numeric>
          </strong>
        </div>
      )}

      <div className="pro-live-scoreboard__grid">
        <div className="pro-live-scoreboard__columns" aria-hidden>
          <span>Team</span>
          {setNumbers.map((setNo) => (
            <span key={setNo}>
              <i>Set</i> {setNo}
            </span>
          ))}
          <span>Sets</span>
        </div>
        <TeamScoreRow
          live={live}
          sets={sets}
          side="A"
          team={match.teamA}
          winner={winnerSide === "A"}
        />
        <TeamScoreRow
          live={live}
          sets={sets}
          side="B"
          team={match.teamB}
          winner={winnerSide === "B"}
        />
      </div>

      {stats && (stats.team.length > 0 || stats.players.length > 0) && (
        <section className="pro-live-stats">
          <header>
            <div>
              <span>Official match data</span>
              <h2>Inside the match.</h2>
            </div>
            <Activity aria-hidden size={22} />
          </header>
          {stats.team.length > 0 && (
            <div className="pro-live-stats__comparison">
              <div className="pro-live-stats__team-labels">
                <strong>{match.teamA.countryCode ?? "Team A"}</strong>
                <span>Team stats</span>
                <strong>{match.teamB.countryCode ?? "Team B"}</strong>
              </div>
              {stats.team
                .filter((stat) => stat.key !== "total")
                .map((stat) => {
                  const maximum = Math.max(stat.a, stat.b, 1);
                  return (
                    <div className="pro-live-stats__metric" key={stat.key}>
                      <Numeric tier="block">{stat.a}</Numeric>
                      <div>
                        <span>{stat.label}</span>
                        <i>
                          <b style={{ width: `${(stat.a / maximum) * 50}%` }} />
                          <b style={{ width: `${(stat.b / maximum) * 50}%` }} />
                        </i>
                      </div>
                      <Numeric tier="block">{stat.b}</Numeric>
                    </div>
                  );
                })}
            </div>
          )}
          {stats.players.length > 0 && (
            <div className="pro-live-stats__players">
              <header>
                <strong>Best scorers</strong>
                <span>Kills · Efficiency · Aces · Blocks · Digs</span>
              </header>
              <div>
                {[...stats.players]
                  .sort((left, right) => right.total - left.total)
                  .map((stat) => (
                    <PlayerStatCard
                      key={`${stat.side}-${stat.externalPlayerId}`}
                      stat={stat}
                      team={stat.side === "A" ? match.teamA : match.teamB}
                    />
                  ))}
              </div>
            </div>
          )}
        </section>
      )}

      <footer className="pro-live-scoreboard__footer">
        <span>
          {displayStatus === "completed" ? (
            <Trophy aria-hidden size={14} />
          ) : (
            <Activity aria-hidden size={14} />
          )}
          {eventName}
        </span>
        {live?.syncedAt && (
          <span>
            Updated{" "}
            {new Intl.DateTimeFormat("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              timeZone: match.timezone ?? "UTC",
              timeZoneName: "short",
            }).format(new Date(live.syncedAt))}
          </span>
        )}
      </footer>
    </section>
  );
}
