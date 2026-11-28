import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * HQ presentation and workflow contracts, checked in a real browser.
 *
 * These replace unit tests that read CSS and TSX source as text. A contract
 * here is what the browser computes or what an operator can do, so a refactor
 * that moves a rule or renames a file passes, and one that changes the result
 * fails. Whole-page appearance is covered separately by the visual baselines
 * in tests/e2e/hq-visual.
 *
 * Originated as uncommitted work in an earlier session's worktree
 * (hq-safety-net-20261125). Three of its contracts are NOT included because
 * they fail against today's main and need a decision on what HQ should look
 * like, not a mechanical fix: HQ messaging layout (compose footer on phones),
 * HQ organization switcher (the sticky topbar now intercepts the trigger
 * click), and HQ promo code workspace styling (the demo field has no border
 * color). Their source-text unit tests stay in place.
 *
 * Some states cannot be reached in demo mode (no WorkOS session, empty
 * catalog, no divisions). Their CSS contracts are checked by mounting the
 * component's class names on a live HQ page.
 */
const hq =
  process.env.PLAYWRIGHT_HQ_BASE_URL ??
  `http://127.0.0.1:${process.env.PLAYWRIGHT_HQ_PORT ?? "3001"}`;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(
    /^https:\/\/(?:api|cdn)\.fontshare\.com\//,
    async (route) => {
      const headers = route.request().headers();
      delete headers["x-forwarded-for"];
      await route.continue({ headers });
    },
  );
});

const width = (page: Page) => page.viewportSize()?.width ?? 1280;

function style(locator: Locator, property: string): Promise<string> {
  return locator
    .first()
    .evaluate(
      (element, name) => getComputedStyle(element).getPropertyValue(name),
      property,
    );
}

/** Resolves a CSS color expression where `inside` would resolve it. */
function resolveColor(inside: Locator, expression: string): Promise<string> {
  return inside.first().evaluate((element, value) => {
    const probe = document.createElement("span");
    probe.style.color = value;
    element.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, expression);
}

/** Mounts markup inside the HQ page so product selectors apply to it. */
async function mount(page: Page, html: string): Promise<Locator> {
  await page.evaluate((markup) => {
    document.querySelector("#contract-fixture")?.remove();
    const host = document.createElement("div");
    host.id = "contract-fixture";
    host.innerHTML = markup;
    (document.querySelector("main") ?? document.body).append(host);
  }, html);
  return page.locator("#contract-fixture");
}

function tracks(value: string): number {
  return value.split(" ").filter((track) => track && track !== "none").length;
}

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
    "the page must not scroll sideways",
  ).toBe(true);
}

test.describe("HQ neutral surface theme", () => {
  const expected = {
    light: {
      "--ground": "#fff",
      "--surface-1": "#fff",
      "--surface-2": "#f7f7f7",
      calendar: "rgb(255, 255, 255)",
    },
    dark: {
      "--ground": "#191919",
      "--surface-1": "#222",
      "--surface-2": "#2b2b2b",
      calendar: "rgb(34, 34, 34)",
    },
  } as const;

  for (const theme of ["light", "dark"] as const) {
    test(`resolves the ${theme} operator surfaces`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(`${hq}/calendar`);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      const body = page.locator("body");

      for (const token of ["--ground", "--surface-1", "--surface-2"] as const) {
        expect((await style(body, token)).trim(), token).toBe(
          expected[theme][token],
        );
      }
      // The retired sand tint follows the neutral secondary surface.
      expect((await style(body, "--color-sand-light")).trim()).toBe(
        expected[theme]["--surface-2"],
      );
      // Calendar framing sits on the primary surface in both themes.
      await expect(page.locator(".schedule-calendar")).toHaveCSS(
        "background-color",
        expected[theme].calendar,
      );
    });
  }
});

test.describe("HQ card inset", () => {
  test("Money cards share one responsive inset and stay inside the page", async ({
    page,
  }) => {
    await page.goto(`${hq}/payments`);
    const cards = page.locator(".money-workspace .hq-card");
    await expect(cards.first()).toBeVisible();

    // clamp(1rem, 1.4vw, 1.5rem)
    const inset = Math.min(24, Math.max(16, width(page) * 0.014));
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      await expect(card).toHaveClass(/(^|\s)hq-card--inset(\s|$)/);
      expect(parseFloat(await style(card, "padding-top"))).toBeCloseTo(
        inset,
        1,
      );
      expect(parseFloat(await style(card, "padding-left"))).toBeCloseTo(
        inset,
        1,
      );
    }

    // The wide ledger scrolls inside its card instead of widening the page.
    const workspace = page.locator(".money-workspace");
    const bounds = await workspace.boundingBox();
    const table = await page.locator(".money-activity-table").boundingBox();
    expect(bounds && table && table.x + table.width).toBeLessThanOrEqual(
      (bounds?.x ?? 0) + (bounds?.width ?? 0) + 1,
    );
    await noPageOverflow(page);
  });
});

test.describe("HQ empty states", () => {
  test("separate empty-state copy from its action", async ({ page }) => {
    await page.goto(`${hq}/marketing`);
    const empty = page.locator(".hq-empty").first();
    await expect(empty).toBeVisible();

    await expect(empty).toHaveCSS("row-gap", "7.2px");
    const copy = empty.locator(":scope > span").first();
    const size = parseFloat(await style(copy, "font-size"));
    expect(parseFloat(await style(copy, "line-height"))).toBeCloseTo(
      size * 1.5,
      1,
    );
    const action = empty.locator(":scope > .hq-button").first();
    await expect(action).toHaveCSS("margin-top", "4.8px");
    // The gap is real space, not a number: copy ends above the action.
    const copyBox = await copy.boundingBox();
    const actionBox = await action.boundingBox();
    expect(
      (actionBox?.y ?? 0) - ((copyBox?.y ?? 0) + (copyBox?.height ?? 0)),
    ).toBeGreaterThanOrEqual(11);
  });

  test("keep venue match states compact and evenly padded", async ({
    page,
  }) => {
    await page.goto(`${hq}/calendar`);
    const empty = page.locator(".venue-match-operations__empty");
    await expect(empty).toBeVisible();
    if (width(page) > 680) {
      await expect(empty).toHaveCSS("padding", "18px 20px");
      // Icon, copy, action.
      await expect
        .poll(async () => tracks(await style(empty, "grid-template-columns")))
        .toBe(3);
    }

    // With matches ready, the heading and list share the same 20px inset.
    const fixture = await mount(
      page,
      `<section class="hq-card venue-match-operations">
         <div class="hq-card-heading"><h2>Ready to score</h2></div>
         <div class="venue-match-operations__list"><article>Court 1</article></div>
       </section>`,
    );
    await expect(fixture.locator(".hq-card-heading")).toHaveCSS(
      "padding",
      "20px",
    );
    await expect(fixture.locator(".venue-match-operations__list")).toHaveCSS(
      "padding",
      "0px 20px 20px",
    );
  });
});

test.describe("HQ calendar typography", () => {
  test("keeps every schedule label at 10px or larger in each view", async ({
    page,
  }) => {
    await page.goto(`${hq}/calendar`);
    const calendar = page.locator(".schedule-calendar");
    await expect(calendar).toBeVisible();

    for (const view of ["day", "week", "month", "3 months"]) {
      await calendar.getByRole("button", { name: view, exact: true }).click();
      await expect(
        calendar.getByRole("button", { name: view, exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      const smallest = await calendar.evaluate((root) => {
        let size = Number.POSITIVE_INFINITY;
        let label = "";
        for (const element of [root, ...root.querySelectorAll("*")]) {
          const ownText = Array.from(element.childNodes).some(
            (node) =>
              node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
          );
          if (!ownText) continue;
          const current = parseFloat(getComputedStyle(element).fontSize);
          if (current < size) {
            size = current;
            label = `${element.tagName.toLowerCase()}.${element.className}`;
          }
        }
        return { size, label };
      });
      expect(
        smallest.size,
        `${view}: ${smallest.label}`,
      ).toBeGreaterThanOrEqual(10);
    }
  });

  test("keeps guided session month labels at calendar scale", async ({
    page,
  }) => {
    await page.goto(`${hq}/products/create`);
    // The date range picker sits inside a product stage whose headings are
    // display-sized; month labels must not inherit that scale.
    const fixture = await mount(
      page,
      `<div class="guided-session-schedule">
         <div class="duna-date-range__month"><h3>July 2026</h3></div>
       </div>
       <div class="guided-session-blackouts">
         <div class="duna-date-range__month"><h3>August 2026</h3></div>
       </div>`,
    );
    for (const heading of await fixture.locator("h3").all()) {
      await expect(heading).toHaveCSS("font-size", "16px");
      await expect(heading).toHaveCSS("line-height", "20px");
      await expect(heading).toHaveCSS("max-width", "none");
    }
  });
});

test.describe("HQ venue and settings readability", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`keeps theme asset controls on semantic ${theme} surfaces`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.goto(`${hq}/settings/theme`);
      const asset = page.locator(".theme-asset").first();
      await expect(asset).toBeVisible();

      await expect(asset).toHaveCSS(
        "background-color",
        await resolveColor(asset, "var(--surface-2)"),
      );
      await expect(asset.locator(":scope > strong")).toHaveCSS(
        "color",
        await resolveColor(asset, "var(--text-1)"),
      );
      const upload = page.locator(".theme-asset__upload > span").first();
      await expect(upload).toHaveCSS(
        "color",
        await resolveColor(upload, "var(--btn-primary-fg)"),
      );
      // The preview keeps its own ink so club colors stay legible in dark.
      const previewTitle = page
        .locator(".theme-kit-editor .theme-kit-preview__copy h3")
        .first();
      await expect(previewTitle).toHaveCSS(
        "color",
        await resolveColor(previewTitle, "var(--theme-preview-ink)"),
      );
    });
  }

  test("offers uploads beside brand URLs without a media-type dropdown", async ({
    page,
  }) => {
    await page.goto(`${hq}/settings/theme`);
    const editor = page.locator(".theme-kit-editor");
    await expect(editor).toBeVisible();

    // The hero media type is derived from the file, never asked for.
    await expect(editor.locator('select[name="heroMediaType"]')).toHaveCount(0);
    await expect(
      editor.locator('input[type="hidden"][name="heroMediaType"]'),
    ).toHaveCount(1);
    expect(await editor.locator('input[type="file"]').count()).toBeGreaterThan(
      0,
    );
  });

  test("gives manual venue setup an image upload and readable controls", async ({
    page,
  }) => {
    await page.goto(`${hq}/locations/create`);
    await page.getByRole("button", { name: /Create manually/ }).click();
    const form = page.locator("main");
    await expect(form.getByText("What kind of place is this?")).toBeVisible();

    await expect(
      form.locator('.venue-image-editor__upload input[type="file"]'),
    ).toHaveAttribute("accept", /image\/jpeg/);

    const smallest = await form.evaluate((root) => {
      let size = Number.POSITIVE_INFINITY;
      for (const element of root.querySelectorAll<HTMLElement>(
        "label, input, select, textarea, button, p, small, strong, span",
      )) {
        if (!element.offsetParent) continue;
        const control = /^(INPUT|SELECT|TEXTAREA)$/.test(element.tagName);
        const ownText = Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (!control && !ownText) continue;
        size = Math.min(size, parseFloat(getComputedStyle(element).fontSize));
      }
      return size;
    });
    expect(smallest).toBeGreaterThanOrEqual(12);
  });
});

test.describe("HQ tournament launch workspace", () => {
  test("makes the event-wide launch sequence explicit", async ({ page }) => {
    await page.goto(`${hq}/events/10000000-0000-4000-8000-000000000303`);
    const lifecycle = page.locator(".event-tournament-lifecycle");
    await expect(lifecycle).toBeVisible();

    for (const step of [
      "Close registration",
      "Publish & Set Live",
      "Message to participants",
      "Complete each unfinished gate",
    ]) {
      await expect(lifecycle.getByText(step).first()).toBeVisible();
    }
    await noPageOverflow(page);
  });

  test("stacks the division lifecycle on phones", async ({ page }) => {
    await page.goto(`${hq}/events/10000000-0000-4000-8000-000000000303`);
    const fixture = await mount(
      page,
      `<section class="division-lifecycle">
         <ol><li>Seeding</li><li>Pools</li><li>Bracket</li></ol>
       </section>`,
    );
    // Poll: the stylesheet can still be applying right after mounting.
    await expect
      .poll(async () => {
        const columns = tracks(
          await style(fixture.locator("ol"), "grid-template-columns"),
        );
        return width(page) <= 680 ? columns === 1 : columns > 1;
      })
      .toBe(true);
  });
});

test.describe("HQ Audience product experience", () => {
  test("exposes one unmistakable creation action", async ({ page }) => {
    await page.goto(`${hq}/audiences`);
    const create = page.getByRole("link", { name: "Create audience" });
    await expect(create).toHaveCount(1);
    await expect(create).toHaveClass(/duna-button--primary/);
    await create.click();
    await expect(page).toHaveURL(`${hq}/audiences/create`);
  });

  test("builds typed rules without exposing internal identifiers", async ({
    page,
  }) => {
    await page.goto(`${hq}/audiences/create`);
    const builder = page.locator(".audience-builder");
    await builder.getByRole("radio", { name: /Live rules/ }).click();

    await expect(
      builder.getByRole("button", { name: /All rules/ }),
    ).toBeVisible();
    await expect(
      builder.getByRole("button", { name: /Any rule/ }),
    ).toBeVisible();

    // Money is entered as money, with the currency shown beside the field.
    await builder
      .locator("select")
      .filter({ hasText: "Lifetime value" })
      .first()
      .selectOption({ label: "Lifetime value" });
    const amount = builder.getByLabel("Lifetime value amount");
    await expect(amount).toBeVisible();
    await expect(
      amount.locator("xpath=ancestor::*[contains(., '$')][1]"),
    ).toBeVisible();

    await expect(builder).not.toContainText("Event or product ID");
    await expect(builder).not.toContainText("minor currency units");
    await expect(builder).not.toContainText(/\b[0-9a-f]{8}-[0-9a-f]{4}-4/);
  });

  test("gives people identity and a live preview while selecting", async ({
    page,
  }) => {
    await page.goto(`${hq}/audiences/create`);
    const builder = page.locator(".audience-builder");
    await builder.getByRole("radio", { name: /Rules \+ people/ }).click();

    await expect(
      builder.getByPlaceholder("Search by name, role, city, or Sand Rating"),
    ).toBeVisible();
    // Hybrid audiences can both add and remove individuals.
    await expect(
      builder.getByRole("button", { name: "Include", exact: true }).first(),
    ).toBeVisible();
    await expect(
      builder.getByRole("button", { name: "Exclude", exact: true }).first(),
    ).toBeVisible();

    await expect(builder.getByText("Audience preview")).toBeVisible();
    await expect(builder.getByText(/of \d+ eligible people/)).toBeVisible();
  });

  test("stacks the builder and converts the overview table on narrow screens", async ({
    page,
  }) => {
    await page.goto(`${hq}/audiences/create`);
    await expect
      .poll(async () =>
        tracks(
          await style(
            page.locator(".audience-builder"),
            "grid-template-columns",
          ),
        ),
      )
      .toBe(width(page) <= 900 ? 1 : 2);
    await noPageOverflow(page);

    await page.goto(`${hq}/audiences`);
    const table = page.locator(".audience-overview__table table");
    await expect(table).toHaveCSS(
      "display",
      width(page) <= 680 ? "block" : "table",
    );
    await noPageOverflow(page);
  });
});

test.describe("HQ page headings", () => {
  test("treat only a trailing second block as the action group", async ({
    page,
  }) => {
    // One block: copy only. It must not become a flex action row.
    await page.goto(`${hq}/setup`);
    const single = page.locator(".hq-page-heading").first();
    await expect(single.locator(":scope > div")).toHaveCount(1);
    await expect(single.locator(":scope > div")).toHaveCSS("display", "block");

    // Two blocks: copy, then actions laid out in a row.
    await page.goto(`${hq}/team`);
    const withActions = page.locator(".hq-page-heading").first();
    await expect(withActions.locator(":scope > div")).toHaveCount(2);
    await expect(withActions.locator(":scope > div").first()).toHaveCSS(
      "display",
      "block",
    );
    await expect(withActions.locator(":scope > div").last()).toHaveCSS(
      "display",
      "flex",
    );
  });
});

test.describe("HQ setup experience", () => {
  test("keeps setup visible from Home and the dedicated guide", async ({
    page,
  }) => {
    await page.goto(hq);
    const strip = page.locator(".hq-setup-strip");
    await expect(strip).toBeVisible();
    await strip.getByRole("link", { name: /Continue setup/ }).click();
    await expect(page).toHaveURL(`${hq}/setup`);
    await expect(
      page.getByRole("heading", { level: 1, name: /Get .+ ready\./ }),
    ).toBeVisible();
    await expect(page.getByText("Ask Duna to guide me")).toBeVisible();
  });

  test("uses one readiness model across setup and settings", async ({
    page,
  }) => {
    await page.goto(`${hq}/setup`);
    const steps = await page
      .locator("main li strong, main article strong")
      .allTextContents();
    const titles = [
      "Confirm your business",
      "Add a venue and court",
      "Bring in your first people",
      "Publish your player-facing brand",
      "Connect payments",
      "Create your first offering",
    ];
    for (const title of titles) expect(steps.join("|")).toContain(title);

    await page.goto(`${hq}/settings`);
    for (const title of titles) {
      await expect(page.getByText(title).first()).toBeAttached();
    }
  });

  test("keeps secondary tools reachable from mobile navigation", async ({
    page,
  }) => {
    test.skip(width(page) > 680, "The bottom bar is the phone navigation.");
    await page.goto(hq);
    const more = page.locator(".hq-mobile-navigation-more");
    await more.locator("summary").click();
    await expect(more.getByText("All HQ tools")).toBeVisible();
    for (const tool of ["Get started", "Products", "Money", "Settings"]) {
      await expect(
        more.getByRole("link", { name: tool, exact: true }),
      ).toBeVisible();
    }
  });
});
