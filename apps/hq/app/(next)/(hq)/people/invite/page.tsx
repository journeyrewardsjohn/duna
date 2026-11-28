import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { AddPersonForm } from "@/components/people/add-person-form";
import { loadPeople, peopleContext } from "@/components/people/people-data";
import {
  PeopleBlockState,
  PeopleScreen,
} from "@/components/people/people-screen";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Add a person" };

/**
 * Add a person (the old "Invite a person" address): one short form, with
 * duplicates explained before anything is saved. `?kind=junior&guardian=<id>`
 * starts a junior for a guardian already at the club (their contact is read
 * here on the server, never carried in the address).
 */
export default async function AddPersonPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ kind?: string; guardian?: string }>;
}) {
  const { kind, guardian } = await searchParams;
  const context = await peopleContext();
  const people = await loadPeople();
  const guardianRow =
    people.state === "ok" && guardian
      ? people.data.rows.find((row) => row.id === guardian && !row.isJunior)
      : undefined;
  return (
    <PeopleScreen
      area="Adding people"
      askLabel="Add a person"
      askStarters={["Is this person already at the club?"]}
      back={{ href: hqHref("people"), label: "People" }}
      crumb="Add a person"
      description="They get the club's invitation. A junior's goes to their guardian."
      needsWrite
      parentHref={hqHref("people")}
      title="Add a person"
    >
      <PageSection id="add" title="Who are you adding?">
        {people.state === "ok" ? (
          <AddPersonForm
            guardian={
              guardianRow
                ? {
                    id: guardianRow.id,
                    name: guardianRow.name,
                    email: guardianRow.email,
                    phone: guardianRow.phone,
                  }
                : undefined
            }
            initialKind={kind === "junior" ? "junior" : "adult"}
            people={people.data.candidates}
          />
        ) : (
          <PeopleBlockState
            loaded={people}
            organization={context.organization}
            what="the people list"
          />
        )}
      </PageSection>
    </PeopleScreen>
  );
}
