"use client";

import {
  Button,
  ConfirmSlot,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  Field,
  Input,
  NumberInput,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  cancelEventAction,
  updateDetailsAction,
} from "@/app/(next)/(hq)/events/actions";
import { unwrap } from "../money/money-action-result";
import { PageSection } from "../shell/page-header";
import { CloseRegistration, failed } from "./event-actions";
import {
  instantToLocalInput,
  isCompetitionKind,
  type EventPermissions,
  type EventView,
} from "./events-model";

/**
 * An event's settings: its details (a tournament's or league's divisions,
 * fees, media and waivers are edited in the event studio), registration,
 * and cancelling, which refunds everyone and restates who gets what first.
 */
export function EventSettings({
  view,
  permissions,
  publicUrl,
}: {
  readonly view: EventView;
  readonly permissions: EventPermissions;
  readonly publicUrl?: string;
}) {
  const open = view.status !== "cancelled" && view.segment !== "past";
  const studio = isCompetitionKind(view.kind) || view.status === "draft";
  return (
    <div className="ev-grid">
      <div className="ev-stack">
        <PageSection
          aside={
            permissions.change && open && studio ? (
              // The event studio is not rebuilt yet: a full page load.
              <Button
                href={`/events/create?draft=${view.id}`}
                size="sm"
                variant="secondary"
              >
                Edit in the event studio
              </Button>
            ) : undefined
          }
          id="details"
          title="Details"
        >
          {permissions.change && open && !studio ? (
            <DetailsForm view={view} />
          ) : (
            <dl className="ev-figures">
              <div className="ev-figure">
                <dt>When</dt>
                <dd className="ev-quiet">{view.when}</dd>
              </div>
              <div className="ev-figure">
                <dt>Where</dt>
                <dd className="ev-quiet">{view.venue ?? "No place yet"}</dd>
              </div>
              <div className="ev-figure">
                <dt>Places</dt>
                <dd>{view.capacity}</dd>
              </div>
            </dl>
          )}
          {studio && open ? (
            <p className="ev-quiet">
              Divisions, entry fees, team size, photos and waivers are set in
              the event studio.
            </p>
          ) : null}
        </PageSection>
        <PageSection id="registration" title="Registration">
          <p className="ev-quiet">
            {view.status === "draft"
              ? "Opens when the event is published."
              : view.registrationOpen
                ? "Open: players can enter and change their teams."
                : "Closed: no new entries or roster changes."}
          </p>
          {permissions.change && open && view.registrationOpen ? (
            <CloseRegistration
              eventId={view.id}
              teams={view.entries}
              title={view.title}
            />
          ) : null}
          {publicUrl ? (
            <p className="ev-quiet">
              Public page:{" "}
              <a
                className="ev-link"
                href={publicUrl}
                rel="noreferrer"
                target="_blank"
              >
                {publicUrl.replace(/^https?:\/\//, "")}
              </a>
            </p>
          ) : null}
        </PageSection>
      </div>
      <div className="ev-stack">
        {open || view.cancellation?.refundStatus === "attention" ? (
          <PageSection
            className="ev-danger"
            id="cancel"
            title="Cancel the event"
          >
            {permissions.refund && view.money ? (
              <CancelEvent view={view} />
            ) : (
              <p className="ev-quiet">
                Cancelling refunds everyone, so only the club's owner can do it.
              </p>
            )}
          </PageSection>
        ) : null}
      </div>
    </div>
  );
}

function DetailsForm({ view }: { readonly view: EventView }) {
  const router = useRouter();
  const confirm = useConfirm();
  const [title, setTitle] = useState(view.title);
  const [starts, setStarts] = useState(
    instantToLocalInput(view.startsAt, view.timeZone),
  );
  const [ends, setEnds] = useState(
    instantToLocalInput(view.endsAt, view.timeZone),
  );
  const [closes, setCloses] = useState(
    view.registrationClosesAt
      ? instantToLocalInput(view.registrationClosesAt, view.timeZone)
      : "",
  );
  const [capacity, setCapacity] = useState<number | null>(view.capacity);
  const [reason, setReason] = useState("");
  const problem =
    title.trim().length < 2
      ? "Give it a name."
      : !starts || !ends || ends <= starts
        ? "It has to end after it starts."
        : !capacity || capacity < 1
          ? "Allow at least one place."
          : capacity < view.entries
            ? `${view.entries} people are already in: allow at least ${view.entries} places.`
            : reason.trim().length < 3
              ? "Say why, in a few words."
              : undefined;
  return (
    <div className="ev-form">
      <Field label="Name">
        <Input
          maxLength={180}
          onChange={(event) => setTitle(event.target.value)}
          value={title}
        />
      </Field>
      <div className="ev-form__row">
        <Field label="Starts">
          <Input
            onChange={(event) => setStarts(event.target.value)}
            type="datetime-local"
            value={starts}
          />
        </Field>
        <Field label="Ends">
          <Input
            onChange={(event) => setEnds(event.target.value)}
            type="datetime-local"
            value={ends}
          />
        </Field>
        <Field label="Registration closes" optional>
          <Input
            onChange={(event) => setCloses(event.target.value)}
            type="datetime-local"
            value={closes}
          />
        </Field>
        <Field label="Places">
          <NumberInput
            max={10_000}
            min={1}
            onValueChange={(value) => setCapacity(value ?? null)}
            value={capacity}
          />
        </Field>
      </div>
      <Field hint="Kept with the event's history." label="Why">
        <Textarea
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          value={reason}
        />
      </Field>
      {problem ? <p className="ev-quiet">{problem}</p> : null}
      <Button
        disabled={Boolean(problem)}
        onClick={() =>
          void confirm
            .run({
              tier: "confirm",
              title: `Save the changes to ${view.title}?`,
              description: `${title.trim()} · ${starts.replace("T", " ")} to ${ends.replace("T", " ")} · ${capacity} places.`,
              affected: view.entries
                ? `${view.entries} ${view.entries === 1 ? "person sees" : "people see"} the new details in Duna.`
                : "Nobody has entered yet.",
              verb: "Save changes",
              agentConfirm: `Changes ${view.title}'s details`,
              perform: async ({ idempotencyKey }) =>
                unwrap(
                  await updateDetailsAction({
                    sessionId: view.id,
                    title,
                    localStartsAt: starts,
                    localEndsAt: ends,
                    ...(closes ? { localRegistrationClosesAt: closes } : {}),
                    capacity: capacity ?? view.capacity,
                    timeZone: view.timeZone,
                    reason,
                    idempotencyKey,
                  }),
                ),
              success: "Details saved",
              report: failed("hq.events.details_failed"),
            })
            .then((outcome) => {
              if (outcome.status === "done") {
                setReason("");
                router.refresh();
              }
            })
        }
        variant="primary"
      >
        Save changes
      </Button>
      {confirm.dialog}
    </div>
  );
}

function CancelEvent({ view }: { readonly view: EventView }) {
  const router = useRouter();
  const inline = useConfirm({ presentation: "inline" });
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const preview = view.money!.cancelPreview;
  const retry = view.cancellation?.refundStatus === "attention";
  const returns = [
    preview.cashMinor > 0
      ? `${preview.cash} to the cards people paid with`
      : undefined,
    preview.credits > 0
      ? `${preview.credits} ${preview.credits === 1 ? "credit" : "credits"} back to wallets`
      : undefined,
  ]
    .filter(Boolean)
    .join(" and ");
  return (
    <>
      <p className="ev-quiet">
        {retry
          ? "Some refunds didn't go through. Retrying sends only those; nobody is refunded twice."
          : `${preview.registrations} ${preview.registrations === 1 ? "entry is" : "entries are"} refunded: ${returns || "nothing was paid"}.`}
      </p>
      <Button onClick={() => setOpen(true)} variant="danger">
        {retry ? "Retry refunds" : "Cancel event"}
      </Button>
      <Dialog {...inline.hostProps} onOpenChange={setOpen} open={open}>
        <DialogContent
          description="Players receive your reason with their refund."
          title={retry ? "Retry refunds" : `Cancel ${view.title}`}
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              <Field label="Reason players receive">
                <Textarea
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  rows={3}
                  value={reason}
                />
              </Field>
            </div>
            <DialogActions>
              <DialogClose>Keep the event</DialogClose>
              <Button
                disabled={reason.trim().length < 3}
                onClick={() =>
                  void inline
                    .run({
                      tier: "strong",
                      destructive: true,
                      title: retry
                        ? "Retry the refunds that failed?"
                        : `Cancel ${view.title} and refund everyone?`,
                      description: retry
                        ? "Only refunds that didn't go through are sent again."
                        : "The event comes off the calendar and its public page says it is cancelled.",
                      amount: returns || "Nothing to refund",
                      recipients: `${preview.registrations} ${preview.registrations === 1 ? "entrant" : "entrants"}`,
                      scope: view.title,
                      consequence:
                        "Refunds can't be undone. Everyone entered is told, with your reason.",
                      verb: retry ? "Retry refunds" : "Cancel and refund",
                      cancelLabel: "Keep the event",
                      agentConfirm: `Cancels ${view.title} and refunds ${preview.registrations} entrants (${returns || "nothing paid"})`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await cancelEventAction({
                            sessionId: view.id,
                            reason,
                            idempotencyKey,
                          }),
                        ),
                      success: retry
                        ? "Refunds sent again"
                        : `${view.title} is cancelled`,
                      report: failed("hq.events.cancel_failed"),
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        setOpen(false);
                        router.refresh();
                      }
                    })
                }
                variant="danger"
              >
                Review
              </Button>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      </Dialog>
    </>
  );
}
