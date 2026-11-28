/**
 * Transport glyphs for the player (play, pause, previous and next step,
 * loop), drawn on the icon grid: 24 viewBox, 1.75 stroke, square ends. The
 * shared glyph set has no transport icons yet; these stay local to the family.
 */
import type { ReactNode } from "react";

function Glyph({ children }: { children: ReactNode }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="td-scene__icon"
      fill="none"
      focusable="false"
      height={20}
      stroke="currentColor"
      strokeLinecap="square"
      strokeLinejoin="miter"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      width={20}
    >
      {children}
    </svg>
  );
}

export const PlayGlyph = () => (
  <Glyph>
    <path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" />
  </Glyph>
);

export const PauseGlyph = () => (
  <Glyph>
    <path d="M8 5 V19 M16 5 V19" />
  </Glyph>
);

export const PreviousGlyph = () => (
  <Glyph>
    <path d="M6 5 V19" />
    <path d="M18 5.5 L9.5 12 L18 18.5 Z" fill="currentColor" />
  </Glyph>
);

export const NextGlyph = () => (
  <Glyph>
    <path d="M18 5 V19" />
    <path d="M6 5.5 L14.5 12 L6 18.5 Z" fill="currentColor" />
  </Glyph>
);

export const LoopGlyph = () => (
  <Glyph>
    <path d="M4 11 V9 H17" />
    <path d="M14 6 L17 9 L14 12" />
    <path d="M20 13 V15 H7" />
    <path d="M10 18 L7 15 L10 12" />
  </Glyph>
);
