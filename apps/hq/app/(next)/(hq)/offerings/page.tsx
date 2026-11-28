import { hqHref } from "@duna/core/hq-routes";
import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import {
  OfferingList,
  OfferingsFirstUse,
  type OfferingRow,
} from "@/components/offerings/offering-list";
import {
  kindForType,
  missingSentence,
  offeringRule,
  priceSummary,
  publishChecklist,
  ruleSummary,
  scheduleSummary,
  STATUS_LABELS,
  subtypeLabel,
} from "@/components/offerings/offering-model";
import {
  activeCoaches,
  loadCatalog,
  loadDefaults,
  loadPublishGate,
  loadWorkspace,
  offeringsContext,
} from "@/components/offerings/offerings-data";
import {
  AreaScreen,
  LoadedState,
} from "@/components/offerings/offerings-screen";

export const metadata: Metadata = { title: "Offerings" };

/**
 * Offerings (H-OFFER): every lesson, group, membership, pack and product as
 * an object row. Kinds are in-page filters; "New offering" starts from a
 * kind and a template.
 */
export default async function OfferingsPage() {
  const context = await offeringsContext();
  if (context.session.access !== "operator") return null; // the shell says why
  const [catalog, defaults, workspace, gate] = await Promise.all([
    loadCatalog(),
    loadDefaults(),
    loadWorkspace(),
    context.access.money ? loadPublishGate() : Promise.resolve(undefined),
  ]);
  const clubDefaults =
    defaults.state === "ok"
      ? { rules: defaults.data.rules, appliesTo: defaults.data.appliesTo }
      : undefined;
  const coachCount =
    workspace.state === "ok" ? activeCoaches(workspace.data).length : 0;
  const performance =
    workspace.state === "ok" ? workspace.data.productPerformance : [];
  const items = catalog.state === "ok" ? catalog.data : [];
  const hasActiveMembership = items.some(
    (item) =>
      item.type === "plan" &&
      item.subtype === "membership" &&
      item.status === "active",
  );
  const rows: OfferingRow[] = items.map((item) => {
    const rule = offeringRule(item, clubDefaults);
    const checklist = publishChecklist(item, {
      gate:
        gate?.state === "ok"
          ? gate.data
          : gate?.state === "not-configured"
            ? "not-configured"
            : "unknown",
      coachCount: context.demo ? Math.max(1, coachCount) : coachCount,
      hasActiveMembership,
      rule,
    });
    const group = ruleSummary(item, rule);
    const customers = performance.find(
      (entry) => entry.catalogItemId === item.id,
    )?.uniqueCustomers;
    return {
      id: item.id,
      title: item.title,
      kind: kindForType(item.type)?.id ?? "services",
      kindLabel: kindForType(item.type)?.label ?? "Offering",
      subtypeLabel: subtypeLabel(item.subtype),
      status: item.status,
      statusLabel: STATUS_LABELS[item.status],
      ...(context.access.money
        ? { price: priceSummary(item, context.currency) }
        : {}),
      schedule: scheduleSummary(item),
      ...(group ? { group, inherited: rule.source === "club-default" } : {}),
      ...(context.access.money && missingSentence(checklist)
        ? { missing: missingSentence(checklist) }
        : {}),
      ...(customers !== undefined ? { customers } : {}),
    };
  });
  return (
    <AreaScreen
      actions={
        context.access.write ? (
          <Button href={hqHref("offeringCreate")} variant="primary">
            New offering
          </Button>
        ) : undefined
      }
      askLabel="Offerings"
      askStarters={[
        "Which offerings aren't selling?",
        "Make every clinic need 4 players",
        "Set up a monthly membership with two credits",
      ]}
      context={context}
      description={`What ${context.organization} sells: lessons, groups, memberships, packs and products`}
      tab="offerings"
      title="Offerings"
    >
      {catalog.state !== "ok" ? (
        <div className="hqs-state">
          <LoadedState
            context={context}
            loaded={catalog}
            retryHref={hqHref("offerings")}
            what="your offerings"
          />
        </div>
      ) : rows.length === 0 ? (
        <OfferingsFirstUse canWrite={context.access.write} />
      ) : (
        <OfferingList canWrite={context.access.write} rows={rows} />
      )}
    </AreaScreen>
  );
}
