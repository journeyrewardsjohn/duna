import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { assertWebsiteHostingConnection } from "./website-hosting-connection";
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubEnv("DUNA_SITES_VERCEL_TOKEN", "private-token");
  vi.stubEnv("DUNA_SITES_VERCEL_TEAM_ID", "team_expected");
  vi.stubEnv("DUNA_SITES_NEON_API_KEY", "private-key");
  vi.stubEnv("DUNA_SITES_NEON_ORG_ID", "org_expected");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) =>
    Response.json(
      url.includes("/teams/") ? { id: "team_expected" } : { projects: [] },
    ),
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("verifies an empty dedicated organization and exact team through read-only scoped requests", async () => {
  await assertWebsiteHostingConnection();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  for (const [, options] of fetchMock.mock.calls) {
    expect(options).toMatchObject({
      method: "GET",
      cache: "no-store",
      redirect: "error",
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  }
  expect(fetchMock.mock.calls[2]?.[0]).toContain("org_id=org_expected");
});
it.each(["vercel.com", "neon.tech"])(
  "rejects invalid %s credentials without exposing provider bodies",
  async (host) => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes(host)
        ? new Response("private-token private-key", { status: 403 })
        : Response.json(
            url.includes("/teams/")
              ? { id: "team_expected" }
              : { projects: [] },
          ),
    );
    await expect(assertWebsiteHostingConnection()).rejects.toThrow(
      "Website hosting connection could not be verified.",
    );
  },
);
it("rejects mismatched team identity", async () => {
  fetchMock.mockResolvedValue(
    Response.json({ id: "team_other", projects: [] }),
  );
  await expect(assertWebsiteHostingConnection()).rejects.toThrow(
    "could not be verified",
  );
});
it("rejects projects returned outside the configured Neon organization", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    Response.json(
      url.includes("/teams/")
        ? { id: "team_expected" }
        : {
            projects: url.includes("neon.tech")
              ? [{ org_id: "org_other" }]
              : [],
          },
    ),
  );
  await expect(assertWebsiteHostingConnection()).rejects.toThrow(
    "could not be verified",
  );
});
it("sanitizes network failures", async () => {
  fetchMock.mockRejectedValue(new Error("private-key"));
  await expect(assertWebsiteHostingConnection()).rejects.toThrow(
    "Website hosting connection could not be verified. Contact Duna before starting your subscription.",
  );
});
it("rejects missing configuration before network access", async () => {
  vi.stubEnv("DUNA_SITES_NEON_API_KEY", "");
  await expect(assertWebsiteHostingConnection()).rejects.toThrow(
    "not connected yet",
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("accepts scoped provider project shapes and trims pasted credentials", async () => {
  vi.stubEnv("DUNA_SITES_VERCEL_TOKEN", " private-token\n");
  vi.stubEnv("DUNA_SITES_NEON_ORG_ID", " org_expected\n");
  fetchMock.mockImplementation(async (url: string) =>
    Response.json(
      url.includes("/teams/")
        ? { id: "team_expected" }
        : {
            projects: url.includes("neon.tech")
              ? [{ org_id: "org_expected" }]
              : [{ accountId: "team_expected" }],
          },
    ),
  );
  await assertWebsiteHostingConnection();
  expect(fetchMock.mock.calls[0]?.[1].headers.Authorization).toBe(
    "Bearer private-token",
  );
  expect(fetchMock.mock.calls[2]?.[0]).toContain("org_id=org_expected&");
});
