import { expect, test } from "@playwright/test";
import { masksFor, openRoute, themes } from "./harness";
import { visualRoutes } from "./routes";

for (const route of visualRoutes) {
  for (const theme of themes) {
    test(`${route.name} · ${theme}`, async ({ page, baseURL }) => {
      await openRoute(page, baseURL, route, theme);
      await expect(page).toHaveScreenshot(`${route.name}-${theme}.png`, {
        mask: masksFor(page, route),
        maskColor: "#ff00ff",
      });
    });
  }
}
