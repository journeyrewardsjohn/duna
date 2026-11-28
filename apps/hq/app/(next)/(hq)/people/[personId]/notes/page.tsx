import { Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { loadStaffNotes } from "@/components/people/people-data";
import { firstName, shortDate } from "@/components/people/people-model";
import {
  PeopleBlockState,
  PersonScreen,
  personPage,
} from "@/components/people/people-screen";
import { StaffNotes } from "@/components/people/person-records";

export const metadata: Metadata = { title: "Notes" };

/**
 * A person › Notes: the team's own notes about the person (author and time;
 * never shown to the person, never exported), the coaches' session notes
 * with whether each is shared, and the club's videos of them.
 */
export default async function PersonNotesPage({
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
  const notes = [...profile.notes].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const staffNotes = context.capabilities.notes
    ? await loadStaffNotes(row.id)
    : undefined;
  return (
    <PersonScreen
      askStarters={[`Summarise the coaches' notes about ${first}`]}
      page={page}
      tab="notes"
    >
      {staffNotes ? (
        <PageSection id="team-notes" title="Team notes">
          {staffNotes.state === "ok" ? (
            <StaffNotes
              canWrite={context.canWrite}
              firstName={first}
              isOwner={context.roles.includes("owner")}
              notes={staffNotes.data.notes}
              personId={row.id}
              timeZone={context.timeZone}
              viewerId={context.session.person?.id}
            />
          ) : (
            <PeopleBlockState
              loaded={staffNotes}
              organization={context.organization}
              what={`the team's notes about ${first}`}
            />
          )}
        </PageSection>
      ) : null}
      <PageSection flush id="notes" title="Session notes">
        {notes.length === 0 ? (
          <p className="people-quiet people-pad">
            No notes yet. Coaches&apos; session notes about {first} collect
            here.
          </p>
        ) : (
          <ul className="people-notes">
            {notes.map((note) => (
              <li key={note.id}>
                <p className="people-notes__meta">
                  <strong>{note.authorName}</strong>
                  <time dateTime={note.createdAt}>
                    {shortDate(note.createdAt, context.timeZone, now)}
                  </time>
                  <Chip>
                    {note.visibility === "private"
                      ? "Team only"
                      : note.status === "published"
                        ? `Shared with ${row.isJunior ? "the family" : first}`
                        : "Draft"}
                  </Chip>
                </p>
                {note.subject ? (
                  <p className="people-notes__subject">{note.subject}</p>
                ) : null}
                <p className="people-body">{note.summary}</p>
                <Link
                  className="people-link"
                  href={`/events/${note.sessionId}`}
                >
                  {note.sessionTitle}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
      <PageSection flush id="videos" title="Videos">
        {profile.videos.length === 0 ? (
          <p className="people-quiet people-pad">
            No club videos of {first} yet.
          </p>
        ) : (
          <ul className="people-timeline" aria-label={`Videos of ${first}`}>
            {profile.videos.slice(0, 12).map((video) => (
              <li key={video.id}>
                <span className="people-timeline__what">
                  <strong>{video.title}</strong>
                  <span>
                    {[video.sessionTitle ?? video.category, video.status]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <time dateTime={video.createdAt}>
                  {shortDate(video.createdAt, context.timeZone, now)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </PersonScreen>
  );
}
