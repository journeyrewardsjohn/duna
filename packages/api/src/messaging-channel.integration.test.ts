import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as schema from "../../db/src/schema";
const pg = new PGlite();
const database = drizzle(pg, { schema });
vi.mock("@duna/db", async () => ({
  ...(await vi.importActual<typeof import("@duna/db")>("@duna/db")),
  getDatabase: () => database,
  getTransactionalDatabase: () => database,
}));
vi.mock("./messaging-service", () => ({
  loadConversation: vi
    .fn()
    .mockImplementation(async () => ({
      conversation: {
        participants: [],
        context: { organizationId: "20000000-0000-4000-8000-000000000001" },
      },
      permissions: { canPost: true },
    })),
  sendConversationMessage: vi.fn(),
  MessagingError: class extends Error {},
}));
import {
  channelLinkCodeHash,
  consumeMessagingChannelLink,
  revokeMessagingChannelLinks,
  processVerifiedChannelInbound,
} from "./messaging-channel-link";
const personId = "10000000-0000-4000-8000-000000000001";
const organizationId = "20000000-0000-4000-8000-000000000001";
const conversationId = "30000000-0000-4000-8000-000000000001";
const messageId = "40000000-0000-4000-8000-000000000001";
const endpoint = "+15550001111";
const senderPhone = "+15552223333";
const command = `DUNA ${"A".repeat(24)}`;
const now = new Date("2026-11-04T12:00:00Z");
beforeAll(async () => {
  await pg.exec(
    `CREATE TABLE people (id uuid PRIMARY KEY, is_minor boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'active', display_name text NOT NULL DEFAULT 'Adult'); CREATE TABLE organizations (id uuid PRIMARY KEY); CREATE TABLE messaging_conversations (id uuid PRIMARY KEY); CREATE TABLE conversation_messages (id uuid PRIMARY KEY);`,
  );
  for (const migration of [
    "0110_ancient_fenris.sql",
    "0112_black_silvermane.sql",
  ])
    await pg.exec(
      readFileSync(
        new URL(`../../db/drizzle/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  await pg.exec(
    `INSERT INTO people (id) VALUES ('${personId}'); INSERT INTO organizations VALUES ('${organizationId}'); INSERT INTO messaging_conversations VALUES ('${conversationId}'); INSERT INTO conversation_messages VALUES ('${messageId}');`,
  );
});
beforeEach(async () => {
  await pg.exec(
    "TRUNCATE messaging_channel_outbox, messaging_channel_bindings, messaging_channel_challenges CASCADE",
  );
});
afterAll(async () => {
  await pg.close();
});
describe("phone channel database invariants", () => {
  it("disconnect serializes with a concurrent consume and invalidates old codes", async () => {
    await database
      .insert(schema.messagingChannelChallenges)
      .values({
        codeHash: channelLinkCodeHash(command.slice(5)),
        personId,
        organizationId,
        conversationId,
        endpoint,
        expiresAt: new Date(now.getTime() + 600000),
      });
    await Promise.all([
      consumeMessagingChannelLink(command, senderPhone, endpoint, now),
      revokeMessagingChannelLinks({
        personId,
        displayName: "Adult",
        ageBand: "adult",
        roles: ["player"],
        scopes: [],
        isDemo: false,
      }),
    ]);
    const bindings = await database
      .select()
      .from(schema.messagingChannelBindings);
    expect(bindings.every((binding) => binding.revokedAt !== null)).toBe(true);
    expect(
      await consumeMessagingChannelLink(command, senderPhone, endpoint, now),
    ).toBe(false);
  });
  it("STOP invalidates previously issued codes as well as the active binding", async () => {
    await database
      .insert(schema.messagingChannelBindings)
      .values({
        personId,
        organizationId,
        conversationId,
        endpoint,
        senderPhone,
        verifiedAt: now,
      });
    await database
      .insert(schema.messagingChannelChallenges)
      .values({
        codeHash: channelLinkCodeHash(command.slice(5)),
        personId,
        organizationId,
        conversationId,
        endpoint,
        expiresAt: new Date(now.getTime() + 600000),
      });
    expect(
      await processVerifiedChannelInbound({
        senderPhone,
        endpoint,
        content: "STOP",
        clientMessageId: messageId,
        optedOut: true,
        group: false,
        media: false,
      }),
    ).toBe("opted-out");
    expect(
      await consumeMessagingChannelLink(command, senderPhone, endpoint, now),
    ).toBe(false);
    expect(
      (await database.select().from(schema.messagingChannelBindings))[0]
        ?.revokedAt,
    ).not.toBeNull();
  });

  it("consumes a challenge only once under concurrent deliveries", async () => {
    await database.insert(schema.messagingChannelChallenges).values({
      codeHash: channelLinkCodeHash(command.slice(5)),
      personId,
      organizationId,
      conversationId,
      endpoint,
      expiresAt: new Date(now.getTime() + 600000),
    });
    const results = await Promise.all([
      consumeMessagingChannelLink(command, senderPhone, endpoint, now),
      consumeMessagingChannelLink(command, senderPhone, endpoint, now),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const bindings = await database
      .select()
      .from(schema.messagingChannelBindings);
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toMatchObject({
      personId,
      organizationId,
      conversationId,
      senderPhone,
      endpoint,
    });
  });
  it("cannot consume an expired or wrong-endpoint challenge", async () => {
    await database.insert(schema.messagingChannelChallenges).values({
      codeHash: channelLinkCodeHash(command.slice(5)),
      personId,
      organizationId,
      conversationId,
      endpoint,
      expiresAt: now,
    });
    expect(
      await consumeMessagingChannelLink(command, senderPhone, endpoint, now),
    ).toBe(false);
    expect(
      await consumeMessagingChannelLink(
        command,
        senderPhone,
        "+15559999999",
        new Date(now.getTime() - 1000),
      ),
    ).toBe(false);
    expect(
      await database.select().from(schema.messagingChannelBindings),
    ).toHaveLength(0);
  });
  it("enforces one outbox destination and one dispatcher per source message", async () => {
    const [binding] = await database
      .insert(schema.messagingChannelBindings)
      .values({
        personId,
        organizationId,
        conversationId,
        endpoint,
        senderPhone,
        verifiedAt: now,
      })
      .returning();
    const values = {
      sourceMessageId: messageId,
      conversationId,
      bindingId: binding!.id,
      organizationId,
      actorPersonId: personId,
      recipientPersonId: personId,
      endpoint,
      recipientPhone: senderPhone,
      body: "Club: Hello",
    };
    const inserts = await Promise.all([
      database
        .insert(schema.messagingChannelOutbox)
        .values(values)
        .onConflictDoNothing()
        .returning(),
      database
        .insert(schema.messagingChannelOutbox)
        .values({ ...values, recipientPhone: "+15558888888" })
        .onConflictDoNothing()
        .returning(),
    ]);
    expect(inserts.flat()).toHaveLength(1);
    const id = inserts.flat()[0]!.id;
    const claim = () =>
      database
        .update(schema.messagingChannelOutbox)
        .set({ status: "dispatching" })
        .where(
          and(
            eq(schema.messagingChannelOutbox.id, id),
            eq(schema.messagingChannelOutbox.status, "queued"),
          ),
        )
        .returning();
    expect((await Promise.all([claim(), claim()])).flat()).toHaveLength(1);
  });
});
