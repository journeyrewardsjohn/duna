import { hqHref } from "@duna/core/hq-routes";
import { Avatar, Button, Chip, Notice } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  firstName,
  type GuardianState,
  normaliseName,
} from "@/components/people/people-model";
import { PersonScreen, personPage } from "@/components/people/people-screen";

export const metadata: Metadata = { title: "Family" };

const consentWords: Record<
  GuardianState,
  { readonly label: string; readonly tone?: "positive" | "warning" }
> = {
  verified: { label: "Guardian consent recorded", tone: "positive" },
  pending: { label: "Waiting for the guardian to accept", tone: "warning" },
  none: { label: "No guardian consent", tone: "warning" },
};

/**
 * A person › Family, as a household: guardians and juniors linked both ways,
 * who pays and who is contacted (the guardian, never the junior), consent
 * per junior, and adding a junior through the club's invitation (the
 * guardian accepts before the junior joins).
 */
export default async function PersonFamilyPage({
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
  const { row } = record;
  const first = firstName(row.name);
  const juniors = row.isJunior
    ? []
    : record.people.rows.filter(
        (other) =>
          other.isJunior &&
          other.guardianName &&
          normaliseName(other.guardianName) === normaliseName(row.name),
      );
  const guardian =
    row.isJunior && row.guardianName
      ? record.people.rows.find(
          (other) =>
            !other.isJunior &&
            normaliseName(other.name) === normaliseName(row.guardianName!),
        )
      : undefined;
  const addJunior = `${hqHref("memberInvite")}?kind=junior&guardian=${encodeURIComponent(row.id)}`;
  return (
    <PersonScreen
      actions={
        context.canWrite && !row.isJunior ? (
          <Button href={addJunior} size="sm" variant="secondary">
            Add a junior
          </Button>
        ) : undefined
      }
      askStarters={
        row.isJunior
          ? [
              `Who is ${first}'s guardian?`,
              `Has ${first}'s guardian signed the waiver?`,
            ]
          : [`Which juniors is ${first} the guardian of?`]
      }
      page={page}
      tab="family"
    >
      {row.isJunior ? (
        <>
          <PageSection id="guardian" title="Guardian">
            <div className="people-household">
              <div className="people-household__person">
                <Avatar name={row.guardianName ?? "Guardian"} size="md" />
                <span className="people-household__text">
                  <strong>
                    {guardian ? (
                      <Link
                        className="people-link"
                        href={hqHref("member", { personId: guardian.id })}
                      >
                        {guardian.name}
                      </Link>
                    ) : (
                      (row.guardianName ?? "Not named yet")
                    )}
                  </strong>
                  <span className="people-quiet">
                    Contacted for {first}, books and pays for them
                  </span>
                </span>
                <Chip tone={consentWords[row.guardianState ?? "none"].tone}>
                  {consentWords[row.guardianState ?? "none"].label}
                </Chip>
              </div>
            </div>
            <ul className="people-facts-list">
              <li>
                <strong>Who is contacted</strong>
                <span>
                  {row.guardianName ?? "The guardian"}. The club never contacts{" "}
                  {first} directly, and {first}&apos;s page has no contact of
                  their own.
                </span>
              </li>
              <li>
                <strong>Who pays</strong>
                <span>The guardian, from their own Duna account.</span>
              </li>
              <li>
                <strong>Consent</strong>
                <span>
                  {row.guardianState === "verified"
                    ? "A guardian accepted and the relationship is confirmed."
                    : row.guardianState === "pending"
                      ? "The guardian has been asked and hasn't accepted yet. Until then the club can't book, message or charge for this junior."
                      : "No guardian has accepted yet. Until one does, the club can't book, message or charge for this junior."}
                </span>
              </li>
            </ul>
          </PageSection>
          <Notice title="A second guardian" tone="info">
            A guardian adds another guardian from their own Duna app, where each
            one accepts by link. Linking a guardian from HQ isn&apos;t switched
            on yet.
          </Notice>
        </>
      ) : (
        <PageSection
          aside={
            context.canWrite ? (
              <Link className="people-link" href={addJunior}>
                Add a junior
              </Link>
            ) : undefined
          }
          flush
          id="juniors"
          title="Juniors"
        >
          {juniors.length === 0 ? (
            <p className="people-quiet people-pad">
              {row.isGuardian
                ? `No junior invited by the club names ${first} as guardian. Juniors ${first} added in the Duna app appear here once household links reach HQ.`
                : `${first} isn't a guardian of any junior at the club.`}
            </p>
          ) : (
            <ul className="people-household-list">
              {juniors.map((junior) => (
                <li key={junior.id}>
                  <Avatar name={junior.name} size="md" />
                  <Link
                    className="people-link"
                    href={hqHref("member", { personId: junior.id })}
                  >
                    {junior.name}
                  </Link>
                  <Chip
                    tone={consentWords[junior.guardianState ?? "none"].tone}
                  >
                    {consentWords[junior.guardianState ?? "none"].label}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </PageSection>
      )}
      {!row.isJunior ? (
        <PageSection id="contact" title="Contact">
          <p className="people-body">
            {row.isGuardian || juniors.length > 0
              ? `${first} is contacted for themselves and for their juniors, and pays for their juniors' bookings.`
              : `${first} is contacted directly and pays for their own bookings.`}
          </p>
        </PageSection>
      ) : null}
    </PersonScreen>
  );
}
