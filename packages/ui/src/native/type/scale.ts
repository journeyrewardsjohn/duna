/**
 * Dynamic Type, pure. React Native scales text with the system text size;
 * these caps keep large roles from outgrowing a phone at the largest
 * accessibility sizes while body text keeps growing all the way. The 12 pt
 * readability floor (contract R3) is a minimum before scaling.
 */
import { nativeTokens, type NativeTypeStyle } from "../tokens";

/** Duna's readability floor: no product text below 12 pt. */
export const READABLE_FLOOR = 12;

/** iOS's largest accessibility text size scales body text about 3.1x. */
export const LARGEST_ACCESSIBILITY_SCALE = 3.12;

/**
 * The most a role of this size may scale (React Native's
 * `maxFontSizeMultiplier`). Body and labels (18 pt and under) follow the
 * system to the largest size; headings stop at 2.5x, titles at 2x, display
 * and live-score figures at 1.5x.
 */
export function fontScaleCap(fontSize: number): number {
  if (fontSize <= 18) return LARGEST_ACCESSIBILITY_SCALE;
  if (fontSize <= 24) return 2.5;
  if (fontSize <= 34) return 2;
  return 1.5;
}

/** The size a role renders at for a system font scale, after its cap. */
export function scaledFontSize(fontSize: number, fontScale: number): number {
  return fontSize * Math.min(Math.max(fontScale, 1), fontScaleCap(fontSize));
}

/** Never below the floor: a smaller request renders at 12. */
export function readableFontSize(fontSize: number): number {
  return Math.max(READABLE_FLOOR, fontSize);
}

/** The cap for a named type style. */
export function typeStyleScaleCap(style: NativeTypeStyle): number {
  return fontScaleCap(nativeTokens.type[style].fontSize);
}
