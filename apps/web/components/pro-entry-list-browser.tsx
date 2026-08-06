"use client";

import type { PublicProEvent } from "@duna/api";
import { Numeric } from "@duna/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CountryCode } from "@/components/country-code";

type TeamEntry = PublicProEvent["teamEntries"][number];
type EntryList = TeamEntry["list"];

const labels: Readonly<Record<EntryList, string>> = {
  "main-draw": "Main draw",
  qualification: "Qualification",
  reserve: "Reserve",
  withdrawn: "Withdrawn",
  league: "League",
};

export function ProEntryListBrowser({
  entries,
}: {
  readonly entries: readonly TeamEntry[];
}) {
  const lists = useMemo(
    () =>
      (["main-draw", "qualification", "reserve", "withdrawn"] as const).filter(
        (list) => entries.some((entry) => entry.list === list),
      ),
    [entries],
  );
  const [selected, setSelected] = useState<EntryList>(lists[0] ?? "main-draw");
  const visibleEntries = entries.filter((entry) => entry.list === selected);

  return (
    <div className="pro-entry-browser">
      <div
        aria-label="Entry list"
        className="pro-entry-browser__filters"
        role="tablist"
      >
        {lists.map((list) => (
          <button
            aria-controls="pro-entry-table"
            aria-selected={selected === list}
            key={list}
            onClick={() => setSelected(list)}
            role="tab"
            type="button"
          >
            {labels[list]}{" "}
            <span>{entries.filter((entry) => entry.list === list).length}</span>
          </button>
        ))}
      </div>
      <div className="pro-entry-list" id="pro-entry-table" role="tabpanel">
        <div className="pro-entry-list__head">
          <span>Seed</span>
          <span>Team</span>
          <span>Country</span>
          <span>Entry pts</span>
          <span>Technical</span>
        </div>
        {visibleEntries.map((team) => (
          <article
            className={
              selected === "withdrawn"
                ? "pro-entry-team pro-entry-team--withdrawn"
                : "pro-entry-team"
            }
            key={`${selected}-${team.externalTeamId}`}
          >
            <Numeric>{team.seed ?? "—"}</Numeric>
            <div>
              <strong>{team.label}</strong>
              <span>
                {team.players.map((player, index) => (
                  <span key={player.personId ?? player.externalPersonId}>
                    {index > 0 && " / "}
                    {(player.publicPath ?? player.handle) ? (
                      <Link
                        href={player.publicPath ?? `/players/${player.handle}`}
                      >
                        {player.name}
                      </Link>
                    ) : (
                      player.name
                    )}
                  </span>
                ))}
              </span>
            </div>
            <span
              aria-label={team.countryCode ?? "Country pending"}
              className="pro-entry-team__country"
            >
              <CountryCode code={team.countryCode} fallback="—" />
            </span>
            <span>{team.entryPoints?.toLocaleString("en-US") ?? "—"}</span>
            <span>
              {team.entryTechnicalPoints?.toLocaleString("en-US") ?? "—"}
            </span>
          </article>
        ))}
      </div>
    </div>
  );
}
