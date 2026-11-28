import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  ErrorState,
  NotConfigured,
  Skeleton,
  SkeletonListRow,
} from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import type { Loaded } from "./money-data";

/**
 * The honest states every Money block can be in (interaction kit, "States"):
 * you need access, not configured yet, not found, or failed with its
 * reference. A block in one of these never shows an amount.
 */
export function BlockState({
  loaded,
  what,
  organization,
  canSetUp,
  feature,
  needs = "Duna Pay",
  retryHref,
}: {
  readonly loaded: Exclude<Loaded<unknown>, { state: "ok" }>;
  /** "your payouts" */
  readonly what: string;
  readonly organization: string;
  readonly canSetUp?: boolean;
  /** For not-configured: "Payout history". */
  readonly feature?: string;
  readonly needs?: string;
  readonly retryHref?: string;
}) {
  switch (loaded.state) {
    case "denied":
      return (
        <AccessDeniedState
          area={what}
          compact
          grantedBy={`an owner of ${organization}`}
        />
      );
    case "not-configured":
      return (
        <NotConfigured
          canSetUp={canSetUp}
          compact
          feature={feature ?? what.replace(/^\w/, (c) => c.toUpperCase())}
          needs={needs}
          owner={`an owner of ${organization}`}
          setup={
            <Button href={hqHref("moneyDunaPay")} size="sm" variant="secondary">
              Open Duna Pay setup
            </Button>
          }
        />
      );
    case "not-found":
      return (
        <p className="money-quiet">
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
          message="Something went wrong on our side. Reload to try again; the rest of Money still works."
          reference={loaded.reference}
          title={`Could not load ${what}`}
        />
      );
  }
}

/** A list or block while it loads, shaped like its rows. */
export function MoneyRowsSkeleton({
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
      className="money-skeleton"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListRow avatar={false} key={index} lines={2} />
      ))}
    </div>
  );
}

/** The whole Money screen while it loads (route-level `loading.tsx`). */
export function MoneyLoading({ children }: { readonly children?: ReactNode }) {
  return (
    <div aria-busy="true" className="money">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading Money" lines={2} />
          </div>
        </div>
      </div>
      {children ?? (
        <>
          <div className="money-figures money-skeleton">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="money-figure" key={index}>
                <Skeleton kind="lines" lines={2} />
              </div>
            ))}
          </div>
          <div className="hqs-section">
            <MoneyRowsSkeleton label="Loading" rows={4} />
          </div>
        </>
      )}
    </div>
  );
}
