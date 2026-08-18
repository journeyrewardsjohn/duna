import { redirect } from "next/navigation";
import { WaiverAppHandoff } from "@/components/waiver-app-handoff";
import { WaiverSignaturePanel } from "@/components/waiver-signature-panel";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getServerCaller } from "@/lib/api";

function isUuid(value: string | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}

export default async function CompleteWaiverPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    organizationId?: string;
    waiverDocumentId?: string;
    subjectPersonId?: string;
  }>;
}) {
  const query = await searchParams;
  if (
    !isUuid(query.organizationId) ||
    !isUuid(query.waiverDocumentId) ||
    !isUuid(query.subjectPersonId)
  ) {
    redirect("/");
  }
  const returnTo = `/waivers/complete?organizationId=${query.organizationId}&waiverDocumentId=${query.waiverDocumentId}&subjectPersonId=${query.subjectPersonId}`;
  const caller = await getServerCaller();
  const requirements = await caller.player
    .waiverRequirements({
      organizationId: query.organizationId,
      subjectPersonId: query.subjectPersonId,
      waiverDocumentIds: [query.waiverDocumentId],
    })
    .catch(() => undefined);
  if (!requirements) {
    redirect(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  const requirement = requirements[0];
  if (!requirement) redirect("/");

  return (
    <main className="waiver-completion-page" data-zone="editorial">
      <SiteHeader />
      <section className="waiver-completion-page__content">
        <div>
          <span className="section__eyebrow">Participation requirement</span>
          <h1>Finish the waiver</h1>
          <p>
            This is required before the participant can take part. The purchase
            is already complete.
          </p>
          <WaiverAppHandoff
            organizationId={query.organizationId}
            subjectPersonId={query.subjectPersonId}
            waiverDocumentId={query.waiverDocumentId}
          />
        </div>
        <WaiverSignaturePanel
          organizationId={query.organizationId}
          requirements={requirements}
        />
      </section>
      <SiteFooter />
    </main>
  );
}
