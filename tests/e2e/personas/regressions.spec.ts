import { expect, hq, test, webBaseUrl } from "./support/fixtures";
import { expectPageReady } from "./support/moves";

/**
 * Regressions for defects the persona suite found in the first run (work
 * package Q1). Each test fails on the old behaviour; the automatic quality and
 * accessibility checks (fixtures.ts) run after every one.
 */

const notConfigured = (provider: string) => ({
  state: "provider-not-configured",
  status: "not-configured",
  provider,
});

test.describe("honest provider states answer 200, not an error", () => {
  test.use({ persona: "club-owner" });

  test("Ask Duna conversations in demo mode is empty and not configured, not 401", async ({
    page,
  }) => {
    const response = await page.request.get(hq("/api/ask-duna/conversations"));
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual(
      expect.objectContaining({
        ...notConfigured("aiGateway"),
        conversations: [],
        nextOffset: null,
      }),
    );
  });

  test("every HQ page asks Ask Duna without logging an error", async ({
    page,
  }) => {
    const asked: number[] = [];
    page.on("response", (response) => {
      if (response.url().includes("/api/ask-duna/conversations"))
        asked.push(response.status());
    });
    // Rebuilt pages (the new shell, S1) do not ask at all in demo mode; a
    // page still on the legacy shell asks and must get a 200.
    await page.goto(hq("/people"));
    await expectPageReady(page);
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(asked.every((status) => status === 200)).toBe(true);
    // A failing request would be a console error, which fails the test.
  });

  test("the messaging updates endpoint answers per the caller's Accept", async ({
    page,
  }) => {
    for (const base of [hq("/"), webBaseUrl]) {
      const url = new URL("/api/messaging/updates", base).toString();
      // An EventSource asks for a stream: 204 means "do not reconnect".
      const stream = await page.request.get(url, {
        headers: { accept: "text/event-stream" },
      });
      expect(stream.status()).toBe(204);
      // The client engine's readiness probe asks for JSON.
      const probe = await page.request.get(url, {
        headers: { accept: "application/json" },
      });
      expect(probe.status()).toBe(200);
      expect(await probe.json()).toEqual(
        expect.objectContaining({
          ...notConfigured("messagingWakeups"),
        }),
      );
    }
  });

  test("the map token route answers not configured on both apps", async ({
    page,
  }) => {
    for (const base of [hq("/"), webBaseUrl]) {
      const response = await page.request.get(
        new URL("/api/mapbox/token", base).toString(),
      );
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body).toEqual(expect.objectContaining(notConfigured("mapbox")));
      expect(body).not.toHaveProperty("token");
    }
  });

  test("the inbox opens and stops asking for live updates", async ({
    page,
  }) => {
    const streamRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/messaging/updates"))
        streamRequests.push(request.headers().accept ?? "");
    });
    await page.goto(hq("/inbox"));
    await expectPageReady(page);
    // One stream attempt, one JSON probe; then it stays quiet (polling only).
    await expect
      .poll(() => streamRequests.length, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    const settled = streamRequests.length;
    await page.waitForTimeout(3_000);
    expect(streamRequests.length).toBe(settled);
    expect(streamRequests.length).toBeLessThanOrEqual(2);
  });

  test("the venue layout map says it is not set up instead of staying blank", async ({
    page,
  }) => {
    await page.goto(
      hq("/setup/places/10000000-0000-4000-8000-000000000101/layout"),
    );
    await expect(
      page.getByText("The satellite map isn't set up yet"),
    ).toBeVisible();
    await expect(page.getByText(/It needs a map key/)).toBeVisible();
  });
});

test.describe("the discovery map", () => {
  test.use({ persona: "visitor" });

  test("shows the kit's not-configured state with no map key", async ({
    page,
  }) => {
    await page.goto("/discover/map");
    await expect(
      page.getByText("The discovery map isn't set up yet"),
    ).toBeVisible();
    await expect(page.getByText(/Opening the world of sand/)).toHaveCount(0);
  });
});

test.describe("pages that used to crash", () => {
  test.describe("club owner", () => {
    test.use({ persona: "club-owner" });

    test("HQ promo codes opens in demo mode with its empty state", async ({
      page,
    }) => {
      await page.goto(hq("/marketing/promo-codes"));
      await expectPageReady(page, "A better reason to join now.");
      await expect(page.getByText("This page didn’t load")).toHaveCount(0);
      await expect(page.getByText("Active codes")).toBeVisible();
    });
  });

  test.describe("player", () => {
    test.use({ persona: "player" });

    test("web video fails soft with the kit's error state", async ({
      page,
    }) => {
      const response = await page.goto("/app/video");
      expect(response?.status()).toBe(200);
      await expectPageReady(page, "Review your game.");
      await expect(
        page.getByText("Your video library isn't available"),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Back to home" }),
      ).toBeVisible();
      await expect(page.getByText("This page didn’t load")).toHaveCount(0);
    });

    test("a player who opens HQ is told they need access, with a way back", async ({
      page,
    }) => {
      const response = await page.goto(hq("/"));
      expect(response?.status()).toBe(200);
      await expectPageReady(page, "Duna HQ");
      await expect(
        page.getByText("You don't have access to Duna HQ"),
      ).toBeVisible();
      await expect(page.getByText(/Ask an owner of your club/)).toBeVisible();
      await expect(page.getByRole("link", { name: "Open Duna" })).toBeVisible();
      await expect(page.getByText("This page didn’t load")).toHaveCount(0);
    });
  });
});
