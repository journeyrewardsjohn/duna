"use client";

import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  ErrorState,
  Field,
  Input,
  Notice,
  PaneTransition,
  RadioGroup,
  RadioOption,
  useAction,
} from "@duna/ui/tideline";
import { useState } from "react";
import { inviteTeamMemberAction } from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import { actionError } from "../money/money-client";
import {
  classificationLabel,
  classificationNote,
  firstName,
  parseInviteContact,
  roleLabel,
  roleSummaries,
  type StaffRole,
} from "./team-model";
import { reportFailure } from "./team-report";

type Step = "form" | "review" | "done";

/**
 * "Invite someone" (TM-Add): one short form (name, email or mobile, role in
 * plain words, worker classification), then a review that restates who,
 * how and as what before anything is sent. The send is single flight with
 * one idempotency key per attempt: a double click sends one invitation.
 */
export function InviteForm({
  canInviteDirector,
  organization,
}: {
  readonly canInviteDirector: boolean;
  readonly organization: string;
}) {
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [contactText, setContactText] = useState("");
  const [role, setRole] = useState<StaffRole>("coach");
  const [classification, setClassification] = useState<
    "1099-contractor" | "w2-employee"
  >("1099-contractor");
  const [touched, setTouched] = useState(false);
  const [copied, setCopied] = useState(false);
  const contact = parseInviteContact(contactText);
  const nameProblem =
    name.trim().length < 2
      ? "Enter their name (at least 2 letters)."
      : undefined;
  const contactProblem =
    contact.kind === "invalid" ? contact.problem : undefined;
  const roles: StaffRole[] = [
    "coach",
    "manager",
    "front-desk",
    "accountant",
    ...(canInviteDirector ? (["director"] as const) : []),
  ];
  const how =
    contact.kind === "email"
      ? `by email to ${contact.email}`
      : contact.kind === "phone"
        ? `by text message to ${contact.phoneE164}`
        : "as a private link you share yourself";

  const send = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await inviteTeamMemberAction({
          name: name.trim(),
          ...(contact.kind === "email" ? { email: contact.email } : {}),
          ...(contact.kind === "phone" ? { phoneE164: contact.phoneE164 } : {}),
          role,
          classification,
          idempotencyKey,
        }),
      ),
    {
      report: reportFailure("hq.team.invite_failed"),
      onSuccess: () => setStep("done"),
    },
  );

  const review = () => {
    setTouched(true);
    if (nameProblem || contactProblem) return;
    send.reset();
    setStep("review");
  };

  const result = send.result;
  return (
    <PaneTransition
      direction={step === "form" ? "back" : "forward"}
      transitionKey={step}
    >
      {step === "form" ? (
        <form
          aria-label="Invite someone"
          className="team-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            review();
          }}
        >
          <Field error={touched ? nameProblem : undefined} label="Name">
            <Input
              autoComplete="name"
              maxLength={120}
              name="name"
              onChange={(event) => setName(event.currentTarget.value)}
              placeholder="Jordan Cruz"
              value={name}
            />
          </Field>
          <Field
            error={touched ? contactProblem : undefined}
            hint="Duna sends the invitation here. Leave it empty to get a private link to share yourself."
            label="Email or mobile"
            optional
          >
            <Input
              autoComplete="email"
              inputMode="email"
              name="contact"
              onChange={(event) => setContactText(event.currentTarget.value)}
              placeholder="jordan@example.com or +1 704 555 0123"
              value={contactText}
            />
          </Field>
          <Field label="Role">
            <RadioGroup
              className="team-presets"
              onValueChange={(value) => setRole(value as StaffRole)}
              value={role}
            >
              {roles.map((item) => (
                <RadioOption
                  description={roleSummaries[item]}
                  key={item}
                  label={roleLabel(item)}
                  value={item}
                />
              ))}
            </RadioGroup>
          </Field>
          <Field label="Worker classification">
            <RadioGroup
              inline
              onValueChange={(value) =>
                setClassification(value as "1099-contractor" | "w2-employee")
              }
              value={classification}
            >
              <RadioOption label="Contractor (1099)" value="1099-contractor" />
              <RadioOption label="Employee (W-2)" value="w2-employee" />
            </RadioGroup>
          </Field>
          <p className="team-note">{classificationNote}</p>
          <div className="team-form__actions">
            <Button href={hqHref("team")} variant="ghost">
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Review invitation
            </Button>
          </div>
        </form>
      ) : step === "review" ? (
        <section aria-labelledby="invite-review-title" className="team-review">
          <h2 className="team-review__title" id="invite-review-title">
            Check before it goes
          </h2>
          <dl className="team-review__facts">
            <div>
              <dt>Who</dt>
              <dd>{name.trim()}</dd>
            </div>
            <div>
              <dt>How</dt>
              <dd>{how}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>
                {roleLabel(role)}: {roleSummaries[role]}
              </dd>
            </div>
            <div>
              <dt>Classification</dt>
              <dd>{classificationLabel(classification)}</dd>
            </div>
          </dl>
          <p className="team-note">
            {`${firstName(name.trim())} sees the role and classification before accepting, and can't change them. The invitation lasts 7 days.`}
          </p>
          {send.status === "error" ? (
            <ErrorState
              compact
              message={actionError(
                send.error,
                "The invitation wasn't sent. Nothing changed; try again.",
              )}
              reference={send.reference}
              title="Not sent"
            />
          ) : null}
          <div className="team-form__actions">
            <Button
              disabled={send.pending}
              onClick={() => setStep("form")}
              variant="ghost"
            >
              Back to edit
            </Button>
            <Button
              {...send.buttonProps}
              data-agent-confirm={`Sends ${name.trim()} an invitation to join ${organization} as ${roleLabel(role)}`}
              variant="primary"
            >
              {contact.kind === "none"
                ? "Create the private link"
                : `Send invitation to ${firstName(name.trim())}`}
            </Button>
          </div>
        </section>
      ) : (
        <section aria-labelledby="invite-done-title" className="team-review">
          <h2 className="team-review__title" id="invite-done-title">
            {contact.kind === "none"
              ? "Private link ready"
              : result?.status === "sent"
                ? `Invitation sent to ${firstName(name.trim())}`
                : "Invitation created"}
          </h2>
          {contact.kind !== "none" && result?.status !== "sent" ? (
            <Notice role="status" tone="info">
              Sending it from Duna isn&apos;t set up yet in this environment.
              Share the link below instead.
            </Notice>
          ) : null}
          {result?.link ? (
            <div className="team-link-box">
              <Input
                aria-label="Private invitation link"
                readOnly
                value={result.link}
              />
              <Button
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(result.link ?? "")
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
                variant="secondary"
              >
                {copied ? "Link copied" : "Copy link"}
              </Button>
            </div>
          ) : null}
          <p className="team-note">
            {`${firstName(name.trim())} shows as Invited on the team until they accept.`}
          </p>
          <div className="team-form__actions">
            <Button
              onClick={() => {
                setName("");
                setContactText("");
                setTouched(false);
                setCopied(false);
                send.reset();
                setStep("form");
              }}
              variant="ghost"
            >
              Invite someone else
            </Button>
            <Button href={hqHref("team")} variant="primary">
              Back to the team
            </Button>
          </div>
        </section>
      )}
    </PaneTransition>
  );
}
