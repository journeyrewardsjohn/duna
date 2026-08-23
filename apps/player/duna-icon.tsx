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
  | "arrow-right"
  | "camera"
  | "check"
  | "chevron-right"
  | "close"
  | "court"
  | "eye"
  | "eye-off"
  | "lock"
  | "microphone"
  | "remote"
  | "rotate"
  | "settings"
  | "sparkles"
  | "star"
  | "video";

function IconPaths({ name }: { readonly name: DunaIconName }): ReactNode {
  switch (name) {
    case "arrow-right":
      return (
        <>
          <Line x1="5" x2="19" y1="12" y2="12" />
          <Polyline points="13 6 19 12 13 18" />
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
    case "microphone":
      return (
        <>
          <Rect height="11" rx="4" width="7" x="8.5" y="3" />
          <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
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
    case "video":
      return (
        <>
          <Rect height="14" rx="2.5" width="14" x="3" y="5" />
          <Path d="m17 10 4-2v8l-4-2Z" />
        </>
      );
  }
}

export function DunaIcon({
  color = "currentColor",
  name,
  size = 22,
  strokeWidth = 1.75,
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
