import type { SendMessageInput } from "./contracts";

export type OutboxStatus = "queued" | "sending" | "failed";

export interface OutboxItem {
  readonly input: SendMessageInput;
  readonly status: OutboxStatus;
  readonly attempts: number;
  readonly queuedAt: string;
  readonly lastAttemptAt?: string;
  readonly error?: string;
}

export interface MessagingOutboxStorage {
  read(): Promise<readonly OutboxItem[]>;
  write(items: readonly OutboxItem[]): Promise<void>;
}

export class MessagingOutbox {
  constructor(private readonly storage: MessagingOutboxStorage) {}

  async enqueue(
    input: SendMessageInput,
    now = new Date(),
  ): Promise<OutboxItem> {
    const items = await this.storage.read();
    const existing = items.find(
      (item) => item.input.clientMessageId === input.clientMessageId,
    );
    if (existing) return existing;
    const item: OutboxItem = {
      input,
      status: "queued",
      attempts: 0,
      queuedAt: now.toISOString(),
    };
    await this.storage.write([...items, item]);
    return item;
  }

  async pending(): Promise<readonly OutboxItem[]> {
    return this.storage.read();
  }

  async markSending(clientMessageId: string, now = new Date()): Promise<void> {
    await this.update(clientMessageId, (item) => ({
      ...item,
      status: "sending",
      attempts: item.attempts + 1,
      lastAttemptAt: now.toISOString(),
      error: undefined,
    }));
  }

  async markFailed(clientMessageId: string, error: string): Promise<void> {
    await this.update(clientMessageId, (item) => ({
      ...item,
      status: "failed",
      error,
    }));
  }

  async acknowledge(clientMessageId: string): Promise<void> {
    const items = await this.storage.read();
    await this.storage.write(
      items.filter((item) => item.input.clientMessageId !== clientMessageId),
    );
  }

  private async update(
    clientMessageId: string,
    transform: (item: OutboxItem) => OutboxItem,
  ): Promise<void> {
    const items = await this.storage.read();
    await this.storage.write(
      items.map((item) =>
        item.input.clientMessageId === clientMessageId ? transform(item) : item,
      ),
    );
  }
}

export class MemoryOutboxStorage implements MessagingOutboxStorage {
  private items: readonly OutboxItem[] = [];

  async read(): Promise<readonly OutboxItem[]> {
    return this.items;
  }

  async write(items: readonly OutboxItem[]): Promise<void> {
    this.items = [...items];
  }
}
