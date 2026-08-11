import {
  demoConversationDetail,
  demoMessagingInbox,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSummary,
  type MessageWidget,
  type MessagingInbox,
  type MessagingComposeOptions,
  type MessagingPrincipal,
  type OutboxItem,
  type SendMessageInput,
} from "@duna/messaging-client";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
} from "./fellix-text";
import { createPlayerMessagingOutbox } from "./messaging-outbox";
import {
  messagingNotificationsEnabled,
  registerMessagingNotifications,
} from "./messaging-notifications";
import { dunaWebUrl } from "./mobile-api";
import { usePlayerRuntime } from "./runtime";

export interface MessagingPalette {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly positive: string;
  readonly warning: string;
  readonly danger: string;
}

interface PlayerMessagingScreenProps {
  readonly initialConversationId?: string;
  readonly initialSupport?: boolean;
  readonly onClose: () => void;
  readonly palette: MessagingPalette;
}

function timeLabel(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function longDate(value: string) {
  return new Date(value).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function pairedResponseId(clientMessageId: string) {
  const final = clientMessageId.at(-1)?.toLowerCase() ?? "0";
  return `${clientMessageId.slice(0, -1)}${final === "0" ? "1" : "0"}`;
}

function openDunaPath(path: string) {
  const url = /^https?:\/\//.test(path)
    ? path
    : `${dunaWebUrl}${path.startsWith("/") ? path : `/${path}`}`;
  void Linking.openURL(url);
}

function WidgetCard({
  index,
  onAction,
  palette,
  widget,
}: {
  readonly index: number;
  readonly onAction: (
    actionId: string,
    actionType: "acknowledge" | "quick-action",
    label?: string,
  ) => void;
  readonly palette: MessagingPalette;
  readonly widget: MessageWidget;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  if (widget.kind === "schedule-change") {
    return (
      <View style={styles.widget}>
        <Text style={styles.widgetEyebrow}>SCHEDULE UPDATE</Text>
        <Text style={styles.widgetTitle}>{widget.title}</Text>
        <Text style={styles.widgetBody}>{longDate(widget.startsAt)}</Text>
        {widget.acknowledgementRequired && (
          <Pressable
            onPress={() =>
              onAction(`schedule-change:${index}:acknowledge`, "acknowledge")
            }
            style={styles.widgetPrimary}
          >
            <Text style={styles.widgetPrimaryText}>Acknowledge</Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (widget.kind === "event-update") {
    return (
      <View style={styles.widget}>
        <Text style={styles.widgetEyebrow}>EVENT UPDATE</Text>
        <Text style={styles.widgetTitle}>{widget.title}</Text>
        <Text style={styles.widgetBody}>{widget.detail}</Text>
        {widget.location && (
          <Text style={styles.widgetMeta}>{widget.location}</Text>
        )}
        {widget.action && (
          <Pressable
            onPress={() => openDunaPath(widget.action!.href)}
            style={styles.widgetPrimary}
          >
            <Text style={styles.widgetPrimaryText}>{widget.action.label}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (widget.kind === "payment-request") {
    return (
      <View style={styles.widget}>
        <Text style={styles.widgetEyebrow}>
          PAYMENT · {widget.status.toUpperCase()}
        </Text>
        <Text style={styles.widgetTitle}>{widget.title}</Text>
        <Text style={styles.widgetAmount}>
          {new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: widget.currency,
          }).format(widget.amountMinor / 100)}
        </Text>
        {widget.status === "open" && (
          <Pressable
            onPress={() => openDunaPath(widget.paymentPath)}
            style={styles.widgetPrimary}
          >
            <Text style={styles.widgetPrimaryText}>Review payment</Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (widget.kind === "form-request") {
    return (
      <View style={styles.widget}>
        <Text style={styles.widgetEyebrow}>
          FORM · {widget.status.toUpperCase()}
        </Text>
        <Text style={styles.widgetTitle}>{widget.title}</Text>
        <Text style={styles.widgetBody}>{widget.description}</Text>
        {widget.status === "open" && (
          <Pressable
            onPress={() => openDunaPath(widget.formPath)}
            style={styles.widgetPrimary}
          >
            <Text style={styles.widgetPrimaryText}>Open form</Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (widget.kind === "score-update") {
    return (
      <Pressable
        disabled={!widget.matchPath}
        onPress={() => widget.matchPath && openDunaPath(widget.matchPath)}
        style={styles.widget}
      >
        <Text style={styles.widgetEyebrow}>
          MATCH · {widget.status.toUpperCase()}
        </Text>
        <Text style={styles.widgetTitle}>{widget.title}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreTeam}>{widget.homeLabel}</Text>
          <Text style={styles.scoreValue}>{widget.homeScore}</Text>
          <Text style={styles.scoreDash}>–</Text>
          <Text style={styles.scoreValue}>{widget.awayScore}</Text>
          <Text style={[styles.scoreTeam, styles.scoreTeamRight]}>
            {widget.awayLabel}
          </Text>
        </View>
      </Pressable>
    );
  }
  return (
    <View style={styles.widget}>
      {widget.title && <Text style={styles.widgetTitle}>{widget.title}</Text>}
      <View style={styles.quickActions}>
        {widget.actions.map((action) => (
          <Pressable
            key={action.id}
            onPress={() => onAction(action.id, "quick-action", action.label)}
            style={
              action.style === "primary"
                ? styles.widgetPrimary
                : styles.widgetSecondary
            }
          >
            <Text
              style={
                action.style === "primary"
                  ? styles.widgetPrimaryText
                  : styles.widgetSecondaryText
              }
            >
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ConversationRow({
  conversation,
  onPress,
  palette,
  selected,
}: {
  readonly conversation: ConversationSummary;
  readonly onPress: () => void;
  readonly palette: MessagingPalette;
  readonly selected: boolean;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const lead = conversation.participants[0]?.displayName ?? conversation.title;
  return (
    <Pressable
      accessibilityLabel={`${conversation.title}, ${conversation.unreadCount} unread`}
      onPress={onPress}
      style={[
        styles.conversationRow,
        selected && styles.conversationRowSelected,
      ]}
    >
      <View style={styles.conversationMark}>
        <Text style={styles.conversationMarkText}>
          {conversation.type === "support"
            ? "✦"
            : lead.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.flex}>
        <View style={styles.rowBetween}>
          <Text numberOfLines={1} style={styles.conversationTitle}>
            {conversation.title}
          </Text>
          <Text style={styles.timeText}>
            {conversation.lastMessage
              ? timeLabel(conversation.lastMessage.createdAt)
              : ""}
          </Text>
        </View>
        <Text numberOfLines={2} style={styles.conversationPreview}>
          {conversation.lastMessage?.body ?? "Start the conversation"}
        </Text>
        <View style={styles.conversationMetaRow}>
          {conversation.context && (
            <Text numberOfLines={1} style={styles.contextLabel}>
              {conversation.context.label}
            </Text>
          )}
          {conversation.safety.screeningRequired && (
            <Text style={styles.safeLabel}>SAFE MESSAGING</Text>
          )}
        </View>
      </View>
      {conversation.unreadCount > 0 && (
        <View style={styles.unreadBadge}>
          <Text style={styles.unreadText}>{conversation.unreadCount}</Text>
        </View>
      )}
    </Pressable>
  );
}

function MessageBubble({
  message,
  onAction,
  palette,
  principal,
}: {
  readonly message: ConversationMessage;
  readonly onAction: (
    messageId: string,
    actionId: string,
    actionType: "acknowledge" | "quick-action",
    label?: string,
  ) => void;
  readonly palette: MessagingPalette;
  readonly principal: MessagingPrincipal;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const mine =
    message.sender.type === principal.type &&
    message.sender.id === principal.id;
  return (
    <View style={[styles.messageWrap, mine && styles.messageWrapMine]}>
      {!mine && (
        <Text style={styles.senderName}>{message.sender.displayName}</Text>
      )}
      <View style={[styles.bubble, mine && styles.bubbleMine]}>
        {message.body && (
          <Text style={[styles.messageBody, mine && styles.messageBodyMine]}>
            {message.body}
          </Text>
        )}
        {message.widgets.map((widget, index) => (
          <WidgetCard
            index={index}
            key={`${message.id}:widget:${index}`}
            onAction={(actionId, actionType, label) =>
              onAction(message.id, actionId, actionType, label)
            }
            palette={palette}
            widget={widget}
          />
        ))}
        <View style={styles.messageStatusRow}>
          <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>
            {timeLabel(message.createdAt)}
          </Text>
          {message.status === "screening" && (
            <Text style={styles.screeningLabel}>Checking safety…</Text>
          )}
          {message.status === "held" && (
            <Text style={styles.heldLabel}>Held for review</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function PlayerMessagingScreen({
  initialConversationId,
  initialSupport = false,
  onClose,
  palette,
}: PlayerMessagingScreenProps) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const { client, dashboard, messagingDelivery, mode } = usePlayerRuntime();
  const player = dashboard?.player;
  const principal = useMemo<MessagingPrincipal>(
    () => ({
      type: "user",
      id: player?.id ?? "10000000-0000-4000-8000-000000000010",
      displayName: player?.displayName ?? "Mara Lewis",
    }),
    [player?.displayName, player?.id],
  );
  const outbox = useMemo(
    () => createPlayerMessagingOutbox(principal.id),
    [principal.id],
  );
  const [inbox, setInbox] = useState<MessagingInbox>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<ConversationDetail>();
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<readonly OutboxItem[]>([]);
  const [composeOptions, setComposeOptions] =
    useState<MessagingComposeOptions>();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [composeFollowerBroadcast, setComposeFollowerBroadcast] =
    useState(false);
  const [composeRecipients, setComposeRecipients] = useState<readonly string[]>(
    [],
  );
  const [creating, setCreating] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>();
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const threadScroll = useRef<ScrollView>(null);

  const loadInbox = useCallback(async () => {
    let nextInbox =
      mode === "preview" || !client
        ? demoMessagingInbox(principal)
        : await client.messaging.inbox.query({ asPrincipal: "user" });
    if (
      initialSupport &&
      mode === "live" &&
      client &&
      !nextInbox.conversations.some((item) => item.type === "support")
    ) {
      await client.messaging.create.mutate({
        asPrincipal: "user",
        conversation: {
          type: "support",
          title: "Duna Support",
          recipientPersonIds: [],
          announcementOnly: false,
          followerBroadcast: false,
        },
      });
      nextInbox = await client.messaging.inbox.query({ asPrincipal: "user" });
    }
    setInbox(nextInbox);
    setSelectedId((current) => {
      if (
        current &&
        nextInbox.conversations.some((item) => item.id === current)
      ) {
        return current;
      }
      const support = nextInbox.conversations.find(
        (item) => item.type === "support",
      );
      if (
        initialConversationId &&
        nextInbox.conversations.some(
          (item) => item.id === initialConversationId,
        )
      ) {
        return initialConversationId;
      }
      return initialSupport ? support?.id : undefined;
    });
    return nextInbox;
  }, [client, initialConversationId, initialSupport, mode, principal]);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      const nextDetail =
        mode === "preview" || !client
          ? demoConversationDetail(conversationId)
          : await client.messaging.conversation.query({
              asPrincipal: "user",
              conversationId,
            });
      setDetail(nextDetail);
      const lastSequence = nextDetail.messages.at(-1)?.seq ?? 0;
      if (mode === "live" && client && lastSequence > 0) {
        if (messagingDelivery) {
          messagingDelivery.queueRead(conversationId, lastSequence);
        } else {
          void client.messaging.markRead
            .mutate({
              asPrincipal: "user",
              conversationId,
              sequence: lastSequence,
            })
            .catch(() => undefined);
        }
      }
      return nextDetail;
    },
    [client, messagingDelivery, mode],
  );

  const flushOutbox = useCallback(
    async (inboxSnapshot?: MessagingInbox) => {
      const queued = await outbox.pending();
      setPending(queued);
      if (mode !== "live" || !client || queued.length === 0) return 0;
      let sent = 0;
      for (const item of queued) {
        await outbox.markSending(item.input.clientMessageId);
        try {
          const support = inboxSnapshot?.conversations.some(
            (conversation) =>
              conversation.id === item.input.conversationId &&
              conversation.type === "support",
          );
          if (support && item.input.body) {
            await client.messaging.askDuna.mutate({
              conversationId: item.input.conversationId,
              question: item.input.body,
              clientMessageId: item.input.clientMessageId,
              responseClientMessageId: pairedResponseId(
                item.input.clientMessageId,
              ),
            });
          } else {
            await client.messaging.send.mutate({
              asPrincipal: "user",
              message: item.input,
            });
          }
          await outbox.acknowledge(item.input.clientMessageId);
          sent += 1;
        } catch (reason) {
          await outbox.markFailed(
            item.input.clientMessageId,
            reason instanceof Error ? reason.message : "Connection unavailable",
          );
        }
      }
      setPending(await outbox.pending());
      return sent;
    },
    [client, mode, outbox],
  );

  const refreshAll = useCallback(async () => {
    setError(undefined);
    try {
      const nextInbox = await loadInbox();
      await flushOutbox(nextInbox);
      if (selectedId) await loadConversation(selectedId);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Messages could not sync. Your drafts are still safe.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [flushOutbox, loadConversation, loadInbox, selectedId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (mode !== "live" || !client) return;
    void messagingNotificationsEnabled()
      .then(setNotificationsEnabled)
      .catch(() => setNotificationsEnabled(false));
  }, [client, mode]);

  const enableNotifications = useCallback(async () => {
    if (!client || enablingNotifications) return;
    setEnablingNotifications(true);
    setError(undefined);
    try {
      const enabled = await registerMessagingNotifications(client, true);
      setNotificationsEnabled(enabled);
      if (!enabled) {
        setError("Message alerts are unavailable on this device.");
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not turn on message alerts.",
      );
    } finally {
      setEnablingNotifications(false);
    }
  }, [client, enablingNotifications]);

  useEffect(() => {
    if (!composeOpen) return;
    if (mode === "preview" || !client) {
      setComposeOptions({
        candidates: [
          {
            principal: {
              type: "user",
              id: "1dc66d99-ec02-4d10-8845-788ee74c63ac",
              displayName: "Mia Rivera",
            },
            isMinor: true,
          },
        ],
        canBroadcastFollowers: true,
        followerCount: 248,
      });
      return;
    }
    void client.messaging.composeOptions
      .query()
      .then(setComposeOptions)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Duna could not load your message connections.",
        ),
      );
  }, [client, composeOpen, mode]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      return;
    }
    setDetail(undefined);
    void loadConversation(selectedId).catch((reason: unknown) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "This conversation is unavailable.",
      ),
    );
  }, [loadConversation, selectedId]);

  useEffect(() => {
    if (mode === "live" && messagingDelivery) {
      const unsubscribe = messagingDelivery.onWakeUp(() => {
        void refreshAll();
      });
      messagingDelivery.connect();
      if (selectedId) {
        void messagingDelivery
          .syncConversation(selectedId)
          .catch(() => undefined);
      }
      const subscription = AppState.addEventListener("change", (state) => {
        if (state !== "active") return;
        void messagingDelivery.syncAll().catch(() => undefined);
        if (selectedId) {
          void messagingDelivery
            .syncConversation(selectedId)
            .catch(() => undefined);
        }
      });
      return () => {
        subscription.remove();
        unsubscribe();
        messagingDelivery.disconnect();
      };
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshAll();
    });
    const interval = setInterval(() => void refreshAll(), 15_000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, [messagingDelivery, mode, refreshAll, selectedId]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !selectedId || sending) return;
    const input: SendMessageInput = {
      conversationId: selectedId,
      clientMessageId: Crypto.randomUUID(),
      kind: "text",
      body,
      widgets: [],
    };
    setDraft("");
    setError(undefined);
    const optimistic: ConversationMessage = {
      id: input.clientMessageId,
      conversationId: input.conversationId,
      clientMessageId: input.clientMessageId,
      seq: (detail?.messages.at(-1)?.seq ?? 0) + 1,
      sender: principal,
      kind: "text",
      body,
      widgets: [],
      status: detail?.conversation.safety.screeningRequired
        ? "screening"
        : "published",
      moderationState: detail?.conversation.safety.screeningRequired
        ? "screening"
        : "not-required",
      createdAt: new Date().toISOString(),
    };
    setDetail((current) =>
      current
        ? { ...current, messages: [...current.messages, optimistic] }
        : current,
    );
    if (mode === "preview") {
      if (detail?.conversation.type === "support") {
        setTimeout(() => {
          setDetail((current) =>
            current
              ? {
                  ...current,
                  messages: [
                    ...current.messages,
                    {
                      ...optimistic,
                      id: pairedResponseId(input.clientMessageId),
                      clientMessageId: pairedResponseId(input.clientMessageId),
                      seq: optimistic.seq + 1,
                      sender: {
                        type: "agent",
                        id: "duna-ai-support",
                        displayName: "Duna Support",
                      },
                      kind: "support-response",
                      body: "I can help with that. In a signed-in build, I use your Duna events, lessons, rentals, and payments to give a grounded answer.",
                      status: "published",
                      moderationState: "not-required",
                    },
                  ],
                }
              : current,
          );
        }, 450);
      }
      return;
    }
    await outbox.enqueue(input);
    setPending(await outbox.pending());
    setSending(true);
    try {
      const sent = await flushOutbox(inbox);
      if (sent > 0) {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
        await Promise.all([loadConversation(selectedId), loadInbox()]);
      }
    } finally {
      setSending(false);
    }
  }, [
    detail,
    draft,
    flushOutbox,
    inbox,
    loadConversation,
    loadInbox,
    mode,
    outbox,
    principal,
    selectedId,
    sending,
  ]);

  const createConversation = useCallback(async () => {
    const body = composeBody.trim();
    const selectedCandidates =
      composeOptions?.candidates.filter((candidate) =>
        composeRecipients.includes(candidate.principal.id),
      ) ?? [];
    if (
      !body ||
      creating ||
      (!composeFollowerBroadcast && selectedCandidates.length === 0)
    ) {
      return;
    }
    const title =
      composeTitle.trim() ||
      (composeFollowerBroadcast
        ? `${principal.displayName} · Followers`
        : selectedCandidates
            .map((candidate) => candidate.principal.displayName)
            .join(", "));
    if (mode === "preview" || !client) {
      setComposeOpen(false);
      setComposeTitle("");
      setComposeBody("");
      setComposeRecipients([]);
      setComposeFollowerBroadcast(false);
      return;
    }
    setCreating(true);
    setError(undefined);
    try {
      const result = await client.messaging.create.mutate({
        asPrincipal: "user",
        conversation: {
          type: composeFollowerBroadcast
            ? "broadcast"
            : selectedCandidates.length === 1
              ? "dm"
              : "group",
          title,
          recipientPersonIds: composeFollowerBroadcast
            ? []
            : selectedCandidates.map((candidate) => candidate.principal.id),
          announcementOnly: composeFollowerBroadcast,
          followerBroadcast: composeFollowerBroadcast,
          initialMessage: body,
          clientMessageId: Crypto.randomUUID(),
        },
      });
      setComposeOpen(false);
      setComposeTitle("");
      setComposeBody("");
      setComposeRecipients([]);
      setComposeFollowerBroadcast(false);
      await loadInbox();
      setSelectedId(result.id);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not create this conversation.",
      );
    } finally {
      setCreating(false);
    }
  }, [
    client,
    composeBody,
    composeFollowerBroadcast,
    composeOptions?.candidates,
    composeRecipients,
    composeTitle,
    creating,
    loadInbox,
    mode,
    principal.displayName,
  ]);

  const recordMessageAction = useCallback(
    async (
      messageId: string,
      actionId: string,
      actionType: "acknowledge" | "quick-action",
      label?: string,
    ) => {
      if (label) setDraft(label);
      if (mode !== "live" || !client) return;
      try {
        await client.messaging.act.mutate({ messageId, actionId, actionType });
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Duna could not record that response.",
        );
      }
    },
    [client, mode],
  );

  const blockConversation = useCallback(() => {
    if (!client || !detail) return;
    const target = detail.participants
      .map((participant) => participant.principal)
      .find(
        (candidate) =>
          candidate.type !== "agent" &&
          !(candidate.type === principal.type && candidate.id === principal.id),
      );
    if (!target || target.type === "agent") return;
    const blockedPrincipalType: "user" | "organization" = target.type;
    Alert.alert(
      target.type === "organization"
        ? "Stop organization messages?"
        : "Block this member?",
      target.type === "organization"
        ? `You will no longer receive messages from ${target.displayName}. You can still use services you already booked.`
        : `${target.displayName} will no longer be able to message you.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: target.type === "organization" ? "Stop messages" : "Block",
          style: "destructive",
          onPress: () => {
            void client.messaging.block
              .mutate({
                blockedPrincipalType,
                blockedPrincipalId: target.id,
                blocked: true,
                reason: "Blocked by member in Duna Messaging",
              })
              .then(() => {
                setSelectedId(undefined);
                setDetail(undefined);
                return loadInbox();
              })
              .catch((reason: unknown) =>
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Duna could not update this preference.",
                ),
              );
          },
        },
      ],
    );
  }, [client, detail, loadInbox, principal.id, principal.type]);

  const inboxPane = (
    <View style={[styles.inboxPane, wide && styles.inboxPaneWide]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityLabel="Close Messages"
          onPress={onClose}
          style={styles.closeButton}
        >
          <Text style={styles.closeButtonText}>‹</Text>
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.eyebrow}>DUNA MESSAGING</Text>
          <Text style={styles.title}>Messages.</Text>
        </View>
        <Pressable
          accessibilityLabel="New conversation"
          onPress={() => setComposeOpen(true)}
          style={styles.newButton}
        >
          <Text style={styles.newButtonText}>＋</Text>
        </Pressable>
        {inbox && inbox.totalUnread > 0 && (
          <View style={styles.totalUnread}>
            <Text style={styles.totalUnreadText}>{inbox.totalUnread}</Text>
          </View>
        )}
      </View>
      <Text style={styles.inboxLead}>
        Event details, team updates, people you know, and Duna Support—all in
        one place.
      </Text>
      {mode === "live" && client && notificationsEnabled === false && (
        <View style={styles.notificationBanner}>
          <View style={styles.flex}>
            <Text style={styles.notificationTitle}>Message alerts</Text>
            <Text style={styles.notificationBody}>
              Get event and support updates when Duna is closed.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Turn on message alerts"
            disabled={enablingNotifications}
            onPress={() => void enableNotifications()}
            style={styles.notificationButton}
          >
            <Text style={styles.notificationButtonText}>
              {enablingNotifications ? "Turning on…" : "Turn on"}
            </Text>
          </Pressable>
        </View>
      )}
      {pending.length > 0 && (
        <Pressable
          onPress={() => void refreshAll()}
          style={styles.offlineBanner}
        >
          <Text style={styles.offlineBannerText}>
            {pending.length} message{pending.length === 1 ? "" : "s"} waiting ·
            Tap to retry
          </Text>
        </Pressable>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
      <ScrollView
        contentContainerStyle={styles.inboxList}
        refreshControl={
          <RefreshControl
            onRefresh={() => {
              setRefreshing(true);
              void refreshAll();
            }}
            refreshing={refreshing}
            tintColor={palette.accent}
          />
        }
      >
        {loading && !inbox ? (
          <ActivityIndicator color={palette.accent} style={styles.loading} />
        ) : inbox?.conversations.length ? (
          inbox.conversations.map((conversation) => (
            <ConversationRow
              conversation={conversation}
              key={conversation.id}
              onPress={() => setSelectedId(conversation.id)}
              palette={palette}
              selected={selectedId === conversation.id}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Nothing to catch up on.</Text>
            <Text style={styles.emptyBody}>
              Messages appear after a booking, registration, lesson, mutual
              follow, or support request.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const threadPane = detail ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={8}
      style={styles.threadPane}
    >
      <View style={styles.threadHeader}>
        {!wide && (
          <Pressable
            accessibilityLabel="Back to conversations"
            onPress={() => setSelectedId(undefined)}
            style={styles.threadBack}
          >
            <Text style={styles.threadBackText}>‹</Text>
          </Pressable>
        )}
        <View style={styles.threadMark}>
          <Text style={styles.threadMarkText}>
            {detail.conversation.type === "support"
              ? "✦"
              : detail.conversation.title.slice(0, 1)}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={styles.threadTitle}>
            {detail.conversation.title}
          </Text>
          <Text numberOfLines={1} style={styles.threadMeta}>
            {detail.conversation.context?.label ??
              `${detail.participants.length} participant${detail.participants.length === 1 ? "" : "s"}`}
          </Text>
        </View>
        {detail.permissions.canBlock && (
          <Pressable onPress={blockConversation} style={styles.threadMenu}>
            <Text style={styles.threadMenuText}>•••</Text>
          </Pressable>
        )}
      </View>
      {detail.conversation.safety.screeningRequired && (
        <View style={styles.safetyBanner}>
          <Text style={styles.safetyIcon}>✓</Text>
          <Text style={styles.safetyText}>
            Youth-safe thread · Messages are screened before delivery and
            verified guardians receive the same conversation.
          </Text>
        </View>
      )}
      {detail.conversation.type === "support" && (
        <View style={styles.aiBanner}>
          <Text style={styles.aiIcon}>✦</Text>
          <Text style={styles.aiText}>
            Duna Support can use your Duna events, lessons, rentals, and
            payments to help. Ask for a person at any time.
          </Text>
        </View>
      )}
      <ScrollView
        contentContainerStyle={styles.messages}
        onContentSizeChange={() =>
          threadScroll.current?.scrollToEnd({ animated: true })
        }
        ref={threadScroll}
      >
        {detail.messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            onAction={(messageId, actionId, actionType, label) =>
              void recordMessageAction(messageId, actionId, actionType, label)
            }
            palette={palette}
            principal={principal}
          />
        ))}
      </ScrollView>
      {detail.permissions.canPost ? (
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Message"
            multiline
            onChangeText={setDraft}
            onSubmitEditing={() => void send()}
            placeholder={
              detail.conversation.type === "support"
                ? "Ask Duna Support…"
                : "Write a message…"
            }
            placeholderTextColor={palette.muted}
            style={styles.composerInput}
            value={draft}
          />
          <Pressable
            accessibilityLabel="Send message"
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              (!draft.trim() || sending) && styles.sendButtonDisabled,
            ]}
          >
            <Text style={styles.sendButtonText}>{sending ? "…" : "↑"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.readOnlyBar}>
          <Text style={styles.readOnlyText}>
            {detail.permissions.reason ?? "Only moderators can post here."}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  ) : (
    <View style={styles.threadEmpty}>
      {selectedId ? (
        <ActivityIndicator color={palette.accent} />
      ) : (
        <>
          <Text style={styles.threadEmptyMark}>↗</Text>
          <Text style={styles.emptyTitle}>Choose a conversation.</Text>
          <Text style={styles.emptyBody}>
            Service messages stay tied to the event, lesson, rental, or
            relationship that made them relevant.
          </Text>
        </>
      )}
    </View>
  );

  return (
    <View style={styles.screen}>
      {wide ? (
        <View style={styles.wideLayout}>
          {inboxPane}
          {threadPane}
        </View>
      ) : selectedId ? (
        threadPane
      ) : (
        inboxPane
      )}
      <Modal
        animationType="slide"
        onRequestClose={() => setComposeOpen(false)}
        presentationStyle="pageSheet"
        visible={composeOpen}
      >
        <View style={styles.composeScreen}>
          <View style={styles.composeHeader}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>NEW CONVERSATION</Text>
              <Text style={styles.composeTitle}>Message people you know.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close new conversation"
              onPress={() => setComposeOpen(false)}
              style={styles.composeClose}
            >
              <Text style={styles.composeCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.composeContent}>
            <View style={styles.composePolicy}>
              <Text style={styles.composePolicyMark}>✓</Text>
              <Text style={styles.composePolicyText}>
                Member messages require a mutual follow. If a minor is included,
                Duna adds their verified guardian and screens every message
                before delivery.
              </Text>
            </View>
            {composeOptions?.canBroadcastFollowers && (
              <Pressable
                onPress={() => {
                  setComposeFollowerBroadcast((current) => !current);
                  setComposeRecipients([]);
                }}
                style={[
                  styles.composeChoice,
                  composeFollowerBroadcast && styles.composeChoiceSelected,
                ]}
              >
                <View
                  style={[
                    styles.composeRadio,
                    composeFollowerBroadcast && styles.composeRadioSelected,
                  ]}
                />
                <View style={styles.flex}>
                  <Text style={styles.composeChoiceTitle}>
                    All my followers
                  </Text>
                  <Text style={styles.composeChoiceMeta}>
                    {composeOptions.followerCount} follower
                    {composeOptions.followerCount === 1 ? "" : "s"} · Pro
                    broadcast
                  </Text>
                </View>
              </Pressable>
            )}
            {!composeFollowerBroadcast && (
              <>
                <Text style={styles.composeFieldLabel}>MUTUAL FOLLOWS</Text>
                {!composeOptions ? (
                  <ActivityIndicator color={palette.accent} />
                ) : composeOptions.candidates.length ? (
                  <View style={styles.composePeople}>
                    {composeOptions.candidates.map((candidate) => {
                      const selected = composeRecipients.includes(
                        candidate.principal.id,
                      );
                      return (
                        <Pressable
                          key={candidate.principal.id}
                          onPress={() =>
                            setComposeRecipients((current) =>
                              selected
                                ? current.filter(
                                    (id) => id !== candidate.principal.id,
                                  )
                                : [...current, candidate.principal.id],
                            )
                          }
                          style={[
                            styles.composePerson,
                            selected && styles.composePersonSelected,
                          ]}
                        >
                          <View style={styles.composePersonMark}>
                            <Text style={styles.composePersonMarkText}>
                              {candidate.principal.displayName
                                .slice(0, 1)
                                .toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.composePersonName}>
                              {candidate.principal.displayName}
                            </Text>
                            <Text style={styles.composePersonMeta}>
                              Mutual follow
                              {candidate.isMinor ? " · Guardian included" : ""}
                            </Text>
                          </View>
                          <Text style={styles.composeCheck}>
                            {selected ? "✓" : ""}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.composeEmpty}>
                    <Text style={styles.composeChoiceTitle}>
                      No mutual follows yet.
                    </Text>
                    <Text style={styles.composeChoiceMeta}>
                      You can reply in event groups, or follow each other before
                      starting a direct conversation.
                    </Text>
                  </View>
                )}
              </>
            )}
            <Text style={styles.composeFieldLabel}>
              CONVERSATION NAME · OPTIONAL
            </Text>
            <TextInput
              maxLength={160}
              onChangeText={setComposeTitle}
              placeholder={
                composeFollowerBroadcast
                  ? "A note for my followers"
                  : "Beach plans"
              }
              placeholderTextColor={palette.muted}
              style={styles.composeInput}
              value={composeTitle}
            />
            <Text style={styles.composeFieldLabel}>FIRST MESSAGE</Text>
            <TextInput
              maxLength={10_000}
              multiline
              onChangeText={setComposeBody}
              placeholder="Write the useful update…"
              placeholderTextColor={palette.muted}
              style={[styles.composeInput, styles.composeTextarea]}
              value={composeBody}
            />
            <Pressable
              disabled={
                !composeBody.trim() ||
                creating ||
                (!composeFollowerBroadcast && composeRecipients.length === 0)
              }
              onPress={() => void createConversation()}
              style={[
                styles.composeSubmit,
                (!composeBody.trim() ||
                  creating ||
                  (!composeFollowerBroadcast &&
                    composeRecipients.length === 0)) &&
                  styles.sendButtonDisabled,
              ]}
            >
              <Text style={styles.composeSubmitText}>
                {creating ? "Creating…" : "Create and send"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(palette: MessagingPalette) {
  return StyleSheet.create({
    screen: { backgroundColor: palette.canvas, flex: 1 },
    wideLayout: { flex: 1, flexDirection: "row" },
    flex: { flex: 1, minWidth: 0 },
    rowBetween: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    inboxPane: { backgroundColor: palette.canvas, flex: 1 },
    inboxPaneWide: {
      borderRightColor: palette.border,
      borderRightWidth: 1,
      flex: 0,
      width: 360,
    },
    topBar: {
      alignItems: "center",
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 18,
      paddingTop: 14,
    },
    closeButton: {
      alignItems: "center",
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    closeButtonText: { color: palette.text, fontSize: 34, lineHeight: 36 },
    eyebrow: {
      color: palette.accent,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    title: {
      color: palette.text,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -1.1,
      lineHeight: 34,
    },
    totalUnread: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 18,
      minHeight: 36,
      justifyContent: "center",
      minWidth: 36,
      paddingHorizontal: 9,
    },
    totalUnreadText: {
      color: palette.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    newButton: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 18,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    newButtonText: { color: palette.onAccent, fontSize: 24, fontWeight: "900" },
    inboxLead: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 19,
      paddingHorizontal: 20,
      paddingTop: 14,
    },
    notificationBanner: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      marginHorizontal: 14,
      marginTop: 12,
      padding: 12,
    },
    notificationTitle: {
      color: palette.text,
      fontSize: 13,
      fontWeight: "900",
    },
    notificationBody: {
      color: palette.muted,
      fontSize: 11,
      lineHeight: 16,
      marginTop: 2,
    },
    notificationButton: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 48,
      minWidth: 84,
      paddingHorizontal: 14,
    },
    notificationButtonText: {
      color: palette.onAccent,
      fontSize: 11,
      fontWeight: "900",
    },
    inboxList: { gap: 8, padding: 14, paddingBottom: 34 },
    loading: { marginTop: 48 },
    conversationRow: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 12,
      minHeight: 92,
      padding: 13,
    },
    conversationRowSelected: { borderColor: palette.accent, borderWidth: 1.5 },
    conversationMark: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 20,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    conversationMarkText: {
      color: palette.accent,
      fontSize: 17,
      fontWeight: "900",
    },
    conversationTitle: {
      color: palette.text,
      flex: 1,
      fontSize: 14,
      fontWeight: "900",
    },
    conversationPreview: {
      color: palette.muted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },
    conversationMetaRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
    },
    contextLabel: {
      color: palette.accent,
      flexShrink: 1,
      fontSize: 10,
      fontWeight: "800",
    },
    safeLabel: {
      color: palette.positive,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    timeText: { color: palette.muted, fontSize: 10, marginLeft: 6 },
    unreadBadge: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 10,
      justifyContent: "center",
      minHeight: 20,
      minWidth: 20,
      paddingHorizontal: 5,
    },
    unreadText: { color: palette.onAccent, fontSize: 10, fontWeight: "900" },
    offlineBanner: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.warning,
      borderRadius: 12,
      borderWidth: 1,
      marginHorizontal: 18,
      marginTop: 12,
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    offlineBannerText: {
      color: palette.warning,
      fontSize: 11,
      fontWeight: "800",
    },
    errorText: {
      color: palette.danger,
      fontSize: 11,
      lineHeight: 16,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    emptyState: {
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 24,
      paddingTop: 60,
    },
    emptyTitle: {
      color: palette.text,
      fontSize: 20,
      fontWeight: "900",
      textAlign: "center",
    },
    emptyBody: {
      color: palette.muted,
      fontSize: 13,
      lineHeight: 20,
      maxWidth: 340,
      textAlign: "center",
    },
    threadPane: { backgroundColor: palette.surfaceAlt, flex: 1 },
    threadHeader: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 68,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    threadBack: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: 42,
    },
    threadBackText: { color: palette.text, fontSize: 34, lineHeight: 36 },
    threadMark: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 18,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    threadMarkText: { color: palette.accent, fontSize: 15, fontWeight: "900" },
    threadTitle: { color: palette.text, fontSize: 15, fontWeight: "900" },
    threadMeta: { color: palette.muted, fontSize: 10, marginTop: 3 },
    threadMenu: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    threadMenuText: {
      color: palette.muted,
      fontSize: 16,
      fontWeight: "900",
      letterSpacing: 1,
    },
    safetyBanner: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 9,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    safetyIcon: { color: palette.positive, fontSize: 13, fontWeight: "900" },
    safetyText: { color: palette.muted, flex: 1, fontSize: 10, lineHeight: 15 },
    aiBanner: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 9,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    aiIcon: { color: palette.accent, fontSize: 15, fontWeight: "900" },
    aiText: { color: palette.muted, flex: 1, fontSize: 10, lineHeight: 15 },
    messages: {
      flexGrow: 1,
      gap: 14,
      justifyContent: "flex-end",
      padding: 16,
      paddingBottom: 24,
    },
    messageWrap: { alignSelf: "flex-start", maxWidth: "86%" },
    messageWrapMine: { alignSelf: "flex-end" },
    senderName: {
      color: palette.muted,
      fontSize: 10,
      fontWeight: "800",
      marginBottom: 4,
      marginLeft: 8,
    },
    bubble: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 18,
      borderBottomLeftRadius: 5,
      borderWidth: 1,
      gap: 9,
      padding: 12,
    },
    bubbleMine: {
      backgroundColor: palette.accent,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 5,
      borderColor: palette.accent,
    },
    messageBody: { color: palette.text, fontSize: 14, lineHeight: 20 },
    messageBodyMine: { color: palette.onAccent },
    messageStatusRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    messageTime: { color: palette.muted, fontSize: 10 },
    messageTimeMine: { color: palette.onAccent, opacity: 0.72 },
    screeningLabel: { color: palette.warning, fontSize: 10, fontWeight: "800" },
    heldLabel: { color: palette.danger, fontSize: 10, fontWeight: "800" },
    widget: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 13,
      borderWidth: 1,
      gap: 7,
      minWidth: 230,
      padding: 12,
    },
    widgetEyebrow: {
      color: palette.accent,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    widgetTitle: {
      color: palette.text,
      fontSize: 14,
      fontWeight: "900",
      lineHeight: 18,
    },
    widgetBody: { color: palette.muted, fontSize: 11, lineHeight: 16 },
    widgetMeta: { color: palette.accent, fontSize: 10, fontWeight: "800" },
    widgetAmount: {
      color: palette.text,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    widgetPrimary: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 12,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 14,
    },
    widgetPrimaryText: {
      color: palette.onAccent,
      fontSize: 11,
      fontWeight: "900",
    },
    widgetSecondary: {
      alignItems: "center",
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 44,
      paddingHorizontal: 14,
    },
    widgetSecondaryText: {
      color: palette.text,
      fontSize: 11,
      fontWeight: "900",
    },
    quickActions: { gap: 7 },
    scoreRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginTop: 4,
    },
    scoreTeam: {
      color: palette.muted,
      flex: 1,
      fontSize: 10,
      fontWeight: "800",
    },
    scoreTeamRight: { textAlign: "right" },
    scoreValue: { color: palette.text, fontSize: 22, fontWeight: "900" },
    scoreDash: { color: palette.muted, fontSize: 13 },
    composer: {
      alignItems: "flex-end",
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 9,
      padding: 10,
    },
    composerInput: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      color: palette.text,
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      maxHeight: 120,
      minHeight: 48,
      paddingHorizontal: 15,
      paddingVertical: 13,
    },
    sendButton: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    sendButtonDisabled: { opacity: 0.38 },
    sendButtonText: {
      color: palette.onAccent,
      fontSize: 24,
      fontWeight: "900",
    },
    readOnlyBar: {
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      borderTopWidth: 1,
      padding: 16,
    },
    readOnlyText: { color: palette.muted, fontSize: 11, textAlign: "center" },
    threadEmpty: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      flex: 1,
      gap: 10,
      justifyContent: "center",
      padding: 30,
    },
    threadEmptyMark: { color: palette.accent, fontSize: 34, fontWeight: "900" },
    composeScreen: {
      backgroundColor: palette.canvas,
      flex: 1,
      paddingTop: Platform.OS === "android" ? 18 : 0,
    },
    composeHeader: {
      alignItems: "center",
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      padding: 18,
    },
    composeTitle: {
      color: palette.text,
      fontSize: 24,
      fontWeight: "900",
      letterSpacing: -0.7,
    },
    composeClose: {
      alignItems: "center",
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    composeCloseText: { color: palette.text, fontSize: 28, lineHeight: 30 },
    composeContent: { gap: 12, padding: 18, paddingBottom: 48 },
    composePolicy: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      padding: 14,
    },
    composePolicyMark: {
      color: palette.positive,
      fontSize: 15,
      fontWeight: "900",
    },
    composePolicyText: {
      color: palette.muted,
      flex: 1,
      fontSize: 11,
      lineHeight: 17,
    },
    composeChoice: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 15,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 66,
      padding: 12,
    },
    composeChoiceSelected: { borderColor: palette.accent, borderWidth: 1.5 },
    composeRadio: {
      borderColor: palette.muted,
      borderRadius: 8,
      borderWidth: 1.5,
      height: 16,
      width: 16,
    },
    composeRadioSelected: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    composeChoiceTitle: {
      color: palette.text,
      fontSize: 13,
      fontWeight: "900",
    },
    composeChoiceMeta: {
      color: palette.muted,
      fontSize: 10,
      lineHeight: 15,
      marginTop: 3,
    },
    composeFieldLabel: {
      color: palette.accent,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
      marginTop: 8,
    },
    composePeople: { gap: 7 },
    composePerson: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 62,
      padding: 10,
    },
    composePersonSelected: { borderColor: palette.accent },
    composePersonMark: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 18,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    composePersonMarkText: {
      color: palette.accent,
      fontSize: 13,
      fontWeight: "900",
    },
    composePersonName: { color: palette.text, fontSize: 12, fontWeight: "900" },
    composePersonMeta: { color: palette.muted, fontSize: 10, marginTop: 3 },
    composeCheck: {
      color: palette.positive,
      fontSize: 15,
      fontWeight: "900",
      width: 20,
    },
    composeEmpty: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      padding: 14,
    },
    composeInput: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      color: palette.text,
      fontSize: 14,
      minHeight: 50,
      paddingHorizontal: 14,
      paddingVertical: 13,
    },
    composeTextarea: { minHeight: 118, textAlignVertical: "top" },
    composeSubmit: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 14,
      justifyContent: "center",
      marginTop: 8,
      minHeight: 52,
      paddingHorizontal: 20,
    },
    composeSubmitText: {
      color: palette.onAccent,
      fontSize: 13,
      fontWeight: "900",
    },
  });
}
