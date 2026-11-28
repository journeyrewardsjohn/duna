import type { BrowserContext, Page, Request } from "@playwright/test";

/**
 * Interaction quality checks that run on every persona journey without the
 * test author remembering them (definition-of-done.md sections 4, 5 and 9).
 * A journey fails on:
 * - an uncaught page error or an unhandled promise rejection;
 * - a console error;
 * - a response with a 5xx status from the app;
 * - a request that failed outright (not one the browser aborted on navigation);
 * - a duplicate mutation: the same method + path + body sent twice within
 *   DUPLICATE_WINDOW_MS, which is what a double-submitted click looks like.
 */
export type QualityIssueKind =
  | "page-error"
  | "console-error"
  | "server-error"
  | "request-failed"
  | "duplicate-mutation";

export interface QualityIssue {
  readonly kind: QualityIssueKind;
  readonly detail: string;
  readonly url: string;
}

/**
 * An issue the journey expects, with the reason. Prefer fixing the page; an
 * allowance needs a reason a reviewer accepts, and the defects already on
 * `main` live in known-issues.ts with their owner.
 */
export interface QualityAllowance {
  readonly kind: QualityIssueKind;
  readonly match: RegExp;
  readonly reason: string;
}

export const DUPLICATE_WINDOW_MS = 1_500;

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Requests that are not the app's own work: never counted as duplicates. */
const NOT_A_MUTATION = [
  /\/_vercel\/(?:insights|speed-insights)\//,
  /\/__nextjs_original-stack-frame/,
  /\/monitoring(?:\?|$)/,
];

/** Hosts whose failures are reported by the page's own degraded states. */
function isAppRequest(url: string, appOrigins: readonly string[]) {
  return appOrigins.some((origin) => url.startsWith(origin));
}

function pathOf(url: string) {
  const parsed = new URL(url);
  return `${parsed.origin}${parsed.pathname}`;
}

export class QualityMonitor {
  readonly issues: QualityIssue[] = [];
  private readonly recentMutations = new Map<string, number>();

  constructor(private readonly appOrigins: readonly string[]) {}

  /** Records unhandled rejections as console errors the monitor can see. */
  static async install(context: BrowserContext) {
    await context.addInitScript(() => {
      window.addEventListener("unhandledrejection", (event) => {
        const reason = event.reason as { message?: unknown } | undefined;
        console.error(
          `[unhandledrejection] ${String(reason?.message ?? event.reason)}`,
        );
      });
    });
  }

  watch(page: Page) {
    page.on("pageerror", (error) => {
      this.issues.push({
        kind: "page-error",
        detail: `${error.name}: ${error.message}`,
        url: page.url(),
      });
    });
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      if (this.isThirdPartyLoadError(message.text(), message.location().url))
        return;
      this.issues.push({
        kind: "console-error",
        detail: message.text(),
        url: message.location().url || page.url(),
      });
    });
    page.on("response", (response) => {
      if (response.status() < 500) return;
      if (!isAppRequest(response.url(), this.appOrigins)) return;
      this.issues.push({
        kind: "server-error",
        detail: `${response.request().method()} ${response.status()}`,
        url: response.url(),
      });
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure()?.errorText ?? "failed";
      // Navigations and router prefetches cancel in-flight requests.
      if (/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(failure)) return;
      if (!isAppRequest(request.url(), this.appOrigins)) return;
      this.issues.push({
        kind: "request-failed",
        detail: `${request.method()} ${failure}`,
        url: request.url(),
      });
    });
    page.on("request", (request) => this.checkDuplicate(request, page));
  }

  /**
   * A third party's asset (a CDN font, a map embed) failing to load is the
   * network's state, not the app's code, and depends on where the suite runs.
   * The page's own degraded state covers it; the app's own failures still
   * count.
   */
  private isThirdPartyLoadError(text: string, location: string) {
    if (location && !isAppRequest(location, this.appOrigins)) {
      return /Failed to load resource|blocked by CORS policy/.test(text);
    }
    const target = text.match(/(?:at|resource) '?(https?:\/\/[^\s']+)/)?.[1];
    return (
      target !== undefined &&
      !isAppRequest(target, this.appOrigins) &&
      /blocked by CORS policy|Failed to load resource/.test(text)
    );
  }

  private checkDuplicate(request: Request, page: Page) {
    const method = request.method();
    if (!MUTATING_METHODS.has(method)) return;
    const url = request.url();
    if (!isAppRequest(url, this.appOrigins)) return;
    if (NOT_A_MUTATION.some((pattern) => pattern.test(url))) return;
    // A Next.js server action is identified by its action id header.
    const action = request.headers()["next-action"] ?? "";
    const key = `${method} ${pathOf(url)} ${action} ${request.postData() ?? ""}`;
    const now = Date.now();
    const previous = this.recentMutations.get(key);
    this.recentMutations.set(key, now);
    if (previous !== undefined && now - previous <= DUPLICATE_WINDOW_MS) {
      this.issues.push({
        kind: "duplicate-mutation",
        detail: `${method} ${pathOf(url)} sent twice within ${now - previous} ms`,
        url: page.url(),
      });
    }
  }

  /** Issues not covered by an allowance, formatted for a failure message. */
  unexpected(allowances: readonly QualityAllowance[]): QualityIssue[] {
    return this.issues.filter(
      (issue) =>
        !allowances.some(
          (allowance) =>
            allowance.kind === issue.kind &&
            (allowance.match.test(issue.detail) ||
              allowance.match.test(issue.url)),
        ),
    );
  }
}

export function formatIssues(issues: readonly QualityIssue[]) {
  return issues
    .map((issue) => `- [${issue.kind}] ${issue.detail} (at ${issue.url})`)
    .join("\n");
}
