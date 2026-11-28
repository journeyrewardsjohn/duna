import "server-only";
import { getServerContext } from "@/lib/api";

/**
 * Who is looking at a public page: signed in (with the name Duna knows) or a
 * visitor. Server-only; the pages are rendered per request.
 */
export async function pageViewer(): Promise<{
  readonly signedIn: boolean;
  readonly name?: string;
}> {
  const context = await getServerContext().catch(() => undefined);
  const actor = context?.actor;
  return actor
    ? { signedIn: true, name: actor.displayName }
    : { signedIn: false };
}

/**
 * Where an action goes: straight there when signed in, otherwise through
 * sign-in, which returns the visitor to the same action (`returnTo`). The
 * product and club names let the sign-in page say what is being continued.
 */
export function actionHref(input: {
  readonly signedIn: boolean;
  readonly target: string;
  readonly product?: string;
  readonly organization?: string;
}): string {
  if (input.signedIn) return input.target;
  const returnTo =
    input.target.startsWith("/") && !input.target.startsWith("//")
      ? input.target
      : "/app";
  const search = new URLSearchParams({ returnTo });
  if (input.product && input.organization) {
    search.set("product", input.product.slice(0, 120));
    search.set("organization", input.organization.slice(0, 100));
  }
  return `/sign-in?${search.toString()}`;
}
