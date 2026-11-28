import { describe, expect, it } from "vitest";
import { isAllowedByRobots, parseRobots, planPages } from "./discovery";
import {
  checkSetupUrl,
  isBlockedAddress,
  isSameSite,
  normaliseSetupUrl,
  sourcePath,
} from "./url-safety";

const publicResolver = async () => ["151.101.1.1"];

describe("normaliseSetupUrl: hostile addresses are refused before any network use", () => {
  it.each([
    ["http://localhost/"],
    ["http://localhost.:80/"],
    ["http://127.0.0.1/"],
    ["http://2130706433/"],
    ["http://0x7f.0.0.1/"],
    ["http://017700000001/"],
    ["http://127.1/"],
    ["http://0/"],
    ["http://[::1]/"],
    ["http://[::ffff:127.0.0.1]/"],
    ["http://[fd00::1]/"],
    ["http://169.254.169.254/latest/meta-data/"],
    ["http://10.0.0.1/admin"],
    ["https://192.168.1.10/"],
    ["http://metadata.google.internal/computeMetadata/v1/"],
    ["https://printer.local/"],
    ["https://club.test/"],
    ["https://club.example/"],
    ["https://club.localhost/"],
    ["https://router.lan/"],
    ["http://club/"],
    ["https://club.com:8443/"],
    ["https://club.com:22/"],
    ["https://user:secret@club.com/"],
    ["https://club.com@evil.com:8080/"],
    ["ftp://club.com/"],
    ["file:///etc/passwd"],
    ["javascript:alert(1)"],
    ["gopher://club.com/"],
    ["data:text/html,hello"],
    ["https://-club.com/"],
    ["https://club.123/"],
    [`https://${"a".repeat(2_100)}.com/`],
    [""],
  ])("refuses %s", (input) => {
    expect(normaliseSetupUrl(input)).toEqual({
      ok: false,
      reason: "address-not-allowed",
    });
  });

  it("normalises a public address: scheme, case, trailing dot, hash, tracking", () => {
    expect(normaliseSetupUrl("WWW.HarborSands-Fixture.CLUB.")).toEqual({
      ok: true,
      url: "https://www.harborsands-fixture.club/",
    });
    expect(
      normaliseSetupUrl(
        "http://harborsands-fixture.club:80/lessons?utm_source=x&level=2#top",
      ),
    ).toEqual({
      ok: true,
      url: "http://harborsands-fixture.club/lessons?level=2",
    });
    expect(normaliseSetupUrl("https://harborsands-fixture.club:443/")).toEqual({
      ok: true,
      url: "https://harborsands-fixture.club/",
    });
    expect(normaliseSetupUrl("https://xn--bcher-kva.club/").ok).toBe(true);
  });
});

describe("isBlockedAddress: every non-public range", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "2002:a00:1::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fe80::1%en0",
    "ff02::1",
    "2001:db8::1",
    "100::1",
    "2001::1",
    "not-an-ip",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "151.101.1.1",
    "8.8.8.8",
    "2606:4700::1111",
    "::ffff:151.101.1.1",
    "172.32.0.1",
  ])("allows public %s", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

describe("checkSetupUrl: what the name resolves to", () => {
  it.each([
    [["10.0.0.5"]],
    [["192.168.1.1"]],
    [["100.64.0.1"]],
    [["fd00::1"]],
    [["fe80::1"]],
    [["::ffff:10.0.0.1"]],
    [["64:ff9b::a00:1"]],
    [["151.101.1.1", "127.0.0.1"]],
  ])(
    "refuses a public-looking name resolving to %j (DNS rebinding to private)",
    async (addresses) => {
      await expect(
        checkSetupUrl("https://rebind-fixture.club/", async () => addresses),
      ).resolves.toEqual({ ok: false, reason: "address-not-allowed" });
    },
  );

  it("says 'no such host' when the name does not resolve", async () => {
    const missing = Object.assign(new Error("not found"), {
      code: "ENOTFOUND",
    });
    await expect(
      checkSetupUrl("https://missing-fixture.club/", async () => {
        throw missing;
      }),
    ).resolves.toEqual({ ok: false, reason: "no-such-host" });
    await expect(
      checkSetupUrl("https://empty-fixture.club/", async () => []),
    ).resolves.toEqual({ ok: false, reason: "no-such-host" });
  });

  it("accepts a public name", async () => {
    await expect(
      checkSetupUrl("harborsands-fixture.club", publicResolver),
    ).resolves.toEqual({ ok: true, url: "https://harborsands-fixture.club/" });
  });

  it("same site ignores www; paths are site-relative", () => {
    expect(
      isSameSite("https://www.a-fixture.club/x", "https://a-fixture.club/"),
    ).toBe(true);
    expect(
      isSameSite("https://a-fixture.club/", "https://b-fixture.club/"),
    ).toBe(false);
    expect(
      isSameSite(
        "https://evil.a-fixture.club.evil.com/",
        "https://a-fixture.club/",
      ),
    ).toBe(false);
    expect(sourcePath("https://a-fixture.club/contact/")).toBe("/contact");
    expect(sourcePath("https://a-fixture.club/")).toBe("/");
  });
});

describe("robots.txt and page planning", () => {
  const robots = parseRobots(`
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /private
Disallow: /coaches
Allow: /coaches/public$
`);

  it("reads the * group and applies longest-match rules", () => {
    expect(isAllowedByRobots(robots, "/")).toBe(true);
    expect(isAllowedByRobots(robots, "/private/x")).toBe(false);
    expect(isAllowedByRobots(robots, "/coaches")).toBe(false);
    expect(isAllowedByRobots(robots, "/coaches/public")).toBe(true);
    expect(
      isAllowedByRobots(parseRobots("User-agent: *\nDisallow: /"), "/"),
    ).toBe(false);
    expect(isAllowedByRobots(parseRobots(undefined), "/anything")).toBe(true);
  });

  it("prefers a group naming Duna or the reader", () => {
    const named = parseRobots(
      "User-agent: *\nDisallow:\n\nUser-agent: FirecrawlAgent\nDisallow: /",
    );
    expect(isAllowedByRobots(named, "/")).toBe(false);
  });

  it("plans one page per topic, same site only, never files or disallowed pages", () => {
    const planned = planPages(
      "https://www.harborsands-fixture.club/",
      [
        "/contact",
        "/contact-us",
        "/lessons",
        "/coaches",
        "/policies",
        "/about",
        "/blog/summer-recap",
        "/gallery.pdf",
        "https://other-fixture.club/pricing",
        "http://localhost/contact",
        "https://harborsands-fixture.club/pricing",
        "mailto:hello@harborsands-fixture.club",
        "https://www.harborsands-fixture.club/",
      ],
      robots,
    );
    expect(planned).toEqual([
      { url: "https://www.harborsands-fixture.club/contact", topic: "contact" },
      { url: "https://www.harborsands-fixture.club/about", topic: "about" },
      {
        url: "https://www.harborsands-fixture.club/lessons",
        topic: "programs",
      },
      { url: "https://harborsands-fixture.club/pricing", topic: "pricing" },
      {
        url: "https://www.harborsands-fixture.club/policies",
        topic: "policies",
      },
    ]);
  });
});
