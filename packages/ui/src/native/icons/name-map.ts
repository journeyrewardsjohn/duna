/**
 * From the icons the apps draw today to the shared glyph set. Screen
 * packages use these when they migrate a call site; this foundation does not
 * sweep call sites. `null` means the shared set has no glyph with that
 * meaning yet: keep the old icon there, or ask design for one (never draw a
 * local look-alike).
 */
import type { GlyphName } from "../../icons/glyph-index";

/** Player `DunaIcon` names (`apps/player/duna-icon.tsx`). */
export const playerIconGlyphs = {
  "arrow-left": "chevron-left",
  "arrow-right": "chevron-right",
  ball: "ball",
  bell: null,
  calendar: "schedule",
  camera: "film",
  check: "check",
  "chevron-right": "chevron-right",
  close: "close",
  court: "court",
  "court-booking": "court-free",
  eye: null,
  "eye-off": null,
  lock: "key",
  home: "home",
  heart: "heart-rate",
  message: "message",
  menu: "more",
  microphone: null,
  plus: "plus",
  remote: "watch",
  rotate: "side-switch",
  score: "score",
  search: "search",
  settings: null,
  sparkles: "highlight",
  star: null,
  "trend-up": "improve",
  user: "you",
  video: "film",
  wallet: "wallet",
  whistle: "whistle",
  waves: "tide",
} as const satisfies Record<string, GlyphName | null>;

/** Pro's `lucide-react-native` imports (by component name). */
export const proLucideGlyphs = {
  CalendarDays: "schedule",
  ChevronDown: "chevron-down",
  Ellipsis: "more",
  House: "home",
  Moon: null,
  Plus: "plus",
  Sun: "full-sun",
} as const satisfies Record<string, GlyphName | null>;

export type PlayerIconName = keyof typeof playerIconGlyphs;
export type ProLucideIconName = keyof typeof proLucideGlyphs;
