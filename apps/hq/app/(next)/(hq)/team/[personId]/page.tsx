import { hqHref } from "@duna/core/hq-routes";
import { Button, Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { MemberDetails } from "@/components/team/member-details";
import {
  glanceOf,
  loadAvailability,
  loadCompensation,
} from "@/components/team/team-data";
import {
  compensationSentence,
  firstName,
  missingForMember,
} from "@/components/team/team-model";
import { MemberScreen, memberPage } from "@/components/team/team-screen";

export const metadata: Metadata = { title: "Team member" };

/**
 * A team member › Overview: when they are free (the shared rule, in
 * words), how busy they are, how they are paid (for whoever may see it),
 * what is missing, and their details for managers.
 */
export default async function TeamMemberPage({
  params,
}: {
  readonly params: Promise<{ personId: string }>;
}) {
  const { personId } = await params;
  const found = await memberPage(personId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { page } = found;
  const { member, context, isSelf } = page;
  const [availability, pay] = await Promise.all([
    loadAvailability(member.id),
    isSelf || context.canSeePay ? loadCompensation(member.id) : undefined,
  ]);
  const glance = glanceOf(availability, context);
  const missing = missingForMember(
    member,
    glance.loaded ? { hasSchedule: glance.hasSchedule } : undefined,
  );
  const first = firstName(member.displayName);
  const params_ = { personId: member.personId };
  return (
    <MemberScreen
      actions={
        context.canManage || isSelf ? (
          <Button
            href={hqHref("teamMemberAvailability", params_)}
            size="sm"
            variant="primary"
          >
            Edit availability
          </Button>
        ) : undefined
      }
      askStarters={[
        `When is ${first} free next week?`,
        `Which of ${first}'s sessions need cover?`,
      ]}
      page={page}
      summary={glance.summary}
      tab="overview"
    >
      <dl aria-label={`${first} at a glance`} className="team-figures">
        <div className="team-figure">
          <dt>Sessions, last 30 days</dt>
          <dd className="team-num">{member.sessionsRun30d}</dd>
        </div>
        <div className="team-figure">
          <dt>Coming up</dt>
          <dd className="team-num">{member.upcomingSessions}</dd>
        </div>
        <div className="team-figure">
          <dt>Sessions needing cover</dt>
          <dd className="team-num">{glance.needsCover}</dd>
        </div>
        <div className="team-figure">
          <dt>Time off asked for</dt>
          <dd className="team-num">{glance.timeOffAsked}</dd>
        </div>
      </dl>

      <PageSection id="member-summary" title="In short">
        <ul className="team-facts">
          <li>
            <span className="team-facts__label">Free</span>
            <span>
              {glance.summary ?? "Availability can't be read right now."}{" "}
              <Link
                className="team-link"
                href={hqHref("teamMemberAvailability", params_)}
              >
                Availability
              </Link>
            </span>
          </li>
          {pay ? (
            <li>
              <span className="team-facts__label">Paid</span>
              <span>
                {pay.state === "ok"
                  ? pay.data.current
                    ? compensationSentence(pay.data.current)
                    : "No pay set yet"
                  : pay.state === "denied"
                    ? `Only ${first}, managers and the owner see this.`
                    : "Pay can't be read right now."}{" "}
                <Link
                  className="team-link"
                  href={hqHref("teamMemberPay", params_)}
                >
                  Pay
                </Link>
              </span>
            </li>
          ) : null}
          <li>
            <span className="team-facts__label">Missing</span>
            <span>
              {missing.length === 0 ? (
                "Nothing: fully set up."
              ) : (
                <span className="team-chips">
                  {missing.map((item) => (
                    <Chip key={item} tone="attention">
                      {item}
                    </Chip>
                  ))}
                </span>
              )}
            </span>
          </li>
          <li>
            <span className="team-facts__label">Contact</span>
            <span>
              {member.email ?? member.phoneE164 ?? "No contact details yet"}
            </span>
          </li>
        </ul>
      </PageSection>

      {context.canManage ? (
        <PageSection id="member-details" title="Details">
          <MemberDetails
            active={member.active}
            address={{
              addressLine1: member.addressLine1,
              addressLine2: member.addressLine2,
              locality: member.locality,
              administrativeArea: member.administrativeArea,
              postalCode: member.postalCode,
              countryCode: member.countryCode,
            }}
            classification={member.workerClassification}
            displayName={member.displayName}
            isOwner={member.isOwner}
            personId={member.personId}
          />
        </PageSection>
      ) : null}
    </MemberScreen>
  );
}
