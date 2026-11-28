import type { DiscoverQuery } from "./search-state";

/**
 * Where an old discovery address goes: the same query string, untouched (the
 * new page reads every old parameter), on the one search page. The old map
 * page adds `view=map`.
 */
export function legacyDiscoverRedirect(
  query: DiscoverQuery,
  path: string,
  options: { readonly map?: boolean } = {},
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") search.append(key, value);
    else for (const item of value ?? []) search.append(key, item);
  }
  if (options.map) search.set("view", "map");
  const text = search.toString();
  return text ? `${path}?${text}` : path;
}
