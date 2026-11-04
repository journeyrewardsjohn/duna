import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  generate: vi.fn(),
  publish: vi.fn(),
  pages: vi.fn(),
  preview: vi.fn(),
  checkout: vi.fn(),
  after: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getServerContext: mocks.context }));
vi.mock("next/server", () => ({
  after: mocks.after,
  NextResponse: {
    json: (value: unknown, options?: ResponseInit) =>
      Response.json(value, options),
  },
}));
vi.mock("@duna/api/website-service", () => ({
  listClubWebsites: mocks.list,
  createClubWebsite: mocks.create,
  requestWebsiteRevision: mocks.generate,
  websitePublishPages: mocks.pages,
  websitePreview: mocks.preview,
  getClubWebsite: vi.fn(),
  processWebsiteRevision: vi.fn(),
  updateWebsiteBrief: vi.fn(),
}));
vi.mock("@duna/api/website-provisioning", () => ({
  publishWebsiteRevision: mocks.publish,
  readPublishStatus: vi.fn(),
  connectWebsiteDomain: vi.fn(),
  websiteHostingReadiness: () => ({ configured: true }),
}));
vi.mock("@duna/api/website-billing", () => ({
  assertWebsiteActor: (actor: {
    roles: string[];
    isDemo?: boolean;
    organizationId?: string;
  }) => {
    if (
      actor.isDemo ||
      !actor.organizationId ||
      !actor.roles.some((role) =>
        ["owner", "manager", "super-admin"].includes(role),
      )
    )
      throw new Error("An authorized club owner is required.");
    return actor.organizationId;
  },
  openWebsiteBillingPortal: vi.fn(),
  startWebsiteCheckout: mocks.checkout,
  cancelWebsiteSubscription: vi.fn(),
}));
import { GET, POST } from "./route";
const siteId = "10000000-0000-4000-8000-000000000001";
const revisionId = "20000000-0000-4000-8000-000000000001";
const actor = {
  personId: "owner",
  organizationId: "club-a",
  roles: ["owner"],
  isDemo: false,
};
function request(body: unknown, origin = "https://hq.duna.coach") {
  return new Request("https://hq.duna.coach/api/websites", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
describe("website studio HTTP boundaries", () => {
  it("does not expose database/provider exception details", async () => {
    mocks.context.mockResolvedValue({ actor });
    mocks.list.mockRejectedValueOnce(
      new Error("SQL credentials=secret tenant data"),
    );
    const response = await GET(
      new Request("https://hq.duna.coach/api/websites"),
    );
    const body = await response.json();
    expect(body.error).not.toContain("secret");
    expect(body.error).toContain("could not confirm");
  });
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.context.mockResolvedValue({ actor });
  });
  it("rejects cross-origin writes before reading identity or making provider calls", async () => {
    expect(
      (
        await POST(
          request(
            { action: "publish", siteId, revisionId },
            "https://elsewhere.example",
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.context).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("requires a signed-in actor for reads", async () => {
    mocks.context.mockResolvedValue({});
    expect(
      (await GET(new Request("https://hq.duna.coach/api/websites"))).status,
    ).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each([
    { ...actor, isDemo: true },
    { ...actor, roles: ["player"] },
    { ...actor, organizationId: undefined },
  ])("denies unqualified actor before listing sites", async (invalid) => {
    mocks.context.mockResolvedValue({ actor: invalid });
    expect(
      (await GET(new Request("https://hq.duna.coach/api/websites"))).status,
    ).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("uses trusted actor and exact selected revision to publish", async () => {
    const pages = [{ path: "/", html: "<h1>Approved version</h1>" }];
    mocks.pages.mockResolvedValue(pages);
    mocks.publish.mockResolvedValue({ status: "deploying" });
    expect(
      (
        await POST(
          request({
            action: "publish",
            siteId,
            revisionId,
            organizationId: "club-b",
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.pages).toHaveBeenCalledWith(actor, siteId, revisionId);
    expect(mocks.publish).toHaveBeenCalledWith(
      actor,
      siteId,
      revisionId,
      pages,
    );
  });
  it("does not publish when scoped preview ownership fails", async () => {
    mocks.pages.mockRejectedValue(new Error("Website not found in this club."));
    expect(
      (await POST(request({ action: "publish", siteId, revisionId }))).status,
    ).toBe(400);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it("does not accept malformed identifiers", async () => {
    expect(
      (await POST(request({ action: "publish", siteId: "bad", revisionId })))
        .status,
    ).toBe(400);
    expect(mocks.pages).not.toHaveBeenCalled();
  });
  it("takes checkout return locations from HQ origin, never submitted redirect URLs", async () => {
    mocks.checkout.mockResolvedValue({
      url: "https://checkout.stripe.com/example",
    });
    await POST(
      request({
        action: "checkout",
        siteId,
        operationId: revisionId,
        successUrl: "https://elsewhere.example",
      }),
    );
    expect(mocks.checkout).toHaveBeenCalledWith(
      expect.objectContaining({
        actor,
        successUrl: `https://hq.duna.coach/website?site=${siteId}&checkout=success`,
        cancelUrl: `https://hq.duna.coach/website?site=${siteId}&checkout=canceled`,
      }),
    );
  });
  it("serves previews private with scripts and forms disabled", async () => {
    mocks.preview.mockResolvedValue("<h1>Club</h1>");
    const response = await GET(
      new Request(
        `https://hq.duna.coach/api/websites?siteId=${siteId}&preview=${revisionId}&page=about`,
      ),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(mocks.preview).toHaveBeenCalledWith(
      actor,
      siteId,
      revisionId,
      "about",
    );
  });
});
