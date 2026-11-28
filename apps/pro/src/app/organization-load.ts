/**
 * The organization load at startup (PRIV-2). Each part loads on its own: a
 * part the person's role may not read (the server answers FORBIDDEN) is
 * recorded as refused and everything else still loads. A coach has no
 * `payments:read`, so Money is refused for a coach and the app opens with
 * Money in its "your role doesn't include club money" state.
 *
 * Any other failure still fails the load, so a real outage is never shown as
 * a permission.
 */

export type OrganizationLoaders<T> = {
  readonly [K in keyof T]: () => Promise<T[K]>;
};

export interface OrganizationLoad<T> {
  readonly values: Partial<T>;
  /** Parts the role may not read. */
  readonly refused: ReadonlySet<keyof T>;
  /** The first failure that was not a refusal. */
  readonly failure?: unknown;
}

/** tRPC server errors carry `code`; client errors carry `data.code`. */
export function isRefusal(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const record = reason as {
    readonly code?: unknown;
    readonly data?: { readonly code?: unknown } | null;
  };
  return record.code === "FORBIDDEN" || record.data?.code === "FORBIDDEN";
}

export async function loadOrganizationParts<T extends object>(
  loaders: OrganizationLoaders<T>,
): Promise<OrganizationLoad<T>> {
  const keys = Object.keys(loaders) as (keyof T)[];
  const settled = await Promise.allSettled(keys.map((key) => loaders[key]()));
  const values: Partial<T> = {};
  const refused = new Set<keyof T>();
  let failure: unknown;
  settled.forEach((result, index) => {
    const key = keys[index]!;
    if (result.status === "fulfilled") {
      values[key] = result.value as T[keyof T];
    } else if (isRefusal(result.reason)) {
      refused.add(key);
    } else if (failure === undefined) {
      failure = result.reason;
    }
  });
  return failure === undefined
    ? { values, refused }
    : { values, refused, failure };
}

/** Every part is either loaded or refused. */
export function organizationLoadComplete<T extends object>(
  load: Pick<OrganizationLoad<T>, "values" | "refused">,
  keys: readonly (keyof T)[],
): boolean {
  return keys.every(
    (key) => load.values[key] !== undefined || load.refused.has(key),
  );
}
