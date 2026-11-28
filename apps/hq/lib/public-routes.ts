export function routeMatches(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isPublicHqRoute(pathname: string): boolean {
  return (
    routeMatches(pathname, "/sign-in") ||
    routeMatches(pathname, "/sign-up") ||
    routeMatches(pathname, "/auth/callback") ||
    pathname === "/api/cron/sand" ||
    pathname === "/api/cron/websites" ||
    pathname === "/api/cron/workflows" ||
    pathname === "/api/cron/event-operations" ||
    pathname === "/api/cron/vision-improvement" ||
    // The money crons check CRON_SECRET themselves; the proxy blocked them
    // with 401 since they were added, so payouts and reconciliation never ran.
    pathname === "/api/cron/money-payouts" ||
    pathname === "/api/cron/money-reconciliation" ||
    routeMatches(pathname, "/api/health")
  );
}
