"use client";

import type { PickupManagementSummary } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  ArrowRight,
  Check,
  Clock3,
  LogOut,
  Pencil,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  cancelPickupAction,
  leavePickupAction,
  requestPickupJoinAction,
  reviewPickupJoinRequestAction,
} from "@/app/events/[slug]/actions";

interface PickupEventActionsProps {
  readonly pickupSessionId: string;
  readonly slug: string;
  readonly approvalRequired: boolean;
  readonly management?: PickupManagementSummary;
}

export function PickupEventActions({
  pickupSessionId,
  slug,
  approvalRequired,
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
