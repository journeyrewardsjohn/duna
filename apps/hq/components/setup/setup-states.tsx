import {
  Button,
  ErrorState,
  NotConfigured,
  Skeleton,
  SkeletonListRow,
} from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import type { Loaded } from "./setup-data";

/**
 * The honest states a Club setup block can be in: you need access, not set
 * up yet, not found, or failed with its reference.
 */
export function SetupBlockState({
  loaded,
  what,
  organization,
  retryHref,
}: {
  readonly loaded: Exclude<Loaded<unknown>, { state: "ok" }>;
  /** "your club's profile" */
  readonly what: string;
  readonly organization: string;
  readonly retryHref?: string;
}) {
  switch (loaded.state) {
    case "denied":
      return (
        <AccessDeniedState
          area={what}
          compact
          grantedBy={`an owner or manager of ${organization}`}
        />
      );
    case "not-configured":
      return (
        <NotConfigured
          compact
          feature={what.replace(/^\w/, (c) => c.toUpperCase())}
          needs="Duna Database"
          owner="Duna support"
        />
      );
    case "not-found":
      return (
        <p className="setup-quiet">
          {`Duna has no record of ${what} for ${organization}.`}
        </p>
      );
    case "error":
      return (
        <ErrorState
          action={
            retryHref ? (
              <Button href={retryHref} size="sm" variant="secondary">
                Reload
              </Button>
            ) : undefined
          }
          compact
          message="Something went wrong on our side. Reload to try again; the rest of Club setup still works."
          reference={loaded.reference}
          title={`Could not load ${what}`}
        />
      );
  }
}

/** Rows while a list loads, shaped like the rows. */
export function SetupRowsSkeleton({
  label,
  rows = 4,
}: {
  readonly label: string;
  readonly rows?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="setup-skeleton"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListRow avatar={false} key={index} lines={2} />
      ))}
    </div>
  );
}

/** The whole Club setup screen while it loads (route-level `loading.tsx`). */
export function SetupLoading({ children }: { readonly children?: ReactNode }) {
  return (
    <div aria-busy="true" className="setup">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading Club setup" lines={2} />
          </div>
        </div>
      </div>
      {children ?? (
        <div className="hqs-section">
          <SetupRowsSkeleton label="Loading" rows={5} />
        </div>
      )}
    </div>
  );
}
