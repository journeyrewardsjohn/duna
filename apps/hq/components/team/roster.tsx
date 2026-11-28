"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Avatar,
  Button,
  Chip,
  EmptyFirstUse,
  EmptyResults,
  FilterChip,
  Input,
  rallyStyle,
  riseClassName,
  useConfirm,
  useDebouncedValue,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useMemo, useState } from "react";
import { inviteTeamMemberAction } from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import {
  deliveryCopy,
  firstName,
  invitationStatusCopy,
  memberStateCopy,
  type MemberState,
  roleLabel,
  type StaffInvitation,
  type StaffRole,
} from "./team-model";

export interface RosterRow {
  readonly staffProfileId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
  readonly role: StaffRole;
  readonly isOwner: boolean;
  readonly isSelf: boolean;
  readonly state: MemberState;
  readonly classification: string;
  readonly sessionsRun30d: number;
  readonly upcomingSessions: number;
  /** The shared rule's verdict in words, or undefined when it can't be read. */
  readonly availability?: string;
  readonly needsCover: number;
  readonly timeOffAsked: number;
  readonly missing: readonly string[];
  readonly contact?: string;
}

type Filter = "everyone" | "coaches" | "invited" | "paused" | "needs";

const filters: readonly { id: Filter; label: string }[] = [
  { id: "everyone", label: "Everyone" },
  { id: "coaches", label: "Coaches" },
  { id: "invited", label: "Invited" },
  { id: "paused", label: "Paused" },
  { id: "needs", label: "Needs something" },
];

function dateWords(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(iso));
}

/**
 * The roster (TM-List): every member as a row with their role, how busy
 * they are, the availability rule's verdict, their state and what is
 * missing; pending invitations as Invited rows with Copy link and Send
 * again. Filters stay in the page; search waits for typing to settle.
 */
export function Roster({
  rows,
  invitations,
  canManage,
  timeZone,
}: {
  readonly rows: readonly RosterRow[];
  readonly invitations: readonly StaffInvitation[];
  readonly canManage: boolean;
  readonly timeZone: string;
}) {
  const [filter, setFilter] = useState<Filter>("everyone");
  const [query, setQuery] = useState("");
  const settled = useDebouncedValue(query).trim().toLocaleLowerCase();
  const confirm = useConfirm();
  const [copied, setCopied] = useState<string>();
  const pending = invitations.filter((row) => row.status === "pending");

  const visible = useMemo(() => {
    const matches = (text: string) =>
      !settled || text.toLocaleLowerCase().includes(settled);
    return rows.filter((row) => {
      if (
        !matches(
          [
            row.displayName,
            roleLabel(row.role, row.isOwner),
            row.contact ?? "",
          ].join(" "),
        )
      ) {
        return false;
      }
      if (filter === "coaches") return row.role === "coach";
      if (filter === "invited") return false;
      if (filter === "paused") return row.state === "paused";
      if (filter === "needs")
        return row.missing.length > 0 || row.needsCover > 0;
      return true;
    });
  }, [filter, rows, settled]);

  const visibleInvites = useMemo(
    () =>
      filter === "everyone" || filter === "invited"
        ? pending.filter(
            (row) =>
              !settled ||
              [row.invitedName, row.invitedEmail ?? "", row.role]
                .join(" ")
                .toLocaleLowerCase()
                .includes(settled),
          )
        : [],
    [filter, pending, settled],
  );

  const count = (id: Filter) =>
    id === "everyone"
      ? rows.length + pending.length
      : id === "coaches"
        ? rows.filter((row) => row.role === "coach").length
        : id === "invited"
          ? pending.length
          : id === "paused"
            ? rows.filter((row) => row.state === "paused").length
            : rows.filter((row) => row.missing.length > 0 || row.needsCover > 0)
                .length;

  const sendAgain = (invitation: StaffInvitation) => {
    const contact = invitation.invitedEmail ?? invitation.invitedPhoneE164;
    if (!contact) return;
    const by = invitation.invitedEmail ? "email" : "text message";
    void confirm.run({
      tier: "confirm",
      title: `Send ${invitation.invitedName}'s invitation again?`,
      description: `Duna sends a new invitation by ${by} to ${contact}, as ${roleLabel(invitation.role)}.`,
      affected: `The earlier link keeps working until it expires on ${dateWords(invitation.expiresAt, timeZone)}.`,
      verb: `Send again to ${firstName(invitation.invitedName)}`,
      cancelLabel: "Don't send",
      agentConfirm: `Sends ${invitation.invitedName} a new team invitation by ${by}`,
      perform: async ({ idempotencyKey }) =>
        unwrap(
          await inviteTeamMemberAction({
            name: invitation.invitedName,
            ...(invitation.invitedEmail
              ? { email: invitation.invitedEmail }
              : { phoneE164: invitation.invitedPhoneE164 }),
            role: invitation.role,
            classification: invitation.workerClassification,
            idempotencyKey,
          }),
        ),
      success: `Invitation sent again to ${invitation.invitedName}`,
    });
  };

  const copy = (invitation: StaffInvitation) => {
    void navigator.clipboard
      ?.writeText(invitation.inviteUrl)
      .then(() => setCopied(invitation.id))
      .catch(() => setCopied(undefined));
  };

  if (rows.length === 0 && pending.length === 0) {
    return (
      <EmptyFirstUse
        action={
          canManage ? (
            <Button href={hqHref("teamInvite")} variant="primary">
              Invite someone
            </Button>
          ) : (
            <span className="team-quiet">Ask an owner to invite the team.</span>
          )
        }
        description="Coaches, managers and the front desk appear here once they join."
        icon="users"
        title="Nobody on the team yet"
      />
    );
  }

  return (
    <div className="team-roster">
      <div className="team-roster__tools">
        <Input
          aria-label="Search the team"
          autoComplete="off"
          clearable
          clearLabel="Clear search"
          icon={<Icon name="search" size="inline" />}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search by name, role or contact"
          type="search"
          value={query}
        />
        <div aria-label="Show" className="team-filters" role="group">
          {filters.map((item) => (
            <FilterChip
              key={item.id}
              onPressedChange={() => setFilter(item.id)}
              pressed={filter === item.id}
            >
              {item.label}
              <span className="team-filters__count">{count(item.id)}</span>
            </FilterChip>
          ))}
        </div>
      </div>

      {visible.length === 0 && visibleInvites.length === 0 ? (
        <EmptyResults
          clearLabel="Show everyone"
          onClear={() => {
            setQuery("");
            setFilter("everyone");
          }}
          query={query.trim() || undefined}
        />
      ) : (
        <ul aria-label="Team members" className="team-list">
          {visible.map((row, index) => {
            const state = memberStateCopy(row.state);
            return (
              <li
                className={`team-row ${riseClassName()}`}
                key={row.staffProfileId}
                style={rallyStyle(index)}
              >
                <Avatar
                  decorative
                  name={row.displayName}
                  size="md"
                  src={row.avatarUrl}
                />
                <div className="team-row__who">
                  <Link
                    className="team-row__name"
                    href={hqHref("teamMember", { personId: row.personId })}
                  >
                    {row.displayName}
                    {row.isSelf ? (
                      <span className="team-quiet"> (you)</span>
                    ) : null}
                  </Link>
                  <span className="team-row__role">
                    {roleLabel(row.role, row.isOwner)} · {row.classification}
                  </span>
                  <span className="team-row__availability">
                    {row.availability ?? "Availability can't be read right now"}
                  </span>
                </div>
                <div className="team-row__load">
                  <span className="team-num">{row.sessionsRun30d}</span>
                  <span className="team-quiet">sessions in 30 days</span>
                  <span className="team-quiet">{`${row.upcomingSessions} coming up`}</span>
                </div>
                <div className="team-row__state">
                  <Chip tone={state.tone}>{state.label}</Chip>
                  {row.needsCover > 0 ? (
                    <Link className="team-link" href={hqHref("teamCoverage")}>
                      {`${row.needsCover} ${row.needsCover === 1 ? "session needs" : "sessions need"} cover`}
                    </Link>
                  ) : null}
                  {row.timeOffAsked > 0 ? (
                    <span className="team-quiet">{`Time off asked for (${row.timeOffAsked})`}</span>
                  ) : null}
                  {row.missing.length > 0 ? (
                    <span className="team-row__missing">
                      <Icon name="info" size="chip" />
                      {`Missing: ${row.missing.join(", ").toLocaleLowerCase()}`}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
          {visibleInvites.map((invitation, index) => {
            const status = invitationStatusCopy(invitation.status);
            return (
              <li
                className={`team-row team-row--invite ${riseClassName()}`}
                key={invitation.id}
                style={rallyStyle(visible.length + index)}
              >
                <Avatar decorative name={invitation.invitedName} size="md" />
                <div className="team-row__who">
                  <span className="team-row__name">
                    {invitation.invitedName}
                  </span>
                  <span className="team-row__role">
                    {roleLabel(invitation.role)} ·{" "}
                    {invitation.workerClassification === "w2-employee"
                      ? "Employee (W-2)"
                      : "Contractor (1099)"}
                  </span>
                  <span className="team-row__availability">
                    {`${deliveryCopy(invitation)}. Link works until ${dateWords(invitation.expiresAt, timeZone)}.`}
                  </span>
                </div>
                <div className="team-row__load" />
                <div className="team-row__state">
                  <Chip tone={status.tone}>{status.label}</Chip>
                  {canManage ? (
                    <div className="team-row__actions">
                      <Button
                        onClick={() => copy(invitation)}
                        size="sm"
                        variant="secondary"
                      >
                        {copied === invitation.id ? "Link copied" : "Copy link"}
                      </Button>
                      {invitation.invitedEmail ||
                      invitation.invitedPhoneE164 ? (
                        <Button
                          onClick={() => sendAgain(invitation)}
                          size="sm"
                          variant="ghost"
                        >
                          Send again
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canManage && pending.length > 0 ? (
        <p className="team-quiet">
          Withdrawing an invitation isn&apos;t available yet. An unused link
          stops working on the date shown.
        </p>
      ) : null}
      {confirm.dialog}
    </div>
  );
}
