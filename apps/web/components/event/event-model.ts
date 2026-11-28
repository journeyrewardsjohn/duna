import type { EventSummary, TournamentCompetitionSnapshot } from "@duna/api";
import {
  formatVenueTime,
  participationToken,
  renderParticipationCopy,
} from "@duna/core";
import { allInPrice, spotsWords, type AllInPrice } from "../club/offers";

/**
 * The public event page's model (pure). Times are in the venue's time zone;
 * spots and waitlists use the shared participation words; prices are
 * all-in through `@duna/pricing`; nothing names a booked player.
 */

export type EventPhase = "open" | "waitlist" | "live" | "final" | "cancelled";

/** Where the event is: open, full (waitlist), live now, final or cancelled. */
export function eventPhase(
  event: Pick<
    EventSummary,
    "lifecycleStatus" | "live" | "spotsRemaining" | "divisions"
  >,
): EventPhase {
  if (event.lifecycleStatus === "cancelled") return "cancelled";
  if (event.live) return "live";
  if (event.lifecycleStatus === "completed") return "final";
  const divisions = event.divisions ?? [];
  const full =
    divisions.length > 0
      ? divisions.every((division) => division.spotsRemaining === 0)
      : event.spotsRemaining === 0;
  return full ? "waitlist" : "open";
}

export const PHASE_WORDS: Readonly<Record<EventPhase, string>> = {
  open: "Registration open",
  waitlist: "Full · waitlist",
  live: "Live now",
  final: "Final",
  cancelled: "Cancelled",
};

/** "Saturday, December 12" and "9:00 AM – 5:00 PM PST", in the venue's zone. */
export function eventWhen(
  event: Pick<EventSummary, "startsAt" | "endsAt" | "timezone">,
): { readonly day: string; readonly time: string; readonly multiDay: boolean } {
  const dayOptions: Intl.DateTimeFormatOptions = {
    weekday: "long",
    month: "long",
    day: "numeric",
  };
  const startDay = formatVenueTime(event.startsAt, event.timezone, "en-US", {
    ...dayOptions,
  });
  const endDay = formatVenueTime(event.endsAt, event.timezone, "en-US", {
    ...dayOptions,
  });
  const time = (value: string, zone: boolean) =>
    formatVenueTime(value, event.timezone, "en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...(zone ? { timeZoneName: "short" } : {}),
    });
  const multiDay = startDay !== endDay;
  return {
    day: multiDay ? `${startDay} – ${endDay}` : startDay,
    time: `${time(event.startsAt, false)} – ${time(event.endsAt, true)}`,
    multiDay,
  };
}

const FORMAT_WORDS: Readonly<Record<string, string>> = {
  solo: "Individual",
  doubles: "Doubles",
  "three-person": "Triples",
  "four-person": "Fours",
  "six-person": "Sixes",
};

const GENDER_WORDS: Readonly<Record<string, string>> = {
  mens: "Men's",
  womens: "Women's",
  coed: "Coed",
  open: "Open",
};

type Division = NonNullable<EventSummary["divisions"]>[number];

export interface DivisionRow {
  readonly id: string;
  readonly name: string;
  readonly facts: readonly string[];
  /** "3 spots left" / "Full" (shared words). */
  readonly spots: string;
  /** "2 waiting", counted, never named. */
  readonly waiting?: string;
  readonly full: boolean;
  readonly teamPrice?: AllInPrice;
  readonly playerPrice?: AllInPrice;
  readonly registerHref: string;
}

export function divisionRows(
  event: Pick<EventSummary, "slug" | "divisions" | "registrationTeams">,
): readonly DivisionRow[] {
  return (event.divisions ?? []).map((division: Division) => {
    const waitingCount = (event.registrationTeams ?? []).filter(
      (team) => team.divisionId === division.id && team.status === "waitlisted",
    ).length;
    const teamSize = division.teamSize ?? 1;
    const facts = [
      division.gender ? GENDER_WORDS[division.gender] : undefined,
      division.teamFormat ? FORMAT_WORDS[division.teamFormat] : undefined,
      division.ratingMinimum !== undefined ||
      division.ratingMaximum !== undefined
        ? `Sand Rating ${division.ratingMinimum ?? "any"}–${division.ratingMaximum ?? "any"}`
        : undefined,
      division.ageMinimum !== undefined || division.ageMaximum !== undefined
        ? division.ageMaximum !== undefined
          ? `Ages ${division.ageMinimum ?? 0}–${division.ageMaximum}`
          : `Ages ${division.ageMinimum}+`
        : undefined,
    ].filter((fact): fact is string => Boolean(fact));
    const price = (amountMinor: number, currency: string) =>
      allInPrice({ amountMinor, currency, kind: "registration" });
    return {
      id: division.id,
      name: division.name,
      facts,
      spots: spotsWords(division.spotsRemaining),
      ...(waitingCount > 0
        ? {
            waiting: renderParticipationCopy(
              participationToken("line.full-waiting", { n: waitingCount }),
            ),
          }
        : {}),
      full: division.spotsRemaining === 0,
      ...(teamSize > 1
        ? {
            teamPrice: price(
              division.teamPrice.amountMinor,
              division.teamPrice.currency,
            ),
          }
        : {}),
      playerPrice: price(
        division.playerPrice.amountMinor,
        division.playerPrice.currency,
      ),
      registerHref: `/checkout/${event.slug}?division=${division.id}`,
    };
  });
}

/** The lowest entry fee, all-in, for the summary ("From $46.20"). */
export function lowestEntry(event: Pick<EventSummary, "divisions" | "price">): {
  readonly price: AllInPrice;
  readonly from: boolean;
} {
  const divisions = event.divisions ?? [];
  const amounts = divisions.length
    ? divisions.map((division) => division.playerPrice)
    : [event.price];
  const lowest = amounts.toSorted(
    (left, right) => left.amountMinor - right.amountMinor,
  )[0]!;
  return {
    price: allInPrice({
      amountMinor: lowest.amountMinor,
      currency: lowest.currency,
      kind: "registration",
    }),
    from: new Set(amounts.map((amount) => amount.amountMinor)).size > 1,
  };
}

export type CompetitionMatch =
  TournamentCompetitionSnapshot["divisions"][number]["matches"][number];

export interface ScheduleRow {
  readonly id: string;
  readonly division: string;
  readonly label: string;
  readonly court?: string;
  readonly time?: string;
  readonly status: "scheduled" | "live" | "final";
  readonly sets: readonly (readonly [number, number])[];
  /** The existing live page (it enforces each player's privacy itself). */
  readonly href?: string;
}

/**
 * The published schedule and results, without team or player names (a
 * signed-out visitor never sees who is playing; juniors are never named).
 */
export function scheduleRows(
  snapshot: TournamentCompetitionSnapshot | undefined,
): readonly ScheduleRow[] {
  if (!snapshot) return [];
  return snapshot.divisions
    .flatMap((division) =>
      division.matches.map((match) => {
        const status: ScheduleRow["status"] =
          match.score?.status === "live"
            ? "live"
            : match.score?.status === "complete" ||
                match.score?.status === "forfeit" ||
                match.completedAt
              ? "final"
              : "scheduled";
        return {
          id: match.id,
          division: division.name,
          label: match.label,
          ...(match.courtName ? { court: match.courtName } : {}),
          ...(match.scheduledAt
            ? {
                time: formatVenueTime(
                  match.scheduledAt,
                  snapshot.session.timezone,
                  "en-US",
                  { weekday: "short", hour: "numeric", minute: "2-digit" },
                ),
              }
            : {}),
          status,
          sets: match.score?.sets ?? [],
          ...(status === "live"
            ? { href: `/live/${match.id}` }
            : status === "final"
              ? { href: `/matches/${match.id}` }
              : {}),
          sortAt: match.scheduledAt ?? match.startedAt ?? "",
        };
      }),
    )
    .toSorted((left, right) => left.sortAt.localeCompare(right.sortAt))
    .map((row): ScheduleRow => {
      const { sortAt, ...rest } = row;
      void sortAt;
      return rest;
    });
}

/** Directions to the venue (a plain search link; no key, no tracking). */
export function directionsHref(input: {
  readonly name: string;
  readonly address?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly googlePlaceId?: string;
}): string {
  const query =
    input.latitude !== undefined && input.longitude !== undefined
      ? `${input.latitude},${input.longitude}`
      : (input.address ?? input.name);
  const parameters = new URLSearchParams({ api: "1", query });
  if (input.googlePlaceId)
    parameters.set("query_place_id", input.googlePlaceId);
  return `https://www.google.com/maps/search/?${parameters.toString()}`;
}

// ---------- Entries (the public field) ----------

type RegistrationTeam = NonNullable<EventSummary["registrationTeams"]>[number];

export interface EntryRow {
  readonly id: string;
  /** "1", "2" for seeds; "W1" for the first team on the waitlist. */
  readonly seed: string;
  readonly name: string;
  readonly status: "confirmed" | "waitlisted";
  /** Only players with a public profile (adults who chose it), linked. */
  readonly players: readonly {
    readonly name: string;
    readonly href: string;
    readonly initials: string;
    readonly avatarUrl?: string;
  }[];
  readonly averageRating?: string;
}

export interface EntryDivision {
  readonly id: string;
  readonly name: string;
  readonly confirmed: readonly EntryRow[];
  readonly waitlisted: readonly EntryRow[];
}

/**
 * The public entry list, by division, seeds first, then the waitlist. The
 * server already lists only adults with a public profile (minors and
 * private profiles are never sent); this applies the same rule again: a
 * player without a public profile is never shown, and a team name that
 * would name one becomes its seed.
 */
export function entryDivisions(
  event: Pick<EventSummary, "divisions" | "registrationTeams">,
): readonly EntryDivision[] {
  const teams = event.registrationTeams ?? [];
  const row = (
    team: RegistrationTeam,
    index: number,
    status: EntryRow["status"],
  ): EntryRow => {
    const hidden = team.players.filter((player) => !player.publicPath);
    const namesHidden = hidden.some(
      (player) =>
        player.displayName.trim() !== "" &&
        team.name.includes(player.displayName.trim()),
    );
    const seed =
      status === "waitlisted"
        ? `W${index + 1}`
        : team.seed !== undefined
          ? String(team.seed)
          : "–";
    return {
      id: team.id,
      seed,
      name: namesHidden
        ? team.seed !== undefined
          ? `Seed ${team.seed}`
          : "Registered team"
        : team.name,
      status,
      players: team.players.flatMap((player) =>
        player.publicPath
          ? [
              {
                name: player.displayName,
                href: player.publicPath,
                initials: player.initials,
                ...(player.avatarUrl ? { avatarUrl: player.avatarUrl } : {}),
              },
            ]
          : [],
      ),
      ...(team.averageRating !== undefined && hidden.length === 0
        ? { averageRating: team.averageRating.toFixed(2) }
        : {}),
    };
  };
  return (event.divisions ?? []).flatMap((division) => {
    const own = teams.filter((team) => team.divisionId === division.id);
    if (own.length === 0) return [];
    return [
      {
        id: division.id,
        name: division.name,
        confirmed: own
          .filter((team) => team.status === "confirmed")
          .map((team, index) => row(team, index, "confirmed")),
        waitlisted: own
          .filter((team) => team.status === "waitlisted")
          .map((team, index) => row(team, index, "waitlisted")),
      },
    ];
  });
}

// ---------- Conditions at the start ----------

export interface StartConditions {
  readonly conditions: {
    readonly at: number;
    readonly temperatureC?: number;
    readonly windSpeedKph?: number;
    readonly windGustKph?: number;
    readonly windFromDeg?: number;
    readonly precipChancePct?: number;
    readonly uvIndex?: number;
  };
  readonly attribution?: string;
}

const HOUR = 3_600_000;

/**
 * The forecast hour that covers the event's first serve: from the
 * conditions service first, then the event's own forecast. Undefined when
 * neither covers the start (no forecast is shown rather than a guess).
 */
export function startConditions(input: {
  readonly startsAt: string;
  readonly forecast?: {
    readonly hours: readonly {
      readonly hourStartsAt: string;
      readonly temperatureC?: number;
      readonly windSpeedKph?: number;
      readonly windGustKph?: number;
      readonly windDirectionDeg?: number;
      readonly precipitationProbability?: number;
      readonly uvIndex?: number;
    }[];
    readonly attribution?: string;
  };
  readonly weather?: EventSummary["weather"];
}): StartConditions | undefined {
  const start = Date.parse(input.startsAt);
  const covers = (at: string) => {
    const hour = Date.parse(at);
    return hour <= start && start < hour + HOUR;
  };
  const hour = input.forecast?.hours.find((entry) =>
    covers(entry.hourStartsAt),
  );
  if (hour) {
    return {
      conditions: {
        at: Date.parse(hour.hourStartsAt),
        ...(hour.temperatureC !== undefined
          ? { temperatureC: hour.temperatureC }
          : {}),
        ...(hour.windSpeedKph !== undefined
          ? { windSpeedKph: hour.windSpeedKph }
          : {}),
        ...(hour.windGustKph !== undefined
          ? { windGustKph: hour.windGustKph }
          : {}),
        ...(hour.windDirectionDeg !== undefined
          ? { windFromDeg: hour.windDirectionDeg }
          : {}),
        ...(hour.precipitationProbability !== undefined
          ? { precipChancePct: hour.precipitationProbability }
          : {}),
        ...(hour.uvIndex !== undefined ? { uvIndex: hour.uvIndex } : {}),
      },
      ...(input.forecast?.attribution
        ? { attribution: input.forecast.attribution }
        : {}),
    };
  }
  const point = input.weather?.hourly.find((entry) => covers(entry.startsAt));
  if (!point || input.weather?.source !== "tomorrow.io") return undefined;
  return {
    conditions: {
      at: Date.parse(point.startsAt),
      ...(point.temperatureC !== undefined
        ? { temperatureC: point.temperatureC }
        : {}),
      ...(point.windSpeedKph !== undefined
        ? { windSpeedKph: point.windSpeedKph }
        : {}),
      ...(point.windGustKph !== undefined
        ? { windGustKph: point.windGustKph }
        : {}),
      ...(point.precipitationProbability !== undefined
        ? { precipChancePct: point.precipitationProbability }
        : {}),
    },
    attribution: `Weather: ${input.weather.provider}`,
  };
}
