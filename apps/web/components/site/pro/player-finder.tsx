"use client";

import { Avatar, Icon, Input, Segmented } from "@duna/ui/tideline";
import Link from "@/components/site/site-link";
import { useDeferredValue, useMemo, useState } from "react";

export interface ProFinderPlayer {
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

function searchText(player: ProFinderPlayer) {
  return [
    player.displayName,
    player.countryCode,
    player.gender === "men" ? "men mens male" : "women womens female",
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
}

function PlayerRow({ player }: { readonly player: ProFinderPlayer }) {
  return (
    <Link className="site-player" href={player.publicPath}>
      <span className="td-num site-player__rank">{player.worldRank}</span>
      <Avatar name={player.displayName} size="sm" src={player.avatarUrl} />
      <span className="site-player__name">
        <b>{player.displayName}</b>
        <span className="site-meta">
          {player.countryCode ?? "Country not listed"} ·{" "}
          <span className="td-num">{player.points.toFixed(0)}</span> pts
        </span>
      </span>
      <span className="site-player__rating">
        {player.sandRating !== undefined ? (
          <>
            <span className="site-meta">Sand Rating</span>
            <b className="td-num">{player.sandRating.toFixed(2)}</b>
          </>
        ) : null}
      </span>
      <Icon name="chevron-right" size="inline" />
    </Link>
  );
}

/**
 * Who to watch: the world's top players from the ranking feed, men or
 * women, with a search across every ranked player who has a Duna profile.
 * Without script the server-rendered top list is there and links work.
 */
export function PlayerFinder({
  players,
}: {
  readonly players: readonly ProFinderPlayer[];
}) {
  const [gender, setGender] = useState<"men" | "women">("men");
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query.trim().toLocaleLowerCase());
  const top = useMemo(
    () =>
      players
        .filter((player) => player.gender === gender)
        .toSorted(
          (left, right) =>
            left.worldRank - right.worldRank ||
            left.displayName.localeCompare(right.displayName),
        )
        .slice(0, 10),
    [gender, players],
  );
  const results = useMemo(() => {
    if (deferred.length < 2) return [];
    return players
      .filter((player) => searchText(player).includes(deferred))
      .toSorted((left, right) => left.worldRank - right.worldRank)
      .slice(0, 12);
  }, [deferred, players]);
  const searching = deferred.length >= 2;
  return (
    <div className="site-finder">
      <div className="site-finder__bar">
        <Input
          aria-label="Search players by name or country"
          icon={<Icon name="search" />}
          onValueChange={(value) => setQuery(String(value ?? ""))}
          placeholder="Search by name or country"
          type="search"
          value={query}
        />
        <Segmented
          aria-label="Ranking"
          onValueChange={(value) => setGender(value as "men" | "women")}
          options={[
            { value: "men", label: "Men" },
            { value: "women", label: "Women" },
          ]}
          value={gender}
        />
      </div>
      <p aria-live="polite" className="td-sr">
        {searching ? `${results.length} players found` : ""}
      </p>
      {searching && results.length === 0 ? (
        <p className="site-empty">No ranked player matches “{query.trim()}”.</p>
      ) : (
        <ol className="site-players">
          {(searching ? results : top).map((player) => (
            <li key={player.id}>
              <PlayerRow player={player} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
