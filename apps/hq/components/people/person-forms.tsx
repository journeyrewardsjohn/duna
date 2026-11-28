"use client";

import {
  Button,
  Field,
  Input,
  Notice,
  Select,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addToSessionAction,
  updateDetailsAction,
} from "@/app/(next)/(hq)/people/actions";
import { reportFailure, unwrap } from "./people-result";

function messageOf(error: unknown, fallback: string): string {
  return (error as { userMessage?: string } | null)?.userMessage ?? fallback;
}

/** A person's details for the club's team: name, and an adult's contact. */
export function EditDetails({
  personId,
  name,
  email,
  phone,
  isJunior,
}: {
  readonly personId: string;
  readonly name: string;
  readonly email?: string;
  readonly phone?: string;
  readonly isJunior: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState({
    name,
    email: email ?? "",
    phone: phone ?? "",
  });
  const changed =
    draft.name.trim() !== name ||
    draft.email.trim() !== (email ?? "") ||
    draft.phone.trim() !== (phone ?? "");
  const save = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await updateDetailsAction({
          personId,
          displayName: draft.name,
          email: draft.email,
          phone: draft.phone,
          isJunior,
          idempotencyKey,
        }),
      ),
    {
      messages: {
        success: "Details saved",
        error: "The details weren't saved. Nothing changed.",
      },
      report: reportFailure("hq.people.details_failed"),
      onSuccess: () => router.refresh(),
    },
  );
  return (
    <form
      aria-label="Details"
      className="people-form people-form--grid"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && draft.name.trim().length >= 2) void save.run();
      }}
    >
      <Field label="Name">
        <Input
          autoComplete="off"
          maxLength={120}
          minLength={2}
          onChange={(event) =>
            setDraft({ ...draft, name: event.currentTarget.value })
          }
          required
          value={draft.name}
        />
      </Field>
      {isJunior ? (
        <p className="people-quiet">
          A junior has no contact of their own here: the club reaches them
          through their guardian.
        </p>
      ) : (
        <>
          <Field label="Email" optional>
            <Input
              autoComplete="off"
              onChange={(event) =>
                setDraft({ ...draft, email: event.currentTarget.value })
              }
              type="email"
              value={draft.email}
            />
          </Field>
          <Field
            hint="With the country code, like +1 310 555 0121."
            label="Mobile"
            optional
          >
            <Input
              autoComplete="off"
              inputMode="tel"
              onChange={(event) =>
                setDraft({ ...draft, phone: event.currentTarget.value })
              }
              value={draft.phone}
            />
          </Field>
        </>
      )}
      {save.error ? (
        <Notice role="alert" title="Not saved" tone="danger">
          {messageOf(save.error, "The details weren't saved. Nothing changed.")}
        </Notice>
      ) : null}
      <div className="people-actions">
        <Button
          disabled={!changed}
          loading={save.showPending}
          type="submit"
          variant="secondary"
        >
          Save details
        </Button>
      </div>
    </form>
  );
}

/** Adds the person to an upcoming session, after a confirmation naming it. */
export function AddToSession({
  personId,
  name,
  sessions,
}: {
  readonly personId: string;
  readonly name: string;
  readonly sessions: readonly { readonly id: string; readonly label: string }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const chosen = sessions.find((session) => session.id === sessionId);
  if (sessions.length === 0) {
    return (
      <p className="people-quiet">
        No upcoming session has room for {name} right now.
      </p>
    );
  }
  return (
    <form
      aria-label="Add to a session"
      className="people-form people-form--inline"
      onSubmit={(event) => {
        event.preventDefault();
        if (!chosen) return;
        void confirm
          .run({
            tier: "confirm",
            title: `Add ${name} to ${chosen.label}?`,
            description: `${name} is booked on the session's roster.`,
            affected:
              "They see it in their Duna app. No payment is taken from here.",
            verb: `Add ${name}`,
            cancelLabel: "Don't add",
            agentConfirm: `Adds ${name} to ${chosen.label}`,
            perform: async ({ idempotencyKey }) =>
              unwrap(
                await addToSessionAction({
                  personId,
                  sessionId: chosen.id,
                  idempotencyKey,
                }),
              ),
            success: `${name} is booked on ${chosen.label}`,
            report: reportFailure("hq.people.add_to_session_failed"),
          })
          .then((outcome) => {
            if (outcome.status === "done") router.refresh();
          });
      }}
    >
      <Field label="Session">
        <Select
          onValueChange={setSessionId}
          options={sessions.map((session) => ({
            value: session.id,
            label: session.label,
          }))}
          value={sessionId}
        />
      </Field>
      <div className="people-actions">
        <Button disabled={!chosen} type="submit" variant="secondary">
          Add to session
        </Button>
      </div>
      {confirm.dialog}
    </form>
  );
}
