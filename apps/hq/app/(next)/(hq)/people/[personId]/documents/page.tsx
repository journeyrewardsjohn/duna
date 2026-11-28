import type { PeopleDocument } from "@duna/api";
import { Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { loadDocuments } from "@/components/people/people-data";
import { firstName, shortDate } from "@/components/people/people-model";
import {
  PeopleBlockState,
  PeopleUnavailable,
  PersonScreen,
  personPage,
} from "@/components/people/people-screen";
import { SignatureRequest } from "@/components/people/person-records";

export const metadata: Metadata = { title: "Documents" };

/** Each status in words, exactly as Duna recorded it. */
const statusWords: Record<
  PeopleDocument["status"],
  { readonly label: string; readonly tone?: "positive" | "warning" | "info" }
> = {
  signed: { label: "Signed", tone: "positive" },
  missing: { label: "Not signed", tone: "warning" },
  expired: { label: "Expired", tone: "warning" },
  superseded: { label: "New version to sign", tone: "info" },
  withdrawn: { label: "Withdrawn", tone: "warning" },
};

/**
 * A person › Documents (`documents`): each waiver and consent with the
 * version signed against the current one, who signed (the guardian for a
 * junior) and when, expiry and status; "Ask for a signature" saves a draft
 * in Inbox (`requestSignature`), reviewed and sent there.
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
  const { row } = record;
  const now = new Date(context.now);
  const first = firstName(row.name);
  const documents = context.capabilities.documents
    ? await loadDocuments(row.id)
    : undefined;
  const date = (iso: string) => shortDate(iso, context.timeZone, now);
  const list = (kind: PeopleDocument["kind"], empty: string) => {
    if (!documents || documents.state !== "ok") return null;
    const items = documents.data.documents.filter(
      (document) => document.kind === kind,
    );
    if (items.length === 0)
      return <p className="people-quiet people-pad">{empty}</p>;
    return (
      <ul className="people-documents">
        {items.map((document) => {
          const words = statusWords[document.status] ?? {
            label: `Status: ${document.status}`,
          };
          const needsSignature =
            document.status !== "signed" && document.kind === "waiver";
          return (
            <li key={document.documentId}>
              <span className="people-documents__what">
                <strong>{document.title}</strong>
                <span className="people-quiet">
                  {[
                    document.versionSigned !== undefined
                      ? `Version ${document.versionSigned} signed`
                      : undefined,
                    document.currentVersion !== undefined &&
                    document.currentVersion !== document.versionSigned
                      ? `current is version ${document.currentVersion}`
                      : undefined,
                    document.signedAt
                      ? `on ${date(document.signedAt)}`
                      : undefined,
                    document.signedBy
                      ? document.signedBy.role === "guardian"
                        ? `by ${document.signedBy.displayName}, guardian`
                        : `by ${document.signedBy.displayName}`
                      : undefined,
                    document.expiresAt
                      ? `${new Date(document.expiresAt) < now ? "expired" : "expires"} ${date(document.expiresAt)}`
                      : undefined,
                    document.required ? "required" : "optional",
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <Chip tone={words.tone}>{words.label}</Chip>
              {needsSignature && context.canDraft ? (
                <SignatureRequest
                  documentTitle={document.title}
                  isJunior={row.isJunior}
                  personId={row.id}
                  waiverDocumentId={document.documentId}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
    );
  };
  return (
    <PersonScreen
      askStarters={[`Has ${first} signed the club waiver?`]}
      page={page}
      tab="documents"
    >
      {!documents ? (
        <PeopleUnavailable what="Signed documents" />
      ) : documents.state !== "ok" ? (
        <PeopleBlockState
          loaded={documents}
          organization={context.organization}
          what={`${first}'s documents`}
        />
      ) : (
        <>
          <PageSection flush id="waivers" title="Waivers">
            {list(
              "waiver",
              "The club has no active waiver. Add one in Offerings when a session needs it.",
            )}
          </PageSection>
          <PageSection flush id="consents" title="Consents">
            {list(
              "consent",
              row.isJunior
                ? `No parental consent is recorded for ${first} yet.`
                : `No consent documents for ${first}.`,
            )}
          </PageSection>
          <PageSection id="messages" title="Messages and health">
            <ul className="people-facts-list">
              <li>
                <strong>Messages</strong>
                <span>
                  {row.isJunior
                    ? "Messages, and signature requests, go to a verified guardian, following the guardian's own choices."
                    : `${first} chooses in their Duna app how the club may reach them.`}
                </span>
              </li>
              {record.canSeeHealth ? (
                <li>
                  <strong>Health sharing</strong>
                  <span>{`${first} shares a health summary that you may see. ${first} can stop it at any time.`}</span>
                </li>
              ) : null}
            </ul>
          </PageSection>
        </>
      )}
    </PersonScreen>
  );
}
