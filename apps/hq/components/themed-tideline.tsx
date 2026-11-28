"use client";

import "@duna/ui/tideline/styles.css";
import "@duna/ui/tideline/legacy-bridge.css";

import { Tideline } from "@duna/ui/tideline";
import { type ComponentProps, useSyncExternalStore } from "react";

type AppTheme = "light" | "dark";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["data-theme"],
    attributes: true,
  });
  return () => observer.disconnect();
}

function currentTheme(): AppTheme | undefined {
  const theme = document.documentElement.dataset.theme;
  return theme === "dark" || theme === "light" ? theme : undefined;
}

/**
 * A Tideline scope that follows the app's own light or dark theme (the app
 * sets `data-theme` on the document), so a kit state dropped into an existing
 * page matches the page around it.
 */
export function ThemedTideline(props: ComponentProps<typeof Tideline>) {
  const theme = useSyncExternalStore(subscribe, currentTheme, () => undefined);
  return <Tideline theme={theme} {...props} />;
}
