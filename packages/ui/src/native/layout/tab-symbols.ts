/**
 * Whether tab items may carry their SF Symbol. iPadOS 26's floating tab bar
 * never finishes laying out an item that has a symbol image (UIKit loops in
 * `-[_UIFloatingTabBar layoutSubviews]` measuring the symbol, the main thread
 * spins and the app never draws its first frame: a Night Court splash
 * forever). That bar shows titles only, so on iPad before iPadOS 27 the items
 * go without symbols; iPhone, the Duo and iPadOS 27 keep them. Pure;
 * unit-tested.
 */
export function tabSymbolsSupported(platform: {
  readonly os: string;
  readonly isPad: boolean;
  readonly version: string | number;
}): boolean {
  if (platform.os !== "ios" || !platform.isPad) return true;
  const major = Number.parseInt(String(platform.version), 10);
  return !Number.isFinite(major) || major >= 27;
}
