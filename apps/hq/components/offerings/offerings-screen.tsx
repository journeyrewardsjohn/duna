import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  buttonClassName,
  ErrorState,
  NotConfigured,
  ObjectHeader,
  OfflineBanner,
  type SubNavItem,
} from "@duna/ui/tideline";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import { PageHeader } from "../shell/page-header";
import { ShellPage } from "../shell/shell-context";
import { renderLink } from "../money/money-link";
import {
  activeCoaches,
  loadCatalog,
  loadDefaults,
  loadOffering,
  loadPublishGate,
  loadSessions,
  loadWorkspace,
  offeringsContext,
  type Loaded,
  type OfferingsContext,
} from "./offerings-data";
import {
  kindForType,
  offeringRule,
  priceSummary,
  publishChecklist,
  ruleSummary,
  scheduleSummary,
  STATUS_LABELS,
  statusTone,
  subtypeLabel,
  type ChecklistItem,
  type OfferingItem,
  type OfferingRule,
} from "./offering-model";
import { OfferingActions } from "./offering-actions";
import { OfferingSubNav } from "./offering-nav";

/** The area's tabs: every offering, this week's sessions at risk, the club's booking rule. */
export type AreaTab = "offerings" | "at-risk" | "settings";

export function areaTabs(context: OfferingsContext): SubNavItem[] {
  return [
    { id: "offerings", label: "All offerings", href: hqHref("offerings") },
    {
      id: "at-risk",
      label: "At risk this week",
      href: hqHref("offeringsAtRisk"),
    },
    ...(context.access.money
      ? [
          {
            id: "settings",
            label: "Booking rules",
            href: hqHref("offeringsSettings"),
          },
        ]
      : []),
  ];
}

/** A block's honest state when its read did not return data. */
export function LoadedState({
  loaded,
  what,
  context,
  retryHref,
}: {
  readonly loaded: Exclude<Loaded<unknown>, { state: "ok" }>;
  readonly what: string;
  readonly context: OfferingsContext;
  readonly retryHref?: string;
}) {
  switch (loaded.state) {
    case "denied":
      return (
        <AccessDeniedState
          area={what}
          compact
          grantedBy={`an owner of ${context.organization}`}
        />
      );
    case "not-configured":
      return (
        <NotConfigured
          canSetUp={false}
          compact
          feature={what.replace(/^\w/, (c) => c.toUpperCase())}
          needs="Duna Database connected in this environment"
          owner="Duna support"
        />
      );
    case "not-found":
      return <p className="pt-quiet">{`Duna has no record of ${what}.`}</p>;
    case "error":
      return (
        <ErrorState
          action={
            retryHref ? (
              <Button href={retryHref} size="sm" variant="secondary">
                Reload
              </Button>
            ) : undefined
          }
          compact
          message="Something went wrong on our side. Reload to try again; the rest of Offerings still works."
          reference={loaded.reference}
          title={`Could not load ${what}`}
        />
      );
  }
}

/** An area screen: the one title, the area tabs, Ask Duna's context, offline. */
export function AreaScreen({
  context,
  tab,
  title,
  description,
  actions,
  askLabel,
  askStarters,
  children,
}: {
  readonly context: OfferingsContext;
  readonly tab: AreaTab;
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly askLabel: string;
  readonly askStarters: readonly string[];
  readonly children: ReactNode;
}) {
  return (
    <div className="of">
      <ShellPage askLabel={askLabel} askStarters={askStarters} />
      <PageHeader
        actions={actions}
        description={description}
        subnav={
          <OfferingSubNav
            current={tab}
            items={areaTabs(context)}
            label="Offerings"
          />
        }
        title={title}
      />
      <OfflineBanner writes="refused" />
      {context.demo ? (
        <p className="pt-quiet of-demo">
          Demo club: what you change here stays in this browser.
        </p>
      ) : null}
      {children}
    </div>
  );
}

export type OfferingTab =
  "overview" | "schedule" | "price" | "group-size" | "people" | "settings";

/** What an open offering page needs, loaded once. */
export interface OfferingPage {
  readonly context: OfferingsContext;
  readonly item: OfferingItem;
  readonly rule: OfferingRule;
  readonly checklist: readonly ChecklistItem[];
  readonly defaults?: {
    readonly rules: unknown;
    readonly appliesTo: readonly string[];
  };
  readonly coachCount: number;
}

export async function loadOfferingPage(itemId: string): Promise<
  | { readonly state: "ok"; readonly page: OfferingPage }
  | { readonly state: "access" | "gone"; readonly context: OfferingsContext }
  | {
      readonly state: "failed";
      readonly context: OfferingsContext;
      readonly loaded: Exclude<Loaded<unknown>, { state: "ok" }>;
    }
> {
  const context = await offeringsContext();
  if (context.session.access !== "operator")
    return { state: "access", context };
  const loaded = await loadOffering(itemId);
  if (loaded.state === "not-found") notFound();
  if (loaded.state !== "ok") return { state: "failed", context, loaded };
  const item = loaded.data;
  if (item.type === "event") return { state: "gone", context };
  const [defaults, workspace, catalog, gate] = await Promise.all([
    loadDefaults(),
    loadWorkspace(),
    loadCatalog(),
    context.access.money ? loadPublishGate() : Promise.resolve(undefined),
  ]);
  const clubDefaults =
    defaults.state === "ok"
      ? { rules: defaults.data.rules, appliesTo: defaults.data.appliesTo }
      : undefined;
  const rule = offeringRule(item, clubDefaults);
  const coachCount =
    workspace.state === "ok" ? activeCoaches(workspace.data).length : 0;
  const hasActiveMembership =
    catalog.state === "ok" &&
    catalog.data.some(
      (candidate) =>
        candidate.type === "plan" &&
        candidate.subtype === "membership" &&
        candidate.status === "active",
    );
  const checklist = publishChecklist(item, {
    gate:
      gate === undefined
        ? "unknown"
        : gate.state === "ok"
          ? gate.data
          : gate.state === "not-configured"
            ? "not-configured"
            : "unknown",
    coachCount: context.demo ? Math.max(1, coachCount) : coachCount,
    hasActiveMembership,
    rule,
  });
  return {
    state: "ok",
    page: {
      context,
      item,
      rule,
      checklist,
      ...(clubDefaults ? { defaults: clubDefaults } : {}),
      coachCount,
    },
  };
}

function sectionTabs(
  item: OfferingItem,
  context: OfferingsContext,
): SubNavItem[] {
  const id = item.id;
  const tabs: SubNavItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: hqHref("offering", { itemId: id }),
    },
  ];
  if (item.type === "service") {
    tabs.push({
      id: "schedule",
      label: "Schedule and sessions",
      href: hqHref("offeringSchedule", { itemId: id }),
    });
  }
  if (context.access.money) {
    tabs.push({
      id: "price",
      label: "Price",
      href: hqHref("offeringPrice", { itemId: id }),
    });
    if (item.type === "service") {
      tabs.push({
        id: "group-size",
        label: "Group size",
        href: hqHref("offeringGroupSize", { itemId: id }),
      });
    }
  }
  tabs.push({
    id: "people",
    label: "People",
    href: hqHref("offeringPeople", { itemId: id }),
  });
  if (context.access.money) {
    tabs.push({
      id: "settings",
      label: "Settings",
      href: hqHref("offeringSettings", { itemId: id }),
    });
  }
  return tabs;
}

/**
 * An open offering (ObjectHeader + SubNav): Overview, Schedule and
 * sessions, Price, Group size, People, Settings. A coach sees the offering,
 * its sessions and its people; prices, rules and settings stay with the
 * people who hold the money permission (the procedures refuse them too).
 */
export function OfferingScreen({
  page,
  tab,
  askStarters,
  children,
}: {
  readonly page: OfferingPage;
  readonly tab: OfferingTab;
  readonly askStarters?: readonly string[];
  readonly children: ReactNode;
}) {
  const { item, context, rule, checklist } = page;
  const kind = kindForType(item.type);
  const group = ruleSummary(item, rule);
  const facts = [
    ...(context.access.money
      ? [{ label: "Price", value: priceSummary(item, context.currency) }]
      : []),
    {
      label: item.type === "service" ? "Schedule" : "Terms",
      value: scheduleSummary(item),
    },
    ...(group
      ? [
          {
            label: "Group",
            value:
              rule.source === "club-default"
                ? `${group} (club default)`
                : group,
          },
        ]
      : []),
  ];
  return (
    <div className="of">
      <ShellPage
        askLabel={`Ask Duna about this offering: ${item.title} (${subtypeLabel(item.subtype)}, ${STATUS_LABELS[item.status]})`}
        askStarters={
          askStarters ?? [
            `Why isn't ${item.title} filling up?`,
            "What should I charge for this?",
            "Make this a clinic that needs 4 players",
          ]
        }
        crumb={item.title}
        parentHref={hqHref("offerings")}
      />
      <ObjectHeader
        actions={
          <OfferingActions
            canWrite={context.access.write}
            checklist={checklist}
            itemId={item.id}
            status={item.status}
            title={item.title}
          />
        }
        back={{ href: hqHref("offerings"), label: "Offerings" }}
        description={`${kind?.label ?? "Offering"} · ${subtypeLabel(item.subtype)}`}
        facts={facts}
        renderLink={renderLink}
        status={{
          label: STATUS_LABELS[item.status],
          tone: statusTone(item.status),
        }}
        subnav={
          <OfferingSubNav
            current={tab}
            items={sectionTabs(item, context)}
            label={item.title}
          />
        }
        title={item.title}
      />
      <OfflineBanner writes="refused" />
      {context.demo ? (
        <p className="pt-quiet of-demo">
          Demo club: what you change here stays in this browser.
        </p>
      ) : null}
      {children}
    </div>
  );
}

/** The page when an offering cannot be shown: no access, an event, or a failed read. */
export function OfferingUnavailable({
  result,
}: {
  readonly result: Exclude<
    Awaited<ReturnType<typeof loadOfferingPage>>,
    { state: "ok" }
  >;
}) {
  if (result.context.session.access !== "operator") return null; // the shell says why
  return (
    <div className="of">
      <ShellPage
        askLabel="Offerings"
        askStarters={[]}
        parentHref={hqHref("offerings")}
      />
      <PageHeader
        back={{ href: hqHref("offerings"), label: "Offerings" }}
        title="Offering"
      />
      <div className="hqs-state">
        {result.state === "gone" ? (
          <p className="pt-quiet">
            Events are edited in Events.{" "}
            <Link
              className={buttonClassName({ variant: "secondary", size: "sm" })}
              href={hqHref("module", { module: "events" })}
            >
              Open Events
            </Link>
          </p>
        ) : result.state === "failed" ? (
          <LoadedState
            context={result.context}
            loaded={result.loaded}
            retryHref={hqHref("offerings")}
            what="this offering"
          />
        ) : null}
      </div>
    </div>
  );
}

/** "You need access" for a section a coach cannot open. */
export function SectionDenied({
  context,
  area,
}: {
  readonly context: OfferingsContext;
  readonly area: string;
}) {
  return (
    <div className="hqs-state">
      <AccessDeniedState
        area={area}
        grantedBy={`an owner of ${context.organization}`}
      />
    </div>
  );
}

export { loadSessions };
