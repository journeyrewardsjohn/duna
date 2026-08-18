"use client";

import { Lock, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPlayerEventNoteAction } from "@/app/events/[slug]/actions";

export function PlayerEventNotes({
  activityId,
  slug,
}: {
  readonly activityId: string;
  readonly slug: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [shared, setShared] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <section className="pickup-actions__reflection">
      <header>
        <Lock aria-hidden size={15} />
        <strong>Your match note</strong>
      </header>
      <p>Capture what you learned while it is fresh. Private by default.</p>
      <textarea
        maxLength={5000}
        onChange={(event) => setBody(event.target.value)}
        placeholder="What worked? What do you want to repeat next time?"
        value={body}
      />
      <label>
        <input
          checked={shared}
          onChange={(event) => setShared(event.target.checked)}
          type="checkbox"
        />
        Share this note with the host
      </label>
      <button
        disabled={pending || !body.trim()}
        onClick={() =>
          startTransition(async () => {
            const result = await createPlayerEventNoteAction({
              activityType: "pickup",
              activityId,
              body: body.trim(),
              visibility: shared ? "shared-with-host" : "private",
              slug,
              idempotencyKey: crypto.randomUUID(),
            });
            setMessage(
              result.ok ? "Saved to your private match notes." : result.error,
            );
            if (result.ok) {
              setBody("");
              router.refresh();
            }
          })
        }
        type="button"
      >
        <Send aria-hidden size={15} /> {pending ? "Saving…" : "Save note"}
      </button>
      {message ? <small role="status">{message}</small> : null}
    </section>
  );
}
