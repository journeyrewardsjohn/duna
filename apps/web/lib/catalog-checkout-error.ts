import { TRPCError } from "@trpc/server";

function publicCheckoutError(error: unknown): string {
  if (!(error instanceof Error)) return "Checkout could not start.";
  const message = error.message.toLowerCase();
  if (
    message.includes("head office") ||
    message.includes("automatic tax") ||
    message.includes("tax settings") ||
    message.includes("taxable recurring")
  ) {
    return "Card checkout is temporarily unavailable while Duna finishes marketplace tax setup. No charge was made.";
  }
  return error.message;
}

export function catalogCheckoutFailure(
  error: unknown,
):
  | { readonly authRequired: true }
  | { readonly authRequired: false; readonly error: string } {
  if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
    return { authRequired: true };
  }
  return { authRequired: false, error: publicCheckoutError(error) };
}
