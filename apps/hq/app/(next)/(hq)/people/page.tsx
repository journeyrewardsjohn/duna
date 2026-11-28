import { hqHref } from "@duna/core/hq-routes";
import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import {
  type DuplicatePair,
  PeopleList,
} from "@/components/people/people-list";
import { loadPeople, peopleContext } from "@/components/people/people-data";
import {
  findDuplicatePairs,
  listStateFromParams,
} from "@/components/people/people-model";
import {
  PeopleBlockState,
  PeopleScreen,
} from "@/components/people/people-screen";

export const metadata: Metadata = { title: "People" };

/**
 * People: every player, member, parent and junior as an object row, with
 * search, segments as shareable addresses and safe bulk actions.
 */
export default async function PeoplePage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    segment?: string;
    q?: string;
    focus?: string;
  }>;
}) {
  const params = await searchParams;
  const context = await peopleContext();
  const people = await loadPeople();
  const initial = listStateFromParams(params);
  const duplicates: DuplicatePair[] =
    people.state === "ok" && context.canWrite
      ? findDuplicatePairs(people.data.candidates)
          .slice(0, 20)
          .map((pair) => ({
            aId: pair.a.id,
            bId: pair.b.id,
            aName: pair.a.name,
            bName: pair.b.name,
            reason: pair.reason,
          }))
      : [];
  const count = people.state === "ok" ? people.data.rows.length : undefined;
  return (
    <PeopleScreen
      actions={
        context.canWrite && count !== 0 ? (
          <>
            <Button href={hqHref("peopleImport")} variant="secondary">
              Import
            </Button>
            <Button href={hqHref("memberInvite")} variant="primary">
              Add a person
            </Button>
          </>
        ) : undefined
      }
      askLabel="People"
      askStarters={[
        "Who hasn't played in a month?",
        "Which juniors still need a guardian's consent?",
        "Whose membership ends this month?",
      ]}
      description={
        count === undefined
          ? `The players, members, parents and juniors of ${context.organization}`
          : `${count} ${count === 1 ? "person" : "people"} at ${context.organization}`
      }
      title="People"
    >
      {people.state === "ok" ? (
        <PeopleList
          canDraft={context.canDraft}
          canExport={context.canExport}
          canWrite={context.canWrite}
          duplicates={duplicates}
          focusSearch={params.focus === "search"}
          initial={initial}
          now={context.now}
          rows={people.data.rows}
          timeZone={context.timeZone}
        />
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
