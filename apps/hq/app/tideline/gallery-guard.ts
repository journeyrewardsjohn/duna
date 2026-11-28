import type { HqDevOnlyRoutePrefix } from "@duna/core/hq-routes";

/**
 * The Tideline gallery is a development tool. It exists only when HQ runs with
 * `TIDELINE_GALLERY=1`; otherwise `/tideline` and everything under it is a
 * plain 404, answered by the proxy before any page, layout or loading UI runs.
 * Read per request, so one build serves both answers. The path is one of the
 * route map's `hqDevOnlyRoutePrefixes`, so its route test skips it as well.
 */
export const TIDELINE_GALLERY_PATH: HqDevOnlyRoutePrefix = "/tideline";

export function isTidelineGalleryEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.TIDELINE_GALLERY === "1";
}

export function isHiddenTidelineGalleryRoute(
  pathname: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const inGallery =
    pathname === TIDELINE_GALLERY_PATH ||
    pathname.startsWith(`${TIDELINE_GALLERY_PATH}/`);
  return inGallery && !isTidelineGalleryEnabled(env);
}
