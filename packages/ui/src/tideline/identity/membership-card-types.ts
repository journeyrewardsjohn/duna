import type {
  CardArtSource,
  CardContrast,
  CardFact,
  CardKind,
  MembershipPassData,
  MembershipStatus,
} from "@duna/tideline-core";
import type { ClubMarkProps } from "./club-mark";

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

/** Which optional parts of the face show (the club's card design). */
export interface MembershipCardFace {
  chip?: boolean;
  number?: boolean;
  since?: boolean;
}

export interface MembershipCardProps {
  club: MembershipCardClub;
  /** The member's name as the club knows it (a junior's own name). */
  member: string;
  /** The guardian holding a junior's card. */
  heldBy?: string;
  /** The plan, said on the pass and to screen readers ("Annual member"). */
  plan?: string;
  /** The plan chip top right ("Annual", "Junior", "Staff", "Pack"). */
  chip?: string;
  kind?: CardKind;
  status: MembershipStatus;
  /** Overrides the state chip's words. */
  statusText?: string;
  /** Formatted pause end or end date, for "Paused to Jan 4" / "Ended Oct 31". */
  until?: string;
  /** Member number; `null` hides it. */
  number?: string | null;
  /** "Mar 2024" (the face says "Since Mar 2024"). */
  since?: string;
  /** Formatted, for the pass ("Nov 30, 2027"). */
  validThrough?: string;
  /** The one live fact, bottom right. */
  fact?: CardFact | null;
  /** The art. Default: derived from the club colour, else a Duna piece. */
  art?: CardArtSource;
  /** The measured scrim stored with the design; measured here when absent. */
  contrast?: CardContrast;
  face?: MembershipCardFace;
  /** The back. Absent or `null`: the honest "no pass yet" back. */
  pass?: MembershipPassData | null;
  /** Shows the pass side (controlled). */
  flipped?: boolean;
  /** Makes the card itself turn over on tap, Enter or Space. */
  onFlip?: (flipped: boolean) => void;
  /** `card` (≤ 372 px), `hero` (≤ 420 px) or the 36 % `strip`. */
  size?: "card" | "strip" | "hero";
  /** `auto` plays the art's loop where motion is allowed; `still` never does. */
  motion?: "auto" | "still";
  /** Overrides the accessible name. */
  label?: string;
  className?: string;
}

/** A card in a wallet: the card plus a stable id. */
export interface WalletCard extends Omit<
  MembershipCardProps,
  "flipped" | "onFlip" | "size" | "motion"
> {
  id: string;
}
