import { neon } from "@neondatabase/serverless";
import {
  drizzle as drizzleHttp,
  type NeonHttpDatabase,
} from "drizzle-orm/neon-http";
import {
  drizzle as drizzleTransactional,
  type NeonDatabase,
} from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

/**
 * The Neon HTTP driver accepts individual queries and batches, but cannot
 * execute interactive transactions. Keeping `transaction` out of this type
 * makes accidental use a compile-time error; use `getTransactionalDatabase`
 * whenever multiple statements must succeed or fail together.
 */
type HttpDatabase = Omit<NeonHttpDatabase<typeof schema>, "transaction">;

let database: HttpDatabase | undefined;
let readOnlyDatabase: HttpDatabase | undefined;
let transactionalDatabase: NeonDatabase<typeof schema> | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function isReadOnlyReplicaConfigured(): boolean {
  return Boolean(process.env.NEON_READ_ONLY_REPLICA);
}

export function getDatabase(): HttpDatabase {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Use the demo adapter or connect Neon.",
    );
  }
  if (!database) {
    database = drizzleHttp(neon(connectionString), { schema });
  }
  return database;
}

/**
 * Returns the Neon read-only replica for latency-tolerant reads. A replica can
 * lag the primary, so authorization, checkout, capacity, live state, messaging
 * cursors, and read-after-write flows must continue to use `getDatabase()`.
 * Local and isolated environments may omit the replica and safely fall back to
 * the primary connection.
 */
export function getReadOnlyDatabase(): HttpDatabase {
  const connectionString =
    process.env.NEON_READ_ONLY_REPLICA || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "NEON_READ_ONLY_REPLICA and DATABASE_URL are not configured. Use the demo adapter or connect Neon.",
    );
  }
  if (!readOnlyDatabase) {
    readOnlyDatabase = drizzleHttp(neon(connectionString), { schema });
  }
  return readOnlyDatabase;
}

export function getTransactionalDatabase(): NeonDatabase<typeof schema> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not configured. Use the demo adapter or connect Neon.",
    );
  }
  if (!transactionalDatabase) {
    transactionalDatabase = drizzleTransactional(connectionString, { schema });
  }
  return transactionalDatabase;
}
