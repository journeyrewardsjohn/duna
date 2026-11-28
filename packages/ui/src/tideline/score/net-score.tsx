import type { SetRow, Side } from "@duna/tideline-core";
import type { ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { NumberChange } from "../motion/motion";
import { NetScoreAnnouncer } from "./net-score-announcer";
import {
  netScoreModel,
  type NetScoreModel,
  type NetScoreModelInput,
} from "./net-score-model";

export type NetScoreLayout = "net" | "rows" | "compact" | "auto";
export type NetScoreSize = "sm" | "md" | "lg";

export interface NetScoreProps extends NetScoreModelInput {
  /**
   * `net` the full card (result screens, share card, hero); `rows` the
   * scoreboard table (lists, tables, HQ); `compact` one line (chips, map
   * callouts); `auto` (default) the card, switching to rows under 320 px of
   * container width.
   */
  layout?: NetScoreLayout;
  /** Card scale. The net is 1.5 px, 2 px only at `lg`. */
  size?: NetScoreSize;
  /**
   * Say live changes politely (default on while live). Turn it off when
   * several live cards share a screen and only one should speak.
   */
  announce?: boolean;
  /**
   * Draw a live card in the live zone (Night Court ground, Solar chip).
   * Default on; turn off inside a surface that is already the live zone.
   */
  liveZone?: boolean;
  /** Extra content under the card (actions, a link to the match). */
  footer?: ReactNode;
  className?: string;
}

function Badge({
  kind,
  provisional,
}: {
  kind: "check" | "trophy";
  provisional: boolean;
}) {
  return (
    <span
      className={cx(
        "td-ns__badge",
        kind === "trophy" && "td-ns__badge--trophy",
        provisional && "td-ns__badge--hollow",
      )}
      title={provisional ? "Ahead, to be confirmed" : "Won"}
    >
      <Icon name={kind === "trophy" ? "trophy" : "check"} size="chip" />
    </span>
  );
}

function badgeFor(model: NetScoreModel, side: Side): ReactNode {
  const { state } = model;
  if (state.winner !== side) return null;
  return (
    <Badge
      kind={state.winnerBadge === "trophy" ? "trophy" : "check"}
      provisional={state.winnerProvisional}
    />
  );
}

function Name({
  model,
  side,
  lines = 2,
}: {
  model: NetScoreModel;
  side: Side;
  lines?: 1 | 2;
}) {
  const name = model.names[side];
  return (
    <span
      className={cx("td-ns__name", lines === 1 && "td-ns__name--one")}
      title={name}
    >
      {name}
    </span>
  );
}

function Team({ model, side }: { model: NetScoreModel; side: Side }) {
  const { state } = model;
  const winning = state.winner === side;
  const losing = state.winner !== null && !winning;
  return (
    <div
      className={cx("td-ns__team", `td-ns__team--${side}`)}
      data-lose={losing && !state.winnerProvisional ? "" : undefined}
      data-win={winning ? "" : undefined}
    >
      {side === "home" ? badgeFor(model, side) : null}
      <Name model={model} side={side} />
      {state.serving === side ? (
        <span className="td-ns__serve" title="Serving" />
      ) : null}
      {side === "away" ? badgeFor(model, side) : null}
    </div>
  );
}

function Num({ value, win }: { value: number; win: boolean }) {
  return (
    <NumberChange
      className={cx("td-ns__num", win && "td-ns__num--win")}
      value={value}
    />
  );
}

function setLabel(model: NetScoreModel, row: SetRow): string {
  if (row.state === "unfinished") return `Set ${row.number} · stopped`;
  if (row.state === "in-progress") return `Set ${row.number} · now`;
  return `Set ${row.number}`;
}

function NetLayout({ model }: { model: NetScoreModel }) {
  const { state, big, look } = model;
  // While live the set in play is the big pair, so it is not repeated below.
  const rows = state.rows.filter((row) => row.state !== "in-progress");
  return (
    <table className="td-ns__table">
      <thead>
        <tr className="td-ns__names">
          <th className="td-ns__lab" scope="col" />
          <th className="td-ns__side td-ns__side--home" scope="col">
            <Team model={model} side="home" />
          </th>
          <th className="td-ns__gap" scope="col" />
          <th className="td-ns__side td-ns__side--away" scope="col">
            <Team model={model} side="away" />
          </th>
        </tr>
      </thead>
      <tbody>
        {big ? (
          <tr className="td-ns__big">
            <th className="td-ns__lab" scope="row">
              {big.label}
            </th>
            <td className="td-ns__pt td-ns__pt--home">
              <Num
                value={big.home}
                win={
                  !look.muted &&
                  (state.winner === "home" ||
                    (model.status === "live" && big.home > big.away))
                }
              />
            </td>
            <td className="td-ns__net" />
            <td className="td-ns__pt td-ns__pt--away">
              <Num
                value={big.away}
                win={
                  !look.muted &&
                  (state.winner === "away" ||
                    (model.status === "live" && big.away > big.home))
                }
              />
            </td>
          </tr>
        ) : (
          <tr className="td-ns__empty">
            <th className="td-ns__lab" scope="row" />
            <td className="td-ns__pending" colSpan={3}>
              {model.status === "cancelled"
                ? "No score"
                : model.status === "forfeit"
                  ? "No sets played"
                  : "Score pending"}
            </td>
          </tr>
        )}
        {big && big.label !== "Points"
          ? rows.map((row) => (
              <tr
                className={cx(
                  "td-ns__set",
                  row.number === model.decidingSet && "td-ns__set--decider",
                  row.state === "unfinished" && "td-ns__set--open",
                )}
                key={row.number}
              >
                <th className="td-ns__lab" scope="row">
                  {setLabel(model, row)}
                </th>
                <td className="td-ns__pt td-ns__pt--home">
                  <Num
                    value={row.home}
                    win={!look.muted && row.winningSide === "home"}
                  />
                </td>
                <td className="td-ns__net" />
                <td className="td-ns__pt td-ns__pt--away">
                  <Num
                    value={row.away}
                    win={!look.muted && row.winningSide === "away"}
                  />
                </td>
              </tr>
            ))
          : null}
      </tbody>
    </table>
  );
}

function RowsLayout({ model }: { model: NetScoreModel }) {
  const { state, look } = model;
  const won = { home: 0, away: 0 };
  for (const row of state.rows) if (row.winningSide) won[row.winningSide] += 1;
  const showNumbers = look.numbers && state.rows.length > 0;
  return (
    <table className="td-ns__board">
      <thead className={showNumbers ? undefined : "td-sr"}>
        <tr>
          <th className="td-ns__boardteam" scope="col">
            Team
          </th>
          {showNumbers
            ? state.rows.map((row) => (
                <th
                  className={cx(
                    "td-ns__col",
                    row.state === "in-progress" && "td-ns__col--now",
                    row.number === model.decidingSet && "td-ns__col--decider",
                  )}
                  key={row.number}
                  scope="col"
                >
                  {row.number}
                </th>
              ))
            : null}
          {showNumbers ? (
            <th className="td-ns__col td-ns__col--sets" scope="col">
              Sets
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {(["home", "away"] as const).map((side) => (
          <tr key={side}>
            <th className="td-ns__boardteam" scope="row">
              <Team model={model} side={side} />
            </th>
            {showNumbers
              ? state.rows.map((row) => (
                  <td
                    className={cx(
                      "td-ns__cell",
                      row.state === "in-progress" && "td-ns__col--now",
                      row.state === "unfinished" && "td-ns__cell--open",
                      row.number === model.decidingSet && "td-ns__col--decider",
                    )}
                    key={row.number}
                  >
                    <Num
                      value={row[side]}
                      win={!look.muted && row.winningSide === side}
                    />
                  </td>
                ))
              : null}
            {showNumbers ? (
              <td className="td-ns__cell td-ns__cell--sets">
                <Num
                  value={won[side]}
                  win={!look.muted && state.winner === side}
                />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CompactLayout({ model }: { model: NetScoreModel }) {
  const { big, look, state } = model;
  return (
    <span className="td-ns__line">
      <span
        className="td-ns__lineteam"
        data-win={state.winner === "home" ? "" : undefined}
      >
        {badgeFor(model, "home")}
        <Name lines={1} model={model} side="home" />
      </span>
      {big ? (
        <span
          className={cx(
            "td-ns__linescore",
            look.muted && "td-ns__linescore--muted",
          )}
        >
          <Num value={big.home} win={false} />
          <span aria-hidden="true">–</span>
          <Num value={big.away} win={false} />
        </span>
      ) : (
        <span className="td-ns__linescore td-ns__linescore--words">vs</span>
      )}
      <span
        className="td-ns__lineteam"
        data-win={state.winner === "away" ? "" : undefined}
      >
        <Name lines={1} model={model} side="away" />
        {badgeFor(model, "away")}
      </span>
    </span>
  );
}

function StatusChip({ model }: { model: NetScoreModel }) {
  const { look } = model;
  return (
    <span
      className={cx(
        "td-chip td-chip--status",
        look.tone !== "neutral" && `td-chip--${look.tone}`,
        "td-ns__chip",
      )}
    >
      {model.statusText}
    </span>
  );
}

/**
 * The match score card (contract R16): a hairline net, set-by-set scores as
 * a table mirrored across the net in Geist Mono, a green check for the
 * winner (a trophy only for a title match; hollow while it waits for
 * confirmation), and one designed state for every `match_status`, plus
 * "not finished" for a match stopped part-way. Only live wears Solar.
 *
 * A screen reader hears one sentence (who played, who won, the set scores,
 * the state); a live score change is said politely and never more than once
 * every two seconds; a changed digit Rallies in place.
 */
export function NetScore({
  layout = "auto",
  size = "md",
  announce,
  liveZone = true,
  footer,
  className,
  ...input
}: NetScoreProps) {
  const model = netScoreModel(input);
  const live = model.status === "live";
  const title = typeof input.title === "string" ? input.title : null;
  const head = layout !== "compact" && (
    <div className="td-ns__head">
      <StatusChip model={model} />
      {title ? <span className="td-ns__title">{title}</span> : null}
      {live && model.state.setsWon ? (
        <span className="td-ns__setswon td-num">
          Sets {model.state.setsWon.home}–{model.state.setsWon.away}
        </span>
      ) : null}
    </div>
  );
  return (
    <section
      className={cx(
        "td-ns",
        `td-ns--${layout}`,
        `td-ns--${size}`,
        live && liveZone && "td",
        className,
      )}
      data-status={model.status}
      data-zone={live && liveZone ? "live" : undefined}
    >
      <p className="td-sr">{model.sentence}</p>
      <div aria-hidden="true" className="td-ns__body">
        {layout === "compact" ? (
          <>
            <CompactLayout model={model} />
            <StatusChip model={model} />
          </>
        ) : (
          <>
            {head}
            {layout === "net" || layout === "auto" ? (
              <div className="td-ns__netview">
                <NetLayout model={model} />
              </div>
            ) : null}
            {layout === "rows" || layout === "auto" ? (
              <div className="td-ns__rowsview">
                <RowsLayout model={model} />
              </div>
            ) : null}
            {model.meta ? <p className="td-ns__meta">{model.meta}</p> : null}
          </>
        )}
      </div>
      {live && announce !== false ? (
        <NetScoreAnnouncer names={model.names} state={model.state} />
      ) : null}
      {footer ? <div className="td-ns__footer">{footer}</div> : null}
    </section>
  );
}
