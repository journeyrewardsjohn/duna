import { createHash } from "node:crypto";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

function normalize(
  value: unknown,
  inArray = false,
): CanonicalValue | undefined {
  if (value === undefined) return inArray ? null : undefined;
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Canonical JSON does not support non-finite numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item, true) ?? null);
  }
  if (typeof value === "object") {
    const normalized: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value).sort()) {
      const item = normalize((value as Record<string, unknown>)[key]);
      if (item !== undefined) normalized[key] = item;
    }
    return normalized;
  }
  throw new Error(`Canonical JSON does not support ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value) ?? null);
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
