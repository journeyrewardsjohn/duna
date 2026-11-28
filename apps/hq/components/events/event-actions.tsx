"use client";

import { Icon } from "@duna/ui/icons";
import { report } from "@duna/observability";
import {
  Button,
  ConfirmSlot,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  Field,
  Notice,
  RadioGroup,
  RadioOption,
  Textarea,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  closeRegistrationAction,
  entrantsLinkAction,
  messageEntrantsAction,
  publishEventAction,
  publishLiveAction,
} from "@/app/(next)/(hq)/events/actions";
import { unwrap } from "../money/money-action-result";
import type { EventCapabilities } from "./events-capabilities";
import type { EventPermissions, EventStatus, NextStep } from "./events-model";

export const failed = (event: string) => (error: unknown) =>
  void report(error, { event });

interface HeaderView {
  readonly id: string;
  readonly title: string;
  readonly next: NextStep;
  readonly divisions: number;
  readonly entries: number;
  readonly status: EventStatus;
  readonly attendees: readonly { hasPhone: boolean; hasEmail: boolean }[];
}

/**
 * The open event's actions: on Overview, the one next step as the primary
 * button (publish, close registration, publish and set live, or the tab
 * where the work is); everywhere, Message entrants and the public page.
 */
export function EventHeaderActions({
  view,
  permissions,
  capabilities,
  primary,
  publicUrl,
}: {
  readonly view: HeaderView;
  readonly permissions: EventPermissions;
  readonly capabilities: EventCapabilities;
  readonly primary: boolean;
  readonly publicUrl?: string;
}) {
  return (
    <>
      {publicUrl ? (
        <Button
          href={publicUrl}
          rel="noreferrer"
          target="_blank"
          variant="ghost"
        >
          Public page
        </Button>
      ) : null}
      {(permissions.change || permissions.message) &&
      view.attendees.length > 0 ? (
        <MessageEntrants
          capabilities={capabilities}
          eventId={view.id}
          people={view.attendees}
          title={view.title}
        />
      ) : null}
      {primary ? <NextStepButton view={view} /> : null}
    </>
  );
}

function NextStepButton({ view }: { readonly view: HeaderView }) {
  const router = useRouter();
  const confirm = useConfirm();
  const next = view.next;
  if (next.kind === "none") return null;
  if (next.kind === "tab") {
    return (
      <Button
        href={`/events/${view.id}/${next.tab}`}
        onClick={(event) => {
          event.preventDefault();
          router.push(`/events/${view.id}/${next.tab}`);
        }}
        variant="primary"
      >
        {next.label}
      </Button>
    );
  }
  if (next.kind === "close-registration") {
    return (
      <CloseRegistration
        eventId={view.id}
        primary
        teams={view.entries}
        title={view.title}
      />
    );
  }
  if (next.kind === "publish-live") {
    return <PublishLive eventId={view.id} primary title={view.title} />;
  }
  return (
    <>
      <Button
        onClick={() =>
          void confirm
            .run({
              tier: "confirm",
              title: `Publish ${view.title}?`,
              description:
                "Its public page goes up and registration opens. Players can find it and enter.",
              verb: "Publish event",
              cancelLabel: "Not yet",
              agentConfirm: `Publishes ${view.title} and opens registration`,
              perform: async ({ idempotencyKey }) =>
                unwrap(
                  await publishEventAction({
                    sessionId: view.id,
                    idempotencyKey,
                  }),
                ),
              success: `${view.title} is published`,
              report: failed("hq.events.publish_failed"),
            })
            .then((outcome) => {
              if (outcome.status === "done") router.refresh();
            })
        }
        variant="primary"
      >
        Publish event
      </Button>
      {confirm.dialog}
    </>
  );
}

/** Close registration: a note for the record, then a confirmation. */
export function CloseRegistration({
  eventId,
  title,
  teams,
  primary = false,
}: {
  readonly eventId: string;
  readonly title: string;
  readonly teams: number;
  readonly primary?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(
    "Director closed registration to begin final seeding.",
  );
  const inline = useConfirm({ presentation: "inline" });
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        variant={primary ? "primary" : "secondary"}
      >
        Close registration
      </Button>
      <Dialog {...inline.hostProps} onOpenChange={setOpen} open={open}>
        <DialogContent
          description="New entries and roster changes stop at once. Kept with the event's history."
          title="Close registration"
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              <Field
                hint="Kept with the event's history."
                label="Note for the record"
              >
                <Textarea
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  rows={2}
                  value={reason}
                />
              </Field>
            </div>
            <DialogActions>
              <DialogClose>Not yet</DialogClose>
              <Button
                disabled={reason.trim().length < 3}
                onClick={() =>
                  void inline
                    .run({
                      tier: "confirm",
                      title: `Close registration for ${title}?`,
                      description:
                        "Checkout stops and nobody can change a team after this.",
                      affected: `${teams} ${teams === 1 ? "entry stays" : "entries stay"} in the field as they are.`,
                      verb: "Close registration",
                      cancelLabel: "Keep it open",
                      agentConfirm: `Closes registration for ${title}`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await closeRegistrationAction({
                            sessionId: eventId,
                            reason,
                            idempotencyKey,
                          }),
                        ),
                      success: "Registration is closed",
                      report: failed("hq.events.close_failed"),
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        setOpen(false);
                        router.refresh();
                      }
                    })
                }
                variant="primary"
              >
                Review and close
              </Button>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Publish and set live: the message the field receives, then a confirmation. */
export function PublishLive({
  eventId,
  title,
  primary = false,
  disabled = false,
}: {
  readonly eventId: string;
  readonly title: string;
  readonly primary?: boolean;
  readonly disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(
    "The official pools and match schedule are live. Check your first match and court before play begins.",
  );
  const inline = useConfirm({ presentation: "inline" });
  return (
    <>
      <Button
        disabled={disabled}
        onClick={() => setOpen(true)}
        variant={primary ? "primary" : "secondary"}
      >
        Publish and set live
      </Button>
      <Dialog {...inline.hostProps} onOpenChange={setOpen} open={open}>
        <DialogContent
          description="Pools, the draw, courts and match times become public, and every entrant is told."
          title="Publish and set live"
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              <Field
                error={
                  message.trim().length < 10
                    ? "Write at least 10 characters."
                    : undefined
                }
                label="Message to the field"
              >
                <Textarea
                  maxLength={500}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={3}
                  value={message}
                />
              </Field>
            </div>
            <DialogActions>
              <DialogClose>Not yet</DialogClose>
              <Button
                disabled={message.trim().length < 10}
                onClick={() =>
                  void inline
                    .run({
                      tier: "confirm",
                      title: `Publish ${title} and set it live?`,
                      description:
                        "The official field, pools, draw, courts and match times appear on the event's public page and in players' apps.",
                      affected: "Every entrant is told, with your message.",
                      verb: "Publish and set live",
                      cancelLabel: "Not yet",
                      agentConfirm: `Publishes ${title}'s field and schedule and tells every entrant`,
                      perform: async ({ idempotencyKey }) =>
                        unwrap(
                          await publishLiveAction({
                            sessionId: eventId,
                            message,
                            idempotencyKey,
                          }),
                        ),
                      success: `${title} is live`,
                      report: failed("hq.events.publish_live_failed"),
                    })
                    .then((outcome) => {
                      if (outcome.status === "done") {
                        setOpen(false);
                        router.refresh();
                      }
                    })
                }
                variant="primary"
              >
                Review and publish
              </Button>
            </DialogActions>
          </ConfirmSlot>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Message entrants. Until Duna sends to an event's entrants itself (a
 * switch), the person's own Messages or email app opens with the entrants
 * who gave a number or an address, after they confirm. Nothing is sent
 * from Duna, and contact details are read only at that moment.
 */
export function MessageEntrants({
  eventId,
  title,
  people,
  capabilities,
}: {
  readonly eventId: string;
  readonly title: string;
  readonly people: readonly { hasPhone: boolean; hasEmail: boolean }[];
  readonly capabilities: EventCapabilities;
}) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"sms" | "email" | "duna">(
    capabilities.messageEntrants ? "duna" : "sms",
  );
  const [body, setBody] = useState(`A quick update about ${title}: `);
  const inline = useConfirm({ presentation: "inline" });
  const phones = people.filter((person) => person.hasPhone).length;
  const emails = people.filter((person) => person.hasEmail).length;
  const reach =
    channel === "duna" ? people.length : channel === "sms" ? phones : emails;
  const left = people.length - reach;
  return (
    <>
      <Button
        icon={<Icon name="message" size="control" />}
        onClick={() => setOpen(true)}
        variant="secondary"
      >
        Message entrants
      </Button>
      <Dialog {...inline.hostProps} onOpenChange={setOpen} open={open}>
        <DialogContent
          description={`${people.length} ${people.length === 1 ? "entrant" : "entrants"} in ${title}.`}
          title="Message entrants"
        >
          <ConfirmSlot confirm={inline}>
            <div className="ev-form">
              <RadioGroup
                aria-label="How to send it"
                onValueChange={(value) => setChannel(value as typeof channel)}
                value={channel}
              >
                {capabilities.messageEntrants ? (
                  <RadioOption
                    description="Each entrant hears from the club in Duna, the way they chose."
                    label="Send through Duna"
                    value="duna"
                  />
                ) : null}
                <RadioOption
                  description={`Opens your Messages app with ${phones} ${phones === 1 ? "number" : "numbers"}. You send it.`}
                  disabled={phones === 0}
                  label="Text message from your phone"
                  value="sms"
                />
                <RadioOption
                  description={`Opens your email with ${emails} ${emails === 1 ? "address" : "addresses"}, hidden from each other. You send it.`}
                  disabled={emails === 0}
                  label="Email from your account"
                  value="email"
                />
              </RadioGroup>
              <Field label="Message">
                <Textarea
                  maxLength={1_000}
                  onChange={(event) => setBody(event.target.value)}
                  rows={4}
                  value={body}
                />
              </Field>
              {left > 0 && channel !== "duna" ? (
                <Notice tone="info">
                  {left} {left === 1 ? "entrant has" : "entrants have"} no{" "}
                  {channel === "sms" ? "phone number" : "email address"} on file
                  and won't get this.
                </Notice>
              ) : null}
            </div>
            <DialogActions>
              <DialogClose>Cancel</DialogClose>
              <Button
                disabled={body.trim().length < 2 || reach === 0}
                onClick={() =>
                  void inline
                    .run<unknown>(
                      channel === "duna"
                        ? {
                            tier: "confirm",
                            title: `Send to ${reach} ${reach === 1 ? "entrant" : "entrants"}?`,
                            description: body.trim(),
                            affected: `Everyone entered in ${title}.`,
                            verb: `Send to ${reach}`,
                            agentConfirm: `Sends a message to ${reach} entrants of ${title}`,
                            perform: async ({ idempotencyKey }) =>
                              unwrap(
                                await messageEntrantsAction({
                                  sessionId: eventId,
                                  body,
                                  idempotencyKey,
                                }),
                              ),
                            success: "Message sent",
                            report: failed("hq.events.message_failed"),
                          }
                        : {
                            tier: "confirm",
                            title: `Open ${channel === "sms" ? "a text" : "an email"} to ${reach} ${reach === 1 ? "entrant" : "entrants"}?`,
                            description: `Your ${channel === "sms" ? "Messages" : "email"} app opens with their ${channel === "sms" ? "numbers" : "addresses"} and your message. Nothing is sent until you send it there.`,
                            affected: `${reach} of ${people.length} entrants.`,
                            verb:
                              channel === "sms"
                                ? "Open in Messages"
                                : "Open in email",
                            agentConfirm: `Opens the person's own app to message ${reach} entrants`,
                            perform: async () => {
                              const link = unwrap(
                                await entrantsLinkAction({
                                  sessionId: eventId,
                                  channel,
                                  body,
                                }),
                              );
                              window.location.href = link.href;
                              return link;
                            },
                            report: failed("hq.events.message_link_failed"),
                          },
                    )
                    .then((outcome) => {
                      if (outcome.status === "done") setOpen(false);
                    })
                }
                variant="primary"
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
