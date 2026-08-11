import type {
  ConversationMessage,
  ConversationParticipant,
  ConversationSummary,
  PrincipalType,
} from "../contracts";

export type Unsubscribe = () => void;

export type WakeUpHint =
  | { readonly conversationId: string; readonly seq: number }
  | { readonly inboxDirty: true };

export interface DeliveryPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly serverTime: string;
}

export interface DeliveryInboxItem extends ConversationSummary {
  readonly latestSeq: number;
  readonly lastReadSeq: number;
  readonly lastDeliveredSeq: number;
  readonly messageUpdatedAt: string;
  readonly stateUpdatedAt: string;
  readonly leftAt?: string;
}

export interface DeliveryParticipantState {
  readonly type: "participant";
  readonly id: string;
  readonly conversationId: string;
  readonly participant: ConversationParticipant;
  readonly joinedAt: string;
  readonly leftAt?: string;
  readonly updatedAt: string;
}

export interface DeliveryReactionState {
  readonly type: "reaction";
  readonly id: string;
  readonly messageId: string;
  readonly principalType: PrincipalType;
  readonly principalId: string;
  readonly emoji: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type DeliveryConversationState =
  DeliveryParticipantState | DeliveryReactionState;

export interface DeliveryEngine {
  /** Full convergence pass: inbox diff, then per-conversation deltas. */
  syncAll(): Promise<void>;
  /** Gap-fill one conversation from its highest locally observed sequence. */
  syncConversation(conversationId: string): Promise<void>;
  /** Start the best-effort wake-up stream and foreground polling fallback. */
  connect(): void;
  disconnect(): void;
  /** Wake-ups are hints only. Consumers must read through sync methods. */
  onWakeUp(callback: (hint: WakeUpHint) => void): Unsubscribe;
  /** Debounced watermark updates; the server always applies GREATEST. */
  queueDelivered(conversationId: string, seq: number): void;
  queueRead(conversationId: string, seq: number): void;
}

export interface DeliverySyncObserver {
  readonly onInbox?: (
    items: readonly DeliveryInboxItem[],
    serverTime: string,
  ) => void | Promise<void>;
  readonly onMessages?: (
    conversationId: string,
    items: readonly ConversationMessage[],
    serverTime: string,
  ) => void | Promise<void>;
  readonly onState?: (
    conversationId: string,
    items: readonly DeliveryConversationState[],
    serverTime: string,
  ) => void | Promise<void>;
  readonly onError?: (error: unknown) => void;
}
