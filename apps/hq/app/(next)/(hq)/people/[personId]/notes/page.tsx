import { Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { AddNote } from "@/components/people/person-actions";
import { firstName, shortDate } from "@/components/people/people-model";
import { PersonScreen, personPage } from "@/components/people/people-screen";

export const metadata: Metadata = { title: "Notes" };

/**
 * A person › Notes: the team's notes with their author and time, whether
 * each is private to the team or shared with the person, and adding one.
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
  return (
    <PersonScreen
      askStarters={[`Summarise the coaches' notes about ${first}`]}
      page={page}
      tab="notes"
    >
      {context.canWrite ? (
        <PageSection id="add-note" title="Add a note">
          <AddNote personId={row.id} />
        </PageSection>
      ) : null}
      <PageSection flush id="notes" title="Notes">
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
    </PersonScreen>
  );
}
