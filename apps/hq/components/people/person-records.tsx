"use client";

import type { PeopleNote } from "@duna/api";
import { Icon } from "@duna/ui/icons";
import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Combobox,
  Field,
  FilterChip,
  Input,
  Notice,
  riseClassName,
  Textarea,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  addNoteAction,
  editNoteAction,
  inviteGuardianAction,
  linkGuardianAction,
  removeNoteAction,
  requestSignatureAction,
  setTagsAction,
} from "@/app/(next)/(hq)/people/actions";
import { NOTE_MAX_LENGTH } from "./people-model";
import { PeopleActionError, reportFailure, unwrap } from "./people-result";

/**
 * The People records the backend keeps for the club (PEOPLE-API): staff
 * notes, tags, guardian links and invitations, and signature requests. Each change is a person's press, single-flight with its
 * idempotency key; nothing here sends a message to anyone (a draft goes to
 * Inbox, or is shown to copy).
 */

function messageOf(error: unknown, fallback: string): string {
  return (error as { userMessage?: string } | null)?.userMessage ?? fallback;
}

function when(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

// ------------------------------------------------------------ notes

/**
 * Staff notes about a person: author and time on each; never shown to the
 * person, never in an export, never sent to Ask Duna. Owners and managers
 * add; the author edits; the author or the owner removes (a confirmation:
 * the text can't be brought back).
 */
export function StaffNotes({
  personId,
  firstName,
  notes: initial,
  viewerId,
  isOwner,
  canWrite,
  timeZone,
}: {
  readonly personId: string;
  readonly firstName: string;
  readonly notes: readonly PeopleNote[];
  readonly viewerId?: string;
  readonly isOwner: boolean;
  readonly canWrite: boolean;
  readonly timeZone: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [notes, setNotes] = useState<readonly PeopleNote[]>(initial);
  const [added, setAdded] = useState<ReadonlySet<string>>(new Set());
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState<string>();
  const [draft, setDraft] = useState("");

  const upsert = (note: PeopleNote) =>
    setNotes((current) =>
      current.some((entry) => entry.id === note.id)
        ? current.map((entry) => (entry.id === note.id ? note : entry))
        : [note, ...current],
    );

  const add = useAction(
    async ({ idempotencyKey }) =>
      unwrap(await addNoteAction({ personId, body, idempotencyKey })),
    {
      messages: { success: "Note saved. Only the club's team sees it." },
      report: reportFailure("hq.people.note_failed"),
      onSuccess: (note) => {
        upsert(note);
        setAdded((current) => new Set(current).add(note.id));
        setBody("");
        router.refresh();
      },
    },
  );
  const edit = useAction(
    async ({ idempotencyKey }, noteId: string) =>
      unwrap(await editNoteAction({ noteId, body: draft, idempotencyKey })),
    {
      messages: { success: "Note updated" },
      report: reportFailure("hq.people.note_edit_failed"),
      onSuccess: (note) => {
        upsert(note);
        setEditing(undefined);
      },
    },
  );
  const remove = (note: PeopleNote) =>
    void confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: "Remove this note?",
        description: `The note's words are removed from ${firstName}'s record for good. Who wrote it, who removed it and when are kept.`,
        verb: "Remove note",
        cancelLabel: "Keep note",
        agentConfirm: `Removes a staff note about ${firstName}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(await removeNoteAction({ noteId: note.id, idempotencyKey })),
        success: "Note removed",
        errorMessage: "The note wasn't removed.",
        report: reportFailure("hq.people.note_remove_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setNotes((current) =>
            current.filter((entry) => entry.id !== note.id),
          );
          router.refresh();
        }
      });

  return (
    <div className="people-staff-notes">
      {canWrite ? (
        <form
          aria-label="Add a note"
          className="people-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) void add.run();
          }}
        >
          <Field
            hint="Seen by the club's team only: never by the person, never in an export. Keep health details out of notes."
            label="Note"
          >
            <Textarea
              maxLength={NOTE_MAX_LENGTH}
              onChange={(event) => setBody(event.currentTarget.value)}
              rows={3}
              value={body}
            />
          </Field>
          {add.error ? (
            <Notice role="alert" title="Not saved" tone="danger">
              {messageOf(add.error, "The note wasn't saved. Try again.")}
            </Notice>
          ) : null}
          <div className="people-actions">
            <Button
              disabled={!body.trim()}
              loading={add.showPending}
              type="submit"
              variant="secondary"
            >
              Save note
            </Button>
          </div>
        </form>
      ) : null}
      {notes.length === 0 ? (
        <p className="people-quiet people-pad">
          {`No team notes about ${firstName} yet.`}
        </p>
      ) : (
        <ul aria-label="Team notes" className="people-notes">
          {notes.map((note) => {
            const mine =
              viewerId !== undefined && note.author.personId === viewerId;
            return (
              <li
                className={added.has(note.id) ? riseClassName() : undefined}
                key={note.id}
              >
                <p className="people-notes__meta">
                  <strong>{note.author.displayName}</strong>
                  <time dateTime={note.createdAt}>
                    {when(note.createdAt, timeZone)}
                  </time>
                  {note.editedAt ? (
                    <span className="people-quiet">edited</span>
                  ) : null}
                </p>
                {editing === note.id ? (
                  <form
                    aria-label="Edit the note"
                    className="people-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (draft.trim()) void edit.run(note.id);
                    }}
                  >
                    <Field label="Note">
                      <Textarea
                        maxLength={NOTE_MAX_LENGTH}
                        onChange={(event) =>
                          setDraft(event.currentTarget.value)
                        }
                        rows={3}
                        value={draft}
                      />
                    </Field>
                    {edit.error ? (
                      <Notice role="alert" title="Not saved" tone="danger">
                        {messageOf(edit.error, "The note wasn't changed.")}
                      </Notice>
                    ) : null}
                    <div className="people-actions">
                      <Button
                        disabled={!draft.trim()}
                        loading={edit.showPending}
                        size="sm"
                        type="submit"
                        variant="primary"
                      >
                        Save changes
                      </Button>
                      <Button
                        onClick={() => {
                          setEditing(undefined);
                          edit.reset();
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <p className="people-body">{note.body}</p>
                )}
                {canWrite && editing !== note.id && (mine || isOwner) ? (
                  <div className="people-actions">
                    {mine ? (
                      <Button
                        onClick={() => {
                          setEditing(note.id);
                          setDraft(note.body);
                          edit.reset();
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Edit
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => remove(note)}
                      size="sm"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {confirm.dialog}
    </div>
  );
}

// ------------------------------------------------------------ tags

/**
 * A person's tags: the club's own labels, never seen by the person. Adding
 * or removing one is reversible, so it happens on the press.
 */
export function PersonTags({
  personId,
  tags: initial,
  clubTags,
  canWrite,
}: {
  readonly personId: string;
  readonly tags: readonly string[];
  readonly clubTags: readonly string[];
  readonly canWrite: boolean;
}) {
  const [tags, setTags] = useState<readonly string[]>(initial);
  const [text, setText] = useState("");
  const change = useAction(
    async (
      { idempotencyKey },
      change: { readonly add?: string; readonly remove?: string },
    ) =>
      unwrap(
        await setTagsAction({
          personIds: [personId],
          add: change.add ? [change.add] : [],
          remove: change.remove ? [change.remove] : [],
          idempotencyKey,
        }),
      ),
    {
      messages: {
        success: (_result, change) =>
          change.add ? `Tagged “${change.add}”` : `“${change.remove}” removed`,
      },
      report: reportFailure("hq.people.tag_failed"),
      onSuccess: (_result, change) => {
        if (change.add) {
          setTags((current) =>
            current.includes(change.add!) ? current : [...current, change.add!],
          );
          setText("");
        }
        if (change.remove)
          setTags((current) => current.filter((tag) => tag !== change.remove));
      },
    },
  );
  const suggestions = clubTags
    .filter((tag) => !tags.includes(tag))
    .filter(
      (tag) =>
        !text.trim() ||
        tag.toLocaleLowerCase().includes(text.trim().toLocaleLowerCase()),
    )
    .slice(0, 6);
  return (
    <div className="people-tags">
      {tags.length === 0 ? (
        <p className="people-quiet">No tags yet.</p>
      ) : (
        <ul aria-label="Tags" className="people-tag-list">
          {tags.map((tag) => (
            <li key={tag}>
              <span className="people-tag">{tag}</span>
              {canWrite ? (
                <Button
                  aria-label={`Remove the tag ${tag}`}
                  disabled={change.pending}
                  icon={<Icon name="close" size="inline" />}
                  onClick={() => void change.run({ remove: tag })}
                  size="sm"
                  variant="ghost"
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <form
          aria-label="Add a tag"
          className="people-form people-form--inline"
          onSubmit={(event) => {
            event.preventDefault();
            if (text.trim()) void change.run({ add: text.trim() });
          }}
        >
          <Field hint="Only the club's team sees tags." label="Add a tag">
            <Input
              maxLength={40}
              onChange={(event) => setText(event.currentTarget.value)}
              placeholder="League"
              value={text}
            />
          </Field>
          <div className="people-actions">
            <Button
              disabled={!text.trim()}
              loading={change.showPending}
              type="submit"
              variant="secondary"
            >
              Add tag
            </Button>
          </div>
        </form>
      ) : null}
      {canWrite && suggestions.length > 0 ? (
        <div
          aria-label="The club's tags"
          className="people-tag-suggestions"
          role="group"
        >
          {suggestions.map((tag) => (
            <FilterChip
              key={tag}
              onPressedChange={() => void change.run({ add: tag })}
              pressed={false}
            >
              {tag}
            </FilterChip>
          ))}
        </div>
      ) : null}
      {change.error ? (
        <Notice role="alert" title="Tags weren't changed" tone="danger">
          {messageOf(change.error, "Nothing was changed. Try again.")}
        </Notice>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ household

/**
 * Invite a guardian for a junior: the club's existing guardian invitation
 * link and a draft message, shown here to copy and send from Inbox (or the
 * club's own email). Nothing is sent from People.
 */
export function InviteGuardian({
  juniorPersonId,
  juniorFirstName,
}: {
  readonly juniorPersonId: string;
  readonly juniorFirstName: string;
}) {
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState("parent");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [result, setResult] = useState<{
    readonly inviteUrl: string;
    readonly expiresAt: string;
    readonly draft: { readonly channel: string; readonly body: string };
  }>();
  const [copied, setCopied] = useState<string>();
  const ready =
    name.trim().length >= 2 &&
    relationship.trim().length >= 2 &&
    Boolean(email.trim() || phone.trim());
  const ask = () =>
    void confirm
      .run({
        tier: "confirm",
        title: `Create an invitation for ${name.trim()}?`,
        description: `Duna makes ${juniorFirstName}'s guardian invitation link and a draft message for you to send. ${name.trim()} becomes ${juniorFirstName}'s guardian only after accepting by the link, and Duna reviews the link before it carries any authority.`,
        affected: "No one is messaged: you send the draft yourself from Inbox.",
        verb: "Create the invitation",
        cancelLabel: "Not now",
        agentConfirm: `Creates a guardian invitation link for ${juniorFirstName} without sending it`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await inviteGuardianAction({
              juniorPersonId,
              guardianName: name,
              relationship,
              email: email || undefined,
              phone: phone || undefined,
              idempotencyKey,
            }),
          ),
        success: "Invitation created. Nothing was sent.",
        errorMessage: "No invitation was created.",
        report: reportFailure("hq.people.invite_guardian_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") setResult(outcome.result);
      });
  const copy = (what: string, value: string) =>
    void navigator.clipboard?.writeText(value).then(() => setCopied(what));
  if (result) {
    return (
      <div className={`people-invite-result ${riseClassName()}`}>
        <Notice role="status" title="Invitation ready, not sent" tone="info">
          {`Send the draft below from Inbox. The link works until ${new Intl.DateTimeFormat(
            "en-US",
            { month: "short", day: "numeric" },
          ).format(new Date(result.expiresAt))}.`}
        </Notice>
        <Field label="Invitation link">
          <Input readOnly value={result.inviteUrl} />
        </Field>
        <Field
          label={`Draft (${result.draft.channel === "sms" ? "text message" : "email"})`}
        >
          <Textarea
            readOnly
            rows={4}
            value={`${result.draft.body}\n\n${result.inviteUrl}`}
          />
        </Field>
        <div className="people-actions">
          <Button
            onClick={() =>
              copy("draft", `${result.draft.body}\n\n${result.inviteUrl}`)
            }
            variant="secondary"
          >
            {copied === "draft" ? "Draft copied" : "Copy the draft"}
          </Button>
          <Button href={hqHref("inbox")} variant="secondary">
            Open Inbox to send it
          </Button>
        </div>
      </div>
    );
  }
  return (
    <form
      aria-label="Invite a guardian"
      className="people-form people-form--grid"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) ask();
      }}
    >
      <Field label="Guardian name">
        <Input
          autoComplete="off"
          maxLength={120}
          onChange={(event) => setName(event.currentTarget.value)}
          value={name}
        />
      </Field>
      <Field label="Relationship">
        <Input
          maxLength={48}
          onChange={(event) => setRelationship(event.currentTarget.value)}
          value={relationship}
        />
      </Field>
      <Field label="Guardian email" optional>
        <Input
          autoComplete="off"
          inputMode="email"
          onChange={(event) => setEmail(event.currentTarget.value)}
          type="email"
          value={email}
        />
      </Field>
      <Field
        hint="With the country code, like +1 310 555 0121."
        label="Guardian mobile"
        optional
      >
        <Input
          autoComplete="off"
          inputMode="tel"
          onChange={(event) => setPhone(event.currentTarget.value)}
          type="tel"
          value={phone}
        />
      </Field>
      <div className="people-actions">
        <Button disabled={!ready} type="submit" variant="secondary">
          Review the invitation
        </Button>
      </div>
      {confirm.dialog}
    </form>
  );
}

/**
 * Link an adult the club already knows as a junior's guardian. The link is
 * "in review" until Duna checks it, and consent stays "not recorded" until
 * the guardian gives it: this page says exactly that.
 */
export function LinkGuardian({
  juniorPersonId,
  juniorFirstName,
  adults,
}: {
  readonly juniorPersonId: string;
  readonly juniorFirstName: string;
  readonly adults: readonly { readonly id: string; readonly name: string }[];
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [guardianId, setGuardianId] = useState<string | null>(null);
  const [relationship, setRelationship] = useState("parent");
  const [linked, setLinked] = useState<string>();
  const guardian = adults.find((adult) => adult.id === guardianId);
  const ask = () => {
    if (!guardian) return;
    void confirm
      .run({
        tier: "confirm",
        title: `Link ${guardian.name} as ${juniorFirstName}'s guardian?`,
        description: `The link waits for Duna's review before it carries any authority. Consent stays "not recorded" until ${guardian.name} gives it in their Duna app.`,
        affected: `No one is messaged. ${guardian.name} sees the link in their Duna app.`,
        verb: `Link ${guardian.name}`,
        cancelLabel: "Not now",
        agentConfirm: `Links ${guardian.name} as ${juniorFirstName}'s guardian, pending review`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await linkGuardianAction({
              juniorPersonId,
              guardianPersonId: guardian.id,
              relationship,
              idempotencyKey,
            }),
          ),
        success: `${guardian.name} linked, pending review`,
        errorMessage: "Nothing was linked.",
        report: reportFailure("hq.people.link_guardian_failed"),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setLinked(guardian.name);
          router.refresh();
        }
      });
  };
  return (
    <form
      aria-label="Link a guardian the club knows"
      className="people-form people-form--grid"
      onSubmit={(event) => {
        event.preventDefault();
        ask();
      }}
    >
      <Field label="Guardian">
        <Combobox
          emptyText="No adult by that name"
          onValueChange={setGuardianId}
          options={adults.map((adult) => ({
            value: adult.id,
            label: adult.name,
          }))}
          placeholder="Search the club's people"
          value={guardianId}
        />
      </Field>
      <Field label="Relationship">
        <Input
          maxLength={48}
          onChange={(event) => setRelationship(event.currentTarget.value)}
          value={relationship}
        />
      </Field>
      <div className="people-actions">
        <Button
          disabled={!guardian || relationship.trim().length < 2}
          type="submit"
          variant="secondary"
        >
          Review the link
        </Button>
      </div>
      {linked ? (
        <Notice
          className={riseClassName()}
          role="status"
          title="Linked, in review"
          tone="info"
        >
          {`${linked} is linked, pending Duna's review. Consent: not recorded.`}
        </Notice>
      ) : null}
      {confirm.dialog}
    </form>
  );
}

// ------------------------------------------------------------ documents

/**
 * Ask for a signature: a draft in Inbox to the adult, or to a junior's
 * verified guardian, reviewed and sent there. Nothing is sent from People.
 * When Inbox can't write to the person yet, says why; for a junior it
 * offers the guardian invitation on Family instead.
 */
export function SignatureRequest({
  personId,
  waiverDocumentId,
  documentTitle,
  isJunior,
}: {
  readonly personId: string;
  readonly waiverDocumentId: string;
  readonly documentTitle: string;
  readonly isJunior: boolean;
}) {
  const [saved, setSaved] = useState(false);
  const request = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await requestSignatureAction({
          personId,
          waiverDocumentId,
          idempotencyKey,
        }),
      ),
    {
      messages: { success: `The ${documentTitle} request is a draft in Inbox` },
      report: reportFailure("hq.people.signature_request_failed"),
      onSuccess: () => setSaved(true),
    },
  );
  const notEligible =
    request.error instanceof PeopleActionError &&
    request.error.code === "not-eligible";
  if (saved) {
    return (
      <Button href={hqHref("inbox")} size="sm" variant="secondary">
        Review and send in Inbox
      </Button>
    );
  }
  return (
    <span className="people-inline">
      <Button {...request.buttonProps} size="sm" variant="secondary">
        {isJunior ? "Ask the guardian to sign" : "Ask for a signature"}
      </Button>
      {request.error ? (
        <span className="people-quiet" role="alert">
          {messageOf(request.error, "Not saved. Nothing was sent.")}
          {notEligible && isJunior ? (
            <>
              {" "}
              <a
                className="people-link"
                href={hqHref("memberFamily", { personId })}
              >
                Invite the guardian instead
              </a>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
