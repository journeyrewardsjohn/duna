import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  evaluateClientFeatureFlags,
  isFeatureEnabled,
  resetFeatureFlagFailureLogForTests,
  resolveFeatureFlag,
  type FeatureFlagRow,
} from "./feature-flag-evaluator";

const ORG = "00000000-0000-4000-8000-0000000000aa";
const OTHER_ORG = "00000000-0000-4000-8000-0000000000bb";
const KEY = "website.workspace" as const;

const row = (
  enabled: boolean,
  organizationId: string | null = null,
  market: string | null = null,
  key: string = KEY,
): FeatureFlagRow => ({ key, enabled, organizationId, market });

describe("resolveFeatureFlag precedence", () => {
  it("returns the registry default (on) when no row applies", () => {
    expect(resolveFeatureFlag(KEY, [], {})).toBe(true);
    expect(
      resolveFeatureFlag(KEY, [row(false, OTHER_ORG)], { organizationId: ORG }),
    ).toBe(true);
    expect(resolveFeatureFlag(KEY, [row(false, null, "Austin")], {})).toBe(
      true,
    );
    expect(
      resolveFeatureFlag(KEY, [row(false, null, null, "facility.owners")], {}),
    ).toBe(true);
  });

  it("lets a global row act as a kill switch", () => {
    expect(resolveFeatureFlag(KEY, [row(false)], { organizationId: ORG })).toBe(
      false,
    );
  });

  it("prefers organization+market > organization > market > global", () => {
    const rows = [
      row(false),
      row(true, null, "South Bay"),
      row(false, ORG),
      row(true, ORG, "south bay "),
    ];
    expect(
      resolveFeatureFlag(KEY, rows, {
        organizationId: ORG,
        market: "South Bay",
      }),
    ).toBe(true);
    expect(resolveFeatureFlag(KEY, rows, { organizationId: ORG })).toBe(false);
    expect(
      resolveFeatureFlag(KEY, rows, {
        organizationId: OTHER_ORG,
        market: "South Bay",
      }),
    ).toBe(true);
    expect(resolveFeatureFlag(KEY, rows, { organizationId: OTHER_ORG })).toBe(
      false,
    );
  });
});

describe("isFeatureEnabled", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/duna");
    vi.stubEnv("DUNA_DATA_SOURCE", "");
    resetFeatureFlagFailureLogForTests();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns registry defaults in demo mode without reading the table", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const loadRows = vi.fn(async () => [row(false)]);
    await expect(
      isFeatureEnabled(KEY, { organizationId: ORG }, { loadRows }),
    ).resolves.toBe(true);
    vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost/duna");
    vi.stubEnv("DUNA_DATA_SOURCE", "demo");
    await expect(isFeatureEnabled(KEY, {}, { loadRows })).resolves.toBe(true);
    expect(loadRows).not.toHaveBeenCalled();
  });

  it("applies table rows when connected", async () => {
    const loadRows = vi.fn(async () => [row(true), row(false, ORG)]);
    await expect(
      isFeatureEnabled(KEY, { organizationId: ORG }, { loadRows }),
    ).resolves.toBe(false);
    await expect(
      isFeatureEnabled(KEY, { organizationId: OTHER_ORG }, { loadRows }),
    ).resolves.toBe(true);
  });

  it("reads once per request and organization when given a context", async () => {
    const loadRows = vi.fn(async () => [row(false, ORG)]);
    const context = {};
    await isFeatureEnabled(KEY, { organizationId: ORG, context }, { loadRows });
    await isFeatureEnabled(
      "facility.owners",
      { organizationId: ORG, context },
      { loadRows },
    );
    await evaluateClientFeatureFlags(
      { organizationId: ORG, context },
      { loadRows },
    );
    expect(loadRows).toHaveBeenCalledTimes(1);
    await isFeatureEnabled(
      KEY,
      { organizationId: ORG, context: {} },
      {
        loadRows,
      },
    );
    expect(loadRows).toHaveBeenCalledTimes(2);
  });

  it("never throws: a failing read returns the default and logs once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rejecting = vi.fn(async () => {
      throw new Error("relation feature_flags does not exist");
    });
    const throwing = vi.fn(() => {
      throw new Error("synchronous failure");
    }) as unknown as () => Promise<FeatureFlagRow[]>;
    await expect(
      isFeatureEnabled(KEY, {}, { loadRows: rejecting }),
    ).resolves.toBe(true);
    await expect(
      isFeatureEnabled(KEY, {}, { loadRows: throwing }),
    ).resolves.toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("evaluates every client-visible flag", async () => {
    const flags = await evaluateClientFeatureFlags(
      {},
      { loadRows: async () => [row(false)] },
    );
    expect(flags[KEY]).toBe(false);
    expect(flags["concierge.channel.email"]).toBe(true);
    expect(Object.keys(flags).length).toBeGreaterThanOrEqual(11);
  });
});
