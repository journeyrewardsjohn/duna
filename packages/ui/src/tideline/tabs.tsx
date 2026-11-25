import {
  Tabs as UiTabs,
  TabsIndicator as UiTabsIndicator,
  TabsList as UiTabsList,
  TabsPanel as UiTabsPanel,
  TabsTab as UiTabsTab,
} from "@ui-sdk/react/tabs";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

type WithClass<Props> = Omit<Props, "className" | "render"> & {
  className?: string;
};

export type TabsProps = WithClass<ComponentProps<typeof UiTabs<string>>>;

/**
 * Related panels, one visible at a time. UI SDK Tabs: arrow keys move between
 * tabs, Home and End jump, and each tab is wired to its panel.
 */
export function Tabs({ className, ...props }: TabsProps) {
  return <UiTabs className={cx("td-tabs", className)} {...props} />;
}

export type TabListProps = WithClass<ComponentProps<typeof UiTabsList>> & {
  children?: ReactNode;
};

/** The row of tabs. Give it an `aria-label`. */
export function TabList({ className, children, ...props }: TabListProps) {
  return (
    <UiTabsList className={cx("td-tabs__list", className)} {...props}>
      {children}
      <UiTabsIndicator className="td-tabs__indicator" />
    </UiTabsList>
  );
}

export type TabProps = WithClass<ComponentProps<typeof UiTabsTab>> & {
  children?: ReactNode;
  /** A count shown beside the label, like unread items. */
  count?: number;
};

export function Tab({ className, children, count, ...props }: TabProps) {
  return (
    <UiTabsTab className={cx("td-tab", className)} {...props}>
      {children}
      {count === undefined ? null : (
        <span className="td-tab__count">{count}</span>
      )}
    </UiTabsTab>
  );
}

export type TabPanelProps = WithClass<ComponentProps<typeof UiTabsPanel>>;

export function TabPanel({ className, ...props }: TabPanelProps) {
  return <UiTabsPanel className={cx("td-tabs__panel", className)} {...props} />;
}
