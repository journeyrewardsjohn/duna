import type { ConciergeThread } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import { Avatar, Button, Chip } from "@duna/ui/tideline";
import Link from "next/link";
import { AccessDeniedState } from "@/lib/access-state";
import type { Loaded } from "./inbox-data";
import {
  focusPerson,
  formatMoney,
  inboxHref,
  type InboxState,
  kindLabels,
  type PersonContext,
} from "./inbox-model";

function when(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

/**
 * Beside a thread: what it is about, who is in it (faces, guardians named),
 * and the person in focus with their upcoming bookings, membership and
 * credits. Money shows only for a role that may see payments (People's
 * rule); nothing about health is ever here.
 */
export function PersonPanel({
  thread,
  person,
  state,
  timeZone,
  organization,
}: {
  readonly thread: ConciergeThread;
  readonly person?: Loaded<PersonContext>;
  readonly state: InboxState;
  readonly timeZone: string;
  readonly organization: string;
}) {
  const focus = focusPerson(thread, state.person);
  const others = thread.participants.filter(
    (participant) =>
      participant.role === "member" || participant.role === "guardian",
  );
  return (
    <div className="inbox-context__inner">
      <section aria-label="About this conversation" className="inbox-panel">
        <h2 className="inbox-panel__title">About this conversation</h2>
        <p className="inbox-panel__lead">
          {thread.context?.label ?? thread.title}
        </p>
        <dl className="inbox-facts">
          <div>
            <dt>Kind</dt>
            <dd>{kindLabels[thread.kind]}</dd>
          </div>
          {thread.context?.status ? (
            <div>
              <dt>Status</dt>
              <dd>{thread.context.status}</dd>
            </div>
          ) : null}
          {thread.context?.startsAt ? (
            <div>
              <dt>When</dt>
              <dd className="td-num">
                {when(thread.context.startsAt, timeZone)}
              </dd>
            </div>
          ) : null}
          {thread.context?.place ? (
            <div>
              <dt>Where</dt>
              <dd>{thread.context.place}</dd>
            </div>
          ) : null}
          <div>
            <dt>People</dt>
            <dd className="td-num">{thread.participantCount}</dd>
          </div>
        </dl>
        {thread.minorPresent ? (
          <p className="inbox-quiet">
            <Icon name="junior-guardian" size="inline" /> A junior is in this
            conversation, so their verified guardians are too and every message
            is screened for safety.
          </p>
        ) : null}
      </section>

      {others.length > 1 ? (
        <section aria-label="People in it" className="inbox-panel">
          <h2 className="inbox-panel__title">People</h2>
          <ul className="inbox-who">
            {others.slice(0, 12).map((participant) => (
              <li key={`${participant.personId}-${participant.role}`}>
                <Link
                  aria-current={
                    participant.personId === focus?.personId
                      ? "true"
                      : undefined
                  }
                  className="inbox-who__row"
                  href={inboxHref(state, { person: participant.personId })}
                  scroll={false}
                >
                  <Avatar
                    decorative
                    name={participant.displayName}
                    size="sm"
                    src={participant.avatarUrl}
                  />
                  <span>
                    {participant.displayName}
                    <span className="inbox-who__role">
                      {participant.role === "guardian" && participant.guardianOf
                        ? `Guardian of ${participant.guardianOf}`
                        : "Member"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {others.length > 12 ? (
            <p className="inbox-quiet">and {others.length - 12} more</p>
          ) : null}
        </section>
      ) : null}

      {focus ? (
        <PersonCard
          fallbackName={focus.displayName}
          organization={organization}
          person={person}
          timeZone={timeZone}
        />
      ) : null}
    </div>
  );
}

function PersonCard({
  person,
  fallbackName,
  timeZone,
  organization,
}: {
  readonly person?: Loaded<PersonContext>;
  readonly fallbackName: string;
  readonly timeZone: string;
  readonly organization: string;
}) {
  if (!person || person.state === "not-found") {
    return (
      <section aria-label={fallbackName} className="inbox-panel">
        <div className="inbox-person__head">
          <Avatar name={fallbackName} size="lg" />
          <p className="inbox-person__name">{fallbackName}</p>
        </div>
        <p className="inbox-quiet">
          {`Not on ${organization}'s people list, so there are no bookings or membership to show.`}
        </p>
      </section>
    );
  }
  if (person.state === "denied") {
    return (
      <section aria-label={fallbackName} className="inbox-panel">
        <div className="inbox-person__head">
          <Avatar name={fallbackName} size="lg" />
          <p className="inbox-person__name">{fallbackName}</p>
        </div>
        <AccessDeniedState
          area="People's records"
          compact
          grantedBy={`an owner or manager of ${organization}`}
        />
      </section>
    );
  }
  if (person.state !== "ok") {
    return (
      <section aria-label={fallbackName} className="inbox-panel">
        <div className="inbox-person__head">
          <Avatar name={fallbackName} size="lg" />
          <p className="inbox-person__name">{fallbackName}</p>
        </div>
        <p className="inbox-quiet">
          {person.state === "not-configured"
            ? "Their bookings and membership need Duna Database, which isn't connected here."
            : `Their bookings and membership couldn't be loaded. Reference: ${person.reference}`}
        </p>
      </section>
    );
  }
  const data = person.data;
  return (
    <section aria-label={data.name} className="inbox-panel inbox-person">
      <div className="inbox-person__head">
        <Avatar name={data.name} size="lg" src={data.avatarUrl} />
        <div>
          <p className="inbox-person__name">{data.name}</p>
          <p className="inbox-quiet">{data.relation}</p>
        </div>
      </div>
      {data.isJunior ? (
        <p className="inbox-quiet">
          <Icon name="junior-guardian" size="inline" /> Junior
          {data.guardianName ? ` · guardian ${data.guardianName}` : ""}.
          Messages reach their guardian.
        </p>
      ) : null}
      <dl className="inbox-facts">
        <div>
          <dt>Membership</dt>
          <dd>
            {data.plan ? (
              <>
                {data.plan.name}{" "}
                <Chip
                  kind="status"
                  tone={
                    data.plan.status === "active" ? "positive" : "attention"
                  }
                >
                  {data.plan.status.replace(/[-_]/g, " ")}
                </Chip>
              </>
            ) : (
              "No plan"
            )}
          </dd>
        </div>
        <div>
          <dt>Credits</dt>
          <dd className="td-num">{data.credits}</dd>
        </div>
        {data.balance ? (
          <div>
            <dt>Credit balance</dt>
            <dd className="td-num">
              {formatMoney(data.balance.minor, data.balance.currency)}
            </dd>
          </div>
        ) : null}
        {data.lifetimeSpend ? (
          <div>
            <dt>Spent with the club</dt>
            <dd className="td-num">
              {formatMoney(
                data.lifetimeSpend.minor,
                data.lifetimeSpend.currency,
              )}
            </dd>
          </div>
        ) : null}
      </dl>
      <h3 className="inbox-panel__sub">Coming up</h3>
      {data.upcoming.length > 0 ? (
        <ul className="inbox-upcoming">
          {data.upcoming.map((session) => (
            <li key={session.id}>
              <Icon name="calendar" size="inline" />
              <span>
                {session.title}
                <span className="inbox-quiet td-num">
                  {when(session.startsAt, session.timezone || timeZone)}
                  {session.place ? ` · ${session.place}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="inbox-quiet">Nothing booked.</p>
      )}
      <Button
        href={hqHref("member", { personId: data.personId })}
        size="sm"
        variant="secondary"
      >
        Open {data.name.split(/\s+/)[0]}'s record
      </Button>
    </section>
  );
}
