import { Chip, PartialData } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { SignatureRequest } from "@/components/people/person-actions";
import { loadWaivers } from "@/components/people/people-data";
import { firstName, shortDate } from "@/components/people/people-model";
import {
  PeopleBlockState,
  PersonScreen,
  personPage,
} from "@/components/people/people-screen";

export const metadata: Metadata = { title: "Documents" };

/**
 * A person › Documents: the club's waivers and consents with their versions
 * and dates, the junior's guardian consent, and "Send for signature" as a
 * draft reviewed in Inbox (a junior's goes to the guardian).
 */
export default async function PersonDocumentsPage({
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
  const waivers = await loadWaivers();
  const documents =
    waivers.state === "ok"
      ? waivers.data.documents.filter(
          (document) => document.status === "active",
        )
      : [];
  const channel = row.email ? "email" : row.phone ? "sms" : undefined;
  return (
    <PersonScreen
      askStarters={[`Has ${first} signed the club waiver?`]}
      page={page}
      tab="documents"
    >
      <PageSection flush id="waivers" title="Waivers">
        {waivers.state !== "ok" ? (
          <div className="people-pad">
            <PeopleBlockState
              loaded={waivers}
              organization={context.organization}
              what="the club's waivers"
            />
          </div>
        ) : documents.length === 0 ? (
          <p className="people-quiet people-pad">
            The club has no active waiver. Add one in Offerings when a session
            needs it.
          </p>
        ) : (
          <ul className="people-documents">
            {documents.map((document) => (
              <li key={document.id}>
                <span className="people-documents__what">
                  <strong>{document.title}</strong>
                  <span className="people-quiet">
                    {[
                      document.version
                        ? `Version ${document.version}`
                        : undefined,
                      `updated ${shortDate(document.updatedAt, context.timeZone, now)}`,
                      document.requiresParentForMinors && row.isJunior
                        ? "signed by a guardian for juniors"
                        : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {context.capabilities.documents ? (
                  <Chip>Signature not on record here</Chip>
                ) : null}
                {context.canDraft ? (
                  <SignatureRequest
                    channel={channel}
                    clubName={record.people.club.name}
                    documentTitle={document.title}
                    firstName={first}
                    isJunior={row.isJunior}
                    personId={row.id}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PageSection>
      {context.capabilities.documents && documents.length > 0 ? (
        <PartialData missing={["who has signed which version, and when"]} />
      ) : null}

      <PageSection id="consents" title="Consents">
        <ul className="people-facts-list">
          {row.isJunior ? (
            <li>
              <strong>Guardian consent</strong>
              <span>
                {row.guardianState === "verified"
                  ? "Recorded: a guardian accepted and the relationship is confirmed."
                  : row.guardianState === "pending"
                    ? "Asked: the guardian hasn't accepted yet."
                    : "Not recorded: no guardian has accepted yet."}
              </span>
            </li>
          ) : null}
          {record.canSeeHealth ? (
            <li>
              <strong>Health sharing</strong>
              <span>
                {profile.health
                  ? `${first} shares a health summary with the club since ${shortDate(profile.health.grantedAt, context.timeZone, now)}. ${first} can stop it at any time.`
                  : `${first} doesn't share health with the club.`}
              </span>
            </li>
          ) : null}
          <li>
            <strong>Messages</strong>
            <span>
              {row.isJunior
                ? "Messages go to the guardian, following the guardian's own choices."
                : `${first} chooses in their Duna app how the club may reach them.`}
            </span>
          </li>
        </ul>
      </PageSection>
    </PersonScreen>
  );
}
