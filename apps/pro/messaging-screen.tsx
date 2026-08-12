import {
  demoConversationDetail,
  demoMessagingInbox,
  type ConversationContext,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSummary,
  type MessageWidget,
  type MessagingInbox,
  type MessagingPrincipal,
  type OutboxItem,
  type SendMessageInput,
} from "@duna/messaging-client";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
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
import { createProMessagingOutbox } from "./messaging-outbox";
import {
  messagingNotificationsEnabled,
  registerMessagingNotifications,
} from "./messaging-notifications";
import { useProRuntime } from "./runtime";

export interface ProMessagingPalette {
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

interface ProMessagingScreenProps {
  readonly initialAudienceKey?: string;
  readonly initialConversationId?: string;
  readonly initialPersonId?: string;
  readonly onClose: () => void;
  readonly palette: ProMessagingPalette;
}

type AudienceOption = {
  readonly key: string;
  readonly label: string;
  readonly meta: string;
  readonly conversationType: "group" | "event" | "division" | "league";
  readonly context?: ConversationContext;
};

function timeLabel(value: string) {
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function WidgetCard({
  palette,
  widget,
}: {
  readonly palette: ProMessagingPalette;
  readonly widget: MessageWidget;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const label =
    widget.kind === "schedule-change"
      ? "SCHEDULE UPDATE"
      : widget.kind === "payment-request"
        ? "PAYMENT REQUEST"
        : widget.kind === "form-request"
          ? "FORM REQUEST"
          : widget.kind === "score-update"
            ? `MATCH · ${widget.status.toUpperCase()}`
            : widget.kind === "event-update"
              ? "EVENT UPDATE"
              : "QUICK ACTIONS";
  return (
    <View style={styles.widget}>
      <Text style={styles.widgetEyebrow}>{label}</Text>
      {"title" in widget && widget.title && (
        <Text style={styles.widgetTitle}>{widget.title}</Text>
      )}
      {widget.kind === "schedule-change" && (
        <Text style={styles.widgetBody}>
          {new Date(widget.startsAt).toLocaleString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </Text>
      )}
      {widget.kind === "event-update" && (
        <Text style={styles.widgetBody}>{widget.detail}</Text>
      )}
      {widget.kind === "payment-request" && (
        <Text style={styles.widgetAmount}>
          {new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: widget.currency,
          }).format(widget.amountMinor / 100)}
        </Text>
      )}
      {widget.kind === "form-request" && (
        <Text style={styles.widgetBody}>{widget.description}</Text>
      )}
      {widget.kind === "score-update" && (
        <Text style={styles.widgetScore}>
          {widget.homeLabel} {widget.homeScore} – {widget.awayScore}{" "}
          {widget.awayLabel}
        </Text>
      )}
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
  readonly palette: ProMessagingPalette;
  readonly selected: boolean;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.conversationRow,
        selected && styles.conversationRowSelected,
      ]}
    >
      <View style={styles.conversationMark}>
        <Text style={styles.conversationMarkText}>
          {conversation.title.slice(0, 1).toUpperCase()}
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
          {conversation.lastMessage?.body ?? "Start the update"}
        </Text>
        <View style={styles.rowMeta}>
          <Text numberOfLines={1} style={styles.contextLabel}>
            {conversation.context?.label ??
              `${conversation.participants.length} people`}
          </Text>
          {conversation.safety.minorPresent && (
            <Text style={styles.safetyLabel}>GUARDIAN-COVERED</Text>
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
  organizationId,
  palette,
}: {
  readonly message: ConversationMessage;
  readonly organizationId: string;
  readonly palette: ProMessagingPalette;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const mine =
    message.sender.type === "organization" &&
    message.sender.id === organizationId;
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
            key={`${message.id}:${index}`}
            palette={palette}
            widget={widget}
          />
        ))}
        <View style={styles.messageMeta}>
          <Text style={[styles.messageTime, mine && styles.messageTimeMine]}>
            {timeLabel(message.createdAt)}
          </Text>
          {message.status === "screening" && (
            <Text style={styles.screeningText}>Safety screening…</Text>
          )}
          {message.status === "held" && (
            <Text style={styles.heldText}>Held for review</Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function ProMessagingScreen({
  initialAudienceKey,
  initialConversationId,
  initialPersonId,
  onClose,
  palette,
}: ProMessagingScreenProps) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { width } = useWindowDimensions();
  const wide = width >= 820;
  const runtime = useProRuntime();
  const organization = runtime.dashboard?.organization;
  const organizationId =
    organization?.id ?? "37f7252f-e9c6-4bf9-8286-4d06eb4767ea";
  const principal = useMemo<MessagingPrincipal>(
    () => ({
      type: "organization",
      id: organizationId,
      displayName: organization?.name ?? "Duna Beach Club",
    }),
    [organization?.name, organizationId],
  );
  const outbox = useMemo(
    () => createProMessagingOutbox(organizationId),
    [organizationId],
  );
  const [inbox, setInbox] = useState<MessagingInbox>();
  const [selectedId, setSelectedId] = useState<string>();
  const [detail, setDetail] = useState<ConversationDetail>();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<readonly OutboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [audienceKey, setAudienceKey] = useState("organization");
  const [selectedPeople, setSelectedPeople] = useState<readonly string[]>([]);
  const [creating, setCreating] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>();
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const threadScroll = useRef<ScrollView>(null);
  const initialPersonApplied = useRef(false);
  const initialAudienceApplied = useRef(false);

  const audiences = useMemo<readonly AudienceOption[]>(() => {
    const organizationOption: AudienceOption = {
      key: "organization",
      label: "Everyone in the organization",
      meta: "Active players, guardians, coaches, and directors",
      conversationType: "group",
      context: {
        type: "organization",
        id: organizationId,
        label: organization?.name ?? "Organization",
        organizationId,
      },
    };
    const eventOptions = (runtime.events ?? []).flatMap((event) => {
      const workspaceSession = runtime.workspace?.sessions.find(
        (session) => session.id === event.id,
      );
      const contextType: ConversationContext["type"] =
        event.kind === "league"
          ? "league"
          : event.kind === "private-lesson"
            ? "lesson"
            : "event";
      const option: AudienceOption = {
        key: `event:${event.id}`,
        label: event.title,
        meta: `${event.kind.replaceAll("-", " ")} · ${event.attendees?.length ?? 0} visible attendees`,
        conversationType: event.kind === "league" ? "league" : "event",
        context: {
          type: contextType,
          id:
            event.kind === "league" && workspaceSession?.programId
              ? workspaceSession.programId
              : event.id,
          label: event.title,
          organizationId,
        },
      };
      const divisions: AudienceOption[] = (event.divisions ?? []).map(
        (division) => ({
          key: `division:${division.id}`,
          label: `${event.title} · ${division.name}`,
          meta: "Registered players in this division",
          conversationType: "division",
          context: {
            type: "division",
            id: division.id,
            label: `${event.title} · ${division.name}`,
            organizationId,
          },
        }),
      );
      return [option, ...divisions];
    });
    const publishedEventIds = new Set(
      (runtime.events ?? []).map((event) => event.id),
    );
    const workspaceSessionOptions: AudienceOption[] = (
      runtime.workspace?.sessions ?? []
    )
      .filter((session) => !publishedEventIds.has(session.id))
      .map((session) => {
        const contextType: ConversationContext["type"] =
          session.kind === "league"
            ? "league"
            : session.kind === "private-lesson"
              ? "lesson"
              : "event";
        return {
          key: `event:${session.id}`,
          label: session.title,
          meta: `${session.kind.replaceAll("-", " ")} · ${session.analytics.registrations} registrations`,
          conversationType: session.kind === "league" ? "league" : "event",
          context: {
            type: contextType,
            id:
              session.kind === "league" && session.programId
                ? session.programId
                : session.id,
            label: session.title,
            organizationId,
          },
        };
      });
    const rentalOptions: AudienceOption[] = (
      runtime.workspace?.calendar.entries ?? []
    )
      .filter((entry) => entry.sourceType === "booking")
      .map((entry) => ({
        key: `rental:${entry.id}`,
        label: entry.title,
        meta: `${entry.participantCount} rental participant${entry.participantCount === 1 ? "" : "s"}`,
        conversationType: "event",
        context: {
          type: "rental",
          id: entry.id,
          label: entry.title,
          organizationId,
        },
      }));
    return [
      organizationOption,
      ...eventOptions,
      ...workspaceSessionOptions,
      ...rentalOptions,
      {
        key: "specific",
        label: "Specific people",
        meta: "Choose only people already connected to this organization",
        conversationType: "group",
      },
    ];
  }, [organization?.name, organizationId, runtime.events, runtime.workspace]);

  const relatedPeople = useMemo(() => {
    const people = new Map<
      string,
      {
        readonly personId: string;
        readonly displayName: string;
        readonly isMinor: boolean;
        readonly detail: string;
      }
    >();
    for (const person of runtime.workspace?.people ?? []) {
      people.set(person.personId, {
        personId: person.personId,
        displayName: person.displayName,
        isMinor: person.isMinor,
        detail: person.roles.join(" · "),
      });
    }
    for (const person of runtime.workspace?.staff ?? []) {
      if (!person.active) continue;
      people.set(person.personId, {
        personId: person.personId,
        displayName: person.displayName,
        isMinor: false,
        detail: `${person.role.replaceAll("-", " ")} · organization staff`,
      });
    }
    for (const person of runtime.workspace?.messageRecipients ?? []) {
      people.set(person.id, {
        personId: person.id,
        displayName: person.displayName,
        isMinor: person.isMinor,
        detail: person.isMinor
          ? `${person.verifiedGuardianCount} verified guardian${person.verifiedGuardianCount === 1 ? "" : "s"}`
          : "Related through Duna",
      });
    }
    return [...people.values()].sort((left, right) =>
      left.displayName.localeCompare(right.displayName),
    );
  }, [runtime.workspace]);

  useEffect(() => {
    if (!initialPersonId || initialPersonApplied.current) return;
    const person = relatedPeople.find(
      (candidate) => candidate.personId === initialPersonId,
    );
    if (!person) return;
    initialPersonApplied.current = true;
    setAudienceKey("specific");
    setSelectedPeople([person.personId]);
    setComposeTitle(`Message ${person.displayName}`);
    setComposeOpen(true);
  }, [initialPersonId, relatedPeople]);

  useEffect(() => {
    if (!initialAudienceKey || initialAudienceApplied.current) return;
    const audience = audiences.find(
      (candidate) => candidate.key === initialAudienceKey,
    );
    if (!audience) return;
    initialAudienceApplied.current = true;
    setAudienceKey(audience.key);
    setComposeTitle(audience.label);
    setComposeOpen(true);
  }, [audiences, initialAudienceKey]);

  const loadInbox = useCallback(async () => {
    const nextInbox =
      runtime.mode === "preview" || !runtime.client
        ? demoMessagingInbox(principal)
        : await runtime.client.messaging.inbox.query({
            asPrincipal: "organization",
          });
    setInbox(nextInbox);
    setSelectedId((current) => {
      if (
        current &&
        nextInbox.conversations.some((item) => item.id === current)
      ) {
        return current;
      }
      return initialConversationId &&
        nextInbox.conversations.some(
          (item) => item.id === initialConversationId,
        )
        ? initialConversationId
        : undefined;
    });
    return nextInbox;
  }, [initialConversationId, principal, runtime.client, runtime.mode]);

  const loadConversation = useCallback(
    async (conversationId: string) => {
      const nextDetail =
        runtime.mode === "preview" || !runtime.client
          ? demoConversationDetail(conversationId)
          : await runtime.client.messaging.conversation.query({
              asPrincipal: "organization",
              conversationId,
            });
      setDetail(nextDetail);
      const sequence = nextDetail.messages.at(-1)?.seq ?? 0;
      if (sequence > 0 && runtime.mode === "live" && runtime.client) {
        if (runtime.messagingDelivery) {
          runtime.messagingDelivery.queueRead(conversationId, sequence);
        } else {
          void runtime.client.messaging.markRead
            .mutate({
              asPrincipal: "organization",
              conversationId,
              sequence,
            })
            .catch(() => undefined);
        }
      }
      return nextDetail;
    },
    [runtime.client, runtime.messagingDelivery, runtime.mode],
  );

  const flushOutbox = useCallback(async () => {
    const items = await outbox.pending();
    setPending(items);
    if (runtime.mode !== "live" || !runtime.client || items.length === 0)
      return 0;
    let sent = 0;
    for (const item of items) {
      await outbox.markSending(item.input.clientMessageId);
      try {
        await runtime.client.messaging.send.mutate({
          asPrincipal: "organization",
          message: item.input,
        });
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
  }, [outbox, runtime.client, runtime.mode]);

  const refreshAll = useCallback(async () => {
    setError(undefined);
    try {
      await loadInbox();
      await flushOutbox();
      if (selectedId) await loadConversation(selectedId);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Messages could not sync. On-device drafts remain safe.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [flushOutbox, loadConversation, loadInbox, selectedId]);

  useEffect(() => void refreshAll(), [refreshAll]);

  useEffect(() => {
    if (runtime.mode !== "live" || !runtime.client) return;
    void messagingNotificationsEnabled()
      .then(setNotificationsEnabled)
      .catch(() => setNotificationsEnabled(false));
  }, [runtime.client, runtime.mode]);

  const enableNotifications = useCallback(async () => {
    if (!runtime.client || enablingNotifications) return;
    setEnablingNotifications(true);
    setError(undefined);
    try {
      const enabled = await registerMessagingNotifications(
        runtime.client,
        true,
      );
      setNotificationsEnabled(enabled);
      if (!enabled) {
        setError("Message alerts are unavailable on this device.");
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna Pro could not turn on message alerts.",
      );
    } finally {
      setEnablingNotifications(false);
    }
  }, [enablingNotifications, runtime.client]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      return;
    }
    setDetail(undefined);
    void loadConversation(selectedId).catch((reason: unknown) =>
      setError(
        reason instanceof Error ? reason.message : "Conversation unavailable",
      ),
    );
  }, [loadConversation, selectedId]);

  useEffect(() => {
    if (runtime.mode === "live" && runtime.messagingDelivery) {
      const delivery = runtime.messagingDelivery;
      const unsubscribe = delivery.onWakeUp(() => {
        void refreshAll();
      });
      delivery.connect();
      if (selectedId) {
        void delivery.syncConversation(selectedId).catch(() => undefined);
      }
      const subscription = AppState.addEventListener("change", (state) => {
        if (state !== "active") return;
        void delivery.syncAll().catch(() => undefined);
        if (selectedId) {
          void delivery.syncConversation(selectedId).catch(() => undefined);
        }
      });
      return () => {
        subscription.remove();
        unsubscribe();
        delivery.disconnect();
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
  }, [refreshAll, runtime.messagingDelivery, runtime.mode, selectedId]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !selectedId || sending) return;
    const input: SendMessageInput = {
      conversationId: selectedId,
      clientMessageId: Crypto.randomUUID(),
      kind: "text",
      body,
      widgets: [],
      attachmentUploadIds: [],
    };
    const optimistic: ConversationMessage = {
      id: input.clientMessageId,
      conversationId: selectedId,
      clientMessageId: input.clientMessageId,
      seq: (detail?.messages.at(-1)?.seq ?? 0) + 1,
      sender: principal,
      kind: "text",
      body,
      widgets: [],
      attachments: [],
      status: detail?.conversation.safety.screeningRequired
        ? "screening"
        : "published",
      moderationState: detail?.conversation.safety.screeningRequired
        ? "screening"
        : "not-required",
      createdAt: new Date().toISOString(),
    };
    setDraft("");
    setDetail((current) =>
      current
        ? { ...current, messages: [...current.messages, optimistic] }
        : current,
    );
    if (runtime.mode === "preview") return;
    await outbox.enqueue(input);
    setPending(await outbox.pending());
    setSending(true);
    try {
      if ((await flushOutbox()) > 0) {
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
    loadConversation,
    loadInbox,
    outbox,
    principal,
    runtime.mode,
    selectedId,
    sending,
  ]);

  const createConversation = useCallback(async () => {
    const title = composeTitle.trim();
    const body = composeBody.trim();
    const audience = audiences.find((item) => item.key === audienceKey);
    if (!title || !body || !audience || creating) return;
    if (audience.key === "specific" && selectedPeople.length === 0) {
      setError("Choose at least one person for this conversation.");
      return;
    }
    if (runtime.mode === "preview" || !runtime.client) {
      setComposeOpen(false);
      setComposeTitle("");
      setComposeBody("");
      return;
    }
    setCreating(true);
    setError(undefined);
    try {
      const result = await runtime.client.messaging.create.mutate({
        asPrincipal: "organization",
        conversation: {
          type: audience.conversationType,
          title,
          recipientPersonIds:
            audience.key === "specific" ? [...selectedPeople] : [],
          ...(audience.context ? { context: audience.context } : {}),
          announcementOnly: false,
          followerBroadcast: false,
          initialMessage: body,
          clientMessageId: Crypto.randomUUID(),
        },
      });
      setComposeOpen(false);
      setComposeTitle("");
      setComposeBody("");
      setSelectedPeople([]);
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
    audienceKey,
    audiences,
    composeBody,
    composeTitle,
    creating,
    loadInbox,
    runtime.client,
    runtime.mode,
    selectedPeople,
  ]);

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
          <Text style={styles.eyebrow}>DUNA PRO · SERVICE MESSAGING</Text>
          <Text style={styles.title}>Messages.</Text>
        </View>
        <Pressable
          onPress={() => setComposeOpen(true)}
          style={styles.newButton}
        >
          <Text style={styles.newButtonText}>＋</Text>
        </Pressable>
      </View>
      <Text style={styles.inboxLead}>
        Send operational updates to people connected to this organization.
        Marketing outreach is not allowed here.
      </Text>
      {runtime.mode === "live" &&
        runtime.client &&
        notificationsEnabled === false && (
          <View style={styles.notificationBanner}>
            <View style={styles.flex}>
              <Text style={styles.notificationTitle}>Message alerts</Text>
              <Text style={styles.notificationBody}>
                Get service updates when Duna Pro is closed.
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
          <Text style={styles.offlineText}>
            {pending.length} waiting to send · Tap to retry
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
              selected={conversation.id === selectedId}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No conversations yet.</Text>
            <Text style={styles.emptyBody}>
              Start with an event, division, league, organization audience, or a
              few specific people.
            </Text>
            <Pressable
              onPress={() => setComposeOpen(true)}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>Create conversation</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );

  const threadPane = detail ? (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.threadPane}
    >
      <View style={styles.threadHeader}>
        {!wide && (
          <Pressable
            onPress={() => setSelectedId(undefined)}
            style={styles.threadBack}
          >
            <Text style={styles.threadBackText}>‹</Text>
          </Pressable>
        )}
        <View style={styles.threadMark}>
          <Text style={styles.threadMarkText}>
            {detail.conversation.title.slice(0, 1)}
          </Text>
        </View>
        <View style={styles.flex}>
          <Text numberOfLines={1} style={styles.threadTitle}>
            {detail.conversation.title}
          </Text>
          <Text numberOfLines={1} style={styles.threadMeta}>
            {detail.conversation.context?.label ??
              `${detail.participants.length} participants`}
          </Text>
        </View>
      </View>
      {detail.conversation.safety.minorPresent && (
        <View style={styles.safetyBanner}>
          <Text style={styles.safetyIcon}>✓</Text>
          <Text style={styles.safetyText}>
            Minor present · Every message is screened before delivery and copied
            to verified guardians.
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
            organizationId={organizationId}
            palette={palette}
          />
        ))}
      </ScrollView>
      {detail.permissions.canPost ? (
        <View style={styles.composer}>
          <TextInput
            multiline
            onChangeText={setDraft}
            placeholder="Share an operational update…"
            placeholderTextColor={palette.muted}
            style={styles.composerInput}
            value={draft}
          />
          <Pressable
            disabled={!draft.trim() || sending}
            onPress={() => void send()}
            style={[
              styles.sendButton,
              (!draft.trim() || sending) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.sendButtonText}>{sending ? "…" : "↑"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.readOnlyBar}>
          <Text style={styles.readOnlyText}>
            {detail.permissions.reason ??
              "Posting is unavailable in this conversation."}
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
            Group history remains attached to the event, division, league,
            lesson, or rental.
          </Text>
        </>
      )}
    </View>
  );

  const selectedAudience = audiences.find((item) => item.key === audienceKey);

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
              <Text style={styles.eyebrow}>NEW SERVICE CONVERSATION</Text>
              <Text style={styles.composeTitle}>Who needs the update?</Text>
            </View>
            <Pressable
              onPress={() => setComposeOpen(false)}
              style={styles.composeClose}
            >
              <Text style={styles.composeCloseText}>×</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.composeContent}>
            <View style={styles.policyCard}>
              <Text style={styles.policyMark}>✓</Text>
              <View style={styles.flex}>
                <Text style={styles.policyTitle}>Relationship required</Text>
                <Text style={styles.policyBody}>
                  Duna resolves recipients on the server from registrations,
                  lessons, rentals, memberships, and other existing
                  relationships. This is not a marketing tool.
                </Text>
              </View>
            </View>
            <Text style={styles.fieldLabel}>AUDIENCE</Text>
            <View style={styles.audienceList}>
              {audiences.map((audience) => (
                <Pressable
                  key={audience.key}
                  onPress={() => setAudienceKey(audience.key)}
                  style={[
                    styles.audienceRow,
                    audience.key === audienceKey && styles.audienceRowSelected,
                  ]}
                >
                  <View
                    style={[
                      styles.radio,
                      audience.key === audienceKey && styles.radioSelected,
                    ]}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.audienceTitle}>{audience.label}</Text>
                    <Text style={styles.audienceMeta}>{audience.meta}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
            {selectedAudience?.key === "specific" && (
              <>
                <Text style={styles.fieldLabel}>PEOPLE</Text>
                <View style={styles.peopleList}>
                  {relatedPeople.map((person) => {
                    const selected = selectedPeople.includes(person.personId);
                    return (
                      <Pressable
                        key={person.personId}
                        onPress={() =>
                          setSelectedPeople((current) =>
                            selected
                              ? current.filter((id) => id !== person.personId)
                              : [...current, person.personId],
                          )
                        }
                        style={[
                          styles.personRow,
                          selected && styles.personRowSelected,
                        ]}
                      >
                        <View style={styles.personMark}>
                          <Text style={styles.personMarkText}>
                            {person.displayName.slice(0, 1).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.flex}>
                          <Text style={styles.personName}>
                            {person.displayName}
                          </Text>
                          <Text style={styles.personMeta}>
                            {person.detail}
                            {person.isMinor ? " · Guardian required" : ""}
                          </Text>
                        </View>
                        <Text style={styles.personCheck}>
                          {selected ? "✓" : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
            <Text style={styles.fieldLabel}>CONVERSATION NAME</Text>
            <TextInput
              onChangeText={setComposeTitle}
              placeholder="Saturday schedule update"
              placeholderTextColor={palette.muted}
              style={styles.fieldInput}
              value={composeTitle}
            />
            <Text style={styles.fieldLabel}>FIRST MESSAGE</Text>
            <TextInput
              multiline
              onChangeText={setComposeBody}
              placeholder="Share the information people need…"
              placeholderTextColor={palette.muted}
              style={[styles.fieldInput, styles.fieldTextarea]}
              value={composeBody}
            />
            <Pressable
              disabled={
                !composeTitle.trim() ||
                !composeBody.trim() ||
                creating ||
                (selectedAudience?.key === "specific" &&
                  selectedPeople.length === 0)
              }
              onPress={() => void createConversation()}
              style={[
                styles.primaryButton,
                (!composeTitle.trim() ||
                  !composeBody.trim() ||
                  creating ||
                  (selectedAudience?.key === "specific" &&
                    selectedPeople.length === 0)) &&
                  styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {creating ? "Creating…" : "Create and send"}
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(palette: ProMessagingPalette) {
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
      width: 380,
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
      letterSpacing: 1.1,
    },
    title: {
      color: palette.text,
      fontSize: 30,
      fontWeight: "900",
      letterSpacing: -1.1,
      lineHeight: 34,
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
    timeText: { color: palette.muted, fontSize: 10, marginLeft: 6 },
    rowMeta: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
    },
    contextLabel: {
      color: palette.accent,
      flex: 1,
      fontSize: 10,
      fontWeight: "800",
    },
    safetyLabel: { color: palette.positive, fontSize: 10, fontWeight: "900" },
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
    offlineText: { color: palette.warning, fontSize: 11, fontWeight: "800" },
    errorText: {
      color: palette.danger,
      fontSize: 11,
      lineHeight: 16,
      paddingHorizontal: 20,
      paddingTop: 10,
    },
    emptyState: {
      alignItems: "center",
      gap: 10,
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
      maxWidth: 350,
      textAlign: "center",
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 14,
      justifyContent: "center",
      marginTop: 8,
      minHeight: 52,
      paddingHorizontal: 20,
    },
    primaryButtonText: {
      color: palette.onAccent,
      fontSize: 13,
      fontWeight: "900",
    },
    buttonDisabled: { opacity: 0.38 },
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
    messageMeta: { alignItems: "center", flexDirection: "row", gap: 8 },
    messageTime: { color: palette.muted, fontSize: 10 },
    messageTimeMine: { color: palette.onAccent, opacity: 0.72 },
    screeningText: { color: palette.warning, fontSize: 10, fontWeight: "800" },
    heldText: { color: palette.danger, fontSize: 10, fontWeight: "800" },
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
    widgetAmount: { color: palette.text, fontSize: 24, fontWeight: "900" },
    widgetScore: { color: palette.text, fontSize: 15, fontWeight: "900" },
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
    policyCard: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      padding: 14,
    },
    policyMark: { color: palette.positive, fontSize: 15, fontWeight: "900" },
    policyTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
    policyBody: {
      color: palette.muted,
      fontSize: 11,
      lineHeight: 17,
      marginTop: 4,
    },
    fieldLabel: {
      color: palette.accent,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.9,
      marginTop: 8,
    },
    audienceList: { gap: 7 },
    audienceRow: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 62,
      padding: 12,
    },
    audienceRowSelected: { borderColor: palette.accent, borderWidth: 1.5 },
    radio: {
      borderColor: palette.muted,
      borderRadius: 8,
      borderWidth: 1.5,
      height: 16,
      width: 16,
    },
    radioSelected: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    audienceTitle: { color: palette.text, fontSize: 13, fontWeight: "900" },
    audienceMeta: {
      color: palette.muted,
      fontSize: 10,
      lineHeight: 14,
      marginTop: 3,
    },
    peopleList: { gap: 7 },
    personRow: {
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
    personRowSelected: { borderColor: palette.accent },
    personMark: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 18,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    personMarkText: { color: palette.accent, fontSize: 13, fontWeight: "900" },
    personName: { color: palette.text, fontSize: 12, fontWeight: "900" },
    personMeta: { color: palette.muted, fontSize: 10, marginTop: 3 },
    personCheck: {
      color: palette.positive,
      fontSize: 15,
      fontWeight: "900",
      width: 20,
    },
    fieldInput: {
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
    fieldTextarea: { minHeight: 118, textAlignVertical: "top" },
  });
}
