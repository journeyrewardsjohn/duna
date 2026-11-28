import { formatMoney } from "@duna/core";
import { hqHref } from "@duna/core/hq-routes";
import type { Metadata } from "next";
import Link from "next/link";
import {
  loadAtRisk,
  loadCancelRequests,
  loadSessions,
  offeringShareUrls,
  offeringsContext,
} from "@/components/offerings/offerings-data";
import {
  AreaScreen,
  LoadedState,
} from "@/components/offerings/offerings-screen";
import { SessionList } from "@/components/participation/session-list";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "At risk this week" };

const reasonLabels = {
  coach: "the coach can't make it",
  weather: "the weather",
  venue: "the venue isn't available",
  other: "another reason",
} as const;

/**
 * At risk this week (PART-7): every session that needs players before its
 * decision time, with who is booked and, for people who may see money,
 * what is at stake; and coaches' requests to cancel. Each session opens as
 * a side panel with its actions.
 */
export default async function AtRiskPage() {
  const context = await offeringsContext();
  if (context.session.access !== "operator") return null;
  const [atRisk, requests, all, shareUrls] = await Promise.all([
    loadAtRisk(),
    loadCancelRequests(),
    loadSessions(undefined),
    offeringShareUrls(),
  ]);
  const allSessions = all.state === "ok" ? all.data : [];
  // The at-risk list has no roster: take it from the sessions list when it's there.
  const sessions =
    atRisk.state === "ok"
      ? atRisk.data.sessions.map((session) => {
          const full = allSessions.find(
            (candidate) => candidate.id === session.id,
          );
          return full
            ? { ...session, bookings: full.bookings, endsAt: full.endsAt }
            : session;
        })
      : [];
  const pool = [
    ...sessions,
    ...allSessions.filter(
      (session) => !sessions.some((risk) => risk.id === session.id),
    ),
  ];
  const totals = atRisk.state === "ok" ? atRisk.data.totals : undefined;
  const stake =
    totals && context.access.money
      ? [
          totals.atStakeCredits
            ? `${totals.atStakeCredits} credits`
            : undefined,
          totals.atStakeMinor
            ? formatMoney(totals.atStakeMinor, totals.currency)
            : undefined,
        ]
          .filter(Boolean)
          .join(" and ")
      : "";
  return (
    <AreaScreen
      askLabel="Sessions at risk this week"
      askStarters={[
        "Which of these sessions should I merge?",
        "Draft a message to fill Thursday's clinic",
      ]}
      context={context}
      description={
        totals && totals.sessions > 0
          ? `${totals.sessions} session${totals.sessions === 1 ? " needs" : "s need"} players this week · ${totals.booked} ${totals.booked === 1 ? "person" : "people"} booked${stake ? ` · ${stake} at stake` : ""}`
          : "Sessions that need players before their decision time"
      }
      tab="at-risk"
      title="At risk this week"
    >
      <PageSection id="sessions" title="Sessions that need players" flush>
        {atRisk.state !== "ok" ? (
          <LoadedState
            context={context}
            loaded={atRisk}
            retryHref={hqHref("offeringsAtRisk")}
            what="this week's sessions"
          />
        ) : sessions.length === 0 ? (
          <p className="pt-quiet of-pad">
            Every session this week has enough players.
          </p>
        ) : (
          <SessionList
            allSessions={pool}
            currency={context.currency}
            label="Sessions at risk this week"
            now={context.now}
            permissions={{
              money: context.access.money,
              sessions: context.access.sessions,
            }}
            sessions={sessions}
            shareUrls={shareUrls}
            showFilters={false}
            showTitle
          />
        )}
      </PageSection>
      {context.access.sessions || context.access.money ? (
        <PageSection id="requests" title="Coaches asking to cancel" flush>
          {requests.state !== "ok" ? (
            <LoadedState
              context={context}
              loaded={requests}
              retryHref={hqHref("offeringsAtRisk")}
              what="requests to cancel"
            />
          ) : requests.data.filter((request) => request.status === "open")
              .length === 0 ? (
            <p className="pt-quiet of-pad">No requests right now.</p>
          ) : (
            <ul className="of-tasks of-pad" aria-label="Requests to cancel">
              {requests.data
                .filter((request) => request.status === "open")
                .map((request) => {
                  const session = pool.find(
                    (candidate) => candidate.id === request.subjectId,
                  );
                  return (
                    <li key={request.id}>
                      <span className="of-tasks__text">
                        <span className="of-row__title">
                          {session
                            ? `${session.title}, ${session.startLabel}`
                            : "A session"}
                        </span>
                        <span className="pt-quiet">{`A coach asked to cancel. Reason: ${reasonLabels[request.reason]}.`}</span>
                      </span>
                      <Link
                        className="of-inline-link"
                        href={`${hqHref("offeringsAtRisk")}?session=${request.subjectId}`}
                      >
                        Open the session
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </PageSection>
      ) : null}
    </AreaScreen>
  );
}
