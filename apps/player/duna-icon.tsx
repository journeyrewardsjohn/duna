import type { ReactNode } from "react";
import Svg, {
  Circle,
  Line,
  Path,
  Polyline,
  Rect,
  type SvgProps,
} from "react-native-svg";

export type DunaIconName =
  | "arrow-left"
  | "arrow-right"
  | "ball"
  | "bell"
  | "calendar"
  | "camera"
  | "check"
  | "chevron-right"
  | "close"
  | "court"
  | "court-booking"
  | "eye"
  | "eye-off"
  | "lock"
  | "home"
  | "heart"
  | "message"
  | "menu"
  | "microphone"
  | "plus"
  | "remote"
  | "rotate"
  | "score"
  | "search"
  | "settings"
  | "sparkles"
  | "star"
  | "trend-up"
  | "user"
  | "video"
  | "wallet"
  | "whistle"
  | "waves";

function IconPaths({ name }: { readonly name: DunaIconName }): ReactNode {
  switch (name) {
    case "arrow-left":
      return (
        <>
          <Line x1="5" x2="19" y1="12" y2="12" />
          <Polyline points="11 6 5 12 11 18" />
        </>
      );
    case "arrow-right":
      return (
        <>
          <Line x1="5" x2="19" y1="12" y2="12" />
          <Polyline points="13 6 19 12 13 18" />
        </>
      );
    case "ball":
      return (
        <>
          <Circle cx="12" cy="12" r="9" />
          <Path d="M3.4 10.1c4.7-2.2 12.5-2.2 17.2 0M10.1 3.4c-2.2 4.7-2.2 12.5 0 17.2M13.9 3.4c2.2 4.7 2.2 12.5 0 17.2" />
        </>
      );
    case "bell":
      return (
        <>
          <Path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8Z" />
          <Path d="M10 21h4" />
        </>
      );
    case "calendar":
      return (
        <>
          <Rect height="16" rx="2.5" width="18" x="3" y="5" />
          <Line x1="7" x2="7" y1="3" y2="7" />
          <Line x1="17" x2="17" y1="3" y2="7" />
          <Line x1="3" x2="21" y1="9" y2="9" />
          <Path d="M7 13h3M14 13h3M7 17h3" />
        </>
      );
    case "camera":
      return (
        <>
          <Path d="M8.2 7 9.6 5h4.8l1.4 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
          <Circle cx="12" cy="13" r="3.2" />
        </>
      );
    case "check":
      return <Polyline points="5 12.5 9.5 17 19 7.5" />;
    case "chevron-right":
      return <Polyline points="9 5 16 12 9 19" />;
    case "close":
      return (
        <>
          <Line x1="6" x2="18" y1="6" y2="18" />
          <Line x1="18" x2="6" y1="6" y2="18" />
        </>
      );
    case "court":
      return (
        <>
          <Path d="m4 15 8-5 8 5-8 5Z" />
          <Path d="m8 12.5 8 5M12 10v10M4 15h16" />
          <Path d="M12 10V4M9.5 6.5 12 4l2.5 2.5" />
        </>
      );
    case "court-booking":
      return (
        <>
          <Rect height="14" rx="3" width="19" x="2.5" y="5" />
          <Line x1="12" x2="12" y1="6.5" y2="17.5" />
        </>
      );
    case "eye":
      return (
        <>
          <Path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z" />
          <Circle cx="12" cy="12" r="2.5" />
        </>
      );
    case "eye-off":
      return (
        <>
          <Path d="M4.2 5.2 19 19M9.8 6.7A9.3 9.3 0 0 1 12 6.5c6.1 0 9.5 5.5 9.5 5.5a15 15 0 0 1-2.5 3.1M6.2 8.1A15.2 15.2 0 0 0 2.5 12s3.4 5.5 9.5 5.5a9.7 9.7 0 0 0 3-.5" />
          <Path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </>
      );
    case "lock":
      return (
        <>
          <Rect height="10" rx="2" width="14" x="5" y="10" />
          <Path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
        </>
      );
    case "home":
      return (
        <>
          <Path d="m3.5 10 8.5-7 8.5 7" />
          <Path d="M5.5 9v11h13V9M9.5 20v-6h5v6" />
        </>
      );
    case "heart":
      return (
        <Path d="M20.8 5.9a5.1 5.1 0 0 0-7.2 0L12 7.5l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 21l8.8-7.9a5.1 5.1 0 0 0 0-7.2Z" />
      );
    case "message":
      return (
        <Path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5.5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      );
    case "menu":
      return (
        <>
          <Line x1="4" x2="20" y1="7" y2="7" />
          <Line x1="4" x2="20" y1="12" y2="12" />
          <Line x1="4" x2="20" y1="17" y2="17" />
        </>
      );
    case "microphone":
      return (
        <>
          <Rect height="11" rx="4" width="7" x="8.5" y="3" />
          <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
        </>
      );
    case "plus":
      return (
        <>
          <Line x1="12" x2="12" y1="5" y2="19" />
          <Line x1="5" x2="19" y1="12" y2="12" />
        </>
      );
    case "remote":
      return (
        <>
          <Rect height="13" rx="2" width="9" x="3" y="5" />
          <Rect height="13" rx="2" width="9" x="12" y="7" />
          <Line x1="6" x2="9" y1="15" y2="15" />
          <Line x1="15" x2="18" y1="17" y2="17" />
        </>
      );
    case "rotate":
      return (
        <>
          <Path d="M19 7V3l-2 2a8 8 0 0 0-12 4" />
          <Path d="M5 17v4l2-2a8 8 0 0 0 12-4" />
        </>
      );
    case "score":
      return (
        <>
          <Rect height="16" rx="2.5" width="18" x="3" y="4" />
          <Line x1="12" x2="12" y1="4" y2="20" />
          <Path d="M6.5 9h2M15.5 9h2M6.5 15h2M15.5 15h2" />
        </>
      );
    case "search":
      return (
        <>
          <Circle cx="10.5" cy="10.5" r="6.5" />
          <Line x1="15.5" x2="21" y1="15.5" y2="21" />
        </>
      );
    case "settings":
      return (
        <>
          <Circle cx="12" cy="12" r="3" />
          <Path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </>
      );
    case "sparkles":
      return (
        <>
          <Path d="M12 3.5c.5 3.2 2.3 5 5.5 5.5-3.2.5-5 2.3-5.5 5.5-.5-3.2-2.3-5-5.5-5.5 3.2-.5 5-2.3 5.5-5.5Z" />
          <Path d="M18.5 14.5c.2 1.4 1.1 2.3 2.5 2.5-1.4.2-2.3 1.1-2.5 2.5-.2-1.4-1.1-2.3-2.5-2.5 1.4-.2 2.3-1.1 2.5-2.5Z" />
        </>
      );
    case "star":
      return (
        <Path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />
      );
    case "trend-up":
      return (
        <>
          <Path d="m4 17 5.2-5.2 3.6 3.6L20 8.2" />
          <Polyline points="14.5 8.2 20 8.2 20 13.7" />
        </>
      );
    case "user":
      return (
        <>
          <Circle cx="12" cy="8" r="4" />
          <Path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
        </>
      );
    case "video":
      return (
        <>
          <Rect height="14" rx="2.5" width="14" x="3" y="5" />
          <Path d="m17 10 4-2v8l-4-2Z" />
        </>
      );
    case "wallet":
      return (
        <>
          <Path d="M4 6.5h14a2 2 0 0 1 2 2V19H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2h11" />
          <Path d="M15 11h6v4h-6a2 2 0 0 1 0-4Z" />
          <Circle cx="16" cy="13" r=".55" fill="currentColor" stroke="none" />
        </>
      );
    case "whistle":
      return (
        <>
          <Path d="M5.5 12.5a6.5 6.5 0 1 0 12.3 2.9H21V10h-6.4a6.5 6.5 0 0 0-9.1 2.5Z" />
          <Circle cx="11.5" cy="14.5" r="1.7" />
          <Path d="m7.4 8.7 3.1-4.2" />
        </>
      );
    case "waves":
      return (
        <>
          <Path d="M3 7c2 2 4 2 6 0s4-2 6 0 4 2 6 0" />
          <Path d="M3 12c2 2 4 2 6 0s4-2 6 0 4 2 6 0" />
          <Path d="M3 17c2 2 4 2 6 0s4-2 6 0 4 2 6 0" />
        </>
      );
  }
}

export function DunaIcon({
  color = "currentColor",
  name,
  size = 22,
  strokeWidth = 1.5,
  ...props
}: SvgProps & {
  readonly color?: string;
  readonly name: DunaIconName;
  readonly size?: number;
  readonly strokeWidth?: number;
}) {
  return (
    <Svg
      accessibilityElementsHidden
      fill="none"
      height={size}
      stroke={color}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      <IconPaths name={name} />
    </Svg>
  );
}
