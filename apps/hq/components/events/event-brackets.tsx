"use client";

import { Button, Chip, Segmented, useConfirm } from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { finalizeDivisionAction } from "@/app/(next)/(hq)/events/actions";
import { unwrap } from "../money/money-action-result";
import { PageSection } from "../shell/page-header";
import { failed } from "./event-actions";
import { MatchCard } from "./event-match";
import type { DivisionView, EventPermissions, EventView } from "./events-model";

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/**
 * Brackets and results, one division at a time: its gates (seeds, draw,
 * live) with Finalize where it is the next step, the pools' standings and
 * the bracket's rounds on the score card. Making the draw, choosing its
 * format and swapping pool teams stay in the division's controls.
 */
export function EventBrackets({
  view,
  permissions,
}: {
  readonly view: EventView;
  readonly permissions: EventPermissions;
}) {
  const [current, setCurrent] = useState(view.divisions[0]?.id ?? "");
  const division =
    view.divisions.find((entry) => entry.id === current) ?? view.divisions[0];
  if (!division) {
    return (
      <p className="ev-quiet">
        No divisions yet. Add them in the event studio.
      </p>
    );
  }
  const editable =
    permissions.change &&
    view.status !== "cancelled" &&
    view.segment !== "past";
  return (
    <div className="ev-stack">
      {view.divisions.length > 1 ? (
        view.divisions.length <= 4 ? (
          <Segmented
            aria-label="Division"
            onValueChange={(value) => setCurrent(value as string)}
            options={view.divisions.map((entry) => ({
              value: entry.id,
              label: entry.name,
            }))}
            value={division.id}
          />
        ) : (
          <div aria-label="Division" className="ev-actions" role="group">
            {view.divisions.map((entry) => (
              <Button
                aria-pressed={entry.id === division.id}
                key={entry.id}
                onClick={() => setCurrent(entry.id)}
                size="sm"
                variant={entry.id === division.id ? "primary" : "secondary"}
              >
                {entry.name}
              </Button>
            ))}
          </div>
        )
      ) : null}
      <Gates division={division} editable={editable} eventId={view.id} />
      {division.kob?.length
        ? division.kob.map((stage) => (
            <PageSection
              flush
              id={`kob-${stage.stageIndex}`}
              key={stage.stageIndex}
              title={`${stage.name}${stage.complete ? " · final" : ""}`}
            >
              <table className="ev-table">
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Wins</th>
                    <th scope="col">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {stage.players.map((player) => (
                    <tr key={player.personId}>
                      <th scope="row">
                        {player.rank}. {player.name}
                        {player.advances ? " · advances" : ""}
                      </th>
                      <td>{player.wins}</td>
                      <td>{player.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PageSection>
          ))
        : null}
      {division.pools.length > 0 ? (
        <div className="ev-pools">
          {division.pools.map((pool) => (
            <PageSection
              flush
              id={`pool-${division.id}-${pool.key}`}
              key={pool.key}
              title={`Pool ${pool.key} · ${pool.played} of ${pool.total} played`}
            >
              <table className="ev-table">
                <thead>
                  <tr>
                    <th scope="col">Team</th>
                    <th scope="col">
                      <abbr title="Won and lost">W–L</abbr>
                    </th>
                    <th scope="col">
                      <abbr title="Set difference">Sets</abbr>
                    </th>
                    <th scope="col">
                      <abbr title="Point difference">Pts</abbr>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pool.standings.map((row, index) => (
                    <tr key={row.team}>
                      <th scope="row">
                        {pool.played > 0 ? `${index + 1}. ` : ""}
                        {row.team}
                      </th>
                      <td>
                        {row.wins}–{row.losses}
                      </td>
                      <td>
                        {pool.played > 0 ? signed(row.setDifferential) : "–"}
                      </td>
                      <td>
                        {pool.played > 0 ? signed(row.pointDifferential) : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PageSection>
          ))}
        </div>
      ) : null}
      {division.rounds.length > 0 ? (
        <PageSection id={`rounds-${division.id}`} title="Bracket">
          <div className="ev-rounds" role="list">
            {division.rounds.map((round) => (
              <section
                aria-label={round.label}
                className="ev-round"
                key={round.key}
                role="listitem"
              >
                <h3 className="ev-label">{round.label}</h3>
                {round.matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    timeZone={view.timeZone}
                  />
                ))}
              </section>
            ))}
          </div>
        </PageSection>
      ) : null}
      {division.pools.length === 0 &&
      division.rounds.length === 0 &&
      !division.kob?.length ? (
        <p className="ev-quiet">
          {division.hasBracket
            ? "The draw is made; pools and rounds appear as soon as they are published to the results view."
            : "No draw yet. Make it in the division's controls once the seeds are final."}
        </p>
      ) : null}
    </div>
  );
}

function Gates({
  division,
  editable,
  eventId,
}: {
  readonly division: DivisionView;
  readonly editable: boolean;
  readonly eventId: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const finalize = (step: "seeds" | "draw") =>
    void confirm
      .run({
        tier: "confirm",
        title:
          step === "seeds"
            ? `Finalize the seeds for ${division.name}?`
            : `Finalize the draw for ${division.name}?`,
        description:
          step === "seeds"
            ? `The ${division.confirmed} teams' seeds are locked; the draw is made from them.`
            : "The pools and bracket are locked; matches can then be scheduled and published.",
        affected: "Players see them when the event is published and set live.",
        verb: step === "seeds" ? "Finalize seeds" : "Finalize draw",
        cancelLabel: "Not yet",
        agentConfirm: `Finalizes the ${step} for ${division.name}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await finalizeDivisionAction({
              sessionId: eventId,
              divisionId: division.id,
              step,
              idempotencyKey,
            }),
          ),
        success: step === "seeds" ? "Seeds are final" : "Draw is final",
        report: failed("hq.events.finalize_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });
  return (
    <PageSection
      aside={
        <a
          className="ev-link"
          href={`/events/${eventId}/divisions/${division.id}`}
        >
          Division controls
        </a>
      }
      flush
      id={`gates-${division.id}`}
      title={`${division.name} · ${division.format}`}
    >
      <div className="ev-gates">
        <Chip tone={division.seedsFinal ? "positive" : "neutral"}>
          Seeds {division.seedsFinal ? "final" : "open"}
        </Chip>
        <Chip tone={division.drawFinal ? "positive" : "neutral"}>
          {division.hasBracket
            ? `Draw ${division.drawFinal ? "final" : "open"}`
            : "No draw yet"}
        </Chip>
        <Chip tone="neutral">
          {division.scheduled} of {division.matchCount} scheduled
        </Chip>
        {division.live ? <Chip tone="positive">Published</Chip> : null}
        {editable && !division.seedsFinal ? (
          <Button onClick={() => finalize("seeds")} size="sm" variant="primary">
            Finalize seeds
          </Button>
        ) : editable && division.hasBracket && !division.drawFinal ? (
          <Button onClick={() => finalize("draw")} size="sm" variant="primary">
            Finalize draw
          </Button>
        ) : null}
      </div>
      {confirm.dialog}
    </PageSection>
  );
}
