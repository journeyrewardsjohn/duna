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
let transactionalDatabase: NeonDatabase<typeof schema> | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
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
