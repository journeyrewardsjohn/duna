"use client";

/**
 * Honest states for a pane: error, offline, not configured yet, switched
 * off, no permission, partial data, and empty with its next action, plus
 * `AsyncBoundary`, which picks between loading, error, empty and content.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "../base/cx";
import { Icon, type IconName } from "../base/icons";
import { Button } from "../button/button";
import { errorMessage, errorReference } from "../interactions/errors";
import { useDelayedLoading } from "../interactions/interactions";
import { useAction, useOnline } from "../interactions/kit-hooks";
import { EmptyState, Notice } from "../surfaces/surfaces";
import { type LoadingLayout, LoadingState } from "./skeletons";

interface StateBlockProps {
  kind: string;
  icon: IconName;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  role?: "alert" | "status";
  compact?: boolean;
  className?: string;
}

/** The shared shape: a small icon, a title, one or two lines, the next step. */
function StateBlock({
  kind,
  icon,
  title,
  children,
  actions,
  role,
  compact = false,
  className,
}: StateBlockProps) {
  return (
    <div
      className={cx("td-state", compact && "td-state--compact", className)}
      data-kind={kind}
      role={role}
    >
      <span aria-hidden="true" className="td-state__glyph">
        <Icon name={icon} />
      </span>
      <div className="td-state__body">
        <p className="td-state__title">{title}</p>
        {children ? <div className="td-state__text">{children}</div> : null}
        {actions ? <div className="td-state__actions">{actions}</div> : null}
      </div>
    </div>
  );
}

/** "Reference: req_…" with a Copy button, for support to find the log line. */
export function ReferenceLine({ reference }: { reference: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  // Known only in the browser: decided after hydration so both renders agree.
  const [canCopy, setCanCopy] = useState(false);
  useEffect(() => {
    setCanCopy(Boolean(navigator.clipboard));
  }, []);
  return (
    <p className="td-state__reference">
      <span>
        Reference: <span className="td-state__code">{reference}</span>
      </span>
      {canCopy ? (
        <Button
          onClick={() =>
            navigator.clipboard.writeText(reference).then(() => setCopied(true))
          }
          size="sm"
          variant="ghost"
        >
          {copied ? "Copied" : "Copy reference"}
        </Button>
      ) : null}
    </p>
  );
}

export interface ErrorStateProps {
  /** What failed, plainly: "Could not load the schedule". */
  title?: ReactNode;
  /**
   * What to do. Defaults to the API's own message for people, or "Check
   * your connection and try again."
   */
  message?: ReactNode;
  /** The error, for its message and reference. Never shown raw. */
  error?: unknown;
  /** A request id or digest; read from `error` when left out. */
  reference?: string;
  /** Try again. Runs once at a time, with progress on the button. */
  onRetry?: () => unknown;
  retryLabel?: string;
  /**
   * Hands the error to the error reporter once (the observability
   * package's `report`). May return the reference it logged under.
   */
  report?: (error: unknown) => string | void;
  /** A second action, like "Back to members". */
  action?: ReactNode;
  /** A smaller version for a pane inside a page. */
  compact?: boolean;
  className?: string;
}

/**
 * Something failed: what happened, what to do, Try again, and the reference
 * a developer can search for. A person never sees a stack, provider text or
 * a vendor name.
 */
export function ErrorState({
  title = "Something went wrong",
  message,
  error,
  reference,
  onRetry,
  retryLabel = "Try again",
  report,
  action,
  compact,
  className,
}: ErrorStateProps) {
  const [reported, setReported] = useState<string | undefined>();
  const reportedFor = useRef<unknown>(null);
  useEffect(() => {
    if (!report || error === undefined || reportedFor.current === error) return;
    reportedFor.current = error;
    const logged = report(error);
    if (typeof logged === "string") setReported(logged);
  }, [error, report]);
  const retry = useAction(async () => {
    await onRetry?.();
  });
  const shownReference = reference ?? errorReference(error) ?? reported;
  return (
    <StateBlock
      actions={
        onRetry || action ? (
          <>
            {onRetry ? (
              <Button {...retry.buttonProps} variant="secondary">
                {retryLabel}
              </Button>
            ) : null}
            {action}
          </>
        ) : undefined
      }
      className={className}
      compact={compact}
      icon="alert"
      kind="error"
      role="alert"
      title={title}
    >
      <p>
        {message ?? errorMessage(error, "Check your connection and try again.")}
      </p>
      {shownReference ? <ReferenceLine reference={shownReference} /> : null}
    </StateBlock>
  );
}

export interface OfflineBannerProps {
  /** Override the browser's signal (tests, the gallery). */
  online?: boolean;
  /** When the data on screen was last fresh. */
  lastFresh?: Date | number;
  /** What happens to changes: they wait (`queued`) or are refused until back online. */
  writes?: "queued" | "refused";
  className?: string;
}

const time = (value: Date | number) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);

/**
 * A banner while the browser is offline: the data may be out of date, when
 * it was last fresh, and what happens to changes. Never Solar: offline is
 * not live.
 */
export function OfflineBanner({
  online,
  lastFresh,
  writes = "queued",
  className,
}: OfflineBannerProps) {
  const browserOnline = useOnline();
  const isOnline = online ?? browserOnline;
  if (isOnline) return null;
  return (
    <Notice
      banner
      className={cx("td-offline", className)}
      role="status"
      title="You're offline"
      tone="warning"
    >
      {lastFresh
        ? `Showing what was loaded at ${time(lastFresh)}; it may be out of date. `
        : "What you see may be out of date. "}
      {writes === "queued"
        ? "Changes wait and are sent when you're back online."
        : "Changes can't be saved until you're back online."}
    </Notice>
  );
}

export interface NotConfiguredProps {
  /** The feature: "Online payments". */
  feature: string;
  /** What it needs, in product words: "a Duna Pay account". Never a vendor name. */
  needs?: string;
  /** Who sees it: the owner gets the setup link, everyone else who to ask. */
  canSetUp?: boolean;
  /** The owner's setup page: a link or a Button. */
  setup?: ReactNode;
  /** Who can set it up, for everyone else: "a club owner". */
  owner?: string;
  compact?: boolean;
  className?: string;
}

/**
 * The feature is on, but its provider is not set up yet. Honest wording, no
 * invented data, and the way forward: the setup page for the owner, who to
 * ask for anyone else.
 */
export function NotConfigured({
  feature,
  needs,
  canSetUp = false,
  setup,
  owner = "a club owner",
  compact,
  className,
}: NotConfiguredProps) {
  return (
    <StateBlock
      actions={canSetUp && setup ? setup : undefined}
      className={className}
      compact={compact}
      icon="plug"
      kind="not-configured"
      role="status"
      title={`${feature} isn't set up yet`}
    >
      <p>
        {needs ? `It needs ${needs}. ` : null}
        {canSetUp
          ? "Nothing is sent or charged until it is set up."
          : `Ask ${owner} to set it up.`}
      </p>
    </StateBlock>
  );
}

export interface FeatureOffProps {
  feature: string;
  /** Why, if it helps: "An owner turned it off." */
  reason?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** The feature is switched off (a kill switch), not broken and not missing. */
export function FeatureOff({
  feature,
  reason,
  action,
  compact,
  className,
}: FeatureOffProps) {
  return (
    <StateBlock
      actions={action}
      className={className}
      compact={compact}
      icon="power"
      kind="feature-off"
      role="status"
      title={`${feature} is switched off`}
    >
      <p>{reason ?? "It will be back when it is switched on again."}</p>
    </StateBlock>
  );
}

export interface PermissionDeniedProps {
  /** What they tried to open: "Money". */
  area: string;
  /** Who can give access: "an owner of Harbour Beach Club". */
  grantedBy?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

/** No access: why, and who can grant it. The server refuses too. */
export function PermissionDenied({
  area,
  grantedBy = "an owner",
  action,
  compact,
  className,
}: PermissionDeniedProps) {
  return (
    <StateBlock
      actions={action}
      className={className}
      compact={compact}
      icon="lock"
      kind="permission-denied"
      role="status"
      title={`You don't have access to ${area}`}
    >
      <p>Ask {grantedBy} to give you access.</p>
    </StateBlock>
  );
}

export interface PartialDataProps {
  /** What is missing, in words: ["court surface", "opening hours"]. */
  missing: string[];
  /** What to do, like an Add details link. */
  action?: ReactNode;
  className?: string;
}

const list = (items: string[]) =>
  new Intl.ListFormat(undefined, { type: "conjunction" }).format(items);

/** Some values are missing: they say "Pending", never zero, and the rest works. */
export function PartialData({ missing, action, className }: PartialDataProps) {
  if (missing.length === 0) return null;
  return (
    <Notice
      action={action}
      className={cx("td-partial", className)}
      title="Some details are still pending"
      tone="info"
    >
      {`Not set yet: ${list(missing)}. Everything else is up to date.`}
    </Notice>
  );
}

export interface EmptyNextAction {
  title: ReactNode;
  description?: ReactNode;
  /** The one next action. An empty state always has one. */
  action: ReactNode;
  icon?: IconName;
}

/** Nothing here yet: a title, one line and the one next action. */
export function EmptyFirstUse({
  title,
  description,
  action,
  icon = "plus",
}: EmptyNextAction) {
  return (
    <EmptyState
      actions={action}
      description={description}
      icon={icon}
      title={title}
    />
  );
}

export interface EmptyResultsProps {
  /** The search or filter that found nothing. */
  query?: string;
  /** Clears the search or filters. */
  onClear: () => void;
  clearLabel?: string;
}

/** A search or filter found nothing: say what was searched and offer to clear it. */
export function EmptyResults({
  query,
  onClear,
  clearLabel = "Clear search",
}: EmptyResultsProps) {
  return (
    <EmptyState
      actions={
        <Button onClick={onClear} size="sm" variant="secondary">
          {clearLabel}
        </Button>
      }
      description="Check the spelling or try fewer words."
      icon="search"
      title={
        query ? `Nothing matches “${query}”` : "Nothing matches these filters"
      }
    />
  );
}

export interface AsyncBoundaryProps {
  /** The pane's data is loading. */
  loading: boolean;
  /** The last load failed. */
  error?: unknown;
  /** Data is on screen from an earlier load: keep it (dimmed) while reloading or after an error. */
  hasData?: boolean;
  /** Loaded, and there is nothing to show. */
  empty?: boolean;
  /** The first load's placeholder: a layout, or your own. */
  skeleton?: LoadingLayout | ReactNode;
  /** Announced while the first load shows: "Loading members". */
  loadingLabel?: string;
  /** What to show when empty: title, line and the one next action. */
  emptyState?: EmptyNextAction;
  errorTitle?: ReactNode;
  onRetry?: () => unknown;
  report?: ErrorStateProps["report"];
  className?: string;
  children: ReactNode;
}

/**
 * One boundary for a pane: loading, error, empty and content, in one place.
 *
 * - First load: the skeleton holds the layout's space at once but only
 *   becomes visible after 250 ms (then stays 400 ms), so fast loads show
 *   nothing and slow ones never jump.
 * - Reload with data on screen: the data stays, dimmed, marked busy.
 * - Error with no data: `ErrorState` with Try again and the reference.
 * - Error with data: the data stays, dimmed, under a compact error.
 * - Empty: the empty state and its next action.
 */
export function AsyncBoundary({
  loading,
  error,
  hasData = false,
  empty = false,
  skeleton = "list",
  loadingLabel = "Loading",
  emptyState,
  errorTitle = "Could not load this",
  onRetry,
  report,
  className,
  children,
}: AsyncBoundaryProps) {
  const visible = useDelayedLoading(loading);
  const failed = error !== undefined && error !== null && !loading;
  let content: ReactNode;
  if (loading && !hasData) {
    content = (
      <div className="td-async__wait" data-visible={visible ? "" : undefined}>
        {typeof skeleton === "string" ? (
          <LoadingState
            label={loadingLabel}
            layout={skeleton as LoadingLayout}
          />
        ) : (
          skeleton
        )}
      </div>
    );
  } else if (failed && !hasData) {
    content = (
      <ErrorState
        error={error}
        onRetry={onRetry}
        report={report}
        title={errorTitle}
      />
    );
  } else if (!failed && !loading && empty && emptyState) {
    content = <EmptyFirstUse {...emptyState} />;
  } else {
    content = (
      <>
        {failed ? (
          <ErrorState
            compact
            error={error}
            onRetry={onRetry}
            report={report}
            title={errorTitle}
          />
        ) : null}
        <div
          className="td-async__content"
          data-stale={failed || (loading && visible) ? "" : undefined}
        >
          {children}
        </div>
      </>
    );
  }
  return (
    <div aria-busy={loading || undefined} className={cx("td-async", className)}>
      {content}
    </div>
  );
}
