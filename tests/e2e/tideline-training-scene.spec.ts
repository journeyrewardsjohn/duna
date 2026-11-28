import { expect, test, type Page } from "@playwright/test";
import { waitForHydration } from "./gallery-hydration";

/**
 * The training-scene family in the gallery (DRILL-PLAYER,
 * docs/design/training-scene-player.md): the court drawing for every example
 * drill, the validator's problem state, the player by keyboard, the 3D chunk
 * loaded only when the 3D view opens, stills under reduced motion, no
 * sideways scroll at 320 px, and the accessibility basics.
 *
 *   TIDELINE_GALLERY=1 pnpm exec playwright test tests/e2e/tideline-training-scene.spec.ts
 */
const base =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test.skip(
  process.env.TIDELINE_GALLERY !== "1",
  "Needs HQ running with TIDELINE_GALLERY=1",
);

// Headless Chromium draws WebGL in software only when asked to.
test.use({
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

const EXAMPLES = [
  "serve-receive-sideout",
  "partner-pepper",
  "serving-to-targets",
  "dig-to-transition",
  "king-of-the-court",
  "indoor-receive-outside",
];

async function openGallery(page: Page, theme = "light") {
  await page.goto(`${base}/tideline?theme=${theme}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Tideline gallery" }),
  ).toBeVisible();
  await waitForHydration(page);
  await page.locator("#training-scene").scrollIntoViewIfNeeded();
}

test("the drawing renders for every example drill, with its key", async ({
  page,
}) => {
  await openGallery(page);
  for (const id of EXAMPLES) {
    const example = page.locator(`[data-scene-example="${id}"]`);
    const figure = example.locator('figure[data-scene-state="ready"]');
    await expect(figure).toHaveCount(1);
    const drawing = figure.getByRole("img");
    await expect(drawing).toBeVisible();
    // One orientation is showing, with its ball paths and people.
    const visible = figure.locator("svg.td-scene__svg:visible");
    await expect(visible).toHaveCount(1);
    expect(await visible.locator("path[data-verb]").count()).toBeGreaterThan(0);
    expect(await visible.locator("[data-person]").count()).toBeGreaterThan(1);
    await expect(figure.getByRole("list", { name: "Key" })).toBeVisible();
    // The text alternative is the drawing's description.
    const description = await drawing.evaluate((node) => {
      const id = node.getAttribute("aria-describedby");
      return id ? (document.getElementById(id)?.textContent ?? "") : "";
    });
    expect(description).toContain("Step 1 of");
  }
  const step = page.locator('[data-scene-example="step"]');
  await expect(step.getByText("Step 3 of 4", { exact: true })).toBeVisible();
  await expect(step.locator('path[data-state="now"]:visible')).toHaveCount(1);
  const problem = page.locator('[data-scene-example="problem"]');
  await expect(problem.getByText("This drawing has a problem")).toBeVisible();
  await expect(problem.getByText(/is not a slot in this drill/)).toBeVisible();
});

test("the player works from the keyboard", async ({ page }) => {
  await openGallery(page);
  const player = page.locator('[data-scene-player="beach"] section');
  await player.scrollIntoViewIfNeeded();
  const play = player.getByRole("button", { name: "Play" });
  await play.focus();
  await page.keyboard.press("Enter");
  await expect(player).toHaveAttribute("data-playing", "");
  await page.keyboard.press("Enter");
  await expect(player).not.toHaveAttribute("data-playing", "");
  // Arrow keys step, and the caption follows.
  await page.keyboard.press("Home");
  await expect(player.getByText("Step 1 of 4", { exact: true })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(player.getByText("Step 2 of 4", { exact: true })).toBeVisible();
  await player.getByRole("button", { name: "Next step" }).focus();
  await page.keyboard.press("Enter");
  await expect(player.getByText("Step 3 of 4", { exact: true })).toBeVisible();
  // Next plays that one step, then pauses on it.
  await expect(player).not.toHaveAttribute("data-playing", "");
  await player.getByRole("button", { name: "Previous step" }).focus();
  await page.keyboard.press("Enter");
  await expect(player.getByText("Step 3 of 4", { exact: true })).toBeVisible();
  // Speed by arrow keys inside its group.
  const speed = player.getByRole("radiogroup", { name: "Speed" });
  await speed.getByRole("radio", { name: "1×" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(speed.getByRole("radio", { name: "2×" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Loop is a toggle button.
  const loop = player.getByRole("button", { name: "Loop" });
  await expect(loop).toHaveAttribute("aria-pressed", "true");
  await loop.focus();
  await page.keyboard.press("Space");
  await expect(loop).toHaveAttribute("aria-pressed", "false");
  // The scrub bar: End goes to the last step (the next rep, after the rotation).
  const scrub = player.getByRole("slider", { name: "Timeline" });
  await scrub.focus();
  await page.keyboard.press("End");
  await expect(player.getByText(/^Next rep · Step 4 of 4$/)).toBeVisible();
});

test("the 3D engine loads only when the 3D view opens", async ({ page }) => {
  const scripts: { url: string; three: boolean }[] = [];
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "script") return;
    try {
      const body = await response.text();
      scripts.push({
        url: response.url(),
        three: body.includes("THREE.WebGLRenderer"),
      });
    } catch {
      // Redirects and aborted requests have no body.
    }
  });
  await openGallery(page);
  const player = page.locator('[data-scene-player="beach"] section');
  await player.scrollIntoViewIfNeeded();
  await page.waitForLoadState("networkidle");
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((script) => script.three)).toEqual([]);
  const before = scripts.length;
  await player.getByRole("radio", { name: "3D" }).click();
  await expect(player).toHaveAttribute("data-view3d", "ready", {
    timeout: 30_000,
  });
  await expect
    .poll(() => scripts.slice(before).some((script) => script.three))
    .toBe(true);
  // Camera presets and the way back to 2D.
  const cameras = player.getByRole("radiogroup", { name: "Camera" });
  await expect(cameras.getByRole("radio")).toHaveCount(4);
  await cameras.getByRole("radio").nth(2).click();
  await expect(cameras.getByRole("radio").nth(2)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await player.getByRole("radio", { name: "2D" }).click();
  await expect(player).toHaveAttribute("data-view3d", "off");
  await expect(player.locator("svg.td-scene__svg")).toBeVisible();
});

test("reduced motion: no auto-play, the steps are stills", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGallery(page);
  const player = page.locator('[data-scene-player="beach"] section');
  await player.scrollIntoViewIfNeeded();
  await expect(player).toHaveAttribute("data-reduced", "");
  await expect(player).not.toHaveAttribute("data-playing", "");
  await expect(
    player.getByRole("button", { name: "Play steps" }),
  ).toBeVisible();
  const clock = player.locator(".td-scene__clock");
  await player.getByRole("button", { name: "Next step" }).click();
  await expect(player.getByText("Step 2 of 4", { exact: true })).toBeVisible();
  await expect(player).not.toHaveAttribute("data-playing", "");
  // A still holds: the clock does not move.
  const still = await clock.textContent();
  await page.waitForTimeout(600);
  await expect(clock).toHaveText(still ?? "");
});

test("no sideways scroll at 320 px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await openGallery(page);
  const section = page.locator("#training-scene");
  await section.scrollIntoViewIfNeeded();
  // The family's own boxes: the gallery chrome around them is not part of it.
  const spills = await section.evaluate((node) =>
    [...node.querySelectorAll(".td-scene, .td-scene *")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.right > window.innerWidth + 0.5;
      })
      .map((element) => element.className.toString().slice(0, 60)),
  );
  expect(spills).toEqual([]);
  const widest = await section.evaluate((node) =>
    Math.max(
      ...[...node.querySelectorAll(".td-scene")].map(
        (scene) => scene.getBoundingClientRect().right,
      ),
    ),
  );
  expect(widest).toBeLessThanOrEqual(320);
  // Portrait drawing on a phone.
  await expect(
    page.locator(
      '[data-scene-example="serve-receive-sideout"] svg.td-scene__svg--portrait',
    ),
  ).toBeVisible();
});

test("accessibility basics: names, descriptions and unique ids", async ({
  page,
}) => {
  await openGallery(page);
  const problems = await page.locator("#training-scene").evaluate((root) => {
    const found: string[] = [];
    const nameOf = (element: Element) => {
      const labelled = element.getAttribute("aria-labelledby");
      if (labelled) {
        return labelled
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
      }
      return (
        element.getAttribute("aria-label") ??
        (element as HTMLElement).innerText ??
        ""
      ).trim();
    };
    for (const element of root.querySelectorAll(
      "button, [role=radio], input, [role=img], section[aria-label]",
    )) {
      // Hidden form inputs behind a radio group are not exposed.
      if (element.closest("[aria-hidden=true]")) continue;
      if (!nameOf(element))
        found.push(`no name: ${element.outerHTML.slice(0, 80)}`);
    }
    for (const element of root.querySelectorAll(
      "[aria-describedby], [aria-labelledby]",
    )) {
      for (const attribute of ["aria-describedby", "aria-labelledby"]) {
        for (const id of (element.getAttribute(attribute) ?? "").split(/\s+/)) {
          if (id && !document.getElementById(id)) found.push(`missing #${id}`);
        }
      }
    }
    const ids = [...root.querySelectorAll("[id]")].map((element) => element.id);
    const twice = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (twice.length) found.push(`duplicate ids: ${twice.join(", ")}`);
    for (const svg of root.querySelectorAll("svg")) {
      if (svg.getAttribute("aria-hidden") !== "true") {
        found.push("an svg is not hidden from assistive technology");
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
});
