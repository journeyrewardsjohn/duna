import type { Page } from "@playwright/test";

/**
 * Waits until React has hydrated the page: interactive elements carry React's
 * event props. `networkidle` is the wrong condition for this (a stray
 * connection can keep it from ever settling, and it can settle before
 * hydration), and a click made before hydration is silently ignored.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("button")];
    return (
      buttons.length > 0 &&
      buttons.every((button) =>
        Object.keys(button).some((key) => key.startsWith("__reactProps$")),
      )
    );
  });
}
