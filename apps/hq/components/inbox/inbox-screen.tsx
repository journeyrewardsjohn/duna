import { Icon } from "@duna/ui/icons";
import {
  Avatar,
  Button,
  buttonClassName,
  EmptyState,
  ErrorState,
  NotConfigured,
  OfflineBanner,
  PaneTransition,
  Skeleton,
  SkeletonListRow,
} from "@duna/ui/tideline";
import Link from "next/link";
import { AccessDeniedState } from "@/lib/access-state";
import { PageHeader } from "../shell/page-header";
import { ShellPage } from "../shell/shell-context";
import { Composer } from "./composer";
import { ContextSheet } from "./context-sheet";
import { Conversation, Participants } from "./conversation";
import { ConversationScroller } from "./conversation-scroller";
import {
  inboxContext,
  type Loaded,
  loadCards,
  loadClubChannels,
  loadComposeOptions,
  loadPersonContext,
  loadProposal,
  loadStaff,
  loadThread,
  loadThreads,
} from "./inbox-data";
import {
  channelStatuses,
  focusPerson,
  inboxHref,
  type InboxState,
  kindLabels,
} from "./inbox-model";
import { InboxLiveRefresh } from "./live-refresh";
import { NewConversation } from "./new-conversation";
import { PersonPanel } from "./person-panel";
import { ThreadActions } from "./thread-actions";
import { ThreadList } from "./thread-list";

const askStarters = [
  "Which conversations are waiting on us?",
  "Draft a reminder for this weekend's clinic",
  "Who hasn't replied about Saturday?",
];

/** The honest state of a pane that couldn't load. It shows no data. */
export function InboxBlockState({
  loaded,
  what,
  organization,
}: {
  readonly loaded: Exclude<Loaded<unknown>, { state: "ok" }>;
  readonly what: string;
  readonly organization: string;
}) {
  switch (loaded.state) {
    case "denied":
      return (
        <AccessDeniedState
          area={what}
          compact
          grantedBy={`an owner or manager of ${organization}`}
        />
      );
    case "not-configured":
      return (
        <NotConfigured
          compact
          feature={what.replace(/^\w/, (c) => c.toUpperCase())}
          needs="Duna Database"
          owner={`an owner of ${organization}`}
        />
      );
    case "not-found":
      return (
        <EmptyState
          actions={
            <Button href="/inbox" size="sm" variant="secondary">
              Back to all conversations
            </Button>
          }
          description={`It may have been closed, or it belongs to another club than ${organization}.`}
          icon="thread"
          title="This conversation isn't here"
        />
      );
    case "error":
      return (
        <ErrorState
          compact
          message="Something went wrong on our side. Reload to try again; the rest of Inbox still works."
          reference={loaded.reference}
          title={`Could not load ${what}`}
        />
      );
  }
}

/** Inbox while its first read lands: the list and a thread, as skeletons. */
export function InboxLoading() {
  return (
    <div aria-busy="true" className="inbox" data-view="list">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading Inbox" lines={2} />
          </div>
        </div>
      </div>
      <div className="inbox-grid">
        <div
          className="inbox-list"
          role="status"
          aria-label="Loading conversations"
        >
          {Array.from({ length: 7 }, (_, index) => (
            <SkeletonListRow key={index} lines={2} />
          ))}
        </div>
        <div className="inbox-pane inbox-pane--empty">
          <Skeleton kind="lines" label="Loading the conversation" lines={4} />
        </div>
      </div>
    </div>
  );
}

/**
 * Inbox: the club's threads (Concierge) on the left, the open conversation
 * with its composer in the middle, and who it is with on the right. At
 * phone width it is list, then thread, with a clear way back.
 */
export async function InboxScreen({ state }: { readonly state: InboxState }) {
  const context = await inboxContext();
  if (context.session.access !== "operator") return null; // the shell says why
  if (!context.canRead) {
    return (
      <div className="inbox">
        <ShellPage askLabel="Inbox" askStarters={[]} />
        <PageHeader title="Inbox" />
        <div className="hqs-state">
          <AccessDeniedState
            action={
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href="/"
              >
                Back to HQ
              </Link>
            }
            area="Inbox"
            grantedBy={`an owner or manager of ${context.organization}`}
          />
        </div>
      </div>
    );
  }
  const { capabilities } = context;
  const composing =
    state.compose === "new" &&
    context.canDraft &&
    (capabilities.startThread || capabilities.groupConversation);
  const [threads, channelMap] = await Promise.all([
    loadThreads(state),
    loadClubChannels(context.organizationId),
  ]);
  const channels = channelStatuses(channelMap);
  const view = composing || state.thread ? "thread" : "list";
  const listHref = inboxHref(state, {
    thread: undefined,
    compose: undefined,
    recipient: undefined,
    person: undefined,
    proposal: undefined,
  });
  const canCompose =
    context.canDraft &&
    (capabilities.startThread || capabilities.groupConversation);
  const unread =
    threads.state === "ok" ? threads.data.counts.unread : undefined;

  return (
    <div className="inbox" data-view={view}>
      <ShellPage
        askLabel="Inbox"
        askStarters={askStarters}
        crumb={composing ? "New message" : undefined}
        parentHref={composing || state.thread ? "/inbox" : undefined}
      />
      <InboxLiveRefresh conversationId={state.thread} />
      <PageHeader
        actions={
          canCompose && !composing ? (
            <Button
              href={inboxHref(state, {
                compose: "new",
                thread: undefined,
                person: undefined,
                proposal: undefined,
              })}
              icon={<Icon name="plus" size="control" />}
              variant={state.thread ? "secondary" : "primary"}
            >
              New message
            </Button>
          ) : undefined
        }
        description={
          unread
            ? `${unread} unread · conversations with the people of ${context.organization}`
            : `Conversations with the people of ${context.organization}, on the channel each person chose`
        }
        title="Inbox"
      />
      <OfflineBanner writes="refused" />
      <div
        className="inbox-grid"
        data-has-context={Boolean(state.thread) || undefined}
      >
        <aside aria-label="Conversations" className="inbox-list-pane">
          {threads.state === "ok" ? (
            <ThreadList
              counts={threads.data.counts}
              now={context.now}
              showMuted={capabilities.mute}
              state={state}
              threads={threads.data.items}
              timeZone={context.timeZone}
            />
          ) : (
            <div className="inbox-list">
              <InboxBlockState
                loaded={threads}
                organization={context.organization}
                what="the conversations"
              />
            </div>
          )}
        </aside>
        <section
          aria-label={composing ? "New message" : "Conversation"}
          className="inbox-pane"
        >
          <Link className="inbox-back" href={listHref}>
            <Icon name="chevron-left" size="inline" /> All conversations
          </Link>
          <PaneTransition
            transitionKey={composing ? "compose" : (state.thread ?? "none")}
          >
            {composing ? (
              <ComposePane
                context={context}
                channels={channels}
                listHref={listHref}
                state={state}
              />
            ) : state.thread ? (
              <ThreadPane channels={channels} state={state} />
            ) : (
              <ChooseState
                canCompose={canCompose}
                channels={channels}
                composeHref={inboxHref(state, { compose: "new" })}
                hasThreads={
                  threads.state === "ok" && threads.data.items.length > 0
                }
              />
            )}
          </PaneTransition>
        </section>
      </div>
    </div>
  );
}

/** No thread open (wide screens): what's here and the one next action. */
function ChooseState({
  canCompose,
  composeHref,
  hasThreads,
  channels,
}: {
  readonly canCompose: boolean;
  readonly composeHref: string;
  readonly hasThreads: boolean;
  readonly channels: ReturnType<typeof channelStatuses>;
}) {
  return (
    <div className="inbox-choose">
      <EmptyState
        actions={
          canCompose && !hasThreads ? (
            <Button href={composeHref} variant="primary">
              New message
            </Button>
          ) : undefined
        }
        description={
          hasThreads
            ? "Choose a conversation to read it and reply. Replies from email, iMessage and WhatsApp land in the same thread."
            : "Start one with everyone at the club, a session's players, a league or one person."
        }
        icon="thread"
        title={hasThreads ? "Choose a conversation" : "No conversations yet"}
      />
      <ul
        aria-label="Channels for your club"
        className="inbox-choose__channels"
      >
        {channels.map((channel) => (
          <li data-state={channel.state} key={channel.channel}>
            <Icon
              name={channel.state === "on" ? "success" : "info"}
              size="inline"
            />
            <span>
              <strong>{channel.label}</strong>
              <span className="inbox-quiet">{channel.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

async function ThreadPane({
  state,
  channels,
}: {
  readonly state: InboxState;
  readonly channels: ReturnType<typeof channelStatuses>;
}) {
  const context = await inboxContext();
  const conversationId = state.thread!;
  const thread = await loadThread(conversationId);
  if (thread.state !== "ok") {
    return (
      <div className="inbox-thread inbox-thread--state">
        <InboxBlockState
          loaded={thread}
          organization={context.organization}
          what="this conversation"
        />
      </div>
    );
  }
  const data = thread.data;
  const { capabilities } = context;
  const focus = focusPerson(data, state.person);
  const [cards, proposal, staff, person] = await Promise.all([
    loadCards(conversationId),
    state.proposal ? loadProposal(state.proposal) : Promise.resolve(undefined),
    capabilities.assign && context.canDraft ? loadStaff() : Promise.resolve([]),
    focus && context.canSeePeople
      ? loadPersonContext(focus.personId)
      : Promise.resolve(undefined),
  ]);
  const handed =
    proposal?.state === "ok" && proposal.data.conversationId === conversationId
      ? proposal.data
      : undefined;
  const lastSequence = data.messages.reduce(
    (max, message) => Math.max(max, message.sequence),
    0,
  );
  const panel = (
    <PersonPanel
      organization={context.organization}
      person={
        person ?? (context.canSeePeople ? undefined : { state: "denied" })
      }
      state={state}
      thread={data}
      timeZone={context.timeZone}
    />
  );
  return (
    <div className="inbox-thread-layout">
      <div className="inbox-thread">
        <header className="inbox-thread__head">
          <Avatar
            kind={
              data.kind === "club" || data.kind === "duna" ? "club" : "person"
            }
            name={data.title}
            size="lg"
          />
          <div className="inbox-thread__title">
            <h2 className="inbox-thread__name">{data.title}</h2>
            <div className="inbox-thread__sub">
              <Participants thread={data} />
              <p className="inbox-quiet">
                {kindLabels[data.kind]}
                {data.context?.status ? ` · ${data.context.status}` : ""} ·{" "}
                <span className="td-num">{data.participantCount}</span>{" "}
                {data.participantCount === 1 ? "person" : "people"}
              </p>
            </div>
          </div>
          <ThreadActions
            assignedToMe={state.filter === "mine"}
            canAssign={capabilities.assign && context.canDraft}
            canMarkDone={capabilities.markDone && context.canDraft}
            canMarkRead={capabilities.markRead}
            canMute={capabilities.mute && context.canDraft}
            conversationId={conversationId}
            lastSequence={lastSequence}
            me={context.personId}
            staff={staff}
            unread={data.unreadCount > 0}
          />
          <ContextSheet title={data.title}>{panel}</ContextSheet>
        </header>
        {data.minorPresent ? (
          <p className="inbox-safety">
            <Icon name="junior-guardian" size="inline" /> Guardians see this
            conversation and every message is screened for safety.
          </p>
        ) : null}
        <ConversationScroller newest={lastSequence}>
          <Conversation
            cards={cards}
            now={context.now}
            thread={data}
            timeZone={context.timeZone}
          />
        </ConversationScroller>
        <Composer
          canChooseChannel={capabilities.channelChoice}
          canDraft={context.canDraft}
          canReply={capabilities.reply}
          canSeeDeliveries={capabilities.deliveries}
          canSend={context.canSend}
          channels={channels}
          conversationId={conversationId}
          initialProposal={handed}
          key={conversationId}
          threadTitle={data.title}
        />
      </div>
      <aside aria-label={`About ${data.title}`} className="inbox-context">
        {panel}
      </aside>
    </div>
  );
}

async function ComposePane({
  state,
  context,
  channels,
  listHref,
}: {
  readonly state: InboxState;
  readonly context: Awaited<ReturnType<typeof inboxContext>>;
  readonly channels: ReturnType<typeof channelStatuses>;
  readonly listHref: string;
}) {
  const options = await loadComposeOptions();
  if (options.state !== "ok") {
    return (
      <div className="inbox-thread inbox-thread--state">
        <InboxBlockState
          loaded={options}
          organization={context.organization}
          what="who you can write to"
        />
      </div>
    );
  }
  const known =
    state.recipient &&
    options.data.people.some((person) => person.personId === state.recipient)
      ? state.recipient
      : undefined;
  return (
    <div className="inbox-thread">
      <header className="inbox-thread__head">
        <span aria-hidden="true" className="inbox-thread__glyph">
          <Icon name="send" size="nav" />
        </span>
        <div className="inbox-thread__title">
          <h2 className="inbox-thread__name">New message</h2>
          <p className="inbox-quiet">Start with who needs to hear it.</p>
        </div>
      </header>
      <NewConversation
        backHref={listHref}
        canChooseChannel={context.capabilities.channelChoice}
        canCreateGroup={context.capabilities.groupConversation}
        canSeeDeliveries={context.capabilities.deliveries}
        canSend={context.canSend}
        canStartThread={context.capabilities.startThread}
        channels={channels}
        initialRecipient={known}
        key={known ?? "new"}
        options={options.data}
        recipientUnavailable={Boolean(state.recipient && !known)}
      />
    </div>
  );
}
