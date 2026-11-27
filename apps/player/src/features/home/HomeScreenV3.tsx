import type { EventSummary, MatchSummary, PersonSummary } from "@duna/core";
import {
  demoBookings,
  demoEvents,
  demoMatches,
  demoPeople,
  demoPlayer,
} from "@duna/core/demo";
import { useContext, useMemo } from "react";
import { usePlayerRuntime } from "../../../runtime";
import {
  HomeV3Screen,
  type HomeV3Avatar,
  type HomeV3Match,
  type HomeV3OpenGame,
  type HomeV3UpcomingItem,
} from "../../../home-v3";
import { linkedHomeEvent } from "../../../home-v3-data";
import { MessagingNavigationContext } from "../../app/navigation";
import {
  recordedWeatherSymbol,
  fahrenheit,
  closestWeather,
} from "../../shared/weather";
import type { HomeQuickAction } from "./home-quick-action";

export function HomeScreenV3({
  onAskDuna,
  onAction,
  onOpenBooking,
  onOpenEvent,
  onOpenMatch,
  onOpenPerformance,
  onOpenSchedule,
}: {
  readonly onAskDuna: (prompt: string) => void;
  readonly onAction: (action: HomeQuickAction) => void;
  readonly onOpenBooking: (bookingId: string) => void;
  readonly onOpenEvent: (event: EventSummary) => void;
  readonly onOpenMatch: (match: MatchSummary) => void;
  readonly onOpenPerformance: () => void;
  readonly onOpenSchedule: () => void;
}) {
  const messaging = useContext(MessagingNavigationContext);
  const {
    dashboard,
    mode,
    organizationWallets,
    people: runtimePeople,
  } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const previewSchedule = useMemo(() => {
    const previewTimeZone = "America/Los_Angeles";
    const zonedDateParts = (instant: Date, timeZone: string) =>
      Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          day: "2-digit",
          hour: "2-digit",
          hourCycle: "h23",
          minute: "2-digit",
          month: "2-digit",
          second: "2-digit",
          timeZone,
          year: "numeric",
        })
          .formatToParts(instant)
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, Number(part.value)]),
      ) as Record<string, number>;
    const venueWallTime = (
      dayOffset: number,
      hour: number,
      minute: number,
      timeZone: string,
    ) => {
      const today = zonedDateParts(new Date(), timeZone);
      const wallTime = Date.UTC(
        today.year!,
        today.month! - 1,
        today.day! + dayOffset,
        hour,
        minute,
      );
      let instant = wallTime;
      for (let pass = 0; pass < 2; pass += 1) {
        const local = zonedDateParts(new Date(instant), timeZone);
        const representedWallTime = Date.UTC(
          local.year!,
          local.month! - 1,
          local.day!,
          local.hour!,
          local.minute!,
          local.second!,
        );
        instant += wallTime - representedWallTime;
      }
      return new Date(instant);
    };
    const makeWindow = (
      dayOffset: number,
      hour: number,
      minute: number,
      durationMinutes: number,
    ) => {
      let startsAt = venueWallTime(dayOffset, hour, minute, previewTimeZone);
      if (dayOffset === 0 && startsAt.getTime() <= Date.now()) {
        startsAt = venueWallTime(1, hour, minute, previewTimeZone);
      }
      return {
        startsAt: startsAt.toISOString(),
        endsAt: new Date(
          startsAt.getTime() + durationMinutes * 60_000,
        ).toISOString(),
      };
    };
    const eventWindows: Record<string, { startsAt: string; endsAt: string }> = {
      "event-pickup": makeWindow(0, 18, 0, 90),
      "event-open-play": makeWindow(0, 19, 30, 90),
      "event-clinic": makeWindow(2, 16, 30, 90),
      "event-summer-series": makeWindow(7, 18, 0, 180),
      "event-live-open": makeWindow(18, 8, 0, 480),
    };
    const bookingWindows: Record<string, { startsAt: string; endsAt: string }> =
      {
        "booking-pickup": makeWindow(0, 18, 0, 90),
        "booking-clinic": makeWindow(2, 16, 30, 90),
        "booking-league": makeWindow(7, 18, 0, 180),
      };
    return {
      events: eventWindows,
      bookings: bookingWindows,
    };
  }, []);
  const bookings = (
    mode === "preview" ? demoBookings : (dashboard?.bookings ?? [])
  ).map((booking) =>
    mode === "preview" && previewSchedule.bookings[booking.id]
      ? { ...booking, ...previewSchedule.bookings[booking.id] }
      : booking,
  );
  const events = (
    mode === "preview" ? demoEvents : (dashboard?.events ?? [])
  ).map((event) =>
    mode === "preview" && previewSchedule.events[event.id]
      ? { ...event, ...previewSchedule.events[event.id] }
      : event,
  );
  const now = Date.now();
  const firstName = player.displayName.split(/\s+/)[0] ?? player.displayName;
  const rating = player.rating.display;
  const ratingDelta = player.rating.delta ?? 0;
  const homeOrganization =
    organizationWallets?.find(
      (organization) =>
        organization.membershipStatus === "active" &&
        organization.status === "active",
    ) ??
    organizationWallets?.find(
      (organization) => organization.status === "active",
    ) ??
    organizationWallets?.[0];
  const region =
    (mode === "preview"
      ? "South Bay"
      : homeOrganization?.organizationName
          .replace(/\s+(beach volleyball|volleyball club|club)$/i, "")
          .trim()) ||
    bookings[0]?.venueName.split(/[—·]/)[0]?.trim() ||
    "Duna";
  const weatherEvent = events.find((event) => event.weather?.hourly.length);
  const weather = weatherEvent?.weather
    ? closestWeather(weatherEvent.weather.hourly, new Date().toISOString())
    : undefined;
  const contextLine = [
    weather?.temperatureC === undefined
      ? mode === "preview"
        ? "72°"
        : undefined
      : fahrenheit(weather.temperatureC),
    weather?.condition ?? (mode === "preview" ? "Sunny" : undefined),
    region,
  ]
    .filter(Boolean)
    .join(" · ");

  const dateBlock = (startsAt: string, timeZone?: string) => {
    const date = new Date(startsAt);
    const calendarDate = (instant: Date) => {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
          day: "2-digit",
          month: "2-digit",
          timeZone,
          year: "numeric",
        })
          .formatToParts(instant)
          .filter((part) => part.type !== "literal")
          .map((part) => [part.type, Number(part.value)]),
      ) as Record<string, number>;
      return Date.UTC(parts.year!, parts.month! - 1, parts.day!);
    };
    const dayDistance = Math.floor(
      (calendarDate(date) - calendarDate(new Date())) / 86_400_000,
    );
    return {
      day:
        dayDistance >= 7
          ? date
              .toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone,
              })
              .toUpperCase()
          : date
              .toLocaleDateString("en-US", { weekday: "short", timeZone })
              .toUpperCase(),
      time: date
        .toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone,
        })
        .replace(/\s?(AM|PM)$/i, ""),
    };
  };
  const eventCategory = (
    kind: EventSummary["kind"],
  ): HomeV3UpcomingItem["category"] => {
    if (kind === "clinic" || kind === "private-lesson") return "training";
    if (kind === "tournament" || kind === "league") return "tournament";
    return "match";
  };
  const eventRecurrence = (event: EventSummary) => {
    const days = event.recurrence?.days
      .slice(0, 2)
      .map((day) => day.day.slice(0, 3).toUpperCase());
    return days?.length ? `EVERY ${days.join(" & ")}` : undefined;
  };

  const bookingItems = bookings
    .filter((booking) => new Date(booking.endsAt).getTime() > now)
    .map((booking) => {
      const linkedEvent = linkedHomeEvent(booking, events);
      const date = dateBlock(
        booking.startsAt,
        linkedEvent?.timezone ?? booking.venueTimezone,
      );
      return {
        id: `booking:${booking.id}`,
        startsAt: booking.startsAt,
        category: eventCategory(booking.kind),
        day: date.day,
        time: date.time,
        title: booking.title,
        meta: [linkedEvent?.organizationName, booking.venueName]
          .filter(Boolean)
          .join(" · "),
        recurrence: linkedEvent ? eventRecurrence(linkedEvent) : undefined,
        status: "going" as const,
        onPress: () =>
          linkedEvent ? onOpenEvent(linkedEvent) : onOpenBooking(booking.id),
      };
    });
  const bookedEventIds = new Set(
    bookings.flatMap((booking) => {
      const linkedEvent = linkedHomeEvent(booking, events);
      return [booking.sessionId, linkedEvent?.id].filter((id): id is string =>
        Boolean(id),
      );
    }),
  );
  const bookedTitles = new Set(bookings.map((booking) => booking.title));
  const unbookedEventItems = events
    .filter(
      (event) =>
        new Date(event.endsAt).getTime() > now &&
        event.lifecycleStatus !== "cancelled" &&
        !["pickup", "open-play"].includes(event.kind) &&
        !bookedEventIds.has(event.id) &&
        !bookedTitles.has(event.title),
    )
    .map((event) => {
      const date = dateBlock(event.startsAt, event.timezone);
      return {
        id: `event:${event.id}`,
        startsAt: event.startsAt,
        category: eventCategory(event.kind),
        day: date.day,
        time: date.time,
        title: event.title,
        meta: [event.organizationName, event.venueName]
          .filter(Boolean)
          .join(" · "),
        recurrence: eventRecurrence(event),
        status:
          event.spotsRemaining > 0 ? ("action" as const) : ("detail" as const),
        statusLabel: event.spotsRemaining > 0 ? "Register" : undefined,
        onPress: () => onOpenEvent(event),
      };
    });
  const nextUp = [...bookingItems].sort(
    (left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
  )[0];
  const upcoming = [...bookingItems, ...unbookedEventItems]
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    )
    .slice(0, 6);

  const compactPrice = (amountMinor: number, currency: string) =>
    amountMinor === 0
      ? "Free"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency,
          maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
        }).format(amountMinor / 100);
  const eventMode = (event: EventSummary) =>
    event.format ??
    event.tags.find((tag) =>
      /(^|\s)(2s|4s|6s|doubles|mixed)(\s|$)/i.test(tag),
    ) ??
    (event.kind === "pickup" ? "Pickup" : "Open play");
  const openGameCandidates = events
    .filter(
      (event) =>
        ["pickup", "open-play"].includes(event.kind) &&
        new Date(event.endsAt).getTime() > now &&
        event.spotsRemaining > 0 &&
        event.lifecycleStatus !== "cancelled",
    )
    .sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );
  const openGames: HomeV3OpenGame[] = openGameCandidates.map(
    (event, gameIndex) => {
      const playerSlots: Array<HomeV3OpenGame["teamA"][number]> = (
        event.attendees ?? []
      )
        .slice(0, 4)
        .map((attendee) => ({
          id: attendee.id,
          initials: attendee.initials,
          name: attendee.displayName,
          rating: attendee.ratingDisplay?.toFixed(1),
          uri: attendee.avatarUrl,
        }));
      while (playerSlots.length < 4) {
        playerSlots.push({
          id: `${event.id}:open:${playerSlots.length}`,
          open: true,
        });
      }
      const duration = Math.max(
        30,
        Math.round(
          (new Date(event.endsAt).getTime() -
            new Date(event.startsAt).getTime()) /
            60_000,
        ),
      );
      const startsAt = new Date(event.startsAt);
      const venueDate = (instant: Date) =>
        instant.toLocaleDateString("en-US", { timeZone: event.timezone });
      const today = venueDate(startsAt) === venueDate(new Date());
      return {
        id: event.id,
        time: `${today ? "Tonight" : startsAt.toLocaleDateString("en-US", { weekday: "short", timeZone: event.timezone })} · ${startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: event.timezone }).toLowerCase()}`,
        booked: bookedEventIds.has(event.id) || bookedTitles.has(event.title),
        location: event.venueName,
        teamA: playerSlots.slice(0, 2),
        teamB: playerSlots.slice(2, 4),
        level: event.ratingRange
          ? `${event.kind === "pickup" ? "Competitive" : "Open"} · ${event.ratingRange[0].toFixed(1)} – ${event.ratingRange[1].toFixed(1)}`
          : "Open level",
        mode: eventMode(event),
        price: compactPrice(event.price.amountMinor, event.price.currency),
        duration: `${duration} min`,
        tint: gameIndex % 2 === 0 ? "#FECFC0" : "#D3E3F0",
        onPress: () => onOpenEvent(event),
      };
    },
  );

  const matchData =
    mode === "preview" ? demoMatches : (dashboard?.recentMatches ?? []);
  const recentMatches: HomeV3Match[] = matchData.slice(0, 3).map((match) => {
    const teamName = (team: readonly PersonSummary[]) => {
      const includesPlayer = team.some((person) => person.id === player.id);
      const others = team
        .filter((person) => person.id !== player.id)
        .map((person) => person.displayName.split(/\s+/)[0]);
      if (includesPlayer)
        return others.length ? `You & ${others.join(", ")}` : "You";
      return team
        .map((person) => person.displayName.split(/\s+/)[0])
        .join(" & ");
    };
    const teamRating = (team: readonly PersonSummary[]) => {
      const values = team.map((person) => person.rating.display);
      if (values.length <= 2)
        return values.map((value) => value.toFixed(1)).join(" · ");
      return `${(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)} avg`;
    };
    const avatar = (person: PersonSummary): HomeV3Avatar => ({
      id: person.id,
      initials: person.initials,
      name: person.displayName,
      rating: person.rating.display.toFixed(1),
      uri: person.avatarUrl,
    });
    const date = new Date(match.playedAt).toLocaleDateString("en-US", {
      weekday: "short",
    });
    const format =
      match.formatSummary ?? `${match.teamA.length}V${match.teamB.length}`;
    const recordedWeather = match.weather
      ? [
          `${recordedWeatherSymbol(match.weather.condition)} ${fahrenheit(match.weather.temperatureC) || match.weather.condition}`,
          match.weather.temperatureC !== undefined
            ? match.weather.condition
            : undefined,
          match.weather.windSpeedKph !== undefined
            ? `${Math.round(match.weather.windSpeedKph * 0.621371)} mph wind`
            : undefined,
          match.weather.uvIndex !== undefined
            ? `UV ${Math.round(match.weather.uvIndex)}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ")
      : undefined;
    return {
      id: match.id,
      kicker: `${date} · ${format} · ${match.venueName}`.toUpperCase(),
      weather: recordedWeather,
      delta: `${match.ratingDelta >= 0 ? "+" : ""}${match.ratingDelta.toFixed(2)}`,
      deltaTone: match.ratingDelta > 0 ? "positive" : "neutral",
      onPress: () => onOpenMatch(match),
      teams: (
        [
          {
            id: "A",
            people: match.teamA,
            winner: match.winner === "A",
            side: 0,
          },
          {
            id: "B",
            people: match.teamB,
            winner: match.winner === "B",
            side: 1,
          },
        ] as const
      ).map((team) => ({
        id: `${match.id}:${team.id}`,
        avatars: team.people.slice(0, 2).map(avatar),
        total: team.people.length,
        name: teamName(team.people),
        rating: teamRating(team.people),
        winner: team.winner,
        sets: match.score.map((set) => ({
          value: set[team.side],
          won: set[team.side] > set[team.side === 0 ? 1 : 0],
        })),
      })),
    };
  });
  const chronologicalMatches = [...matchData].slice(0, 10).reverse();
  const ratingHistory = chronologicalMatches.reduce<number[]>(
    (history, match) => [
      ...history,
      Number((history[history.length - 1]! + match.ratingDelta).toFixed(2)),
    ],
    [
      Number(
        (
          rating -
          chronologicalMatches.reduce(
            (sum, match) => sum + match.ratingDelta,
            0,
          )
        ).toFixed(2),
      ),
    ],
  );
  const people = (mode === "preview" ? demoPeople : (runtimePeople ?? []))
    .filter((person) => person.id !== player.id)
    .slice(0, 6);
  const crewAvatars: HomeV3Avatar[] = people.slice(0, 2).map((person) => ({
    id: person.id,
    initials: person.initials,
    name: person.displayName,
    rating: person.rating.display.toFixed(1),
    uri: person.avatarUrl,
  }));

  return (
    <HomeV3Screen
      onAskDuna={onAskDuna}
      contextLine={contextLine}
      crew={
        crewAvatars.length
          ? {
              avatars: crewAvatars,
              overflowCount: Math.min(4, Math.max(0, people.length - 2)),
              message:
                "Bring your circle together this weekend. Get a run going.",
              onPress: () => onAction("create-match"),
            }
          : undefined
      }
      firstName={firstName}
      insight={
        dashboard?.feed[0]?.title ??
        "Ask Duna about your next game or recent progress."
      }
      moreOpenGamesCount={Math.max(0, openGameCandidates.length - 2)}
      notificationCount={messaging.unreadCount}
      onNotifications={() => onAction("messages")}
      onOpenInsight={() =>
        onAskDuna(
          dashboard?.feed[0]?.title
            ? `Help me understand this update: ${dashboard.feed[0].title}`
            : "Help me understand my recent matches and plan my next game.",
        )
      }
      onOpenMap={() => onAction("find-match")}
      onOpenMatches={onOpenPerformance}
      onOpenMoreGames={() => onAction("find-match")}
      onOpenSchedule={onOpenSchedule}
      onSearch={() => onAction("search")}
      openGames={openGames}
      quickActions={[
        {
          key: "find-match",
          label: "Find a match",
          icon: "ball",
          color: "#D6B143",
          onPress: () => onAction("find-match"),
        },
        {
          key: "book-court",
          label: "Book a court",
          icon: "court-booking",
          color: "#7C95AB",
          onPress: () => onAction("book-court"),
        },
        {
          key: "find-coach",
          label: "Find a coach",
          icon: "whistle",
          color: "#142335",
          onPress: () => onAction("find-coach"),
        },
        {
          key: "record-video",
          label: "Record video",
          icon: "video",
          color: "#18181B",
          recording: true,
          onPress: () => onAction("record-video"),
        },
        {
          key: "create-match",
          label: "Create a match",
          icon: "plus",
          color: "#FECFC0",
          onPress: () => onAction("create-match"),
        },
        {
          key: "upload-score",
          label: "Report a score",
          icon: "score",
          color: "#142335",
          onPress: () => onAction("upload-score"),
        },
      ]}
      rating={rating.toFixed(2)}
      ratingDelta={`${ratingDelta >= 0 ? "+" : ""}${ratingDelta.toFixed(2)}`}
      ratingHistory={ratingHistory}
      recentMatches={recentMatches}
      upcoming={upcoming}
      nextUp={nextUp}
    />
  );
}
