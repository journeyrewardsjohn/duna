#!/usr/bin/env node
/**
 * Generates each web app's favicon, icon.svg, apple-touch icon, manifest
 * icons and default Open Graph image from the Brand Book 2.0 geometry
 * (docs/design/tideline-4.1.1/brand-book.md) on Night Court / Salt.
 * Rasterises with the Playwright browser the repo already uses for e2e.
 *
 *   node scripts/generate-brand-icons.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { crc32, deflateSync, inflateSync } from "node:zlib";
import { chromium } from "@playwright/test";

const root = resolve(import.meta.dirname, "..");
const assets = join(root, "docs/design/tideline-4.1.1/assets");
const NIGHT_COURT = "#0E1A22";
const DUNE = "#D9C3A0";

// The mark's viewBox is 16 13 59 74; its centre is (45.5, 50).
const MARK_CENTRE = { x: 45.5, y: 50 };
const MICRO = `<rect x="16" y="13" width="10" height="74"/><path d="M48.96 13A42 40 0 0 1 48.96 87L33 87L33 13Z"/>`;

/** Brand book app icon: Dune mark on Night Court, half the icon height. */
const appIconSvg = await readFile(join(assets, "duna-app-icon.svg"), "utf8");

/** Favicon: the micro mark (under 20 px), Dune on Night Court, 60% of the tile. */
function faviconSvg() {
  const scale = (64 * 0.6) / 74;
  const tx = 32 - MARK_CENTRE.x * scale;
  const ty = 32 - MARK_CENTRE.y * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${NIGHT_COURT}"/><g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(5)})" fill="${DUNE}">${MICRO}</g></svg>\n`;
}

/** Open Graph: the on-dark horizontal logo centred on Night Court. */
async function ogSvg() {
  const logo = await readFile(
    join(assets, "duna-logo-horizontal-on-dark.svg"),
    "utf8",
  );
  const body = logo
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title>.*?<\/title>/, "");
  // Logo is 312.08 x 74 units; render it 520 px wide.
  const scale = 520 / 312.08;
  const height = 74 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="${NIGHT_COURT}"/><g transform="translate(${(600 - 260).toFixed(2)} ${(315 - height / 2).toFixed(2)}) scale(${scale.toFixed(5)})">${body}</g></svg>`;
}

const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
});
const page = await browser.newPage();

async function png(svg, width, height) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`,
  );
  return page.screenshot({
    clip: { x: 0, y: 0, width, height },
    omitBackground: true,
  });
}

/**
 * Re-encode a PNG as 8-bit RGBA. Chrome writes fully opaque screenshots as
 * RGB, and Next's favicon.ico decoder rejects ICO entries that are not RGBA.
 */
function toRgba(source) {
  let offset = 8;
  let header;
  const data = [];
  while (offset < source.length) {
    const length = source.readUInt32BE(offset);
    const type = source.toString("latin1", offset + 4, offset + 8);
    const body = source.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = body;
    if (type === "IDAT") data.push(body);
    offset += 12 + length;
  }
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const channels = header[9] === 6 ? 4 : 3;
  if (header[8] !== 8 || (header[9] !== 6 && header[9] !== 2)) {
    throw new Error("Expected an 8-bit RGB or RGBA PNG");
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft =
        x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      const paeth = () => {
        const estimate = left + up - upLeft;
        const dl = Math.abs(estimate - left);
        const du = Math.abs(estimate - up);
        const dul = Math.abs(estimate - upLeft);
        return dl <= du && dl <= dul ? left : du <= dul ? up : upLeft;
      };
      const predictor = [0, left, up, (left + up) >> 1, paeth()][filter];
      pixels[y * stride + x] = (value + predictor) & 255;
    }
  }
  const out = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < 3; c += 1) {
        out[y * (width * 4 + 1) + 1 + x * 4 + c] =
          pixels[y * stride + x * channels + c];
      }
      out[y * (width * 4 + 1) + 1 + x * 4 + 3] =
        channels === 4 ? pixels[y * stride + x * 4 + 3] : 255;
    }
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "latin1");
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
    return Buffer.concat([head, body, tail]);
  };
  const ihdr = Buffer.from(header);
  ihdr[9] = 6;
  return Buffer.concat([
    source.subarray(0, 8),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(out)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** An ICO container holding PNG images (valid since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const at = 6 + 16 * index;
    header.writeUInt8(size >= 256 ? 0 : size, at);
    header.writeUInt8(size >= 256 ? 0 : size, at + 1);
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

const favicon = faviconSvg();
const og = await ogSvg();
const faviconPngs = [];
for (const size of [16, 32, 48]) {
  faviconPngs.push({
    size,
    data: toRgba(await png(favicon, size, size)),
  });
}
const apple = await png(appIconSvg, 180, 180);
const icon192 = await png(appIconSvg, 192, 192);
const icon512 = await png(appIconSvg, 512, 512);
const ogPng = await png(og, 1200, 630);
await browser.close();

for (const app of ["web", "hq"]) {
  const appDir = join(root, "apps", app, "app");
  const iconDir = join(root, "apps", app, "public/icons");
  await mkdir(iconDir, { recursive: true });
  await writeFile(join(appDir, "icon.svg"), favicon);
  await writeFile(join(appDir, "favicon.ico"), ico(faviconPngs));
  await writeFile(join(appDir, "apple-icon.png"), apple);
  await writeFile(join(appDir, "opengraph-image.png"), ogPng);
  await writeFile(
    join(appDir, "opengraph-image.alt.txt"),
    app === "hq" ? "Duna HQ" : "Duna",
  );
  await writeFile(join(iconDir, "icon-192.png"), icon192);
  await writeFile(join(iconDir, "icon-512.png"), icon512);
}
console.log("Brand icons written for apps/web and apps/hq.");
