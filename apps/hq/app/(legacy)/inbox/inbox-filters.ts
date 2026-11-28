import type { ConversationSummary } from "@duna/messaging-client";
export const inboxFilters = [
  "all",
  "unread",
  "families",
  "activities",
] as const;
export type InboxFilter = (typeof inboxFilters)[number];
export function parseInboxFilter(value?: string): InboxFilter {
  return inboxFilters.find((filter) => filter === value) ?? "all";
}
export function filterInbox(
  conversations: readonly ConversationSummary[],
  filter: InboxFilter,
  query = "",
) {
  const search = query.trim().toLocaleLowerCase();
  return conversations.filter((conversation) => {
    if (filter === "unread" && conversation.unreadCount === 0) return false;
    if (filter === "families" && !conversation.safety.minorPresent)
      return false;
    if (
      filter === "activities" &&
      (!conversation.context ||
        !["event", "division", "league", "lesson", "rental", "match"].includes(
          conversation.context.type,
        ))
    )
      return false;
    return (
      !search ||
      [
        conversation.title,
        conversation.context?.label,
        conversation.lastMessage?.body,
        ...conversation.participants.map((person) => person.displayName),
      ].some((value) => value?.toLocaleLowerCase().includes(search))
    );
  });
}
export function eligibleInitialRecipient(
  people: readonly { personId: string }[],
  requested?: string,
) {
  return requested && people.some((person) => person.personId === requested)
    ? requested
    : undefined;
}
