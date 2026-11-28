import { hqHref } from "@duna/core/hq-routes";
import { Button, Chip, MembershipCard } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { NextActionPanel } from "@/components/people/person-actions";
import { EditDetails } from "@/components/people/person-forms";
import {
  type AttentionKind,
  cardStatusOf,
  firstName,
  monthYear,
  nextBestAction,
  shortDate,
} from "@/components/people/people-model";
import { PersonScreen, personPage } from "@/components/people/people-screen";

export const metadata: Metadata = { title: "Person" };

const attentionTab: Record<AttentionKind, string> = {
  "payment-failed": "payments",
  "membership-ending": "memberships",
  "no-guardian-consent": "family",
  "waiver-missing": "documents",
  lapsing: "bookings",
};

/**
 * A person › Overview: the next best action first (a draft for Inbox, never
 * a send), their membership card as the card, what needs attention, the
 * facts in short, recent activity, and their details for the club's team.
 */
export default async function PersonOverviewPage({
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
  const { row, profile } = record;
  const now = new Date(context.now);
  const first = firstName(row.name);
  const action = nextBestAction({
    personId: row.id,
    name: row.name,
    isJunior: row.isJunior,
    guardianState: row.guardianState,
    email: row.email,
    phone: row.phone,
    membershipStatus: row.planStatus,
    plans: profile.plans,
    credits: profile.creditGrants,
    upcoming: row.upcoming,
    daysQuiet: row.daysQuiet,
    churn: row.churn,
    canSeePayments: context.canSeePayments,
    canDraft: context.canDraft,
    clubName: record.people.club.name,
    timeZone: context.timeZone,
    now,
  });
  const activePlan = profile.plans.find(
    (plan) => cardStatusOf(plan.status) !== "expired",
  );
  const club = record.people.club;
  const messageHref = `/inbox?compose=new&recipient=${encodeURIComponent(row.id)}`;
  return (
    <PersonScreen
      actions={
        <Button href={messageHref} size="sm" variant="secondary">
          {row.isJunior ? "Message the family" : `Message ${first}`}
        </Button>
      }
      askStarters={[
        `What has ${first} booked lately?`,
        `When did ${first} last play?`,
        ...(context.canSeePayments
          ? [`What has ${first} paid this year?`]
          : []),
      ]}
      page={page}
      tab="overview"
    >
      <div className="people-overview">
        <NextActionPanel action={action} personId={row.id} />
        {profile.plans.length === 0 && !row.plan ? (
          <div className="people-card people-card--none">
            <p className="people-body">
              {`No membership card: ${first} has no plan with the club yet.`}
            </p>
          </div>
        ) : (
          <div className="people-card">
            <MembershipCard
              club={{
                name: club.name,
                color: club.color ?? null,
                logo: club.logo ?? null,
              }}
              fact={
                row.credits > 0
                  ? {
                      kind: "credits",
                      text: `${row.credits} ${row.credits === 1 ? "credit" : "credits"}`,
                    }
                  : null
              }
              heldBy={row.isJunior ? row.guardianName : undefined}
              kind={
                row.isJunior
                  ? "junior"
                  : activePlan && /pack/i.test(activePlan.name)
                    ? "pack"
                    : "member"
              }
              member={row.name}
              motion="still"
              number={null}
              plan={activePlan?.name ?? club.programName ?? "No plan"}
              since={monthYear(row.memberSince, context.timeZone)}
              status={cardStatusOf(activePlan?.status ?? row.planStatus)}
            />
          </div>
        )}
      </div>

      {row.attention.length > 0 ? (
        <PageSection id="attention" title="Needs attention">
          <ul className="people-attention">
            {row.attention.map((item) => (
              <li key={item.kind}>
                <Chip tone={item.tone}>{item.label}</Chip>
                <Link
                  className="people-link"
                  href={`/people/${encodeURIComponent(row.id)}/${attentionTab[item.kind]}`}
                >
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </PageSection>
      ) : null}

      <PageSection id="in-short" title="In short">
        <dl className="people-facts">
          <div>
            <dt>Contact</dt>
            <dd>
              {row.isJunior
                ? row.guardianName
                  ? `Through ${row.guardianName}, the guardian`
                  : "Through the guardian"
                : [row.email, row.phone].filter(Boolean).join(" · ") ||
                  "No contact details yet"}
            </dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>
              {row.plan
                ? `${row.plan}${row.planStatus ? ` (${row.planStatus.replaceAll("-", " ")})` : ""}`
                : "No plan"}
            </dd>
          </div>
          <div>
            <dt>Coming up</dt>
            <dd>
              {row.upcoming > 0
                ? `${row.upcoming} ${row.upcoming === 1 ? "session" : "sessions"}`
                : "Nothing booked"}
            </dd>
          </div>
          <div>
            <dt>Last seen</dt>
            <dd>
              {row.lastSeenAt
                ? shortDate(row.lastSeenAt, context.timeZone, now)
                : "Not yet"}
            </dd>
          </div>
        </dl>
      </PageSection>

      <PageSection
        aside={
          <Link
            className="people-link"
            href={hqHref("memberBookings", { personId: row.id })}
          >
            All bookings
          </Link>
        }
        flush
        id="recent"
        title="Recently"
      >
        {profile.timeline.length === 0 ? (
          <p className="people-quiet people-pad">
            Nothing yet. Bookings, notes and credits collect here.
          </p>
        ) : (
          <ul className="people-timeline">
            {profile.timeline.slice(0, 6).map((item) => (
              <li key={item.id}>
                <span className="people-timeline__what">
                  <strong>{item.title}</strong>
                  <span>{item.detail}</span>
                </span>
                <time dateTime={item.occurredAt}>
                  {shortDate(item.occurredAt, context.timeZone, now)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {context.canWrite ? (
        <PageSection id="details" title="Details">
          <EditDetails
            email={row.email}
            isJunior={row.isJunior}
            name={row.name}
            personId={row.id}
            phone={row.phone}
          />
        </PageSection>
      ) : null}
    </PersonScreen>
  );
}
