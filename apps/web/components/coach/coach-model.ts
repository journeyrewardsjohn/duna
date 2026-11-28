import type { PublicCoach } from "@duna/api";
import { absolutePublicUrl } from "../../lib/pro-seo";
import {
  breadcrumbs,
  clubId,
  markdownEncoding,
  type JsonLd,
} from "../club/structured-data";
import { upcoming, type Occurrence, type Offering } from "../club/offers";

/**
 * A coach's public profile (pure). Credentials are only what the data has
 * (playing level, years playing): no invented certifications, testimonials
 * or ratings.
 */

const EXPERIENCE_WORDS: Readonly<Record<string, string>> = {
  amateur: "Played at amateur level",
  "high-school": "Played in high school",
  collegiate: "Played in college",
  professional: "Played professionally",
};

export function coachCredentials(
  coach: Pick<PublicCoach, "playingExperience" | "yearsPlaying">,
): readonly string[] {
  return [
    coach.playingExperience
      ? EXPERIENCE_WORDS[coach.playingExperience]
      : undefined,
    coach.yearsPlaying
      ? `${coach.yearsPlaying} year${coach.yearsPlaying === 1 ? "" : "s"} playing`
      : undefined,
  ].filter((line): line is string => Boolean(line));
}

export interface CoachClub {
  readonly slug: string;
  readonly name: string;
}

/** Every club this coach is listed at (one profile per club in the data). */
export function coachClubs(
  profiles: readonly Pick<
    PublicCoach,
    "organizationSlug" | "organizationName"
  >[],
): readonly CoachClub[] {
  const seen = new Map<string, CoachClub>();
  for (const profile of profiles) {
    if (!seen.has(profile.organizationSlug)) {
      seen.set(profile.organizationSlug, {
        slug: profile.organizationSlug,
        name: profile.organizationName,
      });
    }
  }
  return [...seen.values()];
}

export interface CoachOffering {
  readonly item: Offering;
  readonly clubSlug: string;
  readonly clubName: string;
}

export interface CoachSlot {
  readonly offering: CoachOffering;
  readonly occurrence: Occurrence;
}

/**
 * What a visitor can book with this coach: the services listed on the
 * profile, plus the club's sessions this coach is on.
 */
export function coachOfferings(input: {
  readonly coach: Pick<PublicCoach, "personId" | "services">;
  readonly clubSlug: string;
  readonly clubName: string;
  readonly catalog: readonly Offering[];
}): readonly CoachOffering[] {
  const byId = new Map<string, CoachOffering>();
  for (const item of input.coach.services) {
    byId.set(item.id, {
      item,
      clubSlug: input.clubSlug,
      clubName: input.clubName,
    });
  }
  for (const item of input.catalog) {
    const coaches = item.upcomingOccurrences.some((occurrence) =>
      occurrence.availableCoaches.some(
        (coach) => coach.personId === input.coach.personId,
      ),
    );
    if (coaches && !byId.has(item.id)) {
      byId.set(item.id, {
        item,
        clubSlug: input.clubSlug,
        clubName: input.clubName,
      });
    }
  }
  return [...byId.values()];
}

/** The coach's next open sessions, soonest first. */
export function nextSlots(input: {
  readonly personId: string;
  readonly offerings: readonly CoachOffering[];
  readonly now: Date;
  readonly limit?: number;
}): readonly CoachSlot[] {
  return input.offerings
    .flatMap((offering) =>
      upcoming(offering.item, input.now)
        .filter(
          (occurrence) =>
            occurrence.spotsRemaining !== 0 &&
            (occurrence.availableCoaches.length === 0 ||
              occurrence.availableCoaches.some(
                (coach) => coach.personId === input.personId,
              )),
        )
        .map((occurrence) => ({ offering, occurrence })),
    )
    .toSorted(
      (left, right) =>
        Date.parse(left.occurrence.startsAt) -
        Date.parse(right.occurrence.startsAt),
    )
    .slice(0, input.limit ?? 4);
}

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** The weekly hours the coach published ("Tuesday 4:00 PM – 8:00 PM"). */
export function weeklyHours(
  availability: PublicCoach["availability"],
): readonly { readonly day: string; readonly hours: string }[] {
  const clock = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    if (hour === undefined || Number.isNaN(hour)) return value;
    const suffix = hour >= 12 ? "PM" : "AM";
    const twelve = hour % 12 === 0 ? 12 : hour % 12;
    return `${twelve}:${String(minute ?? 0).padStart(2, "0")} ${suffix}`;
  };
  return availability.flatMap((window) => {
    const weekday = window.weekday;
    const startsAt = window.startsAt;
    const endsAt = window.endsAt;
    if (
      typeof weekday !== "number" ||
      typeof startsAt !== "string" ||
      typeof endsAt !== "string" ||
      !WEEKDAYS[weekday]
    ) {
      return [];
    }
    return [
      {
        day: WEEKDAYS[weekday]!,
        hours: `${clock(startsAt)} – ${clock(endsAt)}`,
      },
    ];
  });
}

/** `ProfilePage` + `Person` for a coach profile. */
export function coachJsonLd(input: {
  readonly coach: Pick<
    PublicCoach,
    "personId" | "handle" | "displayName" | "avatarUrl" | "bio" | "homeMarket"
  >;
  readonly clubs: readonly CoachClub[];
  readonly offerings: readonly CoachOffering[];
}): JsonLd {
  const path = `/coaches/${input.coach.handle}`;
  const url = absolutePublicUrl(path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${url}#page`,
        url,
        name: input.coach.displayName,
        mainEntity: { "@id": `${url}#person` },
        breadcrumb: { "@id": `${url}#breadcrumbs` },
        encoding: markdownEncoding(path),
      },
      breadcrumbs(url, [{ name: input.coach.displayName, path }]),
      {
        "@type": "Person",
        "@id": `${url}#person`,
        name: input.coach.displayName,
        alternateName: `@${input.coach.handle}`,
        url,
        jobTitle: "Volleyball coach",
        ...(input.coach.avatarUrl
          ? { image: absolutePublicUrl(input.coach.avatarUrl) }
          : {}),
        ...(input.coach.bio ? { description: input.coach.bio } : {}),
        ...(input.coach.homeMarket
          ? {
              homeLocation: { "@type": "Place", name: input.coach.homeMarket },
            }
          : {}),
        ...(input.clubs.length
          ? {
              worksFor: input.clubs.map((club) => ({
                "@type": "SportsClub",
                "@id": clubId(club.slug),
                name: club.name,
                url: absolutePublicUrl(`/clubs/${club.slug}`),
              })),
            }
          : {}),
        ...(input.offerings.length
          ? {
              makesOffer: input.offerings.map((offering) => ({
                "@type": "Offer",
                name: offering.item.title,
                url: absolutePublicUrl(
                  `/clubs/${offering.clubSlug}/products/${offering.item.slug}`,
                ),
              })),
            }
          : {}),
      },
    ],
  };
}
