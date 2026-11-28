"use client";

import {
  participationDisplay,
  participationLockAt,
  renderParticipationCopy,
  resolveParticipationRuleV2,
  type ParticipationRuleV2,
} from "@duna/core";
import { NumberInput, RallyOnChange } from "@duna/ui/tideline";
import { useId, useMemo, useState } from "react";
import { GroupStatus } from "../participation/group-status";

/**
 * What a player sees: the offering's card with its group line, rendered by
 * the SAME shared display function the apps use. "Try it" moves the number
 * booked so the owner sees each state before players do.
 */
export function OfferingPreview({
  title,
  summary,
  price,
  coverUrl,
  coverAlt,
  rule,
  capacity,
  now,
  timeZone,
  clubName,
  tryIt = false,
}: {
  readonly title: string;
  readonly summary?: string;
  readonly price: string;
  readonly coverUrl?: string;
  readonly coverAlt?: string;
  /** The rule as it would be saved (undefined: capacity only). */
  readonly rule?: ParticipationRuleV2;
  readonly capacity: number;
  readonly now: string;
  readonly timeZone: string;
  readonly clubName: string;
  readonly tryIt?: boolean;
}) {
  const [booked, setBooked] = useState(
    rule ? Math.max(0, rule.minParticipants - 2) : 0,
  );
  const labelId = useId();
  const display = useMemo(() => {
    const at = new Date(now);
    // A session three days out, so the decision time reads as a weekday.
    const startsAt = new Date(at.getTime() + 72 * 3_600_000);
    const resolved = rule
      ? resolveParticipationRuleV2(rule, { capacity })
      : undefined;
    const lockAt = resolved
      ? participationLockAt({
          startsAt,
          lockMinutesBeforeStart: resolved.lockMinutesBeforeStart,
        })
      : undefined;
    return participationDisplay({
      rule: resolved,
      title,
      capacity,
      booked: Math.min(booked, capacity),
      lockAt,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * 60_000),
      now: at,
      timeZone,
      clubName,
      payment: { method: "credit" },
      viewer: { booked: false, quantity: 1 },
    });
  }, [rule, capacity, booked, now, timeZone, clubName, title]);
  const status = renderParticipationCopy(display.status);
  const line = display.line ? renderParticipationCopy(display.line) : undefined;
  return (
    <aside aria-label="What players see" className="of-preview">
      <p className="of-label">What players see</p>
      <article className="of-preview__card">
        {coverUrl ? (
          // Club and library photos are remote; a plain img keeps the preview honest.
          <img
            alt={coverAlt ?? ""}
            className="of-preview__cover"
            src={coverUrl}
          />
        ) : (
          <div
            aria-hidden="true"
            className="of-preview__cover of-preview__cover--empty"
          />
        )}
        <div className="of-preview__body">
          <h3 className="of-preview__title">{title}</h3>
          {summary ? <p className="of-preview__summary">{summary}</p> : null}
          {price ? <p className="of-preview__price">{price}</p> : null}
          <RallyOnChange value={status}>
            <GroupStatus line={line} status={status} tone={display.tone} />
          </RallyOnChange>
          {display.price ? (
            <>
              <p className="of-preview__line">
                {renderParticipationCopy(display.price.line!)}
              </p>
              <ul className="of-preview__ladder">
                {display.price.ladder.map((row) => (
                  <li
                    data-current={row.current || undefined}
                    key={row.minParticipants}
                  >
                    {renderParticipationCopy(row.label)}
                    {row.current && display.price?.currentRow ? (
                      <span className="pt-quiet">
                        {` · ${renderParticipationCopy(display.price.currentRow)}`}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {display.cancellation.line ? (
            <p className="of-preview__line">
              {renderParticipationCopy(display.cancellation.line)}
            </p>
          ) : null}
        </div>
      </article>
      {tryIt && capacity > 1 ? (
        <div className="of-preview__try">
          <span className="of-label" id={labelId}>
            Try it: players booked
          </span>
          <NumberInput
            aria-labelledby={labelId}
            className="pt-sentence__number"
            max={capacity}
            min={0}
            onValueChange={(value) =>
              setBooked(Math.max(0, Math.min(capacity, Math.trunc(value ?? 0))))
            }
            value={booked}
          />
        </div>
      ) : null}
    </aside>
  );
}
