"use client";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { connectPhone, type ChannelLinkState } from "./actions";
import styles from "./connect.module.css";
export function ConnectionForm({
  conversations,
}: {
  readonly conversations: readonly { id: string; title: string }[];
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ChannelLinkState, FormData>(
    connectPhone,
    {},
  );
  return (
    <form action={action} className={styles.form}>
      <label htmlFor="conversation">
        Send phone messages to this club conversation
      </label>
      <select id="conversation" name="conversationId" required>
        <option value="">Choose a conversation</option>
        {conversations.map((conversation) => (
          <option key={conversation.id} value={conversation.id}>
            {conversation.title}
          </option>
        ))}
      </select>
      <button
        name="intent"
        value="connect"
        disabled={pending || !conversations.length}
      >
        {pending ? "Updating…" : "Get connection code"}
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.command && (
        <div role="status" className={styles.instructions}>
          <strong>Connect to {state.clubName}</strong>
          <p>
            From your own phone, send this exact message to{" "}
            <b>{state.endpoint}</b> within 10 minutes:
          </p>
          <code>{state.command}</code>
          <button
            type="button"
            className={styles.secondary}
            onClick={() => router.refresh()}
          >
            Check connection status
          </button>
          <p>
            This connects text messages to the selected conversation. Eligible
            one-to-one club replies can also reach your phone. Family groups and
            attachments remain securely in Duna. Only one conversation is active
            per phone and Duna number.
          </p>
          <p>
            To change clubs, generate and send a new code. Never share this code
            with another person.
          </p>
        </div>
      )}
      {state.disconnected && (
        <p role="status">
          Phone connections and unused codes have been disconnected. Your Duna
          conversations remain available.
        </p>
      )}
      <button
        className={styles.secondary}
        name="intent"
        formNoValidate
        value="disconnect"
        disabled={pending}
      >
        Disconnect my phone connections
      </button>
    </form>
  );
}
