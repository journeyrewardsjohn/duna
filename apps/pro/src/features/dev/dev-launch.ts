import { Platform, Settings } from "react-native";

/**
 * Development builds only: a deep link to open at launch, read from the app's
 * user defaults so simulators can be driven without touch (the system asks
 * "Open in …?" for `simctl openurl`). Set it with
 *   xcrun simctl spawn <device> defaults write <bundle id> DunaDevOpenUrl "<url>"
 * and remove it with `defaults delete … DunaDevOpenUrl`. Production builds
 * never read it. See docs/mobile/DESIGN_SYSTEM.md.
 */
export function devLaunchUrl(): string | null {
  const development = (globalThis as { __DEV__?: boolean }).__DEV__ === true;
  if (!development || Platform.OS !== "ios") return null;
  const value: unknown = Settings.get("DunaDevOpenUrl");
  return typeof value === "string" && value.length > 0 ? value : null;
}
