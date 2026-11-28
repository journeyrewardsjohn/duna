import { Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { AddToSession } from "@/components/people/person-forms";
import {
  bookingWords,
  firstName,
  shortDate,
} from "@/components/people/people-model";
import { PersonScreen, personPage } from "@/components/people/people-screen";

export const metadata: Metadata = { title: "Bookings" };

function timeOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/**
 * A person › Bookings: what's coming up and what happened, in the words the
 * rest of HQ uses (Booked, Attended, No-show, Cancelled, Refunded), each
 * linking to its session with the session's own group state (the shared
 * participation words, `groupState`), and adding them to a session.
 */
export default async function PersonBookingsPage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const found = await personPage(personId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { page } = found;
  const { record, context } = page;
  const { row, profile } = record;
  const now = new Date(context.now);
  const first = firstName(row.name);
  const sessions = [...profile.sessions].sort((a, b) =>
    b.startsAt.localeCompare(a.startsAt),
  );
  const upcoming = sessions
    .filter((session) => new Date(session.startsAt) > now)
    .reverse();
  const past = sessions.filter((session) => new Date(session.startsAt) <= now);
  const attended = past.filter(
    (session) => session.attendanceStatus === "attended",
  ).length;
  const noShows = past.filter(
    (session) => session.attendanceStatus === "no-show",
  ).length;
  const booked = new Set(profile.sessions.map((session) => session.id));
  const canAdd = context.session.scopes.some(
    (scope) => scope === "*" || scope === "sessions:write",
  );
  const list = (items: typeof sessions, empty: string) =>
    items.length === 0 ? (
      <p className="people-quiet people-pad">{empty}</p>
    ) : (
      <ul className="people-bookings">
        {items.map((session) => {
          const words = bookingWords({
            registrationStatus: session.registrationStatus,
            attendanceStatus: session.attendanceStatus,
            startsAt: session.startsAt,
            now,
          });
          return (
            <li key={session.registrationId}>
              <time
                className="people-bookings__when"
                dateTime={session.startsAt}
              >
                <strong>
                  {shortDate(session.startsAt, session.timezone, now)}
                </strong>
                <span>{timeOf(session.startsAt, session.timezone)}</span>
              </time>
              <span className="people-bookings__what">
                <Link className="people-link" href={`/events/${session.id}`}>
                  {session.title}
                </Link>
                <span className="people-quiet">
                  {[
                    // The session's state in the shared participation words
                    // every Duna surface uses ("3 places left", "Full").
                    session.groupState?.staffWords ??
                      session.kind.replaceAll("-", " "),
                    session.venueName,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Chip tone={words.tone === "neutral" ? undefined : words.tone}>
                {words.label}
              </Chip>
            </li>
          );
        })}
      </ul>
    );
  return (
    <PersonScreen
      askStarters={[
        `How often has ${first} played this season?`,
        `Which sessions did ${first} miss?`,
      ]}
      page={page}
      tab="bookings"
    >
      <dl aria-label={`${first}'s attendance`} className="people-figures">
        <div className="people-figure">
          <dt>Coming up</dt>
          <dd className="people-num">{upcoming.length}</dd>
        </div>
        <div className="people-figure">
          <dt>Attended</dt>
          <dd className="people-num">{attended}</dd>
        </div>
        <div className="people-figure">
          <dt>No-shows</dt>
          <dd className="people-num">{noShows}</dd>
        </div>
      </dl>
      <PageSection flush id="upcoming" title="Coming up">
        {list(upcoming, `${first} has nothing booked.`)}
      </PageSection>
      {canAdd ? (
        <PageSection id="add" title="Add to a session">
          <AddToSession
            name={row.name}
            personId={row.id}
            sessions={record.people.openSessions
              .filter((session) => !booked.has(session.id))
              .map((session) => ({
                id: session.id,
                label: `${session.title}, ${shortDate(session.startsAt, session.timezone, now)} ${timeOf(session.startsAt, session.timezone)}`,
              }))}
          />
        </PageSection>
      ) : null}
      <PageSection flush id="history" title="History">
        {list(past, "No past sessions yet.")}
      </PageSection>
    </PersonScreen>
  );
}
