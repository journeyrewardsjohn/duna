/**
 * The profile's four sections: what each is called, the one line that says
 * what is inside, its glyph and its brand ground. Pure data.
 */
import type { GlyphName } from "@duna/ui/native";
import type { IntroGround } from "../intro/intro-content";

export type ProfileSectionKey = "game" | "money" | "settings" | "learn";

export interface ProfileSection {
  readonly title: string;
  readonly summary: string;
  readonly icon: GlyphName;
  readonly ground: IntroGround;
}

export const PROFILE_SECTIONS: Readonly<
  Record<ProfileSectionKey, ProfileSection>
> = {
  game: {
    title: "Your game",
    summary: "Rating, film, health and training",
    icon: "rating",
    ground: "tidewater",
  },
  money: {
    title: "Money and clubs",
    summary: "Wallet, memberships and your clubs",
    icon: "wallet",
    ground: "hardwood",
  },
  settings: {
    title: "Settings and privacy",
    summary: "Notifications, data, privacy and sign-in",
    icon: "key",
    ground: "night-court",
  },
  learn: {
    title: "Get to know Duna",
    summary: "What each section is for",
    icon: "highlight",
    ground: "dune",
  },
};
