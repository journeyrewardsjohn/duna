/**
 * Whether this device should be offered the 3D view. No WebGL, a data saver
 * or a reduced-data preference, or very little memory: the player stays 2D
 * and says nothing about it. Browser-only; never imports three.js.
 */
interface NavigatorHints {
  readonly connection?: { readonly saveData?: boolean };
  readonly deviceMemory?: number;
}

export function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export type ThreeDimensionalSupport =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "no-webgl" | "data-saver" | "low-memory" | "server";
    };

export function threeDimensionalSupport(): ThreeDimensionalSupport {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ok: false, reason: "server" };
  }
  const hints = navigator as Navigator & NavigatorHints;
  if (hints.connection?.saveData) return { ok: false, reason: "data-saver" };
  if (window.matchMedia?.("(prefers-reduced-data: reduce)").matches) {
    return { ok: false, reason: "data-saver" };
  }
  if (typeof hints.deviceMemory === "number" && hints.deviceMemory < 1) {
    return { ok: false, reason: "low-memory" };
  }
  return webglAvailable() ? { ok: true } : { ok: false, reason: "no-webgl" };
}
