"use client";

import { Icon } from "@duna/ui/icons";
import {
  Button,
  buttonClassName,
  Field,
  Notice,
  successToast,
  Textarea,
} from "@duna/ui/tideline";
import Link from "next/link";
import { useState } from "react";

/**
 * The honest hand-off when athletes should hear about a change: Duna does
 * not notify them automatically yet, so this is a DRAFT a person edits,
 * copies and sends from Inbox, where the review-before-send applies.
 * Nothing is sent from here.
 */
export function MessageDraft({
  title,
  body,
  conciergeDraft,
}: {
  readonly title: string;
  readonly body: string;
  /** Concierge prepared a draft thread: the person reviews and sends it in Inbox. */
  readonly conciergeDraft?: { readonly conversationId: string };
}) {
  const [text, setText] = useState(body);
  if (conciergeDraft) {
    return (
      <section aria-label={title} className="tr-card tr-draft">
        <Notice title="A message draft is ready in Inbox" tone="info">
          Nothing is sent from here. Review it, choose who gets it and send it
          in Inbox.
        </Notice>
        <div className="tr-actions">
          <Link
            className={buttonClassName({ variant: "secondary", size: "sm" })}
            href={`/inbox?thread=${encodeURIComponent(conciergeDraft.conversationId)}`}
          >
            Review in Inbox
          </Link>
        </div>
      </section>
    );
  }
  return (
    <section aria-label={title} className="tr-card tr-draft">
      <Notice title="Athletes are not notified automatically yet" tone="info">
        Nothing is sent from here. Copy the draft, then review and send it in
        Inbox.
      </Notice>
      <Field label="Message draft">
        <Textarea
          autoResize
          maxLength={2000}
          onChange={(event) => setText(event.currentTarget.value)}
          rows={3}
          value={text}
        />
      </Field>
      <div className="tr-actions">
        <Button
          icon={<Icon name="check" />}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(text)
              .then(() => successToast("Message copied"));
          }}
          size="sm"
          variant="secondary"
        >
          Copy the message
        </Button>
        <Link
          className={buttonClassName({ variant: "ghost", size: "sm" })}
          href="/inbox?compose=new"
        >
          Review in Inbox
        </Link>
      </div>
    </section>
  );
}
