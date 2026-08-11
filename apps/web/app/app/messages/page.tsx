import type {
  ConversationMessage,
  MessageWidget,
} from "@duna/messaging-client";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  CircleDollarSign,
  FileCheck2,
  FileText,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { getServerCaller } from "@/lib/api";
import {
  blockPlayerMessagingPrincipal,
  createPlayerConversation,
  ensureDunaSupportConversation,
  recordPlayerMessageAction,
  sendPlayerMessage,
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

function relativeTime(value: string) {
  const difference = Date.now() - new Date(value).getTime();
  if (difference < 60 * 60 * 1_000)
    return `${Math.max(1, Math.floor(difference / 60_000))}m`;
  if (difference < 24 * 60 * 60 * 1_000)
    return `${Math.floor(difference / (60 * 60 * 1_000))}h`;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function Widget({
  index,
  messageId,
  widget,
}: {
  readonly index: number;
  readonly messageId: string;
  readonly widget: MessageWidget;
}) {
  if (widget.kind === "schedule-change") {
    return (
      <div className={styles.widget}>
        <CalendarClock aria-hidden size={19} />
        <span>
          <strong>{widget.title}</strong>
          <small>
            {new Intl.DateTimeFormat("en", {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(widget.startsAt))}
          </small>
        </span>
        {widget.acknowledgementRequired && (
          <form action={recordPlayerMessageAction}>
            <input name="messageId" type="hidden" value={messageId} />
            <input
              name="actionId"
              type="hidden"
              value={`schedule-change:${index}:acknowledge`}
            />
            <input name="actionType" type="hidden" value="acknowledge" />
            <button type="submit">
              <Check aria-hidden size={15} /> Got it
            </button>
          </form>
        )}
      </div>
    );
  }
  if (widget.kind === "payment-request") {
    return (
      <div className={styles.widget}>
        <CircleDollarSign aria-hidden size={19} />
        <span>
          <strong>{widget.title}</strong>
          <small>
            {new Intl.NumberFormat("en", {
              style: "currency",
              currency: widget.currency,
            }).format(widget.amountMinor / 100)}
          </small>
        </span>
        <Link href={widget.paymentPath}>Review</Link>
      </div>
    );
  }
  if (widget.kind === "form-request") {
    return (
      <div className={styles.widget}>
        <FileCheck2 aria-hidden size={19} />
        <span>
          <strong>{widget.title}</strong>
          <small>{widget.description}</small>
        </span>
        <Link href={widget.formPath}>Open</Link>
      </div>
    );
  }
  if (widget.kind === "score-update") {
    return (
      <div className={styles.scoreWidget}>
        <span>{widget.homeLabel}</span>
        <strong>{widget.homeScore}</strong>
        <small>{widget.status}</small>
        <strong>{widget.awayScore}</strong>
        <span>{widget.awayLabel}</span>
      </div>
    );
  }
  if (widget.kind === "quick-actions") {
    return (
      <div className={styles.quickActions}>
        {widget.title && <strong>{widget.title}</strong>}
        <span>
          {widget.actions.map((action) => (
            <form action={recordPlayerMessageAction} key={action.id}>
              <input name="messageId" type="hidden" value={messageId} />
              <input name="actionId" type="hidden" value={action.id} />
              <input name="actionType" type="hidden" value="quick-action" />
              <button type="submit">{action.label}</button>
            </form>
          ))}
        </span>
      </div>
    );
  }
  return (
    <div className={styles.widget}>
      <Trophy aria-hidden size={19} />
      <span>
        <strong>{widget.title}</strong>
        {"detail" in widget && <small>{widget.detail}</small>}
      </span>
      {"action" in widget && widget.action && (
        <Link href={widget.action.href}>{widget.action.label}</Link>
      )}
    </div>
  );
}

function Message({
  message,
  mine,
}: {
  readonly message: ConversationMessage;
  readonly mine: boolean;
}) {
  return (
    <article className={mine ? styles.messageMine : styles.message}>
      {!mine && (
        <span className={styles.messageAvatar}>
          {initials(message.sender.displayName)}
        </span>
      )}
      <div>
        {!mine && <small>{message.sender.displayName}</small>}
        <div className={styles.bubble}>
          {message.body && <p>{message.body}</p>}
          {message.widgets.map((widget, index) => (
            <Widget
              index={index}
              key={`${message.id}:${index}`}
              messageId={message.id}
              widget={widget}
            />
          ))}
          {message.attachments.map((attachment) =>
            attachment.kind === "image" && attachment.downloadUrl ? (
              <a
                className={styles.attachmentImageLink}
                href={attachment.downloadUrl}
                key={attachment.id}
                rel="noreferrer"
                target="_blank"
              >
                <img alt={attachment.fileName} src={attachment.downloadUrl} />
                <small>{attachment.fileName}</small>
              </a>
            ) : attachment.downloadUrl ? (
              <a
                className={styles.attachmentFile}
                href={attachment.downloadUrl}
                key={attachment.id}
                rel="noreferrer"
                target="_blank"
              >
                {attachment.kind === "video" ? (
                  <Play aria-hidden size={18} />
                ) : (
                  <FileText aria-hidden size={18} />
                )}
                <span>
                  <strong>{attachment.fileName}</strong>
                  <small>
                    {(attachment.byteSize / (1024 * 1024)).toFixed(1)} MB · Open
                    on demand
                  </small>
                </span>
              </a>
            ) : (
              <span className={styles.attachmentFile} key={attachment.id}>
                <FileText aria-hidden size={18} />
                <span>
                  <strong>{attachment.fileName}</strong>
                  <small>Private while safety review finishes</small>
                </span>
              </span>
            ),
          )}
        </div>
        <time dateTime={message.createdAt}>
          {new Intl.DateTimeFormat("en", {
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(message.createdAt))}
          {message.status === "screening" && " · Safety check"}
        </time>
      </div>
    </article>
  );
}

export default async function MessagesPage({
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
  const [inbox, composeOptions] = await Promise.all([
    caller.messaging.inbox({ asPrincipal: "user" }),
    caller.messaging.composeOptions(),
  ]);
  const selected =
    inbox.conversations.find((conversation) => conversation.id === thread) ??
    inbox.conversations[0];
  const detail =
    selected && compose !== "new" && view !== "inbox"
      ? await caller.messaging.conversation({
          conversationId: selected.id,
          asPrincipal: "user",
        })
      : undefined;
  const blockTarget = detail?.participants.find(
    (participant) =>
      participant.principal.id !== inbox.principal.id &&
      participant.principal.type !== "agent",
  )?.principal;
  const sendId = crypto.randomUUID();
  const responseId = crypto.randomUUID();
  return (
    <main className={styles.page} data-messaging-page>
      <MessagingLiveRefresh conversationId={detail?.conversation.id} />
      <header className={styles.pageHeader}>
        <div>
          <span>Messages</span>
          <h1>Stay close to what you joined.</h1>
          <p>
            Event updates, group conversations, and Duna Support in one place.
          </p>
        </div>
        <div className={styles.headerTrust}>
          <ShieldCheck aria-hidden size={18} />
          <span>
            <strong>Relationship protected</strong>
            <small>No unsolicited organization marketing</small>
          </span>
        </div>
      </header>

      <section
        className={styles.workspace}
        data-has-thread={Boolean(detail) || compose === "new"}
      >
        <aside className={styles.inbox}>
          <header>
            <span>
              <strong>Inbox</strong>
              {inbox.totalUnread > 0 && <i>{inbox.totalUnread}</i>}
            </span>
            <Link
              aria-label="New conversation"
              href="/app/messages?compose=new"
            >
              <Plus aria-hidden size={16} />
            </Link>
          </header>
          <nav aria-label="Message conversations">
            {inbox.conversations.map((conversation) => (
              <Link
                className={
                  conversation.id === selected?.id
                    ? styles.activeThread
                    : undefined
                }
                href={`/app/messages?thread=${conversation.id}`}
                key={conversation.id}
              >
                <span className={styles.threadAvatar}>
                  {conversation.type === "support" ? (
                    <Sparkles aria-hidden size={18} />
                  ) : conversation.type === "event" ? (
                    <Users aria-hidden size={18} />
                  ) : (
                    initials(conversation.title)
                  )}
                </span>
                <span>
                  <strong>{conversation.title}</strong>
                  <small>
                    {conversation.lastMessage?.body ?? "Conversation ready"}
                  </small>
                </span>
                <span>
                  <time>{relativeTime(conversation.updatedAt)}</time>
                  {conversation.unreadCount > 0 && (
                    <i>{conversation.unreadCount}</i>
                  )}
                </span>
              </Link>
            ))}
          </nav>
          {inbox.conversations.find((item) => item.type === "support") ? (
            <Link
              className={styles.supportLink}
              href={`/app/messages?thread=${inbox.conversations.find((item) => item.type === "support")!.id}`}
            >
              <Sparkles aria-hidden size={17} /> Ask Duna Support
            </Link>
          ) : (
            <form action={ensureDunaSupportConversation}>
              <button className={styles.supportLink} type="submit">
                <Sparkles aria-hidden size={17} /> Ask Duna Support
              </button>
            </form>
          )}
        </aside>

        {compose === "new" ? (
          <section className={styles.thread}>
            <header>
              <Link aria-label="Back to inbox" href="/app/messages?view=inbox">
                <ArrowLeft aria-hidden size={20} />
              </Link>
              <span className={styles.threadAvatar}>
                <MessageCircle aria-hidden size={18} />
              </span>
              <span>
                <strong>New conversation</strong>
                <small>Mutual follows or your Pro followers</small>
              </span>
            </header>
            <form
              action={createPlayerConversation}
              className={styles.newConversation}
            >
              <input
                name="clientMessageId"
                type="hidden"
                value={crypto.randomUUID()}
              />
              <div className={styles.composeTrust}>
                <ShieldCheck aria-hidden size={17} />
                <span>
                  <strong>Relationship protected</strong>
                  <small>
                    Direct messages require a mutual follow. Duna adds verified
                    guardians and safety screening whenever a minor is included.
                  </small>
                </span>
              </div>
              {composeOptions.canBroadcastFollowers && (
                <label className={styles.broadcastChoice}>
                  <input
                    name="followerBroadcast"
                    type="checkbox"
                    value="true"
                  />
                  <span>
                    <strong>Send to all my followers</strong>
                    <small>
                      {composeOptions.followerCount} follower
                      {composeOptions.followerCount === 1 ? "" : "s"} · Pro
                      broadcast
                    </small>
                  </span>
                </label>
              )}
              <fieldset>
                <legend>Mutual follows</legend>
                {composeOptions.candidates.length ? (
                  composeOptions.candidates.map((candidate) => (
                    <label key={candidate.principal.id}>
                      <input
                        name="recipientPersonId"
                        type="checkbox"
                        value={candidate.principal.id}
                      />
                      <span className={styles.messageAvatar}>
                        {initials(candidate.principal.displayName)}
                      </span>
                      <span>
                        <strong>{candidate.principal.displayName}</strong>
                        <small>
                          Mutual follow
                          {candidate.isMinor ? " · Guardian included" : ""}
                        </small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p>
                    No mutual follows yet. You can still reply inside shared
                    event conversations.
                  </p>
                )}
              </fieldset>
              <label>
                <span>Conversation name</span>
                <input
                  maxLength={160}
                  name="title"
                  placeholder="Beach plans"
                  required
                />
              </label>
              <label>
                <span>First message</span>
                <textarea
                  maxLength={10_000}
                  name="body"
                  placeholder="Write the useful update…"
                  required
                  rows={6}
                />
              </label>
              <button type="submit">
                Create and send <Send aria-hidden size={16} />
              </button>
            </form>
          </section>
        ) : detail ? (
          <section className={styles.thread}>
            <header>
              <Link aria-label="Back to inbox" href="/app/messages?view=inbox">
                <ArrowLeft aria-hidden size={20} />
              </Link>
              <span className={styles.threadAvatar}>
                {detail.conversation.type === "support" ? (
                  <Sparkles aria-hidden size={18} />
                ) : (
                  <Users aria-hidden size={18} />
                )}
              </span>
              <span>
                <strong>{detail.conversation.title}</strong>
                <small>
                  {detail.participants.length} people
                  {detail.conversation.context
                    ? ` · ${detail.conversation.context.label}`
                    : ""}
                </small>
              </span>
              <button aria-label="Conversation options" type="button">
                <MoreHorizontal aria-hidden size={20} />
              </button>
            </header>
            {detail.conversation.safety.minorPresent && (
              <div className={styles.safetyNotice}>
                <ShieldCheck aria-hidden size={16} />
                Messages are safety-screened and visible to verified parents or
                guardians.
              </div>
            )}
            <div className={styles.messageList}>
              {detail.messages.map((message) => (
                <Message
                  key={message.id}
                  message={message}
                  mine={message.sender.id === inbox.principal.id}
                />
              ))}
            </div>
            {detail.permissions.canPost ? (
              <form action={sendPlayerMessage} className={styles.composer}>
                <input
                  name="conversationId"
                  type="hidden"
                  value={detail.conversation.id}
                />
                <input name="clientMessageId" type="hidden" value={sendId} />
                <input
                  name="responseClientMessageId"
                  type="hidden"
                  value={responseId}
                />
                <input
                  name="support"
                  type="hidden"
                  value={String(detail.conversation.type === "support")}
                />
                <textarea
                  aria-label="Message"
                  maxLength={10_000}
                  name="body"
                  placeholder={
                    detail.conversation.type === "support"
                      ? "Ask about an event, lesson, rental, or payment…"
                      : "Write a message…"
                  }
                  required
                  rows={1}
                />
                <button aria-label="Send message" type="submit">
                  <Send aria-hidden size={18} />
                </button>
                <small>
                  {detail.conversation.type === "support"
                    ? "Duna AI reads only your Duna context and hands off when a person should help."
                    : "Enter to send · Shift + Enter for a new line"}
                </small>
              </form>
            ) : (
              <div className={styles.readOnly}>
                <LockKeyhole aria-hidden size={17} /> This conversation is
                read-only.
              </div>
            )}
          </section>
        ) : (
          <section className={styles.empty}>
            <MessageCircle aria-hidden size={30} />
            <h2>Your messages will appear here.</h2>
            <p>
              Join an event, lesson, league, or rental to start a conversation.
            </p>
          </section>
        )}

        {detail && (
          <aside className={styles.contextPanel}>
            <span className={styles.contextIcon}>
              {detail.conversation.type === "support" ? (
                <Sparkles aria-hidden size={22} />
              ) : (
                <Trophy aria-hidden size={22} />
              )}
            </span>
            <h2>
              {detail.conversation.context?.label ?? detail.conversation.title}
            </h2>
            <p>
              {detail.conversation.type === "support"
                ? "Duna Support can understand your account context without asking you to repeat it."
                : "This conversation stays tied to the Duna activity that brought everyone together."}
            </p>
            <dl>
              <div>
                <dt>People</dt>
                <dd>{detail.participants.length}</dd>
              </div>
              <div>
                <dt>Posting</dt>
                <dd>
                  {detail.conversation.announcementOnly
                    ? "Updates only"
                    : "Group"}
                </dd>
              </div>
              <div>
                <dt>Safety</dt>
                <dd>
                  {detail.conversation.safety.screeningRequired
                    ? "Screened"
                    : "Protected"}
                </dd>
              </div>
            </dl>
            {blockTarget && detail.permissions.canBlock && (
              <form action={blockPlayerMessagingPrincipal}>
                <input
                  name="conversationId"
                  type="hidden"
                  value={detail.conversation.id}
                />
                <input
                  name="principalType"
                  type="hidden"
                  value={blockTarget.type}
                />
                <input
                  name="principalId"
                  type="hidden"
                  value={blockTarget.id}
                />
                <button className={styles.blockButton} type="submit">
                  Stop messages from {blockTarget.displayName}
                </button>
              </form>
            )}
            {detail.conversation.context && (
              <Link className={styles.contextLink} href="/app/play">
                View details <ChevronRight aria-hidden size={16} />
              </Link>
            )}
          </aside>
        )}
      </section>
    </main>
  );
}
