/**
 * Column helpers shared by the W3 domain schema files (W3-0, schema steward).
 *
 * The same conventions as ../schema.ts: `timestamp with time zone` in `date`
 * mode, money as integer minor units beside an upper-case ISO 4217 currency,
 * enumerations as varchar plus a CHECK constraint (new tables do not add
 * Postgres enums, so adding a state never needs `ALTER TYPE`).
 */
import { sql, type SQL } from "drizzle-orm";
import { timestamp, varchar } from "drizzle-orm/pg-core";

export const createdAtColumn = () =>
  timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

export const updatedAtColumn = () =>
  timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow();

export const at = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const currencyColumn = (name = "currency") =>
  varchar(name, { length: 3 }).notNull().default("USD");

/** `column IN ('a', 'b')` for a CHECK constraint, from a readonly tuple. */
export function oneOf(
  column: SQL | { getSQL(): SQL },
  values: readonly string[],
): SQL {
  return sql`${column} IN (${sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "))})`;
}

/** `column IS NULL OR column IN (...)`. */
export function nullOrOneOf(
  column: SQL | { getSQL(): SQL },
  values: readonly string[],
): SQL {
  return sql`${column} IS NULL OR ${oneOf(column, values)}`;
}

export function upperCurrency(column: SQL | { getSQL(): SQL }): SQL {
  return sql`${column} ~ '^[A-Z]{3}$'`;
}
