import type { Metadata } from "next";
import { InboxScreen } from "@/components/inbox/inbox-screen";
import { parseInboxState } from "@/components/inbox/inbox-model";

export const metadata: Metadata = { title: "Inbox" };

/**
 * Inbox (H-INBOX): the club's Concierge threads, one conversation at a
 * time, and the Send review. The address holds the list filter, the search,
 * the open thread and the new-message pane, so every view can be shared and
 * Back works.
 */
export default async function InboxPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <InboxScreen state={parseInboxState(await searchParams)} />;
}
