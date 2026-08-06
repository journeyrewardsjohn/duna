"use client";

import { ArrowRight, Search, Trophy, X } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { CountryCode } from "@/components/country-code";

export interface ProDiscoveryPlayer {
  readonly id: string;
  readonly displayName: string;
  readonly publicPath: string;
  readonly gender: "men" | "women";
  readonly worldRank: number;
  readonly points: number;
  readonly countryCode?: string;
  readonly avatarUrl?: string;
  readonly sandRating?: number;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function playerSearchText(player: ProDiscoveryPlayer) {
  return [
    player.displayName,
    player.countryCode,
    player.gender === "men" ? "men mens male" : "women womens female",
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

export function ProPlayerDiscovery({
  players,
}: {
  readonly players: readonly ProDiscoveryPlayer[];
}) {
  const [gender, setGender] = useState<"men" | "women">("men");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const topPlayers = useMemo(
    () =>
      players
        .filter((player) => player.gender === gender)
        .sort((left, right) => left.worldRank - right.worldRank)
        .slice(0, 8),
    [gender, players],
  );
  const searchResults = useMemo(() => {
    if (!deferredQuery) return [];
    return players
      .filter((player) => playerSearchText(player).includes(deferredQuery))
      .sort(
        (left, right) =>
          left.worldRank - right.worldRank ||
          left.displayName.localeCompare(right.displayName),
      )
      .slice(0, 12);
  }, [deferredQuery, players]);

  return (
    <section className="pro-player-discovery" id="players">
      <header>
        <div>
          <span className="page-eyebrow">Player directory</span>
          <h2>Know who to watch.</h2>
          <p>
            Meet the athletes at the top of the world tour, then search every
            connected pro profile for ratings, form, partners, and match
            history.
          </p>
        </div>
        <div
          aria-label="Top professional player category"
          className="pro-player-discovery__toggle"
          role="group"
        >
          {(["men", "women"] as const).map((option) => (
            <button
              aria-pressed={gender === option}
              key={option}
              onClick={() => setGender(option)}
              type="button"
            >
              {option === "men" ? "Men" : "Women"}
            </button>
          ))}
        </div>
      </header>

      <div className="pro-player-discovery__topline">
        <span>
          <Trophy aria-hidden size={16} /> Top pros · {gender}
        </span>
        <Link href={`/rankings?view=world&gender=${gender}`}>
          Full rankings <ArrowRight aria-hidden size={15} />
        </Link>
      </div>
      <div className="pro-player-discovery__grid">
        {topPlayers.map((player) => (
          <Link
            aria-label={`View ${player.displayName}'s player profile`}
            className="pro-player-card"
            href={player.publicPath}
            key={`${player.gender}-${player.id}`}
          >
            <div
              className="pro-player-card__portrait"
              style={
                player.avatarUrl
                  ? { backgroundImage: `url("${player.avatarUrl}")` }
                  : undefined
              }
            >
              <span className="pro-player-card__rank">
                World #{player.worldRank}
              </span>
              {!player.avatarUrl && (
                <strong>{initials(player.displayName)}</strong>
              )}
            </div>
            <div className="pro-player-card__copy">
              <span>
                <CountryCode code={player.countryCode} />
              </span>
              <h3>{player.displayName}</h3>
              <dl>
                <div>
                  <dt>Tour points</dt>
                  <dd>{player.points.toLocaleString("en-US")}</dd>
                </div>
                <div>
                  <dt>Sand Rating</dt>
                  <dd>{player.sandRating?.toFixed(2) ?? "—"}</dd>
                </div>
              </dl>
              <span className="pro-player-card__open">
                Player profile <ArrowRight aria-hidden size={14} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="pro-player-search">
        <div>
          <label htmlFor="pro-player-search">Find a player</label>
          <p>Search the connected men&apos;s and women&apos;s pro directory.</p>
        </div>
        <div className="pro-player-search__field">
          <Search aria-hidden size={20} />
          <input
            autoComplete="off"
            id="pro-player-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by player name or country"
            type="search"
            value={query}
          />
          {query && (
            <button
              aria-label="Clear player search"
              onClick={() => setQuery("")}
              type="button"
            >
              <X aria-hidden size={17} />
            </button>
          )}
        </div>
        {deferredQuery && (
          <div className="pro-player-search__results" role="region">
            <p aria-live="polite">
              {searchResults.length > 0
                ? `${searchResults.length} player${searchResults.length === 1 ? "" : "s"} found`
                : "No connected pro profiles match that search yet."}
            </p>
            {searchResults.length > 0 && (
              <div>
                {searchResults.map((player) => (
                  <Link
                    href={player.publicPath}
                    key={`search-${player.gender}-${player.id}`}
                  >
                    <span
                      className="pro-player-search__avatar"
                      style={
                        player.avatarUrl
                          ? {
                              backgroundImage: `url("${player.avatarUrl}")`,
                            }
                          : undefined
                      }
                    >
                      {!player.avatarUrl ? initials(player.displayName) : null}
                    </span>
                    <span>
                      <strong>{player.displayName}</strong>
                      <small>
                        <CountryCode code={player.countryCode} /> · World #
                        {player.worldRank} · {player.gender}
                      </small>
                    </span>
                    <span>
                      {player.sandRating?.toFixed(2) ?? "—"}
                      <small>Sand Rating</small>
                    </span>
                    <ArrowRight aria-hidden size={17} />
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
