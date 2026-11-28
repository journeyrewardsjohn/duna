import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { MergeFlow } from "@/components/people/merge-flow";
import { loadPeople, peopleContext } from "@/components/people/people-data";
import {
  PeopleBlockState,
  PeopleScreen,
  PeopleUnavailable,
} from "@/components/people/people-screen";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Merge duplicates" };

/** Merge two records of one person, side by side (`?a=<id>&b=<id>`). */
export default async function MergePeoplePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const context = await peopleContext();
  const people = await loadPeople();
  return (
    <PeopleScreen
      area="Merging people"
      askLabel="Merge duplicates"
      askStarters={["Are these two records the same person?"]}
      back={{ href: hqHref("people"), label: "People" }}
      crumb="Merge"
      description="Two records of one person become one. You choose which record stays."
      needsWrite
      parentHref={hqHref("people")}
      title="Merge duplicates"
    >
      <PageSection id="merge" title="Which two records?">
        {!context.capabilities.merge ? (
          <PeopleUnavailable what="Merging two people" />
        ) : people.state === "ok" ? (
          <MergeFlow
            initialA={a}
            initialB={b}
            people={people.data.rows.map((row) => ({
              id: row.id,
              name: row.name,
              email: row.email,
              phone: row.phone,
              isJunior: row.isJunior,
              plan: row.plan,
              credits: row.credits,
              memberSince: row.memberSince,
              upcoming: row.upcoming,
            }))}
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
