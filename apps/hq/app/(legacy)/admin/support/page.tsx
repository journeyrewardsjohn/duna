import {
  Bot,
  CircleUserRound,
  Headphones,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminShell } from "@/components/admin-shell";
import { getServerCaller } from "@/lib/api";
import { replyAsDunaSupport } from "./actions";
import styles from "../admin-messaging.module.css";

export const metadata = { title: "Duna Support" };

export default async function DunaSupportPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  const caller = await getServerCaller();
  const queue = await caller.messaging
    .supportQueue()
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "Platform administration access required"
      ) {
        return undefined;
      }
      throw error;
    });
  if (!queue) return <AdminAccessDenied />;
  const selected =
    queue.find((item) => item.conversationId === thread) ?? queue[0];
  return (
    <AdminShell active="support">
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <span className="hq-eyebrow">Duna Support</span>
            <h1>Support inbox</h1>
            <p>
              Duna AI handles grounded account questions and hands off anything
              that needs judgment, a mutation, or a person.
            </p>
          </div>
          <span className={styles.liveBadge}>
            <Sparkles aria-hidden size={16} /> OpenAI Agents SDK connected by
            server
          </span>
        </header>
        <section className={styles.supportWorkspace}>
          <aside className={styles.queue}>
            <header>
              <strong>Conversations</strong>
              <i>{queue.length}</i>
            </header>
            <nav aria-label="Support conversations">
              {queue.map((item) => (
                <Link
                  className={
                    item.conversationId === selected?.conversationId
                      ? styles.active
                      : undefined
                  }
                  href={`/admin/support?thread=${item.conversationId}`}
                  key={item.conversationId}
                >
                  <span className={styles.avatar}>
                    <CircleUserRound aria-hidden size={18} />
                  </span>
                  <span>
                    <strong>{item.member.displayName}</strong>
                    <small>
                      {item.messages.at(-1)?.body ?? "Support conversation"}
                    </small>
                  </span>
                  <i data-status={item.aiStatus}>
                    {item.aiStatus === "handoff" ? "!" : "AI"}
                  </i>
                </Link>
              ))}
            </nav>
          </aside>
          {selected ? (
            <section className={styles.supportThread}>
              <header>
                <span className={styles.avatar}>
                  <CircleUserRound aria-hidden size={19} />
                </span>
                <span>
                  <strong>{selected.member.displayName}</strong>
                  <small>
                    Duna Support · {selected.aiStatus.replaceAll("-", " ")}
                  </small>
                </span>
                {selected.aiStatus === "handoff" && <b>Human attention</b>}
              </header>
              {selected.handoffReason && (
                <div className={styles.handoff}>
                  <Headphones aria-hidden size={16} /> {selected.handoffReason}
                </div>
              )}
              <div className={styles.messageList}>
                {selected.messages.map((message) => {
                  const support = message.sender.type === "agent";
                  return (
                    <article
                      className={support ? styles.supportMessage : undefined}
                      key={message.id}
                    >
                      <span className={styles.avatar}>
                        {support ? (
                          <Sparkles aria-hidden size={16} />
                        ) : (
                          <CircleUserRound aria-hidden size={16} />
                        )}
                      </span>
                      <div>
                        <small>{message.sender.displayName}</small>
                        <p>{message.body}</p>
                        <time dateTime={message.createdAt}>
                          {new Intl.DateTimeFormat("en", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(message.createdAt))}
                        </time>
                      </div>
                    </article>
                  );
                })}
              </div>
              <form action={replyAsDunaSupport} className={styles.replyForm}>
                <input
                  name="conversationId"
                  type="hidden"
                  value={selected.conversationId}
                />
                <input
                  name="clientMessageId"
                  type="hidden"
                  value={crypto.randomUUID()}
                />
                <textarea
                  aria-label="Support reply"
                  maxLength={10_000}
                  name="body"
                  placeholder="Reply as Duna Support…"
                  required
                  rows={2}
                />
                <button type="submit">
                  <Send aria-hidden size={17} /> Reply
                </button>
              </form>
            </section>
          ) : (
            <section className={styles.empty}>
              <Headphones aria-hidden size={30} />
              <h2>No support conversations</h2>
              <p>New member questions will appear here.</p>
            </section>
          )}
          <aside className={styles.contextPanel}>
            <span className={styles.contextIcon}>
              <Bot aria-hidden size={21} />
            </span>
            <h2>Grounded context</h2>
            <p>
              The agent can read only the signed-in member’s verified Duna data.
              It has no write tools.
            </p>
            <ul>
              <li>
                <CheckItem /> Events and registrations
              </li>
              <li>
                <CheckItem /> Lessons and rentals
              </li>
              <li>
                <CheckItem /> Orders and payment state
              </li>
              <li>
                <CheckItem /> Organization relationships
              </li>
            </ul>
            <div className={styles.boundaryCard}>
              <ShieldCheck aria-hidden size={18} />
              <span>
                <strong>Human confirmation boundary</strong>
                <small>
                  Refunds, cancellations, charges, and account changes stay
                  human-controlled.
                </small>
              </span>
            </div>
          </aside>
        </section>
      </main>
    </AdminShell>
  );
}

function CheckItem() {
  return <ShieldCheck aria-hidden size={14} />;
}
