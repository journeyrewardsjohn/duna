import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  ErrorState,
  ObjectHeader,
  OfflineBanner,
  PartialData,
  type SubNavItem,
} from "@duna/ui/tideline";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import { ShellPage } from "../shell/shell-context";
import { EventHeaderActions } from "./event-actions";
import { EventSubNav } from "./event-subnav";
import { loadEvent, type EventLoad } from "./events-data";
import { KIND_ICON, type EventTab, type EventView } from "./events-model";

type Loaded = Extract<EventLoad, { state: "ok" }>;

const tabWords: Readonly<Record<EventTab, string>> = {
  overview: "Overview",
  entries: "Divisions and entries",
  schedule: "Schedule and courts",
  brackets: "Brackets and results",
  money: "Money",
  notes: "Notes",
  settings: "Settings",
};

export function eventTabHref(sessionId: string, tab: EventTab): string {
  return tab === "overview"
    ? `/events/${sessionId}`
    : `/events/${sessionId}/${tab}`;
}

/** The tabs this event has, with counts (ia-hq.md: Entries, Divisions, Schedule, Money, Details). */
export function eventTabs(loaded: Loaded): SubNavItem[] {
  const { view, context } = loaded;
  const tabs: SubNavItem[] = [
    {
      id: "overview",
      label: "Overview",
      href: eventTabHref(view.id, "overview"),
    },
    {
      id: "entries",
      label: view.competition ? "Divisions and entries" : "Entries",
      href: eventTabHref(view.id, "entries"),
      count: view.entries,
    },
  ];
  if (view.competition) {
    tabs.push(
      {
        id: "schedule",
        label: "Schedule and courts",
        href: eventTabHref(view.id, "schedule"),
        ...(view.matches.length ? { count: view.matches.length } : {}),
      },
      {
        id: "brackets",
        label: "Brackets and results",
        href: eventTabHref(view.id, "brackets"),
      },
    );
  }
  if (context.permissions.money) {
    tabs.push({
      id: "money",
      label: "Money",
      href: eventTabHref(view.id, "money"),
    });
  }
  tabs.push(
    {
      id: "notes",
      label: "Notes",
      href: eventTabHref(view.id, "notes"),
      ...(view.notes.length ? { count: view.notes.length } : {}),
    },
    {
      id: "settings",
      label: "Settings",
      href: eventTabHref(view.id, "settings"),
    },
  );
  return tabs;
}

/**
 * Reads the event for one of its tab pages: the page, or the state to show
 * instead (not found, no access, failed with a reference).
 */
export async function eventPage(
  sessionId: string,
): Promise<
  | { readonly kind: "ok"; readonly loaded: Loaded }
  | { readonly kind: "state"; readonly node: ReactNode }
> {
  const load = await loadEvent(sessionId);
  if (load.state === "missing") notFound();
  if (load.state === "denied") {
    return {
      kind: "state",
      node: (
        <div className="ev">
          <AccessDeniedState area="Events" />
        </div>
      ),
    };
  }
  if (load.state === "error") {
    return {
      kind: "state",
      node: (
        <div className="ev">
          <ErrorState
            message="The event didn't load. Nothing was changed."
            reference={load.reference}
            title="Events are unavailable"
          />
        </div>
      ),
    };
  }
  return { kind: "ok", loaded: load };
}

function facts(view: EventView, loaded: Loaded) {
  const list: { label: string; value: string; numeric?: boolean }[] = [
    { label: "When", value: view.when },
    ...(view.venue ? [{ label: "Where", value: view.venue }] : []),
    view.competition
      ? {
          label: "Teams",
          value: `${view.entries} in · ${view.waitlist} waiting`,
        }
      : {
          label: "Entries",
          value: `${view.entries} of ${view.capacity}`,
        },
  ];
  if (view.live && !view.competition) {
    list.push({
      label: "Checked in",
      value: `${view.checkedIn} of ${view.entries}`,
    });
  }
  if (view.money && loaded.context.permissions.money) {
    list.push({ label: "Net", value: view.money.net, numeric: true });
  }
  return list;
}

/**
 * An open event (S3 object pattern): ObjectHeader with the one title, the
 * state in words, key facts, the one next step on Overview, and the event's
 * SubNav. On event day a live band says what is happening now; Solar is
 * used only while the event is in play.
 */
export function EventScreen({
  loaded,
  tab,
  askStarters = [],
  children,
}: {
  readonly loaded: Loaded;
  readonly tab: EventTab;
  readonly askStarters?: readonly string[];
  readonly children: ReactNode;
}) {
  const { view, context } = loaded;
  const onCourt = view.matches.filter((match) => match.live).length;
  return (
    <div className="ev" data-zone={view.live ? "live" : undefined}>
      <ShellPage
        askLabel={`${view.title} ${tab === "overview" ? "" : tabWords[tab].toLowerCase()} (event ${view.id})`.replace(
          /\s+/g,
          " ",
        )}
        askStarters={askStarters}
        crumb={view.title}
        parentHref={hqHref("events")}
      />
      <ObjectHeader
        actions={
          <EventHeaderActions
            capabilities={context.capabilities}
            permissions={context.permissions}
            primary={tab === "overview"}
            publicUrl={
              view.publicPath
                ? `${context.publicBase}${view.publicPath}`
                : undefined
            }
            view={{
              id: view.id,
              title: view.title,
              next: view.next,
              divisions: view.divisions.length,
              attendees: view.attendees
                .filter(
                  (attendee) =>
                    attendee.status !== "cancelled" &&
                    attendee.status !== "refunded",
                )
                .map((attendee) => ({
                  hasPhone: attendee.hasPhone,
                  hasEmail: attendee.hasEmail,
                })),
              entries: view.entries,
              status: view.status,
            }}
          />
        }
        back={{ href: hqHref("events"), label: "Events" }}
        className="ev-objhead"
        description={[
          view.kindLabel,
          view.coaches.length ? `with ${view.coaches.join(", ")}` : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
        facts={facts(view, loaded)}
        mark={
          <span className="ev-mark" data-live={view.live || undefined}>
            <Icon name={KIND_ICON[view.kind]} size="nav" />
          </span>
        }
        status={{ label: view.statusLabel, tone: view.tone }}
        subnav={
          <EventSubNav
            current={tab}
            items={eventTabs(loaded)}
            label={view.title}
          />
        }
        title={view.title}
      />
      {view.live ? (
        <section aria-label="Live now" className="ev-live">
          <span className="ev-live__word">
            <span aria-hidden className="ev-live__dot" />
            {view.status === "weather-hold" ? "Weather hold" : "Live now"}
          </span>
          <p className="ev-live__facts">
            {view.competition ? (
              <span>
                <strong>{onCourt}</strong> {onCourt === 1 ? "match" : "matches"}{" "}
                on court
              </span>
            ) : null}
            <span>
              <strong>{view.checkedIn}</strong> checked in
            </span>
            {view.arrivals.active ? (
              <span>
                <strong>{view.arrivals.arrived}</strong> arrived ·{" "}
                <strong>{view.arrivals.late}</strong> running late
              </span>
            ) : null}
          </p>
          {tab !== "schedule" && view.competition ? (
            <Link href={eventTabHref(view.id, "schedule")}>
              Courts and matches
            </Link>
          ) : tab !== "entries" && !view.competition ? (
            <Link href={eventTabHref(view.id, "entries")}>Check-in</Link>
          ) : null}
        </section>
      ) : null}
      {view.cancellation ? (
        <p className="ev-quiet">
          <Icon name="alert" size="inline" /> Cancelled
          {view.cancellation.at ? ` on ${view.cancellation.at}` : ""}
          {view.cancellation.by ? ` by ${view.cancellation.by}` : ""}
          {view.cancellation.reason ? `: ${view.cancellation.reason}` : "."}
          {view.cancellation.refundStatus === "attention"
            ? " Some refunds need attention."
            : view.cancellation.refundStatus === "pending"
              ? " Refunds are on their way."
              : ""}
        </p>
      ) : null}
      {loaded.partial.length ? (
        <PartialData
          missing={loaded.partial.map((part) =>
            part === "results"
              ? "Pools, brackets and scores"
              : "Some divisions",
          )}
        />
      ) : null}
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}
