import type { ConciergeThread } from "@duna/api";
import type { MessageWidget } from "@duna/messaging-client";
import { Icon, type IconName } from "@duna/ui/icons";
import { Avatar, AvatarStack } from "@duna/ui/tideline";
import Link from "next/link";
import {
  authorLine,
  type ConciergeChannel,
  channelShort,
  deliveryLabels,
  type DeliveryStatus,
  formatMoney,
  groupMessages,
  isClubMessage,
  type ThreadMessage,
  timeOfDay,
} from "./inbox-model";

const channelIcons: Record<ConciergeChannel | "system", IconName> = {
  duna: "thread",
  email: "mail",
  imessage: "phone-bubble",
  whatsapp: "phone-bubble",
  system: "info",
};

/** A card or poll the club put in a message (Duna app only). */
function Card({ widget }: { readonly widget: MessageWidget }) {
  if (widget.kind === "poll") {
    const highest = Math.max(
      1,
      ...widget.options.map((option) => option.voteCount ?? 0),
    );
    return (
      <div className="inbox-card inbox-card--poll">
        <p className="inbox-card__title">
          <Icon name="podium" size="inline" /> {widget.title}
        </p>
        <p className="inbox-card__detail">
          <span className="td-num">{widget.totalVoters ?? 0}</span>{" "}
          {widget.totalVoters === 1 ? "voter" : "voters"}
          {widget.closed ? " · Ended" : " · Open"}
        </p>
        <ul className="inbox-poll">
          {widget.options.map((option) => (
            <li key={option.id}>
              <span className="inbox-poll__row">
                <span>{option.label}</span>
                <span className="td-num">{option.voteCount ?? 0}</span>
              </span>
              <span aria-hidden="true" className="inbox-poll__bar">
                <span
                  style={{
                    transform: `scaleX(${(option.voteCount ?? 0) / highest})`,
                  }}
                />
              </span>
              {option.voterNames?.length ? (
                <span className="inbox-card__detail">
                  {option.voterNames.join(", ")}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (widget.kind === "resource-card") {
    return (
      <div className="inbox-card">
        <p className="inbox-card__title">
          <Icon
            name={
              widget.resourceType === "video"
                ? "film"
                : widget.resourceType === "session"
                  ? "calendar"
                  : "lesson"
            }
            size="inline"
          />{" "}
          {widget.title}
        </p>
        {widget.detail ? (
          <p className="inbox-card__detail">{widget.detail}</p>
        ) : null}
        <Link className="inbox-card__link" href={widget.action.href}>
          {widget.action.label}
        </Link>
      </div>
    );
  }
  const detail =
    widget.kind === "payment-request"
      ? formatMoney(widget.amountMinor, widget.currency)
      : widget.kind === "form-request"
        ? widget.description
        : widget.kind === "schedule-change"
          ? new Intl.DateTimeFormat("en-US", {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(widget.startsAt))
          : "Duna activity update";
  return (
    <div className="inbox-card">
      <p className="inbox-card__title">
        <Icon
          name={
            widget.kind === "payment-request"
              ? "pay"
              : widget.kind === "form-request"
                ? "waiver"
                : "schedule"
          }
          size="inline"
        />{" "}
        {"title" in widget ? widget.title : "Update"}
      </p>
      <p className="inbox-card__detail">{detail}</p>
      <p className="inbox-card__detail">The person acts on this in Duna.</p>
    </div>
  );
}

function Delivery({ message }: { readonly message: ThreadMessage }) {
  if (!message.delivery) return null;
  const { status, readBy, recipientCount } = message.delivery;
  const words =
    readBy.length > 0
      ? `Read by ${readBy.slice(0, 3).join(", ")}${readBy.length > 3 ? ` and ${readBy.length - 3} more` : ""}`
      : `${deliveryLabels[status as DeliveryStatus]?.label ?? "Sent"} to ${recipientCount} ${recipientCount === 1 ? "person" : "people"}`;
  return (
    <span className="inbox-msg__delivery">
      <Icon name={readBy.length > 0 ? "check" : "send"} size="chip" /> {words}
    </span>
  );
}

/**
 * The messages, by day and by channel: each day has its heading, each run
 * on one channel says once where it came in or went out. Club messages sit
 * on the right with who sent them for the club; Duna's own notes and
 * updates sit in the middle.
 */
export function Conversation({
  thread,
  cards,
  timeZone,
  now,
}: {
  readonly thread: ConciergeThread;
  readonly cards: ReadonlyMap<string, readonly MessageWidget[]>;
  readonly timeZone: string;
  readonly now: string;
}) {
  const days = groupMessages(thread.messages, timeZone, new Date(now));
  if (days.length === 0) {
    return (
      <div className="inbox-conversation inbox-conversation--empty">
        <p className="inbox-quiet">
          No messages yet. Write the first one below: everyone in the thread
          sees it, each on the channel they chose.
        </p>
      </div>
    );
  }
  return (
    <ol aria-label="Messages" className="inbox-conversation">
      {days.map((day) => (
        <li className="inbox-day" key={day.key}>
          <h3 className="inbox-day__label">{day.label}</h3>
          {day.runs.map((run, runIndex) => (
            <section
              className="inbox-run"
              data-channel={run.channel}
              key={`${day.key}-${runIndex}`}
            >
              {run.channel !== "system" ? (
                <p className="inbox-run__channel">
                  <Icon name={channelIcons[run.channel]} size="chip" />
                  {channelShort[run.channel]}
                </p>
              ) : null}
              {run.messages.map((message) => {
                const club = isClubMessage(message);
                const note =
                  message.kind === "system" || message.kind === "duna";
                const widgets = cards.get(message.messageId) ?? [];
                if (note) {
                  return (
                    <article
                      className="inbox-note"
                      data-kind={message.kind}
                      key={message.messageId}
                    >
                      <Icon
                        name={message.kind === "duna" ? "info" : "schedule"}
                        size="inline"
                      />
                      <p>
                        <span className="inbox-note__who">
                          {authorLine(message)}
                        </span>{" "}
                        {message.body}
                      </p>
                      <time dateTime={message.createdAt}>
                        {timeOfDay(message.createdAt, timeZone)}
                      </time>
                    </article>
                  );
                }
                return (
                  <article
                    className="inbox-msg"
                    data-side={club ? "club" : "person"}
                    key={message.messageId}
                  >
                    {club ? null : (
                      <Avatar
                        decorative
                        name={message.author?.displayName ?? "Someone"}
                        size="sm"
                        src={message.author?.avatarUrl}
                      />
                    )}
                    <div className="inbox-msg__body">
                      <p className="inbox-msg__who">
                        {authorLine(message)}
                        <time dateTime={message.createdAt}>
                          {timeOfDay(message.createdAt, timeZone)}
                        </time>
                      </p>
                      {message.body ? (
                        <p className="inbox-msg__bubble">{message.body}</p>
                      ) : null}
                      {widgets.map((widget, index) => (
                        <Card
                          key={`${message.messageId}-${index}`}
                          widget={widget}
                        />
                      ))}
                      {club ? <Delivery message={message} /> : null}
                    </div>
                  </article>
                );
              })}
            </section>
          ))}
        </li>
      ))}
    </ol>
  );
}

/** Who is in the thread, as faces (names for screen readers). */
export function Participants({ thread }: { readonly thread: ConciergeThread }) {
  if (thread.participants.length === 0) return null;
  const seen = new Set<string>();
  const people = thread.participants.filter((person) => {
    if (seen.has(person.displayName)) return false;
    seen.add(person.displayName);
    return true;
  });
  return (
    <AvatarStack
      label={`In this conversation: ${people.map((person) => person.displayName).join(", ")}`}
      max={5}
      people={people.map((person) => ({
        name: person.displayName,
        src: person.avatarUrl,
      }))}
      size="xs"
    />
  );
}
