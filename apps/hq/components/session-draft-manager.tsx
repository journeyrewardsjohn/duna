"use client";

import type { OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge } from "@duna/ui";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CircleAlert,
  CreditCard,
  MapPinned,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { publishSessionAction, type OperatorActionState } from "@/app/actions";

const initialActionState: OperatorActionState = {
  status: "idle",
  message: "",
};

type DraftSession = OperatorWorkspace["sessions"][number];

interface PublishBlocker {
  readonly code: "location" | "payments" | "schedule";
  readonly message: string;
  readonly href?: string;
  readonly linkLabel?: string;
}

function publishBlockers(
  session: DraftSession,
  workspace: OperatorWorkspace,
): readonly PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  const venue = session.venueId
    ? workspace.venues.find((item) => item.id === session.venueId)
    : undefined;

  if (session.venueId && venue?.status !== "active") {
    blockers.push({
      code: "location",
      message: "Publish the connected venue before opening registration.",
      href: "/locations",
      linkLabel: "Review venue",
    });
  }
  if (session.priceMinor > 0 && !workspace.organization.stripeChargesEnabled) {
    blockers.push({
      code: "payments",
      message: "Finish Money setup before publishing this paid event.",
      href: "/payments/setup",
      linkLabel: "Configure Money",
    });
  }
  if (new Date(session.startsAt).getTime() <= Date.now()) {
    blockers.push({
      code: "schedule",
      message: "This start time has passed. Create a new future schedule.",
    });
  }

  return blockers;
}

function PublishButton({ disabled }: { readonly disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      className="hq-button hq-button--primary"
      disabled={disabled || pending}
      type="submit"
    >
      {pending ? "Publishing…" : "Publish & open registration"}
      <ArrowRight aria-hidden size={16} />
    </button>
  );
}

function DraftPublicationCard({
  focused,
  session,
  workspace,
}: {
  readonly focused: boolean;
  readonly session: DraftSession;
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action] = useActionState(
    publishSessionAction,
    initialActionState,
  );
  const blockers = publishBlockers(session, workspace);
  const venue = session.venueId
    ? workspace.venues.find((item) => item.id === session.venueId)
    : undefined;
  const locationLabel = venue?.name ?? "Custom or online location";

  return (
    <article
      className={`event-draft-card${focused ? " event-draft-card--focused" : ""}`}
      id={`draft-${session.id}`}
    >
      <header>
        <span>
          <Badge tone="warning">Private draft</Badge>
          <strong>{session.title}</strong>
          <small>{session.kind.replaceAll("-", " ")}</small>
        </span>
        <strong>{formatMoney(session.priceMinor, session.currency)}</strong>
      </header>

      <div className="event-draft-card__facts">
        <span>
          <CalendarClock aria-hidden size={18} />
          <small>Starts</small>
          <strong>
            {formatVenueTime(session.startsAt, session.timezone, "en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </strong>
        </span>
        <span>
          <MapPinned aria-hidden size={18} />
          <small>Location</small>
          <strong>{locationLabel}</strong>
        </span>
        <span>
          <CreditCard aria-hidden size={18} />
          <small>Registration</small>
          <strong>
            {session.priceMinor > 0
              ? workspace.organization.stripeChargesEnabled
                ? "Payments ready"
                : "Money setup needed"
              : "Free entry"}
          </strong>
        </span>
      </div>

      <details className="event-draft-review" open={focused ? true : undefined}>
        <summary>
          <span>
            <ShieldCheck aria-hidden size={19} />
            <strong>Review & publish</strong>
          </span>
          <small>
            {blockers.length === 0
              ? "Ready to open registration"
              : `${blockers.length} item${blockers.length === 1 ? "" : "s"} to finish`}
          </small>
        </summary>
        <div className="event-draft-review__body">
          {blockers.length > 0 ? (
            <div className="event-draft-blockers">
              {blockers.map((blocker) => (
                <div key={blocker.code}>
                  <CircleAlert aria-hidden size={17} />
                  <span>
                    <strong>{blocker.message}</strong>
                    {blocker.href && blocker.linkLabel && (
                      <Link href={blocker.href}>
                        {blocker.linkLabel} <ArrowRight aria-hidden size={14} />
                      </Link>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="event-draft-ready">
              <Check aria-hidden size={18} />
              <span>
                <strong>Ready for players.</strong>
                Publishing makes the event visible and opens registration.
              </span>
            </div>
          )}

          {state.status !== "idle" && (
            <div
              className={`event-draft-action-state event-draft-action-state--${state.status}`}
              role={state.status === "error" ? "alert" : "status"}
            >
              {state.status === "success" ? (
                <Check aria-hidden size={17} />
              ) : (
                <CircleAlert aria-hidden size={17} />
              )}
              <span>{state.message}</span>
            </div>
          )}

          {state.status !== "success" && (
            <form action={action} className="event-draft-publish-form">
              <input name="sessionId" type="hidden" value={session.id} />
              <input name="confirmed" type="hidden" value="true" />
              <span>
                This is the explicit publication step. No draft goes live
                automatically.
              </span>
              <PublishButton disabled={blockers.length > 0} />
            </form>
          )}
        </div>
      </details>
    </article>
  );
}

export function SessionDraftManager({
  focusedDraftId,
  kinds,
  workspace,
}: {
  readonly focusedDraftId?: string;
  readonly kinds?: readonly DraftSession["kind"][];
  readonly workspace: OperatorWorkspace;
}) {
  const drafts = workspace.sessions.filter(
    (session) =>
      session.status === "draft" && (!kinds || kinds.includes(session.kind)),
  );

  return (
    <section className="hq-card event-draft-manager">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Needs review</span>
          <h2>
            {drafts.length === 0
              ? "No drafts awaiting publication"
              : `${drafts.length} draft${drafts.length === 1 ? "" : "s"} awaiting publication`}
          </h2>
          <p>
            Every saved draft stays here until you explicitly review it and open
            registration.
          </p>
        </div>
        <Badge tone={drafts.length > 0 ? "warning" : "positive"}>
          {drafts.length > 0 ? "Action needed" : "All clear"}
        </Badge>
      </header>

      {drafts.length > 0 ? (
        <div className="event-draft-list">
          {drafts.map((session) => (
            <DraftPublicationCard
              focused={focusedDraftId === session.id}
              key={session.id}
              session={session}
              workspace={workspace}
            />
          ))}
        </div>
      ) : (
        <div className="hq-empty event-draft-manager__empty">
          <Check aria-hidden size={20} />
          <span>
            Saved drafts will appear here automatically. Published events stay
            in the inventory below.
          </span>
        </div>
      )}
    </section>
  );
}
