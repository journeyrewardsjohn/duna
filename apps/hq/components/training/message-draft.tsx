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
}: {
  readonly title: string;
  readonly body: string;
}) {
  const [text, setText] = useState(body);
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
