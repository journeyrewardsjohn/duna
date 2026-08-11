import type { MessageWidget } from "@duna/messaging-client";
import {
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  Megaphone,
  MessageSquareText,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";
import {
  createOrganizationConversation,
  sendOrganizationMessage,
} from "./actions";
import { MessagingLiveRefresh } from "./live-refresh";
import styles from "./messaging.module.css";

export const metadata = { title: "Messages" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function Widget({ widget }: { readonly widget: MessageWidget }) {
  const Icon =
    widget.kind === "payment-request"
      ? CircleDollarSign
      : widget.kind === "form-request"
        ? FileCheck2
        : CalendarClock;
  const detail =
    widget.kind === "payment-request"
      ? `${widget.currency} ${(widget.amountMinor / 100).toFixed(2)}`
      : widget.kind === "form-request"
        ? widget.description
        : widget.kind === "schedule-change"
          ? new Intl.DateTimeFormat("en", {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(widget.startsAt))
          : "Duna activity update";
  return (
    <div className={styles.widget}>
      <Icon aria-hidden size={18} />
      <span>
        <strong>{"title" in widget ? widget.title : "Update"}</strong>
        <small>{detail}</small>
      </span>
      <small>Member action</small>
    </div>
  );
}

export default async function OrganizationMessagesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    thread?: string;
    compose?: string;
    view?: string;
  }>;
}) {
  const { compose, thread, view } = await searchParams;
  const caller = await getServerCaller();
  const [dashboard, workspace, events, inbox] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.events(),
    caller.messaging.inbox({ asPrincipal: "organization" }),
  ]);
  const selected =
    inbox.conversations.find((conversation) => conversation.id === thread) ??
    inbox.conversations[0];
  const detail =
    selected && compose !== "new" && view !== "inbox"
      ? await caller.messaging.conversation({
          conversationId: selected.id,
          asPrincipal: "organization",
        })
      : undefined;
  const sendId = crypto.randomUUID();
  const creationId = crypto.randomUUID();
  const activePeople = workspace.people.filter(
    (person) => person.status === "active",
  );
  const relatedPeople = [
    ...new Map([
      ...activePeople.map(
        (person) =>
          [
            person.personId,
            {
              personId: person.personId,
              displayName: person.displayName,
              isMinor: person.isMinor,
              detail: person.isMinor
                ? "Minor · guardian included"
                : person.roles.join(" · "),
            },
          ] as const,
      ),
      ...workspace.messageRecipients.map(
        (person) =>
          [
            person.id,
            {
              personId: person.id,
              displayName: person.displayName,
              isMinor: person.isMinor,
              detail: person.isMinor
                ? `${person.verifiedGuardianCount} verified guardian${person.verifiedGuardianCount === 1 ? "" : "s"}`
                : "Related through Duna",
            },
          ] as const,
      ),
    ]).values(),
  ].sort((left, right) => left.displayName.localeCompare(right.displayName));
  return (
    <OperatorShell
      active="messages"
      messageDraftCount={workspace.messageDrafts.length}
      messageUnreadCount={inbox.totalUnread}
      organization={dashboard.organization}
    >
      <main className={styles.page}>
        <MessagingLiveRefresh conversationId={detail?.conversation.id} />
        <header className={styles.pageHeader}>
          <div>
            <span className="hq-eyebrow">Relationship communication</span>
            <h1>Messages</h1>
            <p>
              Send useful information to people connected to your events,
              leagues, lessons, rentals, or organization.
            </p>
          </div>
          <div>
            <span className={styles.policyNote}>
              <ShieldCheck aria-hidden size={17} />
              Service communication only · blocks always respected
            </span>
            <Link className={styles.newButton} href="/messages?compose=new">
              <Plus aria-hidden size={17} /> New message
            </Link>
          </div>
        </header>

        <section
          className={styles.workspace}
          data-has-thread={Boolean(detail) || compose === "new"}
        >
          <aside className={styles.inbox}>
            <header>
              <strong>Inbox</strong>
              {inbox.totalUnread > 0 && <i>{inbox.totalUnread}</i>}
            </header>
            <nav aria-label="Organization conversations">
              {inbox.conversations.map((conversation) => (
                <Link
                  className={
                    conversation.id === selected?.id && compose !== "new"
                      ? styles.active
                      : undefined
                  }
                  href={`/messages?thread=${conversation.id}`}
                  key={conversation.id}
                >
                  <span className={styles.avatar}>
                    {conversation.type === "broadcast" ? (
                      <Megaphone aria-hidden size={17} />
                    ) : (
                      <UsersRound aria-hidden size={17} />
                    )}
                  </span>
                  <span>
                    <strong>{conversation.title}</strong>
                    <small>
                      {conversation.lastMessage?.body ?? "Conversation ready"}
                    </small>
                  </span>
                  {conversation.unreadCount > 0 && (
                    <i>{conversation.unreadCount}</i>
                  )}
                </Link>
              ))}
            </nav>
            <div className={styles.inboxFoot}>
              <ShieldCheck aria-hidden size={16} />
              <span>
                <strong>Relationship-scoped</strong>
                <small>Unrelated people cannot be added.</small>
              </span>
            </div>
          </aside>

          {compose === "new" ? (
            <section className={styles.composePanel}>
              <header>
                <Link href="/messages?view=inbox" aria-label="Close composer">
                  <ArrowLeft aria-hidden size={19} />
                </Link>
                <span>
                  <small>New conversation</small>
                  <strong>Start with who needs the update.</strong>
                </span>
              </header>
              <form action={createOrganizationConversation}>
                <input
                  name="organizationId"
                  type="hidden"
                  value={dashboard.organization.id}
                />
                <input
                  name="clientMessageId"
                  type="hidden"
                  value={creationId}
                />
                <label>
                  <span>Audience</span>
                  <select defaultValue="" name="audience" required>
                    <option disabled value="">
                      Choose a related audience
                    </option>
                    <option
                      value={`organization::${dashboard.organization.id}::Active organization members`}
                    >
                      Active organization members
                    </option>
                    {workspace.sessions.map((session) => (
                      <option
                        key={session.id}
                        value={`${session.kind === "league" ? "league" : session.kind === "private-lesson" ? "lesson" : "event"}::${session.kind === "league" && session.programId ? session.programId : session.id}::${session.title}`}
                      >
                        {session.title} · {session.analytics.registrations}{" "}
                        registered
                      </option>
                    ))}
                    {events.flatMap((event) =>
                      (event.divisions ?? []).map((division) => (
                        <option
                          key={division.id}
                          value={`division::${division.id}::${event.title} · ${division.name}`}
                        >
                          {event.title} · {division.name}
                        </option>
                      )),
                    )}
                    {workspace.calendar.entries
                      .filter((entry) => entry.sourceType === "booking")
                      .map((entry) => (
                        <option
                          key={`rental:${entry.id}`}
                          value={`rental::${entry.id}::${entry.title}`}
                        >
                          {entry.title} · rental
                        </option>
                      ))}
                    <option value="specific::::Selected people">
                      Specific related people
                    </option>
                  </select>
                </label>
                <label>
                  <span>Conversation name</span>
                  <input
                    maxLength={160}
                    name="title"
                    placeholder="Saturday clinic · Players"
                    required
                  />
                </label>
                <details className={styles.peoplePicker}>
                  <summary>
                    Choose people for a specific-person conversation
                    <small>
                      {relatedPeople.length} related people available
                    </small>
                  </summary>
                  <div>
                    {relatedPeople.map((person) => (
                      <label key={person.personId}>
                        <input
                          name="recipientPersonId"
                          type="checkbox"
                          value={person.personId}
                        />
                        <span className={styles.personAvatar}>
                          {initials(person.displayName)}
                        </span>
                        <span>
                          <strong>{person.displayName}</strong>
                          <small>{person.detail}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </details>
                <label>
                  <span>Message</span>
                  <textarea
                    maxLength={10_000}
                    name="message"
                    placeholder="Share the useful update, what changed, and what people should do next."
                    required
                    rows={7}
                  />
                </label>
                <label className={styles.checkLabel}>
                  <input name="announcementOnly" type="checkbox" />
                  <span>
                    <strong>Updates only</strong>
                    <small>Only organization staff can post.</small>
                  </span>
                </label>
                <div className={styles.guardrail}>
                  <ShieldCheck aria-hidden size={18} />
                  <span>
                    Duna removes blocked recipients, includes verified guardians
                    for minors, and holds minor conversations for SafeSport
                    screening.
                  </span>
                </div>
                <button className={styles.sendButton} type="submit">
                  Create and send <Send aria-hidden size={17} />
                </button>
              </form>
            </section>
          ) : detail ? (
            <section className={styles.thread}>
              <header>
                <Link
                  aria-label="Back to inbox"
                  className={styles.backLink}
                  href="/messages?view=inbox"
                >
                  <ArrowLeft aria-hidden size={19} />
                </Link>
                <span className={styles.avatar}>
                  <UsersRound aria-hidden size={18} />
                </span>
                <span className={styles.threadTitle}>
                  <strong>{detail.conversation.title}</strong>
                  <small>
                    {detail.participants.length} people ·{" "}
                    {detail.conversation.context?.label ?? "Organization"}
                  </small>
                </span>
                <Link href="/messages?compose=new">
                  <Plus aria-hidden size={16} /> New
                </Link>
              </header>
              {detail.conversation.safety.minorPresent && (
                <div className={styles.safetyBar}>
                  <ShieldCheck aria-hidden size={15} /> Guardian visibility and
                  SafeSport screening are active.
                </div>
              )}
              <div className={styles.messageList}>
                {detail.messages.map((message) => {
                  const mine = message.sender.type === "organization";
                  return (
                    <article
                      className={mine ? styles.mine : undefined}
                      key={message.id}
                    >
                      {!mine && (
                        <span className={styles.personAvatar}>
                          {initials(message.sender.displayName)}
                        </span>
                      )}
                      <div>
                        {!mine && <small>{message.sender.displayName}</small>}
                        <div className={styles.bubble}>
                          {message.body && <p>{message.body}</p>}
                          {message.widgets.map((widget, index) => (
                            <Widget
                              key={`${message.id}:${index}`}
                              widget={widget}
                            />
                          ))}
                        </div>
                        <time dateTime={message.createdAt}>
                          {new Intl.DateTimeFormat("en", {
                            hour: "numeric",
                            minute: "2-digit",
                          }).format(new Date(message.createdAt))}
                        </time>
                      </div>
                    </article>
                  );
                })}
              </div>
              <form
                action={sendOrganizationMessage}
                className={styles.composer}
              >
                <input
                  name="conversationId"
                  type="hidden"
                  value={detail.conversation.id}
                />
                <input name="clientMessageId" type="hidden" value={sendId} />
                <input
                  name="announcementOnly"
                  type="hidden"
                  value={String(detail.conversation.announcementOnly)}
                />
                <textarea
                  aria-label="Message"
                  maxLength={10_000}
                  name="body"
                  placeholder="Write a useful update…"
                  required
                  rows={2}
                />
                <button type="submit">
                  <Send aria-hidden size={17} /> Send
                </button>
              </form>
            </section>
          ) : (
            <section className={styles.empty}>
              <MessageSquareText aria-hidden size={30} />
              <h2>Start the first conversation.</h2>
              <p>Choose a real Duna audience and share something useful.</p>
              <Link href="/messages?compose=new">
                New message <ChevronRight aria-hidden size={16} />
              </Link>
            </section>
          )}

          <aside className={styles.detailPanel}>
            <span className={styles.detailIcon}>
              {compose === "new" ? (
                <Sparkles aria-hidden size={20} />
              ) : (
                <UsersRound aria-hidden size={20} />
              )}
            </span>
            <h2>
              {compose === "new"
                ? "Built for service"
                : (detail?.conversation.context?.label ?? "Conversation")}
            </h2>
            <p>
              {compose === "new"
                ? "Messaging exists to coordinate the Duna relationship—not to create a marketing list."
                : "Audience membership follows the underlying event or organization relationship."}
            </p>
            <dl>
              <div>
                <dt>Eligible people</dt>
                <dd>{relatedPeople.length}</dd>
              </div>
              <div>
                <dt>Open conversations</dt>
                <dd>{inbox.conversations.length}</dd>
              </div>
              <div>
                <dt>Unread</dt>
                <dd>{inbox.totalUnread}</dd>
              </div>
            </dl>
            <div className={styles.boundaryCard}>
              <ShieldCheck aria-hidden size={18} />
              <span>
                <strong>Member control</strong>
                <small>
                  People can stop organization messages at any time.
                </small>
              </span>
            </div>
          </aside>
        </section>
      </main>
    </OperatorShell>
  );
}
