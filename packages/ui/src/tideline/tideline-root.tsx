import type { ComponentProps } from "react";
import { cx } from "./cx";

export type TidelineThemeName = "light" | "dark";

export interface TidelineProps extends ComponentProps<"div"> {
  /** The person's preference. Light when omitted. */
  theme?: TidelineThemeName;
  /** `live` is a meaning (a ball is in the air), and wins over the theme. */
  zone?: "live";
  /** Paints the theme's ground behind the content. */
  ground?: boolean;
  /** HQ density: tighter input corners. */
  density?: "hq";
}

/**
 * The scope every Tideline component needs: tokens and styles apply only
 * inside this element, so the rest of the page is untouched. A nested scope
 * states its own theme; it does not inherit the outer one.
 */
export function Tideline({
  theme,
  zone,
  ground = false,
  density,
  className,
  ...props
}: TidelineProps) {
  return (
    <div
      className={cx("td", ground && "td--ground", className)}
      data-density={density}
      data-theme={theme}
      data-zone={zone}
      {...props}
    />
  );
}

/** Geist (product UI and headings) and Geist Mono (codes), both OFL on Google Fonts. */
export const TIDELINE_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&display=swap";

/**
 * Loads the two Tideline families. Render it once on a page that uses
 * Tideline; React hoists the links into `<head>`.
 */
export function TidelineFonts() {
  return (
    <>
      <link href="https://fonts.googleapis.com" rel="preconnect" />
      <link
        crossOrigin="anonymous"
        href="https://fonts.gstatic.com"
        rel="preconnect"
      />
      <link href={TIDELINE_FONT_HREF} precedence="default" rel="stylesheet" />
    </>
  );
}
