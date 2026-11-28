"use client";

/**
 * The page-level honest states of the Player pages, on the kit: a read that
 * was refused for the per-person budget ("Duna is busy"), a read that failed
 * (with its reference), the offline banner, and a page a junior account or a
 * guardian acting for one may not use.
 */
import {
  Button,
  ErrorState,
  OfflineBanner,
  PermissionDenied,
  useOnline,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { AppLink } from "@/components/app-shell/navigation";

export function ReadFailed({
  busy,
  reference,
  what = "This page",
}: {
  readonly busy: boolean;
  readonly reference: string;
  /** "Your plans", "This match". */
  readonly what?: string;
}) {
  const router = useRouter();
  return (
    <section className="pp-state">
      <ErrorState
        action={<AppLink href="/app">Back to Home</AppLink>}
        message={
          busy
            ? "Duna is busy for a moment. Wait a few seconds and try again. If it keeps happening, send Duna support the reference below."
            : "Something went wrong on our side, not yours. Try again. If it keeps happening, send Duna support the reference below."
        }
        onRetry={() => router.refresh()}
        reference={reference}
        title={busy ? "Duna is busy" : `${what} didn’t load`}
      />
    </section>
  );
}

/** Offline: what still works, never Solar. */
export function OfflineNotice({
  writes = "refused",
}: {
  readonly writes?: "queued" | "refused";
}) {
  const online = useOnline();
  if (online) return null;
  return <OfflineBanner online={false} writes={writes} />;
}

export function NotForThisAccount({
  area,
  grantedBy,
  action,
}: {
  readonly area: string;
  readonly grantedBy: string;
  readonly action?: ReactNode;
}) {
  return (
    <section className="pp-state">
      <PermissionDenied
        action={
          action ?? (
            <Button href="/app" variant="secondary">
              Back to Home
            </Button>
          )
        }
        area={area}
        grantedBy={grantedBy}
      />
    </section>
  );
}
