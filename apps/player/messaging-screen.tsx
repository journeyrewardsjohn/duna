import {
  demoConversationDetail,
  demoMessagingInbox,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSummary,
  type MessageAttachment,
  type MessageWidget,
  type MessagingInbox,
  type MessagingComposeOptions,
  type MessagingPrincipal,
  type OutboxItem,
  type SendMessageInput,
} from "@duna/messaging-client";
import * as Crypto from "expo-crypto";
import { File, FileMode } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Keyboard,
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import {
  cancelFileBackedUpload,
  isBackgroundUploadAvailable,
  uploadFileBackedPart,
} from "@duna/expo-background-upload";
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
  readonly onUnreadCountChange?: (count: number) => void;
  readonly palette: MessagingPalette;
}

type InboxFilter = "all" | "unread" | "organizations" | "events" | "followers";

interface SelectedAttachment {
  readonly id: string;
  readonly uri: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly byteSize: number;
  readonly kind: MessageAttachment["kind"];
  readonly progress: number;
}

const ATTACHMENT_LIMITS = {
  image: 50 * 1024 * 1024,
  video: 1024 * 1024 * 1024,
  file: 250 * 1024 * 1024,
} as const;
const ATTACHMENT_MESSAGE_LIMIT = 1024 * 1024 * 1024;

const IMAGE_MEDIA_TYPES = [
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const VIDEO_MEDIA_TYPES = [
  "video/3gpp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
] as const;

const DOCUMENT_MEDIA_TYPES = [
  "application/pdf",
  "application/rtf",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
  "text/plain",
] as const;

function attachmentKind(
  mediaType: string,
): MessageAttachment["kind"] | undefined {
  if (
    IMAGE_MEDIA_TYPES.includes(mediaType as (typeof IMAGE_MEDIA_TYPES)[number])
  ) {
    return "image";
  }
  if (
    VIDEO_MEDIA_TYPES.includes(mediaType as (typeof VIDEO_MEDIA_TYPES)[number])
  ) {
    return "video";
  }
  if (
    DOCUMENT_MEDIA_TYPES.includes(
      mediaType as (typeof DOCUMENT_MEDIA_TYPES)[number],
    )
  ) {
    return "file";
  }
  return undefined;
}

function attachmentSizeLabel(bytes: number) {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function fallbackMediaType(fileName: string, kind?: "image" | "video") {
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  if (kind === "image") {
    if (extension === "png") return "image/png";
    if (extension === "webp") return "image/webp";
    if (extension === "heic") return "image/heic";
    return "image/jpeg";
  }
  if (kind === "video") {
    if (extension === "mov") return "video/quicktime";
    return "video/mp4";
  }
  const documentTypes: Record<string, string> = {
    csv: "text/csv",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pdf: "application/pdf",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    rtf: "application/rtf",
    txt: "text/plain",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return documentTypes[extension ?? ""] ?? "application/octet-stream";
}

async function uploadMessageAttachmentPart(input: {
  readonly file: File;
  readonly fileUri: string;
  readonly uploadId: string;
  readonly partNumber: number;
  readonly mediaType: string;
  readonly offset: number;
  readonly length: number;
  readonly uploadUrl: string;
}): Promise<string> {
  if (isBackgroundUploadAvailable()) {
    const uploaded = await uploadFileBackedPart({
      uploadId: input.uploadId,
      partNumber: input.partNumber,
      fileUri: input.fileUri,
      uploadUrl: input.uploadUrl,
      offset: input.offset,
      length: input.length,
      contentType: input.mediaType,
      // Messaging currently permits cellular uploads; the native module still
      // persists the range and reports retryable errors rather than claiming
      // Android background durability.
      allowCellular: true,
    });
    if (uploaded.sizeBytes !== input.length || !uploaded.etag) {
      throw new Error("Private storage did not confirm the upload.");
    }
    return uploaded.etag;
  }

  const handle = input.file.open(FileMode.ReadOnly);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    handle.offset = input.offset;
    bytes = handle.readBytes(input.length);
  } finally {
    handle.close();
  }
  if (bytes.byteLength !== input.length) {
    throw new Error("The selected file could not be read.");
  }
  const response = await fetch(input.uploadUrl, {
    method: "PUT",
    body: new Blob([bytes], { type: input.mediaType }),
  });
  if (!response.ok) {
    throw new Error("Private storage rejected part of the upload.");
  }
  const etag = response.headers.get("etag");
  if (!etag) {
    throw new Error("Private storage did not confirm the upload.");
  }
  return etag;
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
    actionType: "acknowledge" | "quick-action" | "poll-vote",
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
  if (widget.kind === "resource-card") {
    return (
      <View style={styles.widget}>
        <Text style={styles.widgetEyebrow}>
          {widget.resourceType.replace("-", " ").toUpperCase()}
        </Text>
        <Text style={styles.widgetTitle}>{widget.title}</Text>
        {widget.detail ? (
          <Text style={styles.widgetBody}>{widget.detail}</Text>
        ) : null}
        <Pressable
          onPress={() => openDunaPath(widget.action.href)}
          style={styles.widgetPrimary}
        >
          <Text style={styles.widgetPrimaryText}>{widget.action.label}</Text>
        </Pressable>
      </View>
    );
  }
  if (widget.kind === "poll") {
    const totalVotes = widget.options.reduce(
      (total, option) => total + (option.voteCount ?? 0),
      0,
    );
    return (
      <View style={styles.widget}>
        <Text style={styles.widgetEyebrow}>
          POLL · {widget.closed ? "ENDED" : "OPEN"}
        </Text>
        <Text style={styles.widgetTitle}>{widget.title}</Text>
        <Text style={styles.widgetBody}>
          {widget.allowMultipleAnswers ? "Choose one or more" : "Choose one"}
        </Text>
        <View style={styles.pollOptions}>
          {widget.options.map((option) => {
            const percent = totalVotes
              ? Math.round(((option.voteCount ?? 0) / totalVotes) * 100)
              : 0;
            return (
              <Pressable
                disabled={widget.closed}
                key={option.id}
                onPress={() =>
                  onAction(`poll:${index}:${option.id}`, "poll-vote")
                }
                style={[
                  styles.pollOption,
                  option.selected && styles.pollOptionSelected,
                ]}
              >
                <Text style={styles.pollChoice}>
                  {option.selected ? "✓" : "○"}
                </Text>
                <View style={styles.pollOptionBody}>
                  <View style={styles.pollOptionHeading}>
                    <Text style={styles.pollOptionLabel}>{option.label}</Text>
                    <Text style={styles.widgetMeta}>
                      {option.voteCount ?? 0}
                    </Text>
                  </View>
                  <View style={styles.pollTrack}>
                    <View style={[styles.pollFill, { width: `${percent}%` }]} />
                  </View>
                  {option.voterNames?.length ? (
                    <Text style={styles.widgetMeta}>
                      {option.voterNames.join(", ")}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={styles.widgetMeta}>
          {widget.totalVoters ?? 0} voter{widget.totalVoters === 1 ? "" : "s"}
        </Text>
      </View>
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

function ProBadge({ palette }: { readonly palette: MessagingPalette }) {
  return (
    <View
      accessibilityLabel="Verified Duna Pro"
      style={[stylesBase.proBadge, { backgroundColor: palette.warning }]}
    >
      <Text style={[stylesBase.proBadgeText, { color: palette.canvas }]}>
        ✓
      </Text>
    </View>
  );
}

function PrincipalAvatar({
  palette,
  principal,
  size = 52,
}: {
  readonly palette: MessagingPalette;
  readonly principal?: MessagingPrincipal;
  readonly size?: number;
}) {
  const label = principal?.displayName ?? "Duna";
  if (principal?.avatarUrl) {
    return (
      <Image
        accessibilityLabel={label}
        source={{ uri: principal.avatarUrl }}
        style={{ borderRadius: size / 2, height: size, width: size }}
      />
    );
  }
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: palette.surfaceAlt,
        borderRadius: size / 2,
        height: size,
        justifyContent: "center",
        width: size,
      }}
    >
      <Text
        style={{
          color: palette.accent,
          fontSize: size * 0.3,
          fontWeight: "900",
        }}
      >
        {principal?.type === "agent" ? "✦" : label.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function AttachmentPreview({
  attachment,
  mine,
  palette,
}: {
  readonly attachment: MessageAttachment;
  readonly mine: boolean;
  readonly palette: MessagingPalette;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const available = Boolean(attachment.downloadUrl);
  const open = () => {
    if (attachment.downloadUrl) void Linking.openURL(attachment.downloadUrl);
  };
  if (attachment.kind === "image" && attachment.downloadUrl) {
    return (
      <Pressable
        accessibilityLabel={`Open ${attachment.fileName}`}
        onPress={open}
      >
        <Image
          resizeMode="cover"
          source={{ uri: attachment.downloadUrl }}
          style={styles.attachmentImage}
        />
        <Text
          style={[styles.attachmentCaption, mine && styles.messageTimeMine]}
        >
          {attachment.fileName} · {attachmentSizeLabel(attachment.byteSize)}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityLabel={`${available ? "Open" : "Unavailable"} ${attachment.fileName}`}
      disabled={!available}
      onPress={open}
      style={[styles.attachmentCard, mine && styles.attachmentCardMine]}
    >
      <View style={styles.attachmentGlyph}>
        <Text style={styles.attachmentGlyphText}>
          {attachment.kind === "video" ? "▶" : "DOC"}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text
          numberOfLines={1}
          style={[styles.attachmentName, mine && styles.messageBodyMine]}
        >
          {attachment.fileName}
        </Text>
        <Text style={[styles.attachmentMeta, mine && styles.messageTimeMine]}>
          {attachmentSizeLabel(attachment.byteSize)}
          {!available
            ? attachment.safetyStatus === "blocked"
              ? " · Blocked"
              : attachment.safetyStatus !== "safe"
                ? " · Safety review"
                : " · Temporarily unavailable"
            : attachment.kind === "video"
              ? " · Tap to play"
              : " · Tap to open"}
        </Text>
      </View>
    </Pressable>
  );
}

const stylesBase = StyleSheet.create({
  proBadge: {
    alignItems: "center",
    borderRadius: 8,
    height: 16,
    justifyContent: "center",
    width: 16,
  },
  proBadgeText: { fontSize: 12, fontWeight: "900", lineHeight: 12 },
});

function ConversationRow({
  conversation,
  onPress,
  palette,
  principal,
  selected,
}: {
  readonly conversation: ConversationSummary;
  readonly onPress: () => void;
  readonly palette: MessagingPalette;
  readonly principal: MessagingPrincipal;
  readonly selected: boolean;
}) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const lead =
    conversation.participants.find(
      (participant) =>
        participant.type !== principal.type || participant.id !== principal.id,
    ) ?? conversation.participants[0];
  return (
    <Pressable
      accessibilityLabel={`${conversation.title}, ${conversation.unreadCount} unread`}
      onPress={onPress}
      style={[
        styles.conversationRow,
        selected && styles.conversationRowSelected,
      ]}
    >
      <PrincipalAvatar palette={palette} principal={lead} />
      <View style={styles.flex}>
        <View style={styles.rowBetween}>
          <View style={styles.conversationTitleRow}>
            <Text numberOfLines={1} style={styles.conversationTitle}>
              {conversation.title}
            </Text>
            {lead?.isProfessional && <ProBadge palette={palette} />}
          </View>
          <Text style={styles.timeText}>
            {conversation.lastMessage
              ? timeLabel(conversation.lastMessage.createdAt)
              : ""}
          </Text>
        </View>
        <Text numberOfLines={2} style={styles.conversationPreview}>
          {conversation.lastMessage?.body ??
            (conversation.lastMessage?.attachments.length
              ? `${conversation.lastMessage.attachments.length} attachment${conversation.lastMessage.attachments.length === 1 ? "" : "s"}`
              : "Start the conversation")}
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
    actionType: "acknowledge" | "quick-action" | "poll-vote",
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
        {message.attachments.map((attachment) => (
          <AttachmentPreview
            attachment={attachment}
            key={attachment.id}
            mine={mine}
            palette={palette}
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
  onUnreadCountChange,
  palette,
}: PlayerMessagingScreenProps) {
  const styles = useMemo(() => createStyles(palette), [palette]);
  const insets = useSafeAreaInsets();
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
  const [attachments, setAttachments] = useState<readonly SelectedAttachment[]>(
    [],
  );
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [inboxSearch, setInboxSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState<readonly OutboxItem[]>([]);
  const [composeOptions, setComposeOptions] =
    useState<MessagingComposeOptions>();
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTitle, setComposeTitle] = useState("");
  const [composeSearch, setComposeSearch] = useState("");
  const [composeFollowerBroadcast, setComposeFollowerBroadcast] =
    useState(false);
  const [composeRecipients, setComposeRecipients] = useState<readonly string[]>(
    [],
  );
  const [creating, setCreating] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>();
  const [enablingNotifications, setEnablingNotifications] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
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
      setInbox((current) => {
        if (!current) return current;
        const opened = current.conversations.find(
          (conversation) => conversation.id === conversationId,
        );
        if (!opened?.unreadCount) return current;
        const next = {
          ...current,
          conversations: current.conversations.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation,
          ),
          totalUnread: Math.max(0, current.totalUnread - opened.unreadCount),
        };
        return next;
      });
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

  useEffect(() => {
    if (inbox) onUnreadCountChange?.(inbox.totalUnread);
  }, [inbox, onUnreadCountChange]);

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
          if (
            support &&
            item.input.body &&
            item.input.attachmentUploadIds.length === 0
          ) {
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
    if (mode === "preview" || !client) {
      setComposeOptions({
        candidates: [
          {
            principal: {
              type: "user",
              id: "1dc66d99-ec02-4d10-8845-788ee74c63ac",
              displayName: "Mia Rivera",
              isProfessional: true,
            },
            isMinor: true,
          },
          {
            principal: {
              type: "user",
              id: "2dc66d99-ec02-4d10-8845-788ee74c63ac",
              displayName: "Taylor Sander",
              isProfessional: true,
            },
            isMinor: false,
          },
          {
            principal: {
              type: "user",
              id: "3dc66d99-ec02-4d10-8845-788ee74c63ac",
              displayName: "Jordan Lee",
            },
            isMinor: false,
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
  }, [client, mode]);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(undefined);
      setAttachments([]);
      return;
    }
    setAttachments([]);
    setDraft("");
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

  const contextualGroups = useMemo(
    () =>
      (inbox?.conversations ?? []).filter(
        (conversation) =>
          Boolean(conversation.context) ||
          ["event", "division", "league"].includes(conversation.type),
      ),
    [inbox?.conversations],
  );

  const filteredComposeCandidates = useMemo(() => {
    const query = composeSearch.trim().toLowerCase();
    return (composeOptions?.candidates ?? []).filter((candidate) =>
      query
        ? candidate.principal.displayName.toLowerCase().includes(query)
        : true,
    );
  }, [composeOptions?.candidates, composeSearch]);

  const filteredConversations = useMemo(() => {
    const query = inboxSearch.trim().toLowerCase();
    return (inbox?.conversations ?? []).filter((conversation) => {
      const matchesQuery = query
        ? [
            conversation.title,
            conversation.context?.label,
            conversation.lastMessage?.body,
            ...conversation.participants.map(
              (participant) => participant.displayName,
            ),
          ].some((value) => value?.toLowerCase().includes(query))
        : true;
      if (!matchesQuery) return false;
      if (inboxFilter === "all") return true;
      if (inboxFilter === "unread") return conversation.unreadCount > 0;
      if (inboxFilter === "organizations") {
        return conversation.participants.some(
          (participant) => participant.type === "organization",
        );
      }
      if (inboxFilter === "events") {
        return (
          Boolean(conversation.context) ||
          ["event", "division", "league"].includes(conversation.type)
        );
      }
      return (
        !conversation.context &&
        ["dm", "group", "broadcast"].includes(conversation.type)
      );
    });
  }, [inbox?.conversations, inboxFilter, inboxSearch]);

  const addSelectedAttachments = useCallback(
    (
      selected: readonly {
        readonly uri: string;
        readonly fileName: string;
        readonly mediaType: string;
        readonly byteSize: number;
      }[],
    ) => {
      const availableSlots = 6 - attachments.length;
      if (availableSlots <= 0) {
        setError("A message can include up to six attachments.");
        return;
      }
      const additions: SelectedAttachment[] = [];
      let selectedBytes = attachments.reduce(
        (total, attachment) => total + attachment.byteSize,
        0,
      );
      for (const item of selected.slice(0, availableSlots)) {
        const mediaType = item.mediaType.split(";", 1)[0]!.toLowerCase();
        const kind = attachmentKind(mediaType);
        if (!kind) {
          setError(
            "Choose an image, video, PDF, text file, or standard office document.",
          );
          continue;
        }
        if (selectedBytes + item.byteSize > ATTACHMENT_MESSAGE_LIMIT) {
          setError("Attachments in one message can total up to 1 GB.");
          continue;
        }
        if (item.byteSize < 1 || item.byteSize > ATTACHMENT_LIMITS[kind]) {
          const maximum = attachmentSizeLabel(ATTACHMENT_LIMITS[kind]);
          setError(
            `${kind === "image" ? "Images" : kind === "video" ? "Videos" : "Documents"} must be ${maximum} or smaller.`,
          );
          continue;
        }
        if (
          attachments.some((attachment) => attachment.uri === item.uri) ||
          additions.some((attachment) => attachment.uri === item.uri)
        ) {
          continue;
        }
        additions.push({
          id: Crypto.randomUUID(),
          uri: item.uri,
          fileName: item.fileName.slice(0, 255),
          mediaType,
          byteSize: item.byteSize,
          kind,
          progress: 0,
        });
        selectedBytes += item.byteSize;
      }
      if (selected.length > availableSlots) {
        setError("Only the first six attachments were added.");
      }
      if (additions.length > 0) {
        setAttachments((current) => [...current, ...additions]);
      }
    },
    [attachments],
  );

  const pickMedia = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Allow photo access to attach images or videos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images", "videos"],
      quality: 1,
      selectionLimit: Math.max(1, 6 - attachments.length),
    });
    if (result.canceled) return;
    addSelectedAttachments(
      result.assets.map((asset, index) => {
        const file = new File(asset.uri);
        const kind = asset.type === "video" ? "video" : "image";
        const fileName =
          asset.fileName ??
          `duna-${kind}-${Date.now()}-${index}.${kind === "video" ? "mp4" : "jpg"}`;
        return {
          uri: asset.uri,
          fileName,
          mediaType: asset.mimeType ?? fallbackMediaType(fileName, kind),
          byteSize: asset.fileSize ?? file.size ?? 0,
        };
      }),
    );
  }, [addSelectedAttachments, attachments.length]);

  const pickDocuments = useCallback(async () => {
    const result = await File.pickFileAsync({
      mimeTypes: [...DOCUMENT_MEDIA_TYPES],
      multipleFiles: true,
    });
    if (result.canceled) return;
    addSelectedAttachments(
      result.result.map((file) => ({
        uri: file.uri,
        fileName: file.name,
        mediaType: file.type || fallbackMediaType(file.name),
        byteSize: file.size ?? 0,
      })),
    );
  }, [addSelectedAttachments]);

  const chooseAttachment = useCallback(() => {
    Alert.alert("Add to message", "Choose what you want to share.", [
      { text: "Photos or videos", onPress: () => void pickMedia() },
      { text: "Document", onPress: () => void pickDocuments() },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickDocuments, pickMedia]);

  const uploadSelectedAttachments = useCallback(async () => {
    if (!client || mode !== "live" || attachments.length === 0) return [];
    const activeUploadIds: string[] = [];
    try {
      for (const attachment of attachments) {
        const session = await client.messaging.beginAttachmentUpload.mutate({
          asPrincipal: "user",
          attachment: {
            conversationId: selectedId!,
            fileName: attachment.fileName,
            mediaType: attachment.mediaType,
            byteSize: attachment.byteSize,
          },
        });
        activeUploadIds.push(session.id);
        const file = new File(attachment.uri);
        const completedParts: { partNumber: number; etag: string }[] = [];
        let nextPart = 1;
        let finishedParts = 0;
        const uploadPart = async () => {
          while (nextPart <= session.totalParts) {
            const partNumber = nextPart++;
            const signed = await client.messaging.attachmentPartUrl.mutate({
              uploadId: session.id,
              partNumber,
            });
            const start = (partNumber - 1) * session.partSizeBytes;
            const end = Math.min(
              attachment.byteSize,
              start + session.partSizeBytes,
            );
            const etag = await uploadMessageAttachmentPart({
              file,
              fileUri: attachment.uri,
              uploadId: session.id,
              partNumber,
              mediaType: attachment.mediaType,
              offset: start,
              length: end - start,
              uploadUrl: signed.url,
            });
            completedParts.push({ partNumber, etag });
            finishedParts += 1;
            setAttachments((current) =>
              current.map((item) =>
                item.id === attachment.id
                  ? {
                      ...item,
                      progress: finishedParts / session.totalParts,
                    }
                  : item,
              ),
            );
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(3, session.totalParts) }, () =>
            uploadPart(),
          ),
        );
        await client.messaging.completeAttachmentUpload.mutate({
          uploadId: session.id,
          parts: completedParts.sort(
            (left, right) => left.partNumber - right.partNumber,
          ),
        });
        await cancelFileBackedUpload(session.id).catch(() => undefined);
        const uploadIndex = activeUploadIds.indexOf(session.id);
        if (uploadIndex >= 0) activeUploadIds.splice(uploadIndex, 1);
      }
      return activeUploadIds;
    } catch (reason) {
      await Promise.all(
        activeUploadIds.map((uploadId) =>
          client.messaging.abortAttachmentUpload
            .mutate({ uploadId })
            .then(() => cancelFileBackedUpload(uploadId))
            .catch(() => undefined),
        ),
      );
      throw reason;
    }
  }, [attachments, client, mode, selectedId]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if ((!body && attachments.length === 0) || !selectedId || sending) return;
    setSending(true);
    setError(undefined);
    const clientMessageId = Crypto.randomUUID();
    let attachmentUploadIds: string[] = [];
    try {
      attachmentUploadIds = await uploadSelectedAttachments();
      const input: SendMessageInput = {
        conversationId: selectedId,
        clientMessageId,
        kind: "text",
        ...(body ? { body } : {}),
        widgets: [],
        attachmentUploadIds,
      };
      const optimistic: ConversationMessage = {
        id: input.clientMessageId,
        conversationId: input.conversationId,
        clientMessageId: input.clientMessageId,
        seq: (detail?.messages.at(-1)?.seq ?? 0) + 1,
        sender: principal,
        kind: "text",
        ...(body ? { body } : {}),
        widgets: [],
        attachments: attachments.map((attachment) => ({
          id: attachment.id,
          kind: attachment.kind,
          mediaType: attachment.mediaType,
          fileName: attachment.fileName,
          byteSize: attachment.byteSize,
          safetyStatus: detail?.conversation.safety.screeningRequired
            ? "pending"
            : "safe",
          downloadUrl: attachment.uri,
        })),
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
      if (mode === "preview" || !client) {
        if (
          detail?.conversation.type === "support" &&
          attachments.length === 0
        ) {
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
                        clientMessageId: pairedResponseId(
                          input.clientMessageId,
                        ),
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
        setAttachments([]);
        return;
      }
      if (attachmentUploadIds.length > 0) {
        const sentMessage = await client.messaging.send.mutate({
          asPrincipal: "user",
          message: input,
        });
        setAttachments([]);
        setDetail((current) =>
          current
            ? {
                ...current,
                messages: current.messages.map((message) =>
                  message.id === optimistic.id ? sentMessage : message,
                ),
              }
            : current,
        );
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
        await Promise.all([loadConversation(selectedId), loadInbox()]);
        return;
      }
      await outbox.enqueue(input);
      setPending(await outbox.pending());
      const sent = await flushOutbox(inbox);
      if (sent > 0) {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => undefined);
        await Promise.all([loadConversation(selectedId), loadInbox()]);
      }
    } catch (reason) {
      setDraft(body);
      setDetail((current) =>
        current
          ? {
              ...current,
              messages: current.messages.filter(
                (message) => message.clientMessageId !== clientMessageId,
              ),
            }
          : current,
      );
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not send this message.",
      );
      if (attachmentUploadIds.length > 0 && client) {
        await Promise.all(
          attachmentUploadIds.map((uploadId) =>
            client.messaging.abortAttachmentUpload
              .mutate({ uploadId })
              .then(() => cancelFileBackedUpload(uploadId))
              .catch(() => undefined),
          ),
        );
      }
    } finally {
      setSending(false);
    }
  }, [
    attachments,
    client,
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
    uploadSelectedAttachments,
  ]);

  const createConversation = useCallback(async () => {
    const selectedCandidates =
      composeOptions?.candidates.filter((candidate) =>
        composeRecipients.includes(candidate.principal.id),
      ) ?? [];
    if (
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
      setComposeSearch("");
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
        },
      });
      setComposeOpen(false);
      setComposeTitle("");
      setComposeSearch("");
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
      actionType: "acknowledge" | "quick-action" | "poll-vote",
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

  const threadLead = detail?.participants
    .map((participant) => participant.principal)
    .find(
      (participant) =>
        participant.type !== principal.type || participant.id !== principal.id,
    );
  const threadBottomInset =
    Platform.OS === "ios"
      ? Math.max(insets.bottom, keyboardHeight)
      : insets.bottom;

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
        <View style={styles.inboxHeading}>
          <Text numberOfLines={1} style={styles.inboxAccountName}>
            {principal.displayName}
          </Text>
          <Text style={styles.inboxAccountMeta}>Messages</Text>
        </View>
        <Pressable
          accessibilityLabel="New conversation"
          onPress={() => setComposeOpen(true)}
          style={styles.newButton}
        >
          <Text style={styles.newButtonText}>✎</Text>
        </Pressable>
      </View>
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
        contentContainerStyle={[
          styles.inboxList,
          { paddingBottom: Math.max(34, insets.bottom + 18) },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
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
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <TextInput
            accessibilityLabel="Search messages"
            onChangeText={setInboxSearch}
            placeholder="Search messages"
            placeholderTextColor={palette.muted}
            style={styles.searchInput}
            value={inboxSearch}
          />
        </View>
        {(composeOptions?.candidates.length ?? 0) > 0 && (
          <View>
            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>Mutual followers</Text>
              <Text style={styles.sectionMeta}>People you can message</Text>
            </View>
            <ScrollView
              contentContainerStyle={styles.followerRail}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {composeOptions?.candidates.slice(0, 12).map((candidate) => (
                <Pressable
                  accessibilityLabel={`Message ${candidate.principal.displayName}`}
                  key={candidate.principal.id}
                  onPress={() => {
                    const existing = inbox?.conversations.find(
                      (conversation) =>
                        conversation.type === "dm" &&
                        conversation.participants.some(
                          (participant) =>
                            participant.type === "user" &&
                            participant.id === candidate.principal.id,
                        ),
                    );
                    if (existing) {
                      setSelectedId(existing.id);
                    } else {
                      setComposeRecipients([candidate.principal.id]);
                      setComposeFollowerBroadcast(false);
                      setComposeOpen(true);
                    }
                  }}
                  style={styles.followerItem}
                >
                  <View>
                    <PrincipalAvatar
                      palette={palette}
                      principal={candidate.principal}
                      size={64}
                    />
                    {candidate.principal.isProfessional && (
                      <View style={styles.followerProBadge}>
                        <ProBadge palette={palette} />
                      </View>
                    )}
                  </View>
                  <Text numberOfLines={1} style={styles.followerName}>
                    {candidate.principal.displayName.split(" ")[0]}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <ScrollView
          contentContainerStyle={styles.filterRail}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {(
            [
              ["all", "Primary"],
              ["unread", "Unread"],
              ["organizations", "Orgs"],
              ["events", "Events"],
              ["followers", "Followers"],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setInboxFilter(key)}
              style={[
                styles.filterChip,
                inboxFilter === key && styles.filterChipSelected,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  inboxFilter === key && styles.filterChipTextSelected,
                ]}
              >
                {label}
              </Text>
              {key === "unread" && (inbox?.totalUnread ?? 0) > 0 && (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>
                    {inbox?.totalUnread}
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </ScrollView>
        {loading && !inbox ? (
          <ActivityIndicator color={palette.accent} style={styles.loading} />
        ) : filteredConversations.length ? (
          filteredConversations.map((conversation) => (
            <ConversationRow
              conversation={conversation}
              key={conversation.id}
              onPress={() => setSelectedId(conversation.id)}
              palette={palette}
              principal={principal}
              selected={selectedId === conversation.id}
            />
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {inboxSearch || inboxFilter !== "all"
                ? "No messages match this view."
                : "Nothing to catch up on."}
            </Text>
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
    <View style={[styles.threadPane, { paddingBottom: threadBottomInset }]}>
      <View style={styles.threadHeader}>
        {!wide && (
          <Pressable
            accessibilityLabel="Back to conversations"
            onPress={() => {
              Keyboard.dismiss();
              setAttachments([]);
              setSelectedId(undefined);
            }}
            style={styles.threadBack}
          >
            <Text style={styles.threadBackText}>‹</Text>
          </Pressable>
        )}
        <PrincipalAvatar palette={palette} principal={threadLead} size={42} />
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
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() =>
          threadScroll.current?.scrollToEnd({ animated: true })
        }
        ref={threadScroll}
        style={styles.messageScroller}
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
        <View style={styles.composerShell}>
          {attachments.length > 0 && (
            <ScrollView
              contentContainerStyle={styles.pendingAttachmentRail}
              horizontal
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
            >
              {attachments.map((attachment) => (
                <View key={attachment.id} style={styles.pendingAttachment}>
                  {attachment.kind === "image" ? (
                    <Image
                      source={{ uri: attachment.uri }}
                      style={styles.pendingAttachmentImage}
                    />
                  ) : (
                    <View style={styles.pendingAttachmentFile}>
                      <Text style={styles.pendingAttachmentFileText}>
                        {attachment.kind === "video" ? "▶" : "DOC"}
                      </Text>
                    </View>
                  )}
                  <View style={styles.pendingAttachmentBody}>
                    <Text
                      numberOfLines={1}
                      style={styles.pendingAttachmentName}
                    >
                      {attachment.fileName}
                    </Text>
                    <Text style={styles.pendingAttachmentMeta}>
                      {sending
                        ? `${Math.round(attachment.progress * 100)}%`
                        : attachmentSizeLabel(attachment.byteSize)}
                    </Text>
                  </View>
                  {!sending && (
                    <Pressable
                      accessibilityLabel={`Remove ${attachment.fileName}`}
                      onPress={() =>
                        setAttachments((current) =>
                          current.filter((item) => item.id !== attachment.id),
                        )
                      }
                      style={styles.pendingAttachmentRemove}
                    >
                      <Text style={styles.pendingAttachmentRemoveText}>×</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
          <View style={styles.composer}>
            <Pressable
              accessibilityLabel="Add photo, video, or document"
              disabled={sending}
              onPress={chooseAttachment}
              style={styles.attachButton}
            >
              <Text style={styles.attachButtonText}>＋</Text>
            </Pressable>
            <TextInput
              accessibilityLabel="Message"
              multiline
              onChangeText={setDraft}
              onSubmitEditing={() => void send()}
              placeholder={
                detail.conversation.type === "support"
                  ? "Message Duna Support…"
                  : "Message…"
              }
              placeholderTextColor={palette.muted}
              style={styles.composerInput}
              value={draft}
            />
            <Pressable
              accessibilityLabel="Send message"
              disabled={(!draft.trim() && attachments.length === 0) || sending}
              onPress={() => void send()}
              style={[
                styles.sendButton,
                ((!draft.trim() && attachments.length === 0) || sending) &&
                  styles.sendButtonDisabled,
              ]}
            >
              <Text style={styles.sendButtonText}>{sending ? "…" : "↑"}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.readOnlyBar}>
          <Text style={styles.readOnlyText}>
            {detail.permissions.reason ?? "Only moderators can post here."}
          </Text>
        </View>
      )}
    </View>
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
        <View
          style={[
            styles.composeScreen,
            { paddingBottom: Math.max(14, insets.bottom) },
          ]}
        >
          <View style={styles.composeHeader}>
            <Pressable
              accessibilityLabel="Close new conversation"
              onPress={() => setComposeOpen(false)}
              style={styles.composeClose}
            >
              <Text style={styles.composeCloseText}>‹</Text>
            </Pressable>
            <Text style={styles.composeTitle}>
              {composeRecipients.length > 1 ? "New group chat" : "New message"}
            </Text>
            <View style={styles.composeHeaderSpacer} />
          </View>
          <ScrollView
            contentContainerStyle={styles.composeContent}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.composeSearchRow}>
              <Text style={styles.composeToLabel}>To:</Text>
              <TextInput
                autoFocus
                onChangeText={setComposeSearch}
                placeholder="Search"
                placeholderTextColor={palette.muted}
                style={styles.composeSearchInput}
                value={composeSearch}
              />
            </View>
            {composeRecipients.length > 0 && (
              <ScrollView
                contentContainerStyle={styles.composeRecipientChips}
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
              >
                {composeOptions?.candidates
                  .filter((candidate) =>
                    composeRecipients.includes(candidate.principal.id),
                  )
                  .map((candidate) => (
                    <Pressable
                      key={candidate.principal.id}
                      onPress={() =>
                        setComposeRecipients((current) =>
                          current.filter((id) => id !== candidate.principal.id),
                        )
                      }
                      style={styles.composeRecipientChip}
                    >
                      <Text style={styles.composeRecipientChipText}>
                        {candidate.principal.displayName} ×
                      </Text>
                    </Pressable>
                  ))}
              </ScrollView>
            )}
            {contextualGroups.length > 0 && !composeSearch.trim() && (
              <View>
                <Text style={styles.composeSectionTitle}>Your Duna groups</Text>
                <ScrollView
                  contentContainerStyle={styles.groupShortcutRail}
                  horizontal
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                >
                  {contextualGroups.slice(0, 10).map((conversation) => (
                    <Pressable
                      key={conversation.id}
                      onPress={() => {
                        Keyboard.dismiss();
                        setComposeOpen(false);
                        setSelectedId(conversation.id);
                      }}
                      style={styles.groupShortcut}
                    >
                      <View style={styles.groupShortcutMark}>
                        <Text style={styles.groupShortcutMarkText}>
                          {conversation.title.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <Text numberOfLines={2} style={styles.groupShortcutTitle}>
                        {conversation.context?.label ?? conversation.title}
                      </Text>
                      <Text numberOfLines={1} style={styles.groupShortcutMeta}>
                        {conversation.context?.type ?? conversation.type}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
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
                  <View style={styles.composeNameWithBadge}>
                    <Text style={styles.composeChoiceTitle}>
                      All my followers
                    </Text>
                    <ProBadge palette={palette} />
                  </View>
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
                <Text style={styles.composeSectionTitle}>Suggested</Text>
                {!composeOptions ? (
                  <ActivityIndicator color={palette.accent} />
                ) : filteredComposeCandidates.length ? (
                  <View style={styles.composePeople}>
                    {filteredComposeCandidates.map((candidate) => {
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
                          <PrincipalAvatar
                            palette={palette}
                            principal={candidate.principal}
                            size={48}
                          />
                          <View style={styles.flex}>
                            <View style={styles.composeNameWithBadge}>
                              <Text style={styles.composePersonName}>
                                {candidate.principal.displayName}
                              </Text>
                              {candidate.principal.isProfessional && (
                                <ProBadge palette={palette} />
                              )}
                            </View>
                            <Text style={styles.composePersonMeta}>
                              Mutual follow
                              {candidate.isMinor ? " · Guardian included" : ""}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.composeCheck,
                              selected && styles.composeCheckSelected,
                            ]}
                          >
                            <Text style={styles.composeCheckText}>
                              {selected ? "✓" : ""}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.composeEmpty}>
                    <Text style={styles.composeChoiceTitle}>
                      No mutual followers found.
                    </Text>
                    <Text style={styles.composeChoiceMeta}>
                      You can reply in event groups, or follow each other before
                      starting a direct conversation.
                    </Text>
                  </View>
                )}
              </>
            )}
            {(composeRecipients.length > 1 || composeFollowerBroadcast) && (
              <>
                <Text style={styles.composeSectionTitle}>
                  Group name · optional
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
              </>
            )}
            <View style={styles.composePolicy}>
              <Text style={styles.composePolicyMark}>✓</Text>
              <Text style={styles.composePolicyText}>
                Member chats require a mutual follow. For minors, Duna includes
                their verified guardian and screens every message before
                delivery.
              </Text>
            </View>
            <Pressable
              disabled={
                creating ||
                (!composeFollowerBroadcast && composeRecipients.length === 0)
              }
              onPress={() => void createConversation()}
              style={[
                styles.composeSubmit,
                (creating ||
                  (!composeFollowerBroadcast &&
                    composeRecipients.length === 0)) &&
                  styles.sendButtonDisabled,
              ]}
            >
              <Text style={styles.composeSubmitText}>
                {creating
                  ? "Opening…"
                  : composeFollowerBroadcast
                    ? "Open follower chat"
                    : composeRecipients.length > 1
                      ? "Create group chat"
                      : "Open chat"}
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
      paddingBottom: 10,
      paddingTop: 14,
    },
    inboxHeading: { alignItems: "center", flex: 1, minWidth: 0 },
    inboxAccountName: {
      color: palette.text,
      fontSize: 17,
      fontWeight: "900",
      maxWidth: "100%",
    },
    inboxAccountMeta: { color: palette.muted, fontSize: 12, marginTop: 2 },
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
      fontSize: 12,
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
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 18,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    newButtonText: { color: palette.text, fontSize: 23, fontWeight: "900" },
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
      fontSize: 12,
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
      fontSize: 12,
      fontWeight: "900",
    },
    inboxList: { gap: 10, padding: 14, paddingBottom: 34 },
    searchBar: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderRadius: 18,
      flexDirection: "row",
      gap: 8,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    searchIcon: { color: palette.muted, fontSize: 22 },
    searchInput: {
      color: palette.text,
      flex: 1,
      fontSize: 14,
      minHeight: 48,
      paddingVertical: 10,
    },
    sectionHeadingRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 9,
      marginTop: 2,
    },
    sectionHeading: { color: palette.text, fontSize: 13, fontWeight: "900" },
    sectionMeta: { color: palette.muted, fontSize: 12 },
    followerRail: { gap: 14, paddingRight: 18 },
    followerItem: { alignItems: "center", gap: 6, width: 70 },
    followerName: {
      color: palette.text,
      fontSize: 12,
      maxWidth: 70,
      textAlign: "center",
    },
    followerProBadge: { bottom: 0, position: "absolute", right: -1 },
    filterRail: { gap: 8, paddingRight: 18 },
    filterChip: {
      alignItems: "center",
      borderColor: palette.border,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    filterChipSelected: {
      backgroundColor: palette.surface,
      borderColor: palette.surface,
    },
    filterChipText: { color: palette.muted, fontSize: 12, fontWeight: "800" },
    filterChipTextSelected: { color: palette.text },
    filterBadge: {
      alignItems: "center",
      backgroundColor: palette.danger,
      borderRadius: 8,
      justifyContent: "center",
      minHeight: 16,
      minWidth: 16,
      paddingHorizontal: 4,
    },
    filterBadgeText: {
      color: palette.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    loading: { marginTop: 48 },
    conversationRow: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderRadius: 16,
      flexDirection: "row",
      gap: 12,
      minHeight: 80,
      paddingHorizontal: 4,
      paddingVertical: 9,
    },
    conversationRowSelected: { backgroundColor: palette.surface },
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
      flexShrink: 1,
      fontSize: 14,
      fontWeight: "900",
    },
    conversationTitleRow: {
      alignItems: "center",
      flex: 1,
      flexDirection: "row",
      gap: 5,
      minWidth: 0,
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
      fontSize: 12,
      fontWeight: "800",
    },
    safeLabel: {
      color: palette.positive,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.5,
    },
    timeText: { color: palette.muted, fontSize: 12, marginLeft: 6 },
    unreadBadge: {
      alignItems: "center",
      backgroundColor: palette.danger,
      borderRadius: 10,
      justifyContent: "center",
      minHeight: 20,
      minWidth: 20,
      paddingHorizontal: 5,
    },
    unreadText: { color: palette.onAccent, fontSize: 12, fontWeight: "900" },
    offlineBanner: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.warning,
      borderRadius: 12,
      borderWidth: 1,
      marginHorizontal: 18,
      marginTop: 12,
      minHeight: 48,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    offlineBannerText: {
      color: palette.warning,
      fontSize: 12,
      fontWeight: "800",
    },
    errorText: {
      color: palette.danger,
      fontSize: 12,
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
      width: 48,
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
    threadMeta: { color: palette.muted, fontSize: 12, marginTop: 3 },
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
    safetyText: { color: palette.muted, flex: 1, fontSize: 12, lineHeight: 15 },
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
    aiText: { color: palette.muted, flex: 1, fontSize: 12, lineHeight: 15 },
    messages: {
      flexGrow: 1,
      gap: 14,
      justifyContent: "flex-end",
      padding: 16,
      paddingBottom: 24,
    },
    messageScroller: { flex: 1 },
    messageWrap: { alignSelf: "flex-start", maxWidth: "86%" },
    messageWrapMine: { alignSelf: "flex-end" },
    senderName: {
      color: palette.muted,
      fontSize: 12,
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
    messageTime: { color: palette.muted, fontSize: 12 },
    messageTimeMine: { color: palette.onAccent, opacity: 0.72 },
    attachmentImage: {
      borderRadius: 13,
      height: 180,
      maxWidth: 260,
      width: 230,
    },
    attachmentCaption: { color: palette.muted, fontSize: 12, marginTop: 5 },
    attachmentCard: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 13,
      borderWidth: 1,
      flexDirection: "row",
      gap: 10,
      minWidth: 230,
      padding: 10,
    },
    attachmentCardMine: { backgroundColor: "transparent" },
    attachmentGlyph: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderRadius: 10,
      height: 42,
      justifyContent: "center",
      width: 42,
    },
    attachmentGlyphText: {
      color: palette.accent,
      fontSize: 12,
      fontWeight: "900",
    },
    attachmentName: { color: palette.text, fontSize: 12, fontWeight: "900" },
    attachmentMeta: { color: palette.muted, fontSize: 12, marginTop: 3 },
    screeningLabel: { color: palette.warning, fontSize: 12, fontWeight: "800" },
    heldLabel: { color: palette.danger, fontSize: 12, fontWeight: "800" },
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
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    widgetTitle: {
      color: palette.text,
      fontSize: 14,
      fontWeight: "900",
      lineHeight: 18,
    },
    widgetBody: { color: palette.muted, fontSize: 12, lineHeight: 16 },
    widgetMeta: { color: palette.accent, fontSize: 12, fontWeight: "800" },
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
      minHeight: 48,
      paddingHorizontal: 14,
    },
    widgetPrimaryText: {
      color: palette.onAccent,
      fontSize: 12,
      fontWeight: "900",
    },
    widgetSecondary: {
      alignItems: "center",
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 14,
    },
    widgetSecondaryText: {
      color: palette.text,
      fontSize: 12,
      fontWeight: "900",
    },
    quickActions: { gap: 7 },
    pollOptions: { gap: 7 },
    pollOption: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 54,
      padding: 9,
    },
    pollOptionSelected: { borderColor: palette.accent, borderWidth: 2 },
    pollChoice: { color: palette.accent, fontSize: 17, fontWeight: "900" },
    pollOptionBody: { flex: 1, gap: 4 },
    pollOptionHeading: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    pollOptionLabel: { color: palette.text, fontSize: 12, fontWeight: "800" },
    pollTrack: {
      backgroundColor: palette.border,
      borderRadius: 999,
      height: 5,
      overflow: "hidden",
    },
    pollFill: { backgroundColor: palette.accent, height: 5 },
    scoreRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 7,
      marginTop: 4,
    },
    scoreTeam: {
      color: palette.muted,
      flex: 1,
      fontSize: 12,
      fontWeight: "800",
    },
    scoreTeamRight: { textAlign: "right" },
    scoreValue: { color: palette.text, fontSize: 22, fontWeight: "900" },
    scoreDash: { color: palette.muted, fontSize: 13 },
    composerShell: {
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      borderTopWidth: 1,
    },
    pendingAttachmentRail: { gap: 8, paddingHorizontal: 10, paddingTop: 10 },
    pendingAttachment: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 12,
      flexDirection: "row",
      minHeight: 54,
      overflow: "hidden",
      paddingRight: 8,
      width: 210,
    },
    pendingAttachmentImage: { height: 54, width: 54 },
    pendingAttachmentFile: {
      alignItems: "center",
      backgroundColor: palette.canvas,
      height: 54,
      justifyContent: "center",
      width: 54,
    },
    pendingAttachmentFileText: {
      color: palette.accent,
      fontSize: 12,
      fontWeight: "900",
    },
    pendingAttachmentBody: { flex: 1, minWidth: 0, paddingHorizontal: 8 },
    pendingAttachmentName: {
      color: palette.text,
      fontSize: 12,
      fontWeight: "800",
    },
    pendingAttachmentMeta: {
      color: palette.muted,
      fontSize: 12,
      marginTop: 3,
    },
    pendingAttachmentRemove: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: 40,
    },
    pendingAttachmentRemoveText: { color: palette.text, fontSize: 20 },
    composer: {
      alignItems: "flex-end",
      backgroundColor: palette.surface,
      flexDirection: "row",
      gap: 7,
      padding: 10,
    },
    attachButton: {
      alignItems: "center",
      borderColor: palette.border,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    attachButtonText: { color: palette.text, fontSize: 25, lineHeight: 27 },
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
    readOnlyText: { color: palette.muted, fontSize: 12, textAlign: "center" },
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
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    composeTitle: {
      color: palette.text,
      fontSize: 17,
      fontWeight: "900",
    },
    composeClose: {
      alignItems: "center",
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    composeCloseText: { color: palette.text, fontSize: 36, lineHeight: 38 },
    composeHeaderSpacer: { height: 48, width: 48 },
    composeContent: { gap: 12, padding: 18, paddingBottom: 48 },
    composeSearchRow: {
      alignItems: "center",
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 8,
      minHeight: 54,
    },
    composeToLabel: { color: palette.muted, fontSize: 15 },
    composeSearchInput: {
      color: palette.text,
      flex: 1,
      fontSize: 15,
      minHeight: 52,
      paddingVertical: 10,
    },
    composeRecipientChips: { gap: 7, paddingVertical: 2 },
    composeRecipientChip: {
      backgroundColor: palette.surface,
      borderRadius: 16,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    composeRecipientChipText: {
      color: palette.text,
      fontSize: 12,
      fontWeight: "800",
    },
    composeSectionTitle: {
      color: palette.text,
      fontSize: 14,
      fontWeight: "900",
      marginTop: 7,
    },
    groupShortcutRail: { gap: 9, paddingTop: 9, paddingRight: 16 },
    groupShortcut: {
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 14,
      borderWidth: 1,
      minHeight: 116,
      padding: 10,
      width: 126,
    },
    groupShortcutMark: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 17,
      height: 34,
      justifyContent: "center",
      marginBottom: 8,
      width: 34,
    },
    groupShortcutMarkText: {
      color: palette.accent,
      fontSize: 12,
      fontWeight: "900",
    },
    groupShortcutTitle: {
      color: palette.text,
      fontSize: 12,
      fontWeight: "900",
      lineHeight: 14,
    },
    groupShortcutMeta: {
      color: palette.muted,
      fontSize: 12,
      marginTop: 5,
      textTransform: "capitalize",
    },
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
      fontSize: 12,
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
      fontSize: 12,
      lineHeight: 15,
      marginTop: 3,
    },
    composeNameWithBadge: {
      alignItems: "center",
      flexDirection: "row",
      gap: 5,
    },
    composeFieldLabel: {
      color: palette.accent,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.9,
      marginTop: 8,
    },
    composePeople: { gap: 7 },
    composePerson: {
      alignItems: "center",
      backgroundColor: "transparent",
      borderRadius: 14,
      flexDirection: "row",
      gap: 11,
      minHeight: 62,
      padding: 10,
    },
    composePersonSelected: { backgroundColor: palette.surface },
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
    composePersonMeta: { color: palette.muted, fontSize: 12, marginTop: 3 },
    composeCheck: {
      alignItems: "center",
      borderColor: palette.muted,
      borderRadius: 13,
      borderWidth: 1.5,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    composeCheckSelected: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    composeCheckText: {
      color: palette.onAccent,
      fontSize: 13,
      fontWeight: "900",
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
