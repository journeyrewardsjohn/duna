"use client";

import type { TeamAvailabilityCoverageRequest } from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  Avatar,
  Button,
  Chip,
  EmptyState,
  rallyStyle,
  RallyOnChange,
  riseClassName,
  useConfirm,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useState } from "react";
import { coverageAction } from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import {
  coverageReasonWords,
  coverageStatusCopy,
  firstName,
  offerStatusWords,
} from "./team-model";

type Request = TeamAvailabilityCoverageRequest;

function when(request: Request, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  }).format(new Date(request.startsAt));
  const time = (iso: string) =>
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone,
    }).format(new Date(iso));
  return `${day} · ${time(request.startsAt)}–${time(request.endsAt)}`;
}

/**
 * What needs cover in the coming two weeks (TM-Coverage, CO coverage
 * steps): each session with why, who the shared availability rule says is
 * free for all of it (ranked by its plain rules), and the fix in place:
 * Assign moves the session after a confirmation; Ask records the ask and
 * leaves the message to a person in Inbox. Nobody is suggested who isn't
 * free, and nobody is reassigned until a person presses Assign.
 */
export function CoverageBoard({
  initial,
  canManage,
  timeZone,
}: {
  readonly initial: readonly Request[];
  readonly canManage: boolean;
  readonly timeZone: string;
}) {
  const confirm = useConfirm();
  const [requests, setRequests] = useState<readonly Request[]>(initial);
  const replace = (next: Request) =>
    setRequests((current) =>
      current.map((row) => (row.id === next.id ? next : row)),
    );

  const act = (
    request: Request,
    action: "assign" | "ask" | "decline" | "cancel" | "suggest",
    offer?: Request["offers"][number],
  ) => {
    const who = offer?.staff.displayName ?? "";
    const first = firstName(who);
    const slot = `${request.title}, ${when(request, timeZone)}`;
    if (action === "suggest") {
      void coverageAction({ action: "suggest", requestId: request.id }).then(
        (result) => {
          if (result.ok) replace(result.data);
        },
      );
      return;
    }
    const words = {
      assign: {
        title: `Give ${slot} to ${who}?`,
        description: `${first} becomes the coach for this session. Duna checks ${first} is still free before it moves.`,
        affected: request.originalStaff
          ? `${request.originalStaff.displayName} comes off it. Other suggestions for it are closed.`
          : "Other suggestions for it are closed.",
        verb: `Give it to ${first}`,
        success: `${first} is covering ${request.title}`,
        tier: "confirm" as const,
        destructive: false,
      },
      ask: {
        title: `Ask ${who} to cover ${request.title}?`,
        description: `Duna records that you asked ${first}. The message itself is drafted in Inbox for you to check and send.`,
        affected: "Nothing is sent until someone presses Send in Inbox.",
        verb: `Record the ask to ${first}`,
        success: `Asked ${first}. The message is waiting in Inbox.`,
        tier: "confirm" as const,
        destructive: false,
      },
      decline: {
        title: `${who} can't cover it?`,
        description: `${first} is marked as having said no for ${request.title}.`,
        affected: undefined,
        verb: `Mark ${first} as no`,
        success: `${first} marked as no`,
        tier: "confirm" as const,
        destructive: true,
      },
      cancel: {
        title: `Stop looking for cover for ${request.title}?`,
        description:
          "The session keeps the coach it has now (or none). Use this when the session is cancelled or sorted out another way.",
        affected: undefined,
        verb: "Stop looking",
        success: "No longer looking for cover",
        tier: "confirm" as const,
        destructive: true,
      },
    }[action];
    void confirm
      .run({
        tier: words.tier,
        destructive: words.destructive,
        title: words.title,
        description: words.description,
        affected: words.affected,
        verb: words.verb,
        cancelLabel: "Not now",
        agentConfirm: `${words.verb} (${slot})`,
        perform: async () =>
          unwrap(
            await coverageAction(
              action === "cancel"
                ? { action, requestId: request.id }
                : { action, requestId: request.id, offerId: offer!.id },
            ),
          ),
        success: words.success,
      })
      .then((outcome) => {
        if (outcome.status === "done") replace(outcome.result as Request);
      });
  };

  if (requests.length === 0) {
    return (
      <EmptyState
        description="Every session in the next two weeks has a coach who is free for it."
        icon="success"
        title="Everything is covered"
      />
    );
  }

  return (
    <>
      <ul aria-label="Sessions needing cover" className="team-cover-list">
        {requests.map((request, index) => {
          const status = coverageStatusCopy(request.status);
          const offers = [...request.offers].sort((a, b) => a.rank - b.rank);
          const open = request.status === "open" || request.status === "asking";
          return (
            <li
              className={`team-cover ${riseClassName()}`}
              key={request.id}
              style={rallyStyle(index)}
            >
              <div className="team-cover__head">
                <div className="team-row__who">
                  <span className="team-row__name">{request.title}</span>
                  <span className="team-quiet">{when(request, timeZone)}</span>
                  <span className="team-quiet">
                    {coverageReasonWords(
                      request.reason,
                      request.originalStaff?.displayName,
                    )}
                  </span>
                </div>
                <RallyOnChange value={request.status}>
                  <Chip tone={status.tone}>{status.label}</Chip>
                </RallyOnChange>
              </div>
              {request.status === "covered" && request.coveredBy ? (
                <p className="team-cover__done">
                  <Icon name="success" size="inline" />
                  {`${request.coveredBy.displayName} is covering it.`}
                </p>
              ) : request.status === "nobody-free" || offers.length === 0 ? (
                <p className="team-quiet">
                  Nobody on the team is free for the whole session. Change the
                  session&apos;s time, or ask someone to add hours on their
                  Availability page.
                </p>
              ) : (
                <ol
                  aria-label={`Free for ${request.title}`}
                  className="team-offers"
                >
                  {offers.map((offer) => (
                    <li className="team-offer" key={offer.id}>
                      <Avatar
                        decorative
                        name={offer.staff.displayName}
                        size="sm"
                      />
                      <div className="team-row__who">
                        <Link
                          className="team-row__name"
                          href={hqHref("teamMemberAvailability", {
                            personId: offer.staff.personId,
                          })}
                        >
                          {offer.staff.displayName}
                        </Link>
                        <span className="team-quiet">
                          {[offer.rationale, offerStatusWords(offer.status)]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                      {canManage &&
                      open &&
                      ["suggested", "asked", "accepted"].includes(
                        offer.status,
                      ) ? (
                        <div className="team-row__actions">
                          {offer.status === "suggested" ? (
                            <Button
                              onClick={() => act(request, "ask", offer)}
                              size="sm"
                              variant="ghost"
                            >
                              Ask
                            </Button>
                          ) : (
                            <Button
                              onClick={() => act(request, "decline", offer)}
                              size="sm"
                              variant="ghost"
                            >
                              Said no
                            </Button>
                          )}
                          <Button
                            onClick={() => act(request, "assign", offer)}
                            size="sm"
                            variant="secondary"
                          >
                            {`Give it to ${firstName(offer.staff.displayName)}`}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
              {canManage && open ? (
                <div className="team-form__actions team-form__actions--start">
                  <Button
                    onClick={() => act(request, "suggest")}
                    size="sm"
                    variant="ghost"
                  >
                    Check who is free again
                  </Button>
                  <Button
                    onClick={() => act(request, "cancel")}
                    size="sm"
                    variant="ghost"
                  >
                    Stop looking
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {confirm.dialog}
    </>
  );
}
