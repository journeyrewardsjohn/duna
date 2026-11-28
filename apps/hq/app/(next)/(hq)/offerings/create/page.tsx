import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewOffering } from "@/components/offerings/new-offering";
import {
  kindForType,
  kindFromParam,
  templateFor,
  templateFromLegacy,
} from "@/components/offerings/offering-model";
import { offeringsContext } from "@/components/offerings/offerings-data";
import {
  AreaScreen,
  SectionDenied,
} from "@/components/offerings/offerings-screen";

export const metadata: Metadata = { title: "New offering" };

/**
 * New offering: a kind and a template, a name and a price. `?kind=` and
 * `?template=` preselect; the old `?type=service&subtype=program` links pick
 * the matching template; `?clone=` (the old duplicate link) opens the
 * offering, where Duplicate is one click.
 */
export default async function NewOfferingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    kind?: string;
    template?: string;
    type?: string;
    subtype?: string;
    clone?: string;
  }>;
}) {
  const query = await searchParams;
  if (query.clone && /^[0-9a-f-]{36}$/i.test(query.clone)) {
    redirect(hqHref("offering", { itemId: query.clone }));
  }
  const context = await offeringsContext();
  if (context.session.access !== "operator") return null;
  const legacy = templateFromLegacy(query.type, query.subtype);
  const template = templateFor(query.template) ?? legacy;
  const kind =
    kindFromParam(query.kind) ??
    (template ? kindForType(template.type) : undefined);
  return (
    <AreaScreen
      askLabel="New offering"
      askStarters={[
        "Set up a clinic for 4 to 12 players",
        "What should a ten-credit pack cost?",
      ]}
      context={context}
      description="Pick what it is and where to start. Everything else has a sensible default you can change."
      tab="offerings"
      title="New offering"
    >
      {context.access.write ? (
        <NewOffering
          currency={context.currency}
          initialKind={kind?.id}
          initialTemplate={template?.id}
        />
      ) : (
        <SectionDenied area="Creating offerings" context={context} />
      )}
    </AreaScreen>
  );
}
