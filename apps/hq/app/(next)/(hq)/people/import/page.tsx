import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { ImportFlow } from "@/components/people/import-flow";
import { loadPeople, peopleContext } from "@/components/people/people-data";
import {
  PeopleBlockState,
  PeopleScreen,
  PeopleUnavailable,
} from "@/components/people/people-screen";

export const metadata: Metadata = { title: "Import people" };

/**
 * Import people from a spreadsheet: choose, match columns, Duna's dry run
 * (it writes nothing), then one strong confirmation with the counts. The
 * people list is read first so a role or environment that can't see it gets
 * its honest state before choosing a file.
 */
export default async function ImportPeoplePage() {
  const context = await peopleContext();
  const people = await loadPeople();
  return (
    <PeopleScreen
      area="Importing people"
      askLabel="Import people"
      askStarters={["Which columns does an import need?"]}
      back={{ href: hqHref("people"), label: "People" }}
      crumb="Import"
      description="Bring in a list you already have. Nothing is saved until you confirm, and no one is messaged."
      needsWrite
      parentHref={hqHref("people")}
      title="Import people"
    >
      {!context.capabilities.import ? (
        <PeopleUnavailable what="Importing people from a file" />
      ) : people.state === "ok" ? (
        <ImportFlow />
      ) : (
        <PeopleBlockState
          loaded={people}
          organization={context.organization}
          what="the people list"
        />
      )}
    </PeopleScreen>
  );
}
