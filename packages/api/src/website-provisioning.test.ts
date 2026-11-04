import { describe, expect, it, vi, afterEach } from "vitest";
import {
  normalizeWebsiteDomain,
  validatePublishPages,
  websiteRuntimeFiles,
  websiteHostingReadiness,
} from "./website-provisioning";
afterEach(() => vi.unstubAllEnvs());
describe("website publication boundaries", () => {
  it("accepts owned hostnames without accepting URLs, provider domains, or traversal", () => {
    expect(normalizeWebsiteDomain(" CLUB.Example.com. ")).toBe(
      "club.example.com",
    );
    for (const value of [
      "https://club.example.com",
      "club.example.com/x",
      "localhost",
      "duna.coach",
      "hq.duna.coach",
      "club.vercel.app",
      "db.neon.tech",
      "foo..com",
      "evil.com:443",
      "127.0.0.1",
      "a@evil.com",
      "-club.example.com",
    ]) {
      expect(() => normalizeWebsiteDomain(value)).toThrow();
    }
  });
  it("requires complete safe page paths and rejects executable content", () => {
    const page = {
      path: "/",
      html: "<!doctype html><html><body>Hello</body></html>",
    };
    expect(() =>
      validatePublishPages([page, { ...page, path: "/programs" }]),
    ).not.toThrow();
    for (const pages of [
      [],
      [{ ...page, path: "/../private" }],
      [page, page],
      [{ ...page, html: "<html><script>alert(1)</script></html>" }],
      [{ ...page, html: '<html><img onerror="alert(1)" /></html>' }],
      [
        {
          ...page,
          html: '<html><iframe src="https://example.com"></iframe></html>',
        },
      ],
      [{ ...page, html: "<html>" + "x".repeat(5000000) + "</html>" }],
    ])
      expect(() => validatePublishPages(pages)).toThrow();
  });
  it("keeps credentials out of deployment source and binds a deployment to exactly one immutable revision", () => {
    const revision = "10000000-0000-4000-8000-000000000001";
    const files = websiteRuntimeFiles(revision);
    const source = files.find((f) => f.file === "api/site.js")!.data;
    expect(source).toContain(revision);
    expect(source).toContain("process.env.DATABASE_URL");
    expect(source).toContain("sql.query(");
    expect(source).toContain("revision_id = $1 AND path = $2");
    expect(source).toContain("script-src 'none'");
    expect(source).toContain("X-Duna-Revision");
    expect(source).not.toContain("STRIPE_SECRET");
    expect(source).not.toContain("DUNA_SITES_NEON_API_KEY");
    expect(() => websiteRuntimeFiles("bad'; process.exit() //")).toThrow();
  });
  it("reports provider readiness without exposing secret values", () => {
    for (const key of [
      "DUNA_SITES_VERCEL_TOKEN",
      "DUNA_SITES_VERCEL_TEAM_ID",
      "DUNA_SITES_NEON_API_KEY",
      "DUNA_SITES_NEON_ORG_ID",
    ])
      vi.stubEnv(key, "");
    expect(websiteHostingReadiness().configured).toBe(false);
    for (const key of websiteHostingReadiness().missing)
      vi.stubEnv(key, "secret-value");
    expect(websiteHostingReadiness()).toEqual({
      configured: true,
      missing: [],
    });
  });
});

describe("generated website runtime", () => {
  it("serves only the requested immutable revision using the SDK query interface", async () => {
    const revision = "10000000-0000-4000-8000-000000000001";
    const source = websiteRuntimeFiles(revision).find(
      (f) => f.file === "api/site.js",
    )!.data;
    const query = vi.fn().mockResolvedValue([{ html: "<html>Club</html>" }]);
    const tag = Object.assign(
      vi.fn(() => {
        throw new Error("SDK requires query for untagged calls");
      }),
      { query },
    );
    const factory = new Function(
      "neon",
      source
        .replace("import { neon } from '@neondatabase/serverless';", "")
        .replace(
          "export default async function handler",
          "return async function handler",
        ),
    );
    const handler = factory(() => tag) as (
      req: { method: string; url: string },
      res: unknown,
    ) => Promise<void>;
    const headers = new Map<string, string>();
    let status = 0,
      body = "";
    const response = {
      setHeader: (k: string, v: string) => headers.set(k, v),
      status: (value: number) => {
        status = value;
        return response;
      },
      end: (value: string) => {
        body = value;
      },
    };
    await handler({ method: "GET", url: "/api/site?path=programs" }, response);
    expect(query).toHaveBeenCalledWith(
      "SELECT html FROM duna_site_pages WHERE revision_id = $1 AND path = $2",
      [revision, "/programs"],
    );
    expect(status).toBe(200);
    expect(body).toBe("<html>Club</html>");
    expect(headers.get("X-Duna-Revision")).toBe(revision);
    query.mockClear();
    await handler({ method: "POST", url: "/" }, response);
    expect(status).toBe(405);
    expect(query).not.toHaveBeenCalled();
    query.mockRejectedValue(new Error("postgres://secret"));
    await handler({ method: "GET", url: "/" }, response);
    expect(status).toBe(503);
    expect(body).not.toContain("secret");
  });
});
