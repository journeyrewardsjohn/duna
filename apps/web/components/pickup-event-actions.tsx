"use client";

import type { PickupManagementSummary } from "@duna/api";
import {
  pickupInviteActionLabel,
  pickupInviteExplanation,
  pickupInviteResult,
  type PersonSummary,
} from "@duna/core";
import { Badge } from "@duna/ui";
import {
  ArrowRight,
  Camera,
  Check,
  Clock3,
  LogOut,
  Pencil,
  ShieldCheck,
  Trash2,
  Trophy,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelPickupAction,
  invitePickupPlayersAction,
  leavePickupAction,
  reportPickupAttendanceAction,
  requestPickupJoinAction,
  reviewPickupJoinRequestAction,
} from "@/app/events/[slug]/actions";
import { PlayerEventNotes } from "@/components/player-event-notes";
import {
  searchTeammatesAction,
  startEventCheckoutAction,
} from "@/app/app/checkout/[slug]/actions";

type PickupPlayerResult = {
  readonly person: PersonSummary;
  readonly eligible: boolean;
  readonly eligibilityReasons: readonly string[];
};

function PickupPlayerAdder({
  pickupSessionId,
  slug,
  management,
  paidMatch,
}: {
  readonly pickupSessionId: string;
  readonly slug: string;
  readonly management: PickupManagementSummary;
  readonly paidMatch: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly PickupPlayerResult[]>([]);
  const [selected, setSelected] = useState<readonly PickupPlayerResult[]>([]);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const search = () => {
    startTransition(async () => {
      const response = await searchTeammatesAction({
        query: query.trim() || undefined,
      });
      if (!response.ok) {
        setMessage(response.error);
        return;
      }
      setResults(response.results);
    });
  };

  const invite = () => {
    startTransition(async () => {
      const response = await invitePickupPlayersAction({
        pickupSessionId,
        slug,
        personIds: selected.map(({ person }) => person.id),
        idempotencyKey: crypto.randomUUID(),
      });
      setMessage(
        response.ok
          ? pickupInviteResult({
              invitedCount: response.result.invitedPersonIds.length,
              alreadyActiveCount: response.result.alreadyActivePersonIds.length,
              paidMatch,
            })
          : response.error,
      );
      if (response.ok) setSelected([]);
    });
  };

  const cover = () => {
    startTransition(async () => {
      const response = await startEventCheckoutAction({
        sessionId: pickupSessionId,
        slug,
        teamPaymentMode: "team",
        teamRoster: selected.map(({ person }) => ({
          personId: person.id,
          displayName: person.displayName,
        })),
        acceptedPolicyIds: [],
        readPolicyIds: [],
        isDunaPlus: false,
        idempotencyKey: crypto.randomUUID(),
      });
      if (!response.ok) {
        setMessage(response.error);
        return;
      }
      if (response.result.checkoutUrl) {
        window.location.assign(response.result.checkoutUrl);
        return;
      }
      setMessage(
        response.result.mode === "waitlist"
          ? "The match filled while you were choosing; waitlist status was applied."
          : `${selected.length} place(s) confirmed.`,
      );
      setSelected([]);
    });
  };

  if (!management.canAddPlayers) return null;
  return (
    <section className="pickup-actions__player-adder">
      <button onClick={() => setOpen((value) => !value)} type="button">
        <UserPlus aria-hidden size={15} />{" "}
        {open ? "Close player picker" : "Add players"}
      </button>
      {open && (
        <div className="pickup-actions__player-picker">
          <p>
            <strong>{management.spotsRemaining} open</strong> of{" "}
            {management.capacity}
            {management.waitlistEnabled ? " · waitlist on" : " · waitlist off"}
          </p>
          <label>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Duna players"
              value={query}
            />
            <button disabled={pending} onClick={search} type="button">
              Search
            </button>
          </label>
          <div className="pickup-actions__player-results">
            {results.map((result) => {
              const chosen = selected.some(
                ({ person }) => person.id === result.person.id,
              );
              return (
                <button
                  aria-pressed={chosen}
                  disabled={!result.eligible}
                  key={result.person.id}
                  onClick={() =>
                    setSelected((current) =>
                      chosen
                        ? current.filter(
                            ({ person }) => person.id !== result.person.id,
                          )
                        : [...current, result],
                    )
                  }
                  type="button"
                >
                  <span className="avatar">{result.person.initials}</span>
                  <span>
                    <strong>{result.person.displayName}</strong>
                    <small>
                      Sand Rating {result.person.rating.display.toFixed(2)}
                    </small>
                  </span>
                  <Check aria-hidden size={15} />
                </button>
              );
            })}
          </div>
          {selected.length > 0 && (
            <>
              <small className="pickup-actions__invite-help">
                {pickupInviteExplanation(paidMatch)}
              </small>
              <div className="pickup-actions__player-decisions">
                <button disabled={pending} onClick={invite} type="button">
                  {pickupInviteActionLabel(selected.length)}
                </button>
                {paidMatch && (
                  <button
                    disabled={
                      pending || selected.length > management.spotsRemaining
                    }
                    onClick={cover}
                    type="button"
                  >
                    Pay & confirm {selected.length}
                  </button>
                )}
              </div>
            </>
          )}
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}

interface PickupEventActionsProps {
  readonly pickupSessionId: string;
  readonly slug: string;
  readonly approvalRequired: boolean;
  readonly paidMatch: boolean;
  readonly phase: "upcoming" | "live" | "completed" | "cancelled";
  readonly management?: PickupManagementSummary;
}

export function PickupEventActions({
  pickupSessionId,
  slug,
  approvalRequired,
  paidMatch,
  phase,
  management,
}: PickupEventActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  const run = (
    action: () => Promise<{ readonly ok: boolean; readonly error?: string }>,
    success: string,
  ) => {
    setMessage("");
    startTransition(async () => {
      const result = await action();
      setMessage(result.ok ? success : (result.error ?? "Try again."));
      if (result.ok) router.refresh();
    });
  };

  if (phase === "cancelled") {
    return (
      <div className="pickup-actions pickup-actions--finished">
        <Badge tone="warning">Cancelled</Badge>
        <span>
          <strong>This pickup was cancelled.</strong>
          <small>
            Its roster and original details remain here for reference.
          </small>
        </span>
      </div>
    );
  }

  if (phase === "completed") {
    return (
      <div className="pickup-actions pickup-actions--finished">
        <Badge tone="positive">Event ended</Badge>
        <span>
          <strong>This pickup has ended.</strong>
          <small>
            Review the result or revisit any recordings from the match.
          </small>
        </span>
        <div className="pickup-actions__finished-links">
          <Link href="/app/matches">
            <Trophy aria-hidden size={15} /> Results
          </Link>
          <Link href="/app/video">
            <Camera aria-hidden size={15} /> Recordings
          </Link>
        </div>
        {management?.isParticipant ? (
          <PlayerEventNotes activityId={pickupSessionId} slug={slug} />
        ) : null}
      </div>
    );
  }

  if (phase === "live" && management) {
    const noShowCandidates = management.participants.filter(
      (participant) =>
        !participant.isHost && participant.status === "confirmed",
    );
    return (
      <div className="pickup-actions pickup-actions--live">
        <header>
          <Badge tone="live">Live now</Badge>
          <strong>Keep the match moving.</strong>
        </header>
        <p className="pickup-actions__live-copy">
          Score the match or capture it with Duna. Hosts can replace a no-show
          before the final whistle.
        </p>
        <div className="pickup-actions__live-primary">
          <Link
            href={`/app/score?event=${encodeURIComponent(pickupSessionId)}`}
          >
            <Trophy aria-hidden size={16} /> Keep score
          </Link>
          <Link
            href={`/app/video?event=${encodeURIComponent(pickupSessionId)}`}
          >
            <Camera aria-hidden size={16} /> Record video
          </Link>
        </div>
        {management.isHost && (
          <>
            <PickupPlayerAdder
              management={management}
              paidMatch={paidMatch}
              pickupSessionId={pickupSessionId}
              slug={slug}
            />
            {noShowCandidates.length > 0 && (
              <section className="pickup-actions__attendance">
                <small>Player missing?</small>
                {noShowCandidates.map((participant) => (
                  <button
                    className="secondary"
                    disabled={pending}
                    key={participant.id}
                    onClick={() =>
                      run(
                        () =>
                          reportPickupAttendanceAction({
                            pickupSessionId,
                            participantId: participant.id,
                            status: "no-show",
                            slug,
                            idempotencyKey: crypto.randomUUID(),
                          }),
                        `${participant.displayName} marked as not present.`,
                      )
                    }
                    type="button"
                  >
                    <UserX aria-hidden size={15} /> Report{" "}
                    {participant.displayName} absent
                  </button>
                ))}
              </section>
            )}
          </>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    );
  }

  if (!management) {
    return approvalRequired ? (
      <div className="pickup-actions pickup-actions--signed-out">
        <ShieldCheck aria-hidden size={19} />
        <span>
          <strong>Host approval is required.</strong>
          <small>Sign in to ask for a spot. You will not be charged yet.</small>
        </span>
        <Link
          href={`/sign-in?returnTo=${encodeURIComponent(`/events/${slug}`)}`}
        >
          Sign in to request <ArrowRight aria-hidden size={15} />
        </Link>
      </div>
    ) : (
      <Link href={`/app/checkout/${slug}`}>
        Join this pickup <ArrowRight aria-hidden size={17} />
      </Link>
    );
  }

  if (management.isHost) {
    return (
      <div className="pickup-actions pickup-actions--host">
        <header>
          <Badge tone="positive">You&apos;re hosting</Badge>
          <strong>
            {management.requests.length > 0
              ? `${management.requests.length} waiting for your review`
              : "Your pickup is live"}
          </strong>
        </header>
        {management.requests.map((request) => (
          <article key={request.id}>
            <span className="avatar">
              {request.avatarUrl ? (
                <img alt="" src={request.avatarUrl} />
              ) : (
                request.displayName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join("")
              )}
            </span>
            <span>
              <strong>{request.displayName}</strong>
              <small>{request.note || "Asked to join your match"}</small>
            </span>
            <button
              aria-label={`Approve ${request.displayName}`}
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    reviewPickupJoinRequestAction({
                      requestId: request.id,
                      decision: "approved",
                      slug,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  `${request.displayName} can now finish booking.`,
                )
              }
              type="button"
            >
              <Check aria-hidden size={15} /> Approve
            </button>
            <button
              aria-label={`Decline ${request.displayName}`}
              className="secondary"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    reviewPickupJoinRequestAction({
                      requestId: request.id,
                      decision: "rejected",
                      slug,
                      idempotencyKey: crypto.randomUUID(),
                    }),
                  "Request declined.",
                )
              }
              type="button"
            >
              <X aria-hidden size={15} />
            </button>
          </article>
        ))}
        {management.canEdit && (
          <Link
            className="pickup-actions__edit"
            href={`/app/pickup/${encodeURIComponent(slug)}/edit`}
          >
            <Pencil aria-hidden size={15} /> Edit pickup
          </Link>
        )}
        <PickupPlayerAdder
          management={management}
          paidMatch={paidMatch}
          pickupSessionId={pickupSessionId}
          slug={slug}
        />
        {management.canCancel ? (
          <button
            className="pickup-actions__danger"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  cancelPickupAction({
                    pickupSessionId,
                    slug,
                    idempotencyKey: crypto.randomUUID(),
                  }),
                "Pickup cancelled.",
              )
            }
            type="button"
          >
            <Trash2 aria-hidden size={15} /> Cancel pickup
          </button>
        ) : (
          <small className="pickup-actions__guard">
            Once another player joins, the host can remove themself but cannot
            silently cancel the match for everyone.
          </small>
        )}
        {management.canLeave && !management.canCancel && (
          <button
            className="pickup-actions__danger"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  leavePickupAction({
                    pickupSessionId,
                    slug,
                    idempotencyKey: crypto.randomUUID(),
                  }),
                "You removed yourself from the player list.",
              )
            }
            type="button"
          >
            <LogOut aria-hidden size={15} /> Remove myself
          </button>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    );
  }

  if (management.canLeave) {
    return (
      <div className="pickup-actions">
        <Badge tone="positive">You&apos;re in</Badge>
        <PickupPlayerAdder
          management={management}
          paidMatch={paidMatch}
          pickupSessionId={pickupSessionId}
          slug={slug}
        />
        <button
          className="pickup-actions__danger"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                leavePickupAction({
                  pickupSessionId,
                  slug,
                  idempotencyKey: crypto.randomUUID(),
                }),
              "You left this pickup.",
            )
          }
          type="button"
        >
          <LogOut aria-hidden size={15} /> Remove my spot
        </button>
        {message && <p role="status">{message}</p>}
      </div>
    );
  }

  if (management.ownRequestStatus === "approved") {
    return (
      <div className="pickup-actions pickup-actions--approved">
        <Check aria-hidden size={18} />
        <span>
          <strong>You&apos;re approved.</strong>
          <small>Finish booking to confirm your spot.</small>
        </span>
        <Link href={`/app/checkout/${slug}`}>
          Finish booking <ArrowRight aria-hidden size={15} />
        </Link>
      </div>
    );
  }

  if (management.ownRequestStatus === "requested") {
    return (
      <div className="pickup-actions pickup-actions--waiting">
        <Clock3 aria-hidden size={18} />
        <span>
          <strong>Request sent.</strong>
          <small>You can book after the host approves you.</small>
        </span>
      </div>
    );
  }

  if (!approvalRequired) {
    return (
      <Link href={`/app/checkout/${slug}`}>
        Join this pickup <ArrowRight aria-hidden size={17} />
      </Link>
    );
  }

  return (
    <div className="pickup-actions pickup-actions--request">
      <ShieldCheck aria-hidden size={19} />
      <span>
        <strong>Ask the host for a spot.</strong>
        <small>No charge is attempted until you are approved.</small>
      </span>
      <textarea
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Optional note to the host"
        rows={2}
        value={note}
      />
      <button
        disabled={pending}
        onClick={() =>
          run(
            () =>
              requestPickupJoinAction({
                pickupSessionId,
                slug,
                note: note.trim() || undefined,
                idempotencyKey: crypto.randomUUID(),
              }),
            "Request sent to the host.",
          )
        }
        type="button"
      >
        {pending ? "Sending…" : "Request to join"}{" "}
        <ArrowRight aria-hidden size={15} />
      </button>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
