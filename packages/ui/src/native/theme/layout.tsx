import type { ReactNode } from "react";
import {
  AdaptiveScaffold as BaseAdaptiveScaffold,
  AdaptiveSheet as BaseAdaptiveSheet,
  FoldScaffold as BaseFoldScaffold,
  NavigationChrome as BaseNavigationChrome,
  type AdaptiveScaffoldProps,
  type AdaptiveSheetProps,
  type FoldScaffoldProps,
  type LayoutTheme,
  type NavigationChromeProps,
} from "../layout";
import { TitleRegion } from "../type/title-region";
import { useTheme } from "./ThemeProvider";

/** The layout primitives' structural theme, from the current Tideline roles. */
export function useLayoutTheme(): LayoutTheme {
  const { colors } = useTheme();
  return {
    ground: colors.ground,
    separator: colors.line,
    scrim: colors.scrim,
    sheet: colors.surface,
    control: colors.text,
  };
}

/** Each pane may hold its own one title. */
function region(name: string, node: ReactNode | null | undefined) {
  return node === null || node === undefined ? (
    node
  ) : (
    <TitleRegion name={name}>{node}</TitleRegion>
  );
}

/** `AdaptiveScaffold` with the Tideline theme and a title region per pane. */
export function AdaptiveScaffold({
  theme,
  primary,
  detail,
  emptyDetail,
  inspector,
  ...props
}: AdaptiveScaffoldProps) {
  const base = useLayoutTheme();
  return (
    <BaseAdaptiveScaffold
      {...props}
      detail={region("detail", detail)}
      emptyDetail={region("empty-detail", emptyDetail)}
      inspector={region("inspector", inspector)}
      primary={region("primary", primary)}
      theme={{ ...base, ...theme }}
    />
  );
}

/** `FoldScaffold` with the Tideline theme and a title region per half. */
export function FoldScaffold({
  theme,
  primary,
  secondary,
  ...props
}: FoldScaffoldProps) {
  const base = useLayoutTheme();
  return (
    <BaseFoldScaffold
      {...props}
      primary={region("fold-primary", primary)}
      secondary={region("fold-secondary", secondary)}
      theme={{ ...base, ...theme }}
    />
  );
}

/** `AdaptiveSheet` with the Tideline theme; the sheet is its own title region. */
export function AdaptiveSheet({
  theme,
  children,
  ...props
}: AdaptiveSheetProps) {
  const base = useLayoutTheme();
  return (
    <BaseAdaptiveSheet {...props} theme={{ ...base, ...theme }}>
      <TitleRegion name="sheet">{children}</TitleRegion>
    </BaseAdaptiveSheet>
  );
}

/**
 * The system tab bar with the action colour as its selected tint, and a title
 * region per tab (tabs stay mounted side by side).
 */
export function NavigationChrome({
  tintColor,
  tabs,
  ...props
}: NavigationChromeProps) {
  const { colors } = useTheme();
  return (
    <BaseNavigationChrome
      {...props}
      tabs={tabs.map((tab) => ({
        ...tab,
        content: (
          <TitleRegion name={`tab:${tab.key}`}>{tab.content}</TitleRegion>
        ),
      }))}
      tintColor={tintColor ?? colors.action}
    />
  );
}
