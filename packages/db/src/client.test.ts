import { afterEach, describe, expect, it, vi } from "vitest";

const { neon, drizzleHttp } = vi.hoisted(() => ({
  neon: vi.fn((connectionString: string) => ({ connectionString })),
  drizzleHttp: vi.fn((client: unknown) => ({ client })),
}));

vi.mock("@neondatabase/serverless", () => ({ neon }));
vi.mock("drizzle-orm/neon-http", () => ({ drizzle: drizzleHttp }));
vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: vi.fn((connectionString: string) => ({ connectionString })),
}));

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  neon.mockClear();
  drizzleHttp.mockClear();
});

describe("getReadOnlyDatabase", () => {
  it("uses NEON_READ_ONLY_REPLICA when configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://primary.example/duna");
    vi.stubEnv("NEON_READ_ONLY_REPLICA", "postgresql://replica.example/duna");

    const { getReadOnlyDatabase, isReadOnlyReplicaConfigured } =
      await import("./client");

    expect(isReadOnlyReplicaConfigured()).toBe(true);
    expect(getReadOnlyDatabase()).toBeDefined();
    expect(neon).toHaveBeenCalledWith("postgresql://replica.example/duna");
  });

  it("falls back to DATABASE_URL when the replica is omitted", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://primary.example/duna");
    vi.stubEnv("NEON_READ_ONLY_REPLICA", "");

    const { getReadOnlyDatabase, isReadOnlyReplicaConfigured } =
      await import("./client");

    expect(isReadOnlyReplicaConfigured()).toBe(false);
    expect(getReadOnlyDatabase()).toBeDefined();
    expect(neon).toHaveBeenCalledWith("postgresql://primary.example/duna");
  });
});
