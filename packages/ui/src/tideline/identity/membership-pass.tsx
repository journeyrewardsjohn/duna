"use client";

import {
  cardPassBack,
  clubMarkModel,
  SALT,
  encodeQr,
  passSecondsLeft,
  qrPath,
  type CardKind,
  type MembershipPassData,
  type MembershipStatus,
} from "@duna/tideline-core";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { CrestMark } from "../motion/crest";
import { ClubMark } from "./club-mark";
import type { MembershipCardClub } from "./membership-card-types";

/** A QR Code drawn as one SVG path from the exact payload (no dependency). */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  /** The accessible name ("Check-in code for Noa Williams"). */
  label: string;
  className?: string;
}) {
  const drawn = useMemo(() => {
    try {
      const matrix = encodeQr(value, "M");
      return { size: matrix.size + 8, path: qrPath(matrix) };
    } catch {
      return null;
    }
  }, [value]);
  if (!drawn) return null;
  return (
    <svg
      aria-label={label}
      className={cx("td-qr", className)}
      role="img"
      shapeRendering="crispEdges"
      viewBox={`0 0 ${drawn.size} ${drawn.size}`}
    >
      <rect className="td-qr__ground" height={drawn.size} width={drawn.size} />
      <path className="td-qr__modules" d={drawn.path} />
    </svg>
  );
}

export interface MembershipPassProps {
  club: MembershipCardClub;
  member: string;
  heldBy?: string;
  plan?: string;
  kind?: CardKind;
  status: MembershipStatus;
  number?: string | null;
  validThrough?: string;
  /** Formatted pause end or end date. */
  until?: string;
  /** What the server supplies; `null` or absent is the honest "no pass yet". */
  pass?: MembershipPassData | null;
  className?: string;
}

function useCountdown(refreshesAt: string | undefined): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!refreshesAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [refreshesAt]);
  return refreshesAt && now !== null ? passSecondsLeft(refreshesAt, now) : null;
}

/**
 * The back of a card: the check-in pass. Text first (member, status in
 * words, plan, number, valid-through, guardian), with the code drawn from
 * exactly what the server sent. Today that is the Duna-wide member
 * credential, labelled as such; a rotating per-club code shows its
 * countdown. Pending, ended and passless cards say why, with no code.
 */
export function MembershipPass({
  club,
  member,
  heldBy,
  plan,
  kind,
  status,
  number,
  validThrough,
  until,
  pass,
  className,
}: MembershipPassProps) {
  const back = cardPassBack({
    club: club.name,
    status,
    ...(kind ? { kind } : {}),
    ...(pass !== undefined ? { pass } : {}),
    ...(until ? { until } : {}),
  });
  const brand = clubMarkModel({ ...club, size: 24 });
  const bandStyle = {
    "--td-mpass-club": brand.background,
    "--td-mpass-on-club":
      brand.foreground === SALT
        ? "var(--td-brand-salt)"
        : "var(--td-brand-night-court)",
  } as CSSProperties;
  const seconds = useCountdown(
    back.kind === "code" ? back.refreshesAt : undefined,
  );
  return (
    <div className={cx("td-mpass", className)} data-pass={back.kind}>
      <div className="td-mpass__band" style={bandStyle}>
        <ClubMark {...club} decorative size={24} />
        <span className="td-mpass__club">{club.name}</span>
        <span className="td-mpass__kicker">Check-in pass</span>
      </div>
      {back.kind === "code" ? (
        <div className="td-mpass__body">
          <QrCode
            className="td-mpass__qr"
            label={`Check-in code for ${member}`}
            value={back.code}
          />
          <div className="td-mpass__info">
            <span className="td-mpass__member">{member}</span>
            <span className="td-mpass__status" data-status={status}>
              <Icon
                name={back.statusIcon === "pause" ? "timeout" : "check"}
                size="chip"
              />
              {back.statusLine}
            </span>
            <span className="td-mpass__meta">
              {[
                plan,
                number ? `No. ${number}` : back.reference,
                validThrough && kind !== "day"
                  ? `Valid to ${validThrough}`
                  : null,
                heldBy ? `Guardian ${heldBy}` : null,
              ]
                .filter(Boolean)
                .map((line) => (
                  <span key={line}>{line}</span>
                ))}
            </span>
            <span className="td-mpass__note">
              {back.rotation === "rotating" ? (
                <>
                  <Icon name="undo" size="chip" />
                  {seconds === null
                    ? "Code changes every 30 seconds"
                    : `New code in 0:${String(seconds).padStart(2, "0")}`}
                </>
              ) : (
                <>
                  <CrestMark className="td-mpass__crest" micro />
                  {back.label}
                  {back.reference ? ` · ${back.reference}` : ""}
                </>
              )}
            </span>
          </div>
        </div>
      ) : (
        <div className="td-mpass__none" data-reason={back.reason}>
          <span className="td-mpass__title">{back.title}</span>
          <span className="td-mpass__text">{back.text}</span>
        </div>
      )}
    </div>
  );
}
