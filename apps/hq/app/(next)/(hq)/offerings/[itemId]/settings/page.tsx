import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import {
  IncludesForm,
  MembershipForm,
  OptionsForm,
  StockReceiver,
  VersionList,
  VisibilityForm,
} from "@/components/offerings/settings-forms";
import { optionsFromVariants } from "@/components/offerings/offering-model";
import {
  loadCatalog,
  loadVersions,
  loadWaivers,
  loadWorkspace,
} from "@/components/offerings/offerings-data";
import {
  LoadedState,
  loadOfferingPage,
  OfferingScreen,
  OfferingUnavailable,
  SectionDenied,
} from "@/components/offerings/offerings-screen";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Offering settings" };

/** Settings: who can book it, terms, what it includes, options and stock, versions. */
export default async function OfferingSettingsPage({
  params,
}: {
  readonly params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  const result = await loadOfferingPage(itemId);
  if (result.state !== "ok") return <OfferingUnavailable result={result} />;
  const { item, context } = result.page;
  if (!context.access.money) {
    return (
      <OfferingScreen page={result.page} tab="settings">
        <SectionDenied area="Offering settings" context={context} />
      </OfferingScreen>
    );
  }
  const [catalog, versions, workspace] = await Promise.all([
    loadCatalog(),
    loadVersions(item.id),
    loadWorkspace(),
  ]);
  const isMembership = item.type === "plan" && item.subtype === "membership";
  const waivers = isMembership ? await loadWaivers() : undefined;
  const live = item.status === "active";
  const others =
    catalog.state === "ok"
      ? catalog.data.filter(
          (other) => other.id !== item.id && other.status !== "archived",
        )
      : [];
  const hasActiveMembership = others.some(
    (other) =>
      other.type === "plan" &&
      other.subtype === "membership" &&
      other.status === "active",
  );
  const stock =
    workspace.state === "ok"
      ? workspace.data.inventory.filter(
          (entry) => entry.catalogItemId === item.id,
        )
      : [];
  return (
    <OfferingScreen page={result.page} tab="settings">
      <PageSection id="visibility" title="Who can see and book it">
        <VisibilityForm
          canWrite={context.access.write}
          hasActiveMembership={hasActiveMembership}
          isMembership={isMembership}
          itemId={item.id}
          live={live}
          membershipRequired={item.membershipRequired}
          title={item.title}
          visibility={item.visibility}
        />
      </PageSection>
      {isMembership ? (
        <PageSection id="terms" title="Membership terms">
          <MembershipForm
            canWrite={context.access.write}
            configuration={item.configuration}
            itemId={item.id}
            live={live}
            offerings={others
              .filter(
                (other) => other.type === "service" || other.type === "event",
              )
              .map((other) => ({ id: other.id, title: other.title }))}
            title={item.title}
            waivers={
              waivers?.state === "ok"
                ? waivers.data.documents
                    .filter(
                      (waiver) =>
                        waiver.status === "active" && waiver.versionId,
                    )
                    .map((waiver) => ({ id: waiver.id, title: waiver.title }))
                : null
            }
          />
        </PageSection>
      ) : null}
      {item.type === "plan" && item.subtype === "bundle" ? (
        <PageSection id="includes" title="What's in the bundle">
          <IncludesForm
            canWrite={context.access.write}
            configuration={item.configuration}
            itemId={item.id}
            kind="bundle"
            live={live}
            offerings={others
              .filter((other) => other.type !== "plan")
              .map((other) => ({ id: other.id, title: other.title }))}
            title={item.title}
          />
        </PageSection>
      ) : null}
      {item.subtype === "program" ? (
        <PageSection id="includes" title="What comes with the program">
          <IncludesForm
            canWrite={context.access.write}
            configuration={item.configuration}
            itemId={item.id}
            kind="program"
            live={live}
            offerings={others
              .filter(
                (other) => other.type === "good" || other.type === "event",
              )
              .map((other) => ({ id: other.id, title: other.title }))}
            title={item.title}
          />
        </PageSection>
      ) : null}
      {item.type === "good" ? (
        <>
          <PageSection id="options" title="Options and stock settings">
            <OptionsForm
              canWrite={context.access.write}
              configuration={item.configuration}
              itemId={item.id}
              live={live}
              options={optionsFromVariants(item).map(({ name, values }) => ({
                name,
                values,
              }))}
              title={item.title}
            />
          </PageSection>
          <PageSection id="stock" title="Stock">
            <p className="pt-quiet">{`${Math.max(0, item.inventoryOnHand - item.inventoryReserved)} available · ${item.inventoryReserved} held for orders.`}</p>
            {stock.length > 0 ? (
              <ul className="pt-roster">
                {stock.slice(0, 8).map((entry) => (
                  <li key={entry.id}>
                    <span>{`${entry.variantTitle} · ${entry.locationName}`}</span>
                    <span className="pt-quiet pt-num">{`${entry.quantityOnHand - entry.quantityReserved} of ${entry.quantityReceived}`}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {context.demo ? (
              <p className="pt-quiet">
                The demo club has no stock records to add to.
              </p>
            ) : (
              <StockReceiver
                canWrite={context.access.write}
                currency={context.currency}
                locations={
                  workspace.state === "ok"
                    ? workspace.data.inventoryLocations
                        .filter((entry) => entry.active)
                        .map((entry) => ({ id: entry.id, name: entry.name }))
                    : []
                }
                variants={item.variants
                  .filter((variant) => variant.status === "active")
                  .map((variant) => ({
                    id: variant.id,
                    label:
                      Object.values(variant.optionCoordinates).join(" · ") ||
                      variant.title,
                  }))}
              />
            )}
          </PageSection>
        </>
      ) : null}
      <PageSection id="versions" title="Versions">
        {versions.state === "ok" ? (
          <VersionList
            canWrite={context.access.write}
            itemId={item.id}
            title={item.title}
            versions={versions.data}
          />
        ) : versions.state === "not-configured" ? (
          <p className="pt-quiet">
            Versions are kept in Duna Database, which the demo club doesn't
            have.
          </p>
        ) : (
          <LoadedState
            context={context}
            loaded={versions}
            retryHref={hqHref("offeringSettings", { itemId })}
            what="this offering's versions"
          />
        )}
      </PageSection>
    </OfferingScreen>
  );
}
