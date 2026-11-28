import type { PeopleHousehold } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Avatar, Button, Chip, Notice } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { loadHousehold } from "@/components/people/people-data";
import {
  firstName,
  type GuardianState,
} from "@/components/people/people-model";
import {
  PeopleBlockState,
  PeopleUnavailable,
  PersonScreen,
  personPage,
} from "@/components/people/people-screen";
import {
  InviteGuardian,
  LinkGuardian,
} from "@/components/people/person-records";

export const metadata: Metadata = { title: "Family" };

const consentWords: Record<
  GuardianState,
  { readonly label: string; readonly tone?: "positive" | "warning" }
> = {
  verified: { label: "Guardian consent recorded", tone: "positive" },
  pending: { label: "Waiting for the guardian to accept", tone: "warning" },
  none: { label: "No guardian consent", tone: "warning" },
};

const reviewWords: Record<
  PeopleHousehold["guardians"][number]["reviewStatus"],
  { readonly label: string; readonly tone?: "positive" | "warning" | "info" }
> = {
  verified: { label: "Verified", tone: "positive" },
  pending: { label: "In review", tone: "info" },
  rejected: { label: "Not accepted", tone: "warning" },
};

const juniorConsentWords: Record<
  PeopleHousehold["juniors"][number]["consent"]["state"],
  { readonly label: string; readonly tone?: "positive" | "warning" }
> = {
  recorded: { label: "Consent recorded", tone: "positive" },
  withdrawn: { label: "Consent withdrawn", tone: "warning" },
  "not-recorded": { label: "Consent not recorded", tone: "warning" },
};

/**
 * A person › Family, as Duna's household record (`household`): guardians
 * with their review state, who is contacted and who pays; juniors with their
 * consent state; and, for a junior, inviting a guardian (a link and a draft
 * to send from Inbox: nothing is sent here) or linking an adult the club
 * knows (in review, consent not recorded).
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
  const household = context.capabilities.household
    ? await loadHousehold(row.id)
    : undefined;
  const addJunior = `${hqHref("memberInvite")}?kind=junior&guardian=${encodeURIComponent(row.id)}`;
  const canChange = context.canWrite && context.capabilities.household;
  const adults = record.people.rows
    .filter((other) => !other.isJunior && other.id !== row.id)
    .map((other) => ({ id: other.id, name: other.name }));
  const personLink = (ref: { personId: string; displayName: string }) =>
    record.people.rows.some((other) => other.id === ref.personId) ? (
      <Link
        className="people-link"
        href={hqHref("member", { personId: ref.personId })}
      >
        {ref.displayName}
      </Link>
    ) : (
      ref.displayName
    );
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
      {!household ? (
        <PeopleUnavailable what="The household record" />
      ) : household.state !== "ok" ? (
        <PeopleBlockState
          loaded={household}
          organization={context.organization}
          what={`${first}'s household`}
        />
      ) : (
        <>
          {row.isJunior || household.data.guardians.length > 0 ? (
            <PageSection flush id="guardians" title="Guardians">
              {household.data.guardians.length === 0 ? (
                <p className="people-quiet people-pad">
                  {`No guardian is linked to ${first} yet. Until one accepts, the club can't book, message or charge for ${first}.`}
                </p>
              ) : (
                <ul className="people-household-list">
                  {household.data.guardians.map((guardian) => (
                    <li key={guardian.personId}>
                      <Avatar name={guardian.displayName} size="md" />
                      <span className="people-household__text">
                        <strong>{personLink(guardian)}</strong>
                        <span className="people-quiet">
                          {[
                            guardian.relationship,
                            guardian.contacted
                              ? `contacted for ${first}`
                              : undefined,
                            guardian.pays === true ? "pays" : undefined,
                            guardian.canApproveSpending
                              ? "approves spending"
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <Chip tone={reviewWords[guardian.reviewStatus].tone}>
                        {reviewWords[guardian.reviewStatus].label}
                      </Chip>
                    </li>
                  ))}
                </ul>
              )}
            </PageSection>
          ) : null}

          {row.isJunior ? (
            <PageSection id="consent" title="Consent and contact">
              <ul className="people-facts-list">
                <li>
                  <strong>Consent</strong>
                  <span>
                    <Chip tone={consentWords[row.guardianState ?? "none"].tone}>
                      {consentWords[row.guardianState ?? "none"].label}
                    </Chip>
                  </span>
                </li>
                <li>
                  <strong>Who is contacted</strong>
                  <span>
                    {household.data.contact
                      ? `${household.data.contact.displayName}. `
                      : "A verified guardian, once one accepts. "}
                    {`The club never contacts ${first} directly, and ${first}'s page has no contact of their own.`}
                  </span>
                </li>
                {household.data.payer ? (
                  <li>
                    <strong>Who pays</strong>
                    <span>{household.data.payer.displayName}</span>
                  </li>
                ) : null}
              </ul>
            </PageSection>
          ) : (
            <>
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
                {household.data.juniors.length === 0 ? (
                  <p className="people-quiet people-pad">
                    {`${first} isn't a guardian of any junior at the club.`}
                  </p>
                ) : (
                  <ul className="people-household-list">
                    {household.data.juniors.map((junior) => (
                      <li key={junior.personId}>
                        <Avatar name={junior.displayName} size="md" />
                        <span className="people-household__text">
                          <strong>{personLink(junior)}</strong>
                          {junior.consent.at ? (
                            <span className="people-quiet">
                              {`Since ${junior.consent.at.slice(0, 10)}`}
                            </span>
                          ) : null}
                        </span>
                        <Chip
                          tone={juniorConsentWords[junior.consent.state].tone}
                        >
                          {juniorConsentWords[junior.consent.state].label}
                        </Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </PageSection>
              <PageSection id="contact" title="Contact">
                <p className="people-body">
                  {household.data.juniors.length > 0
                    ? `${first} is contacted for themselves and for their juniors.`
                    : `${first} is contacted directly.`}
                  {household.data.payer
                    ? ` ${household.data.payer.displayName} pays for ${first}'s bookings.`
                    : ""}
                </p>
              </PageSection>
            </>
          )}

          {row.isJunior && canChange ? (
            <>
              <PageSection id="invite-guardian" title="Invite a guardian">
                <p className="people-body">
                  {`Makes ${first}'s guardian invitation link and a draft message for you to send from Inbox. Nothing is sent from here.`}
                </p>
                <InviteGuardian
                  juniorFirstName={first}
                  juniorPersonId={row.id}
                />
              </PageSection>
              <PageSection
                id="link-guardian"
                title="Link a guardian the club knows"
              >
                <LinkGuardian
                  adults={adults}
                  juniorFirstName={first}
                  juniorPersonId={row.id}
                />
              </PageSection>
            </>
          ) : null}
          {row.isJunior ? (
            <Notice title="A second guardian" tone="info">
              A guardian can also add another guardian from their own Duna app,
              where each one accepts by link.
            </Notice>
          ) : null}
        </>
      )}
    </PersonScreen>
  );
}
