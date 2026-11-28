/**
 * Where drafts live. The database in production (`score_drafts`, always the
 * primary: drafts are read straight after they are written); an in-memory
 * map in demo mode (CI and Playwright have no database), so the whole flow
 * still works there for one server process.
 */
import { getDatabase, scoreDrafts } from "@duna/db";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { AddScoreDraftData } from "../../contracts/add-score";

export type DraftStatus = "draft" | "claiming" | "claimed";
export type DraftPlaceKind = "duna" | "places" | "described";

export interface DraftRecord {
  readonly id: string;
  readonly tokenHash: string;
  readonly status: DraftStatus;
  readonly data: AddScoreDraftData;
  readonly placeKind: DraftPlaceKind | null;
  readonly venueId: string | null;
  readonly venueCandidateId: string | null;
  readonly playedOn: string | null;
  readonly claimedByPersonId: string | null;
  readonly claimedMatchId: string | null;
  readonly claimStartedAt: Date | null;
  readonly claimedAt: Date | null;
  readonly expiresAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export type DraftPatch = Partial<
  Omit<DraftRecord, "id" | "tokenHash" | "createdAt" | "expiresAt">
>;

export interface DraftStore {
  findByTokenHash(tokenHash: string): Promise<DraftRecord | undefined>;
  insert(record: DraftRecord): Promise<DraftRecord>;
  update(id: string, patch: DraftPatch): Promise<DraftRecord | undefined>;
  /**
   * Moves a draft from one of `from` to the patch's state, only if it is
   * still in one of them: the claim's lock. Returns the row when it moved.
   */
  transition(
    id: string,
    from: readonly DraftStatus[],
    patch: DraftPatch,
    guard?: { readonly claimedByPersonId?: string },
  ): Promise<DraftRecord | undefined>;
  delete(id: string): Promise<boolean>;
  /** Deletes drafts past their expiry (claimed or not); returns how many. */
  deleteExpired(now: Date, limit: number): Promise<number>;
}

type Row = typeof scoreDrafts.$inferSelect;

function fromRow(row: Row): DraftRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    status: row.status as DraftStatus,
    data: (row.data ?? {}) as AddScoreDraftData,
    placeKind: (row.placeKind as DraftPlaceKind | null) ?? null,
    venueId: row.venueId,
    venueCandidateId: row.venueCandidateId,
    playedOn: row.playedOn,
    claimedByPersonId: row.claimedByPersonId,
    claimedMatchId: row.claimedMatchId,
    claimStartedAt: row.claimStartedAt,
    claimedAt: row.claimedAt,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toValues(patch: DraftPatch) {
  const values: Partial<typeof scoreDrafts.$inferInsert> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    (values as Record<string, unknown>)[key] =
      key === "data" ? (value as Record<string, unknown>) : value;
  }
  return values;
}

export class DatabaseDraftStore implements DraftStore {
  async findByTokenHash(tokenHash: string) {
    const rows = await getDatabase()
      .select()
      .from(scoreDrafts)
      .where(eq(scoreDrafts.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ? fromRow(rows[0]) : undefined;
  }

  async insert(record: DraftRecord) {
    const [row] = await getDatabase()
      .insert(scoreDrafts)
      .values({
        ...record,
        data: record.data as Record<string, unknown>,
      })
      .returning();
    return fromRow(row!);
  }

  async update(id: string, patch: DraftPatch) {
    const [row] = await getDatabase()
      .update(scoreDrafts)
      .set(toValues(patch))
      .where(eq(scoreDrafts.id, id))
      .returning();
    return row ? fromRow(row) : undefined;
  }

  async transition(
    id: string,
    from: readonly DraftStatus[],
    patch: DraftPatch,
    guard?: { readonly claimedByPersonId?: string },
  ) {
    const [row] = await getDatabase()
      .update(scoreDrafts)
      .set(toValues(patch))
      .where(
        and(
          eq(scoreDrafts.id, id),
          inArray(scoreDrafts.status, [...from]),
          guard?.claimedByPersonId
            ? eq(scoreDrafts.claimedByPersonId, guard.claimedByPersonId)
            : undefined,
        ),
      )
      .returning();
    return row ? fromRow(row) : undefined;
  }

  async delete(id: string) {
    const rows = await getDatabase()
      .delete(scoreDrafts)
      .where(eq(scoreDrafts.id, id))
      .returning({ id: scoreDrafts.id });
    return rows.length > 0;
  }

  async deleteExpired(now: Date, limit: number) {
    const expired = getDatabase()
      .select({ id: scoreDrafts.id })
      .from(scoreDrafts)
      .where(lte(scoreDrafts.expiresAt, now))
      .limit(limit);
    const rows = await getDatabase()
      .delete(scoreDrafts)
      .where(sql`${scoreDrafts.id} IN (${expired})`)
      .returning({ id: scoreDrafts.id });
    return rows.length;
  }
}

/** Demo mode: one process, one map. Same behaviour as the table. */
export class MemoryDraftStore implements DraftStore {
  readonly #rows = new Map<string, DraftRecord>();

  async findByTokenHash(tokenHash: string) {
    for (const row of this.#rows.values()) {
      if (row.tokenHash === tokenHash) return row;
    }
    return undefined;
  }

  async insert(record: DraftRecord) {
    this.#rows.set(record.id, record);
    return record;
  }

  async update(id: string, patch: DraftPatch) {
    const current = this.#rows.get(id);
    if (!current) return undefined;
    const next = { ...current, ...stripUndefined(patch) };
    this.#rows.set(id, next);
    return next;
  }

  async transition(
    id: string,
    from: readonly DraftStatus[],
    patch: DraftPatch,
    guard?: { readonly claimedByPersonId?: string },
  ) {
    const current = this.#rows.get(id);
    if (!current || !from.includes(current.status)) return undefined;
    if (
      guard?.claimedByPersonId &&
      current.claimedByPersonId !== guard.claimedByPersonId
    ) {
      return undefined;
    }
    return this.update(id, patch);
  }

  async delete(id: string) {
    return this.#rows.delete(id);
  }

  async deleteExpired(now: Date, limit: number) {
    let removed = 0;
    for (const [id, row] of this.#rows) {
      if (removed >= limit) break;
      if (row.expiresAt.getTime() <= now.getTime()) {
        this.#rows.delete(id);
        removed += 1;
      }
    }
    return removed;
  }
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
