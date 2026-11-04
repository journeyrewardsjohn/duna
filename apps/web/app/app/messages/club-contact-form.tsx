"use client";
import { useActionState, useState } from "react";
import { contactClub } from "./actions";
import styles from "./messaging.module.css";

export function ClubContactForm({
  club,
  name,
  clientMessageId,
}: {
  readonly club: string;
  readonly name: string;
  readonly clientMessageId: string;
}) {
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState(contactClub, { error: "" });
  return (
    <form action={action} className={styles.newConversation}>
      <input type="hidden" name="club" value={club} />
      <input type="hidden" name="clientMessageId" value={clientMessageId} />
      <div className={styles.composeTrust}>
        <span>
          <strong>To: {name}</strong>
          <small>
            Only this club receives your request. If you are under 18, your
            verified parent or guardian is included and messages are screened.
            This stays in Duna unless you separately connect your phone.
          </small>
        </span>
      </div>
      <label>
        <span>Your message</span>
        <textarea
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          maxLength={10000}
          rows={6}
          placeholder="Ask about programs, lessons, courts, or joining the club…"
        />
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Sending…" : `Send to ${name}`}
      </button>
    </form>
  );
}
