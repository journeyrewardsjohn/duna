import { Icon } from "@duna/ui/icons";
import { Notice } from "@duna/ui/tideline";
import Link from "next/link";
import { PageSection } from "../shell/page-header";
import { CloseRegistration, PublishLive } from "./event-actions";
import { eventTabHref } from "./event-screen";
import { MatchCard } from "./event-match";
import type { EventPermissions, EventView } from "./events-model";

/**
 * An event's Overview: the launch steps of a tournament or league (each
 * with its action or the tab where the work is), the numbers that matter,
 * what needs attention, and on event day who is arriving and what is on
 * court. The header carries the one next step.
 */
export function EventOverview({
  view,
  permissions,
}: {
  readonly view: EventView;
  readonly permissions: EventPermissions;
}) {
  const onCourt = view.matches.filter((match) => match.live);
  const pendingIndex = view.launch.findIndex((step) => !step.done);
  return (
    <div className="ev-grid">
      <div className="ev-stack">
        {view.launch.length > 0 ? (
          <PageSection flush id="launch" title="Getting to game day">
            <ol className="ev-steps">
              {view.launch.map((step, index) => (
                <li
                  className="ev-step"
                  data-done={step.done || undefined}
                  key={step.id}
                >
                  <span aria-hidden className="ev-step__mark">
                    {step.done ? <Icon name="check" size="chip" /> : index + 1}
                  </span>
                  <span className="ev-step__text">
                    <strong>
                      {step.label}
                      <span className="ev-sr">
                        {step.done ? " (done)" : " (to do)"}
                      </span>
                    </strong>
                    <span className="ev-quiet">{step.detail}</span>
                  </span>
                  {step.done ? null : step.id === "close" &&
                    permissions.change ? (
                    index === pendingIndex ? null : (
                      <CloseRegistration
                        eventId={view.id}
                        teams={view.entries}
                        title={view.title}
                      />
                    )
                  ) : step.id === "publish" && permissions.change ? (
                    index === pendingIndex ? null : (
                      <PublishLive
                        disabled
                        eventId={view.id}
                        title={view.title}
                      />
                    )
                  ) : step.tab ? (
                    <Link
                      className="ev-link"
                      href={eventTabHref(view.id, step.tab)}
                    >
                      {step.tab === "schedule"
                        ? "Schedule matches"
                        : "Seeds and draw"}
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
          </PageSection>
        ) : null}

        {onCourt.length > 0 ? (
          <PageSection
            aside={
              <Link
                className="ev-link"
                href={eventTabHref(view.id, "schedule")}
              >
                All courts
              </Link>
            }
            id="on-court"
            title="On court now"
          >
            <ul className="ev-matches">
              {onCourt.slice(0, 6).map((match) => (
                <li key={match.id}>
                  <MatchCard match={match} timeZone={view.timeZone} />
                </li>
              ))}
            </ul>
          </PageSection>
        ) : null}

        {view.arrivals.active ? (
          <PageSection
            aside={
              <span className="ev-quiet">{view.arrivals.arrived} arrived</span>
            }
            flush
            id="arrivals"
            title={
              view.arrivals.late
                ? `${view.arrivals.late} running late`
                : "Who is on the way"
            }
          >
            {view.arrivals.people.length ? (
              <ul className="ev-list">
                {view.arrivals.people.map((person, index) => (
                  <li className="ev-item" key={`${person.name}-${index}`}>
                    <span className="ev-item__main">
                      <span className="ev-item__title">{person.name}</span>
                      <span className="ev-quiet">{person.status}</span>
                    </span>
                    {person.eta ? (
                      <span className="ev-item__side ev-num">{person.eta}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ev-quiet ev-pad">
                Players appear here when they share their arrival from their
                Duna session card.
              </p>
            )}
            <p className="ev-quiet ev-pad">
              Only arrival status and time are shown, never where anyone is.
            </p>
          </PageSection>
        ) : null}
      </div>

      <div className="ev-stack">
        <dl className="ev-figures">
          <div className="ev-figure">
            <dt>{view.competition ? "Teams in the field" : "Entries"}</dt>
            <dd>{view.entries}</dd>
            <small>
              {view.competition
                ? `${view.divisions.length} ${view.divisions.length === 1 ? "division" : "divisions"}`
                : `${Math.max(0, view.capacity - view.entries)} places left`}
            </small>
          </div>
          <div className="ev-figure">
            <dt>Waitlist</dt>
            <dd>{view.waitlist}</dd>
          </div>
          {view.segment !== "upcoming" && view.segment !== "drafts" ? (
            <div className="ev-figure">
              <dt>Checked in</dt>
              <dd>{view.checkedIn}</dd>
              <small>{view.noShows} no-shows</small>
            </div>
          ) : null}
          {view.money ? (
            <div className="ev-figure">
              <dt>Net collected</dt>
              <dd>{view.money.net}</dd>
              <small>{view.money.refunded} refunded</small>
            </div>
          ) : null}
        </dl>

        {view.attentionTeams > 0 ? (
          <Notice
            action={
              <Link className="ev-link" href={eventTabHref(view.id, "entries")}>
                Review teams
              </Link>
            }
            title={`${view.attentionTeams} ${view.attentionTeams === 1 ? "team needs" : "teams need"} a look`}
            tone="attention"
          >
            A player is missing, an invitation is unclaimed or a payment is
            incomplete.
          </Notice>
        ) : null}
        {view.cancellation?.refundStatus === "attention" && view.money ? (
          <Notice
            action={
              <Link className="ev-link" href={eventTabHref(view.id, "money")}>
                Review refunds
              </Link>
            }
            title="Some refunds need attention"
            tone="warning"
          >
            The card network refused a refund. Nothing was taken twice.
          </Notice>
        ) : null}
        {view.weather ? (
          <p className="ev-quiet">
            <Icon name="full-sun" size="inline" /> {view.weather}
          </p>
        ) : null}
        {view.registrationOpen && view.registrationClosesAt ? (
          <p className="ev-quiet">
            Registration closes{" "}
            {new Intl.DateTimeFormat("en-US", {
              timeZone: view.timeZone,
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(view.registrationClosesAt))}
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
