import {
  clubMarkModel,
  MEMBERSHIP_STATUS_TEXT,
  membershipPassModel,
  SALT,
  type MembershipStatus,
} from "@duna/tideline-core";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { CrestMark } from "../motion/crest";
import { riseClassName } from "../motion/verbs";
import { ClubMark, type ClubMarkProps } from "./club-mark";

export type MembershipCardClub = Pick<
  ClubMarkProps,
  | "name"
  | "color"
  | "logo"
  | "logoLight"
  | "logoDark"
  | "tile"
  | "source"
  | "worksSmall"
>;

export interface MembershipCardProps {
  club: MembershipCardClub;
  /** The member's name as the club knows it. */
  member: string;
  /** The plan ("Annual member"). */
  plan?: string;
  /** What kind of card ("Club member", "Approved player · public beach"). */
  kind?: string;
  status: MembershipStatus;
  /** Overrides the chip words. */
  statusText?: string;
  /** When it is valid through or ended, already formatted ("Nov 30, 2026"). */
  validThrough?: string;
  /** "Member since Mar 2024". */
  since?: string;
  /** One more line from the club (credits left, renewal as `[date]`). */
  line?: string;
  /** The pass code from the server. Never invent one. */
  code?: string | null;
  /** The scannable code drawn from the server pass token (a QR component). */
  qr?: ReactNode;
  /** An approved club photograph behind the club band. */
  image?: string;
  /** The 64 px strip used in the wallet stack. */
  compact?: boolean;
  /** Rise when it first renders. Default on. */
  rise?: boolean;
  className?: string;
}

function validityText(status: MembershipStatus, validThrough?: string) {
  if (!validThrough) return null;
  if (status === "expired") return `Ended ${validThrough}`;
  return `Valid through ${validThrough}`;
}

/** The membership state as a status chip: the brand never fades, the chip says it. */
export function MembershipStatusChip({
  status,
  text,
}: {
  status: MembershipStatus;
  text?: string;
}) {
  const tone =
    status === "active"
      ? "td-chip--positive"
      : status === "pending"
        ? "td-chip--info"
        : status === "paused"
          ? "td-chip--warning"
          : null;
  return (
    <span className={cx("td-chip td-chip--status td-mcard__chip", tone)}>
      {text ?? MEMBERSHIP_STATUS_TEXT[status]}
    </span>
  );
}

/**
 * A member's card for a club: the club's mark on its colour (and its photo,
 * if it gave one), the member, plan, status and validity, and a code area
 * that is honest when there is no pass to scan. On Salt in light, on Dune in
 * dark. Pending, paused and expired never desaturate the club's brand: the
 * state is a chip and a sentence. No tilt, no shine.
 */
export function MembershipCard({
  club,
  member,
  plan,
  kind,
  status,
  statusText,
  validThrough,
  since,
  line,
  code,
  qr,
  image,
  compact = false,
  rise = true,
  className,
}: MembershipCardProps) {
  const pass = membershipPassModel({ status, code, validThrough });
  const validity = validityText(status, validThrough);
  const chipText = statusText ?? MEMBERSHIP_STATUS_TEXT[status];
  const brand = clubMarkModel({ ...club, size: 56 });
  const bandStyle = {
    "--td-mcard-club": brand.background,
    "--td-mcard-on-club":
      image || brand.foreground === SALT
        ? "var(--td-brand-salt)"
        : "var(--td-brand-night-court)",
  } as CSSProperties;
  const label = `${club.name} membership card for ${member}, ${chipText.toLowerCase()}`;

  if (compact) {
    return (
      <article
        aria-label={label}
        className={cx("td-mcard td-mcard--compact", className)}
        data-status={status}
      >
        <ClubMark {...club} decorative size="md" />
        <span className="td-mcard__striptext">
          <span className="td-mcard__club">{club.name}</span>
          <span className="td-mcard__plan">
            {[plan, validity].filter(Boolean).join(" · ") || kind}
          </span>
        </span>
        <MembershipStatusChip status={status} text={statusText} />
      </article>
    );
  }

  return (
    <article
      aria-label={label}
      className={cx("td-mcard", rise && riseClassName(), className)}
      data-status={status}
    >
      <div
        className="td-mcard__band"
        data-photo={image ? "" : undefined}
        style={bandStyle}
      >
        {image ? (
          <img alt="" className="td-mcard__photo" loading="lazy" src={image} />
        ) : null}
        <ClubMark {...club} decorative onPhoto={Boolean(image)} size="lg" />
        <span className="td-mcard__bandtext">
          <span className="td-mcard__club">{club.name}</span>
          {kind ? <span className="td-mcard__kind">{kind}</span> : null}
        </span>
        <CrestMark className="td-mcard__duna" micro />
      </div>
      <div className="td-mcard__face">
        <div className="td-mcard__who">
          <span className="td-mcard__member">{member}</span>
          <MembershipStatusChip status={status} text={statusText} />
        </div>
        {plan || since ? (
          <p className="td-mcard__plan">
            {[plan, since].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        {validity || line ? (
          <p className="td-mcard__line">
            {[validity, line].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <div
          className={cx(
            "td-mcard__pass",
            pass.kind === "message" && "td-mcard__pass--none",
          )}
          data-pass={pass.kind === "code" ? "code" : pass.reason}
        >
          {pass.kind === "code" ? (
            <>
              {qr ? <span className="td-mcard__qr">{qr}</span> : null}
              <span className="td-mcard__code">
                <span className="td-mcard__codelabel">Member code</span>
                <span className="td-mcard__codevalue">{pass.code}</span>
              </span>
            </>
          ) : (
            <>
              <Icon
                name={pass.reason === "pending" ? "clock" : "pass"}
                size="inline"
              />
              <span>{pass.text}</span>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
