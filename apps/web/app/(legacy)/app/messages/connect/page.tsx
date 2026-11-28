import Link from "next/link";
import { getServerCaller } from "@/lib/api";
import { ConnectionForm } from "./connection-form";
import styles from "./connect.module.css";
export const metadata = { title: "Connect phone messaging" };
export default async function ConnectPhonePage() {
  const caller = await getServerCaller();
  const [status, inbox] = await Promise.all([
    caller.messaging.channelStatus(),
    caller.messaging.inbox({ asPrincipal: "user" }),
  ]);
  const conversations = inbox.conversations.filter((conversation) =>
    conversation.participants.some(
      (participant) => participant.type === "organization",
    ),
  );
  return (
    <main className={styles.page} data-zone="editorial">
      <Link href="/app/messages">← Back to messages</Link>
      <h1>Connect your phone</h1>
      <p>
        Text an existing club conversation from your phone. Your club, activity,
        and family permissions still apply.
      </p>
      {status.connections.length > 0 && (
        <div role="status">
          {status.connections.map((connection) => (
            <p key={connection.id}>
              <strong>Connected:</strong> phone ending {connection.phoneEnding}{" "}
              ·{" "}
              {inbox.conversations.find(
                (conversation) => conversation.id === connection.conversationId,
              )?.title ?? "Club conversation"}
            </p>
          ))}
        </div>
      )}
      {!status.available ? (
        <p role="status">
          Phone messaging is not available yet. You can keep messaging every
          club in Duna.
        </p>
      ) : !status.adult ? (
        <p>
          Phone connections are available to adult accounts. Parents and
          guardians can connect their own accounts.
        </p>
      ) : (
        <>
          <p>
            Choose the conversation first, then verify your phone with a
            private, one-use code. Connecting does not send messages or enable
            marketing.
          </p>
          {!conversations.length && (
            <p>
              Start a club conversation in Duna before connecting your phone.
            </p>
          )}
          <ConnectionForm
            conversations={conversations.map((conversation) => ({
              id: conversation.id,
              title: `${conversation.participants.find((participant) => participant.type === "organization")?.displayName} · ${conversation.title}`,
            }))}
          />
        </>
      )}
    </main>
  );
}
