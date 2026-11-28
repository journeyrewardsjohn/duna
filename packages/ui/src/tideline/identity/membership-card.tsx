"use client";

import {
  cardAccessibleName,
  cardArtPalette,
  cardMetaLine,
  cardStateChip,
  defaultCardArt,
  estimateCardContrast,
  measureCardContrast,
  MEMBERSHIP_STATUS_TEXT,
  type CardArtSource,
  type CardContrast,
  type CardPixels,
  type MembershipStatus,
} from "@duna/tideline-core";
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { CardArt } from "./card-art";
import { CardFlip } from "./card-flip";
import { ClubMark } from "./club-mark";
import { MembershipPass } from "./membership-pass";
import type { MembershipCardProps } from "./membership-card-types";

export type {
  MembershipCardClub,
  MembershipCardFace,
  MembershipCardProps,
  WalletCard,
} from "./membership-card-types";

/** Uploads before measurement: a strong dark scrim errs on the side of reading. */
const UPLOAD_CONTRAST: CardContrast = {
  text: "salt",
  scrim: "#0A1218",
  top: 0.72,
  bottom: 0.78,
  ratio: 5,
  glow: "#1A2A33",
};

/** One measurement per piece of art, shared by every card that shows it. */
const measured = new Map<string, CardContrast>();
const artKey = (art: CardArtSource) => JSON.stringify(art);

function initialContrast(art: CardArtSource): CardContrast {
  const known = measured.get(artKey(art));
  if (known) return known;
  const palette = cardArtPalette(art);
  return palette ? estimateCardContrast(palette) : UPLOAD_CONTRAST;
}

/** The membership state as a status chip, for rows and lists outside the card. */
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
    <span className={cx("td-chip td-chip--status", tone)}>
      {text ?? MEMBERSHIP_STATUS_TEXT[status]}
    </span>
  );
}

/**
 * A club's membership card (docs/design/wallet.md): an ID-1 object with
 * full-bleed club art, a keyline and a glass edge; the club mark and name top
 * left, one chip top right, the member bottom left and one live fact bottom
 * right. The art keeps full colour: a measured local scrim brings the type to
 * 5:1. State is a solid Salt chip; nothing fades (R13). No tilt; a pointer
 * sheen that moves only with the pointer. The back is the pass.
 */
export function MembershipCard(props: MembershipCardProps) {
  const {
    club,
    member,
    heldBy,
    plan,
    chip,
    kind,
    status,
    statusText,
    until,
    number,
    since,
    fact,
    face,
    flipped = false,
    onFlip,
    size = "card",
    motion = "auto",
    label,
    className,
  } = props;
  const art = props.art ?? defaultCardArt({ id: club.name, color: club.color });
  const key = artKey(art);
  const [contrast, setContrast] = useState<CardContrast>(() =>
    initialContrast(art),
  );
  const [contrastFor, setContrastFor] = useState(key);
  if (contrastFor !== key) {
    setContrastFor(key);
    setContrast(initialContrast(art));
  }
  const used = props.contrast ?? contrast;
  const onPoster = useCallback(
    (pixels: CardPixels) => {
      if (props.contrast) return;
      const next = measureCardContrast(pixels);
      measured.set(key, next);
      setContrast(next);
    },
    [key, props.contrast],
  );

  const ref = useRef<HTMLElement>(null);
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--td-mcard-mx",
      `${((event.clientX - box.left) / box.width) * 100}%`,
    );
    event.currentTarget.style.setProperty(
      "--td-mcard-my",
      `${((event.clientY - box.top) / box.height) * 100}%`,
    );
  };

  const state = cardStateChip({
    status,
    ...(statusText ? { statusText } : {}),
    ...(until ? { until } : {}),
  });
  const meta = cardMetaLine({
    status,
    ...(number !== undefined ? { number } : {}),
    ...(since ? { since } : {}),
    ...(face ? { face } : {}),
    ...(chip ? { chip } : {}),
  });
  const name =
    label ??
    cardAccessibleName({
      club: club.name,
      ...(plan ? { plan } : {}),
      member,
      ...(heldBy ? { heldBy } : {}),
      status,
      ...(statusText ? { statusText } : {}),
      fact: fact ?? null,
    });
  const style = {
    "--td-mcard-scrim": used.scrim,
    "--td-mcard-st": used.top,
    "--td-mcard-sb": used.bottom,
    "--td-mcard-glow": used.glow,
  } as CSSProperties;

  const front = (
    <span className="td-mcard__face td-mcard__front">
      <CardArt
        animate={motion === "auto" && !flipped && size !== "strip"}
        art={art}
        className="td-mcard__art"
        onPoster={onPoster}
      />
      <span aria-hidden="true" className="td-mcard__scrim" />
      <span aria-hidden="true" className="td-mcard__sheen" />
      <span aria-hidden="true" className="td-mcard__keyline" />
      <span className="td-mcard__top">
        <ClubMark {...club} decorative size={size === "strip" ? 26 : 30} />
        <span className="td-mcard__club">{club.name}</span>
        {state ? (
          <span className="td-mcard__state" data-tone={state.tone}>
            <Icon
              name={
                state.icon === "pause"
                  ? "timeout"
                  : state.icon === "clock"
                    ? "clock"
                    : "alert"
              }
              size="chip"
            />
            {state.text}
          </span>
        ) : chip && face?.chip !== false ? (
          <span className="td-mcard__chip">{chip}</span>
        ) : null}
      </span>
      {size === "strip" ? null : (
        <span className="td-mcard__bottom">
          <span className="td-mcard__who">
            <span className="td-mcard__member">{member}</span>
            {heldBy ? (
              <span className="td-mcard__held">{`Held by ${heldBy}, guardian`}</span>
            ) : null}
            {meta ? <span className="td-mcard__meta">{meta}</span> : null}
          </span>
          {fact && status !== "pending" ? (
            <span className="td-mcard__fact" data-kind={fact.kind}>
              {fact.text}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );

  const back =
    size === "strip" ? null : (
      <span className="td-mcard__face td-mcard__back">
        <MembershipPass
          club={club}
          member={member}
          status={status}
          {...(heldBy ? { heldBy } : {})}
          {...(plan ? { plan } : {})}
          {...(kind ? { kind } : {})}
          {...(number !== undefined ? { number } : {})}
          {...(props.validThrough ? { validThrough: props.validThrough } : {})}
          {...(until ? { until } : {})}
          {...(props.pass !== undefined ? { pass: props.pass } : {})}
        />
      </span>
    );

  const interactive = onFlip !== undefined;
  const toggle = () => onFlip?.(!flipped);
  return (
    <article
      aria-label={interactive ? undefined : name}
      aria-pressed={interactive ? flipped : undefined}
      className={cx("td-mcard", className)}
      data-kind={kind}
      data-size={size}
      data-status={status}
      data-contrast={used.ratio}
      data-measured={props.contrast || measured.has(key) ? "" : undefined}
      data-text={used.text}
      onClick={interactive ? toggle : undefined}
      onKeyDown={
        interactive
          ? (event: KeyboardEvent<HTMLElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
              }
            }
          : undefined
      }
      onPointerMove={onPointerMove}
      ref={ref}
      role={interactive ? "button" : undefined}
      style={style}
      tabIndex={interactive ? 0 : undefined}
      {...(interactive
        ? {
            "aria-label": `${name}. ${flipped ? "Showing the pass; turn back to the card" : "Turn over to show the pass"}`,
          }
        : {})}
    >
      {back ? <CardFlip back={back} flipped={flipped} front={front} /> : front}
    </article>
  );
}
