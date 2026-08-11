import {
  MessagingOutbox,
  sendMessageInputSchema,
  type MessagingOutboxStorage,
  type OutboxItem,
} from "@duna/messaging-client";
import { openDatabaseAsync } from "expo-sqlite";

const database = openDatabaseAsync("duna-pro-messaging.db").then(
  async (nextDatabase) => {
    await nextDatabase.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS messaging_outbox (
        scope TEXT PRIMARY KEY NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    return nextDatabase;
  },
);

function parseItems(payload: string | undefined): readonly OutboxItem[] {
  if (!payload) return [];
  try {
    const value: unknown = JSON.parse(payload);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<OutboxItem>;
      const input = sendMessageInputSchema.safeParse(candidate.input);
      if (
        !input.success ||
        !["queued", "sending", "failed"].includes(candidate.status ?? "") ||
        typeof candidate.attempts !== "number" ||
        typeof candidate.queuedAt !== "string"
      ) {
        return [];
      }
      return [{ ...candidate, input: input.data } as OutboxItem];
    });
  } catch {
    return [];
  }
}

class SQLiteMessagingOutboxStorage implements MessagingOutboxStorage {
  constructor(private readonly scope: string) {}

  async read(): Promise<readonly OutboxItem[]> {
    const nextDatabase = await database;
    const row = await nextDatabase.getFirstAsync<{ payload: string }>(
      "SELECT payload FROM messaging_outbox WHERE scope = ?",
      this.scope,
    );
    return parseItems(row?.payload);
  }

  async write(items: readonly OutboxItem[]): Promise<void> {
    const nextDatabase = await database;
    await nextDatabase.runAsync(
      `INSERT INTO messaging_outbox (scope, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(scope) DO UPDATE SET
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      this.scope,
      JSON.stringify(items),
      new Date().toISOString(),
    );
  }
}

export function createProMessagingOutbox(organizationId: string) {
  return new MessagingOutbox(
    new SQLiteMessagingOutboxStorage(`organization:${organizationId}`),
  );
}
