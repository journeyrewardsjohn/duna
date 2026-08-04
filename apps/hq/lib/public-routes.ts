export function routeMatches(pathname: string, root: string): boolean {
  return pathname === root || pathname.startsWith(`${root}/`);
}

export function isPublicHqRoute(pathname: string): boolean {
  return (
    routeMatches(pathname, "/sign-in") ||
    routeMatches(pathname, "/sign-up") ||
    routeMatches(pathname, "/auth/callback") ||
    pathname === "/api/cron/sand" ||
    routeMatches(pathname, "/api/health")
  );
}
