import "server-only";
import { report } from "@duna/observability";

/**
 * A public read that can be there, be missing (the address is wrong or the
 * thing is not public) or fail. A failure is reported once and its
 * reference shown on the page, so a visitor can quote it to support.
 */
export type Loaded<T> =
  | { readonly status: "ok"; readonly value: T }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly reference: string };

function notFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "NOT_FOUND"
  );
}

export async function load<T>(
  read: () => Promise<T>,
  event: string,
  fields: Readonly<Record<string, string>> = {},
): Promise<Loaded<T>> {
  try {
    return { status: "ok", value: await read() };
  } catch (error) {
    if (notFound(error)) return { status: "missing" };
    return {
      status: "error",
      reference: report(error, { event, fields }),
    };
  }
}

export function value<T>(loaded: Loaded<T>): T | undefined {
  return loaded.status === "ok" ? loaded.value : undefined;
}
