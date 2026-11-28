import { formatMoney } from "@duna/core";
import { Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  GrantCredits,
  MembershipControls,
} from "@/components/people/person-actions";
import {
  cardStatusOf,
  firstName,
  shortDate,
} from "@/components/people/people-model";
import { PersonScreen, personPage } from "@/components/people/people-screen";
import { CARD_STATUS_WORDS } from "@duna/ui/tideline";

export const metadata: Metadata = { title: "Memberships and credits" };

/**
 * A person › Memberships and credits: each plan with its state in words,
 * pause / resume / cancel through a strong confirmation, the credit balance
 * and its grants, and giving credits (money changes: strong tier).
 */
export default async function PersonMembershipsPage({
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
  return (
    <PersonScreen
      askStarters={[
        `When does ${first}'s plan renew?`,
        `How many credits has ${first} used this year?`,
      ]}
      page={page}
      tab="memberships"
    >
      <PageSection flush id="plans" title="Plans">
        {profile.plans.length === 0 ? (
          <p className="people-quiet people-pad">
            {`${first} has no plan with the club.`}
          </p>
        ) : (
          <ul className="people-plans">
            {profile.plans.map((plan) => {
              const state = cardStatusOf(plan.status);
              return (
                <li key={plan.id}>
                  <div className="people-plans__what">
                    <strong>{plan.name}</strong>
                    <span className="people-quiet">
                      {[
                        context.canSeePayments && plan.priceMinor > 0
                          ? `${formatMoney(plan.priceMinor, plan.currency)} a ${plan.interval}`
                          : `Every ${plan.interval}`,
                        plan.currentPeriodEndsAt
                          ? `${plan.cancelAtPeriodEnd ? "Ends" : "Renews"} ${shortDate(plan.currentPeriodEndsAt, context.timeZone, now)}`
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <Chip
                    tone={
                      state === "active"
                        ? "positive"
                        : state === "paused"
                          ? "info"
                          : undefined
                    }
                  >
                    {plan.status === "past-due"
                      ? "Payment due"
                      : CARD_STATUS_WORDS[state]}
                  </Chip>
                  {context.canWrite ? (
                    <MembershipControls
                      name={row.name}
                      personId={row.id}
                      plan={{
                        id: plan.id,
                        name: plan.name,
                        status: plan.status,
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>

      <PageSection id="credits" title="Credits">
        <dl className="people-facts">
          <div>
            <dt>Balance</dt>
            <dd className="people-num">{`${row.credits} ${row.credits === 1 ? "credit" : "credits"}`}</dd>
          </div>
          <div>
            <dt>Grants</dt>
            <dd>{profile.creditGrants.length}</dd>
          </div>
        </dl>
        {profile.creditGrants.length > 0 ? (
          <ul className="people-grants">
            {profile.creditGrants.map((grant) => (
              <li key={grant.id}>
                <span className="people-num">
                  {`${grant.remainingCredits} of ${grant.initialCredits} left`}
                </span>
                <span className="people-quiet">
                  {[
                    `Given ${shortDate(grant.createdAt, context.timeZone, now)}`,
                    grant.expiresAt
                      ? `expires ${shortDate(grant.expiresAt, context.timeZone, now)}`
                      : "no expiry",
                    context.canSeePayments &&
                    grant.remainingValueMinor > 0 &&
                    grant.currency
                      ? `${formatMoney(grant.remainingValueMinor, grant.currency)} value left`
                      : undefined,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {context.canGrantCredits ? (
          <GrantCredits name={row.name} personId={row.id} />
        ) : (
          <p className="people-quiet">
            Only an owner can give credits, because credits are money.
          </p>
        )}
      </PageSection>
    </PersonScreen>
  );
}
