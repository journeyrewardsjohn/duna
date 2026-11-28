/**
 * The court data the time picker and the flow share (M-P3): the venue's
 * inventory, the day's availability (refreshed every 30 seconds so a time
 * someone else takes turns "just taken") and the signed-in person's own
 * quote (member rate, Duna Plus, split shares: only the backend prices a
 * buyer). Errors are reported once and come back as a reference id.
 */
import { report } from "@duna/observability";
import { useEffect, useState } from "react";
import { usePlayerRuntime } from "../../../../runtime";
import type {
  BookingParticipant,
  CourtAvailability,
  CourtCheckoutQuote,
  CourtInventory,
} from "../../courts/court-types";
import { checkoutParticipants } from "./roster";

const REFRESH_MS = 30_000;

export function useCourtInventory(venueId: string | undefined) {
  const runtime = usePlayerRuntime();
  const client = runtime.publicClient ?? runtime.client;
  const [inventory, setInventory] = useState<CourtInventory>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!client || !venueId) return;
    let active = true;
    setError(undefined);
    void client.public.courtBookingInventory
      .query({ venueId })
      .then((next) => {
        if (active) setInventory(next);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(report(reason, { event: "player.court.inventory_failed" }));
      });
    return () => {
      active = false;
    };
  }, [attempt, client, venueId]);
  return {
    inventory: inventory?.venue.id === venueId ? inventory : undefined,
    error,
    retry: () => setAttempt((count) => count + 1),
  };
}

export function useCourtAvailability(input: {
  readonly venueId: string | undefined;
  readonly date: string;
  readonly durationMinutes: number | null;
  readonly enabled: boolean;
}) {
  const runtime = usePlayerRuntime();
  const client = runtime.publicClient ?? runtime.client;
  const [availability, setAvailability] = useState<CourtAvailability>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  const { venueId, date, durationMinutes, enabled } = input;
  useEffect(() => {
    if (!client || !venueId || !durationMinutes || !enabled) return;
    let active = true;
    void client.public.courtAvailability
      .query({ venueId, date, durationMinutes })
      .then((next) => {
        if (!active) return;
        setAvailability(next);
        setError(undefined);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            report(reason, { event: "player.court.availability_failed" }),
          );
      });
    const timer = setTimeout(() => setTick((count) => count + 1), REFRESH_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, date, durationMinutes, enabled, tick, venueId]);
  const current =
    availability &&
    availability.date === date &&
    availability.durationMinutes === durationMinutes &&
    availability.venueId === venueId
      ? availability
      : undefined;
  return {
    availability: current,
    error,
    refresh: () => setTick((count) => count + 1),
  };
}

export type QuoteState =
  | { readonly kind: "idle" }
  | { readonly kind: "signed-out" }
  | { readonly kind: "loading"; readonly previous?: CourtCheckoutQuote }
  | { readonly kind: "ready"; readonly quote: CourtCheckoutQuote }
  | { readonly kind: "error"; readonly reference: string };

/** The person's own price for the chosen court, time and roster. */
export function useCourtQuote(input: {
  readonly courtId?: string;
  readonly localStartsAt?: string;
  readonly durationMinutes: number;
  readonly paymentMode: "full" | "split";
  readonly guests: readonly BookingParticipant[];
  readonly enabled: boolean;
}): QuoteState & { readonly retry: () => void } {
  const runtime = usePlayerRuntime();
  const client = runtime.mode === "live" ? runtime.client : undefined;
  const [state, setState] = useState<QuoteState>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const guestsKey = JSON.stringify(checkoutParticipants(input.guests));
  useEffect(() => {
    if (!input.enabled || !input.courtId || !input.localStartsAt) {
      setState({ kind: "idle" });
      return;
    }
    if (!client) {
      setState({ kind: "signed-out" });
      return;
    }
    let active = true;
    setState((previous) => ({
      kind: "loading",
      ...(previous.kind === "ready" ? { previous: previous.quote } : {}),
    }));
    // A short pause so adding three players asks for one quote, not three.
    const timer = setTimeout(() => {
      void client.player.courtCheckoutQuote
        .query({
          courtId: input.courtId!,
          localStartsAt: input.localStartsAt!.slice(0, 16),
          durationMinutes: input.durationMinutes,
          paymentMode: input.paymentMode,
          participants: [...checkoutParticipants(input.guests)],
        })
        .then((quote) => {
          if (active) setState({ kind: "ready", quote });
        })
        .catch((reason: unknown) => {
          if (active)
            setState({
              kind: "error",
              reference: report(reason, { event: "player.court.quote_failed" }),
            });
        });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
    // guestsKey stands for the guests.
  }, [
    attempt,
    client,
    guestsKey,
    input.courtId,
    input.durationMinutes,
    input.enabled,
    input.localStartsAt,
    input.paymentMode,
  ]);
  return { ...state, retry: () => setAttempt((count) => count + 1) };
}
