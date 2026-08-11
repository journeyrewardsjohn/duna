import {
  CheckCircle2,
  Clock3,
  Siren,
  MessageSquareWarning,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { AdminShell } from "@/components/admin-shell";
import { getServerCaller } from "@/lib/api";
import { reviewMessageSafetyCase } from "./actions";
import styles from "../admin-messaging.module.css";

export const metadata = { title: "Message safety" };

export default async function MessageSafetyPage() {
  const caller = await getServerCaller();
  const cases = await caller.messaging
    .moderationQueue()
    .catch((error: unknown) => {
      if (
        error instanceof Error &&
        error.message === "Platform administration access required"
      ) {
        return undefined;
      }
      throw error;
    });
  if (!cases) return <AdminAccessDenied />;
  return (
    <AdminShell active="messaging-safety">
      <main className={styles.page}>
        <header className={styles.pageHeader}>
          <div>
            <span className="hq-eyebrow">Trust + safety</span>
            <h1>Message safety</h1>
            <p>
              Review held messages involving minors. Automated screening
              controls delivery; it never applies a penalty or decides guilt.
            </p>
          </div>
          <span className={styles.liveBadge}>
            <ShieldCheck aria-hidden size={16} /> Guardian copy required
          </span>
        </header>
        <section className={styles.safetyGrid}>
          <aside className={styles.safetySummary}>
            <span>
              <strong>{cases.length}</strong>
              <small>Open review</small>
            </span>
            <span>
              <strong>
                {
                  cases.filter(
                    (item) =>
                      item.severity === "high" || item.severity === "critical",
                  ).length
                }
              </strong>
              <small>High priority</small>
            </span>
            <div className={styles.boundaryCard}>
              <ShieldAlert aria-hidden size={18} />
              <span>
                <strong>Fail closed</strong>
                <small>
                  If the AI provider or required privacy control is unavailable,
                  the message stays held.
                </small>
              </span>
            </div>
          </aside>
          <div className={styles.caseList}>
            {cases.map((item) => (
              <article
                className={styles.caseCard}
                data-severity={item.severity}
                key={item.id}
              >
                <header>
                  <span>
                    <MessageSquareWarning aria-hidden size={18} />
                    <strong>{item.conversationTitle}</strong>
                  </span>
                  <b>{item.severity}</b>
                </header>
                <blockquote>
                  {item.messagePreview ??
                    "Message content is unavailable in this view."}
                </blockquote>
                <p>{item.explanation}</p>
                <div className={styles.categoryRow}>
                  {item.categories.map((category) => (
                    <span key={category}>{category.replaceAll("-", " ")}</span>
                  ))}
                </div>
                <footer>
                  <span>
                    <Clock3 aria-hidden size={14} />
                    {new Intl.DateTimeFormat("en", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }).format(new Date(item.createdAt))}
                    {item.minorPresent && " · Minor present"}
                  </span>
                  <form action={reviewMessageSafetyCase}>
                    <input name="caseId" type="hidden" value={item.id} />
                    <input
                      name="note"
                      type="hidden"
                      value="A Super Admin reviewed the held message and cleared it for delivery with guardian visibility."
                    />
                    <button name="decision" type="submit" value="cleared">
                      <CheckCircle2 aria-hidden size={15} /> Clear
                    </button>
                    <button name="decision" type="submit" value="escalated">
                      <Siren aria-hidden size={15} /> Escalate
                    </button>
                    <button name="decision" type="submit" value="restricted">
                      <ShieldAlert aria-hidden size={15} /> Keep blocked
                    </button>
                  </form>
                </footer>
              </article>
            ))}
            {cases.length === 0 && (
              <section className={styles.empty}>
                <ShieldCheck aria-hidden size={30} />
                <h2>No messages need review</h2>
                <p>Held messages will appear here with the screening reason.</p>
              </section>
            )}
          </div>
        </section>
      </main>
    </AdminShell>
  );
}
