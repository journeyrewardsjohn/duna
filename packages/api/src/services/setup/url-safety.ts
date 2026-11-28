/**
 * URL safety for AI setup (SSRF defence). A club owner types any address;
 * Duna hands it to the hosted reader and checks every address the reader
 * ends up on. Rules:
 *
 * - http or https only; no user name or password; no port other than the
 *   scheme's default; at most 2,048 characters;
 * - a public DNS name: never an IP literal (any encoding: WHATWG URL parsing
 *   turns `http://2130706433/` and `http://0x7f.1/` into `127.0.0.1`, which
 *   is then refused), never a single label, never a reserved or internal
 *   suffix (`localhost`, `.local`, `.internal`, `.test`, …);
 * - every address the name resolves to must be public: private, loopback,
 *   link-local, carrier-grade NAT, documentation, multicast, reserved, and
 *   the IPv6 forms that embed them (mapped, NAT64, 6to4) are refused;
 * - redirects: the reader's final address goes through the same checks, and
 *   pages after the home page must stay on the same site.
 *
 * Duna's own servers never open a connection to the address: only a DNS
 * lookup (no connection) runs here; the hosted reader does the fetching.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { SetupFailureReason } from "./failure-reasons";

export type UrlCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: SetupFailureReason };

const reservedSuffixes = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "corp",
  "private",
  "test",
  "invalid",
  "example",
  "onion",
  "arpa",
] as const;

const trackingParameter = /^(?:utm_[a-z]+|gclid|fbclid|mc_[a-z]+)$/i;

/**
 * Validates and normalises a website address without touching the network.
 * Accepts a bare host ("club.example.com") by assuming https.
 */
export function normaliseSetupUrl(input: string): UrlCheck {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2_048) {
    return { ok: false, reason: "address-not-allowed" };
  }
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "address-not-allowed" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "address-not-allowed" };
  }
  if (url.username || url.password || url.port) {
    return { ok: false, reason: "address-not-allowed" };
  }
  const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!isPublicHostname(hostname)) {
    return { ok: false, reason: "address-not-allowed" };
  }
  url.hostname = hostname;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (trackingParameter.test(key)) url.searchParams.delete(key);
  }
  return { ok: true, url: url.toString() };
}

/** A DNS name that can only mean a public website (no IPs, no internal names). */
export function isPublicHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253) return false;
  // IPv6 literals keep their brackets in URL.hostname; IPv4 literals in any
  // encoding were normalised to dotted decimal by the URL parser.
  if (hostname.startsWith("[") || isIP(hostname) !== 0) return false;
  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/.test(label))) {
    return false;
  }
  const tld = labels.at(-1) ?? "";
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return false;
  return !reservedSuffixes.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
  );
}

function ipv4Parts(address: string): number[] | undefined {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return undefined;
  }
  return parts;
}

function blockedIpv4(address: string): boolean {
  const parts = ipv4Parts(address);
  if (!parts) return true;
  const [a, b, c] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

/** Expands an IPv6 address to eight 16-bit groups, or undefined. */
function ipv6Groups(address: string): number[] | undefined {
  let text = address.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  let tail: number[] = [];
  const lastColon = text.lastIndexOf(":");
  const maybeV4 = text.slice(lastColon + 1);
  if (maybeV4.includes(".")) {
    const parts = ipv4Parts(maybeV4);
    if (!parts) return undefined;
    tail = [(parts[0]! << 8) | parts[1]!, (parts[2]! << 8) | parts[3]!];
    text = `${text.slice(0, lastColon + 1)}0:0`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return undefined;
  const parse = (part: string) =>
    part ? part.split(":").map((group) => Number.parseInt(group, 16)) : [];
  const head = parse(halves[0] ?? "");
  const rest = halves.length === 2 ? parse(halves[1] ?? "") : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 && fill !== 0) return undefined;
  if (fill < 0) return undefined;
  const groups = [...head, ...Array<number>(fill).fill(0), ...rest];
  if (
    groups.length !== 8 ||
    groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)
  ) {
    return undefined;
  }
  if (tail.length) groups.splice(6, 2, ...tail);
  return groups;
}

function v4From(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function blockedIpv6(address: string): boolean {
  const g = ipv6Groups(address);
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const zeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (zeroPrefix && g5 === 0 && g6 === 0 && (g7 === 0 || g7 === 1)) return true; // :: and ::1
  if (zeroPrefix && g5 === 0xffff) return blockedIpv4(v4From(g6, g7)); // ::ffff:a.b.c.d
  if (zeroPrefix && g5 === 0) return blockedIpv4(v4From(g6, g7)); // ::a.b.c.d (deprecated)
  if (g0 === 0x64 && g1 === 0xff9b) return blockedIpv4(v4From(g6, g7)); // NAT64
  if (g0 === 0x2002) return blockedIpv4(v4From(g1, g2)); // 6to4
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // site-local (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard
  if (g0 === 0x2001 && g1 < 0x200) return true; // Teredo, benchmarking, ORCHID
  return false;
}

/** True when an IP address must never be read (not public unicast). */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address.replace(/^\[|\]$/g, "").split("%")[0] ?? "");
  if (family === 4) return blockedIpv4(address);
  if (family === 6) return blockedIpv6(address);
  return true;
}

export type HostResolver = (hostname: string) => Promise<readonly string[]>;

export const systemHostResolver: HostResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
};

/**
 * The full check: syntax, then every resolved address. A DNS failure is
 * "no such host"; one private address anywhere refuses the whole name.
 */
export async function checkSetupUrl(
  input: string,
  resolve: HostResolver = systemHostResolver,
): Promise<UrlCheck> {
  const syntax = normaliseSetupUrl(input);
  if (!syntax.ok) return syntax;
  const hostname = new URL(syntax.url).hostname;
  let addresses: readonly string[];
  try {
    addresses = await resolve(hostname);
  } catch (error) {
    const code = (error as { code?: string }).code;
    return {
      ok: false,
      reason:
        code === "ETIMEOUT" || code === "ECONNREFUSED"
          ? "no-response"
          : "no-such-host",
    };
  }
  if (!addresses.length) return { ok: false, reason: "no-such-host" };
  if (addresses.some(isBlockedAddress)) {
    return { ok: false, reason: "address-not-allowed" };
  }
  return syntax;
}

function siteKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** Same site: the same host, ignoring a leading "www.". */
export function isSameSite(a: string, b: string): boolean {
  try {
    return siteKey(new URL(a).hostname) === siteKey(new URL(b).hostname);
  } catch {
    return false;
  }
}

/** The site-relative path shown as a proposal's source ("/contact"). */
export function sourcePath(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname.replace(/\/+$/, "") || "/"}${parsed.search}`;
  } catch {
    return url.slice(0, 200);
  }
}
