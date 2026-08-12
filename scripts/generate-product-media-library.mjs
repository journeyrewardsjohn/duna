#!/usr/bin/env node

import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const webOutput = join(root, "apps/web/public/media/product-library");
const hqOutput = join(root, "apps/hq/public/media/product-library");
const concurrency = Math.max(
  1,
  Math.min(4, Number(process.env.DUNA_MEDIA_CONCURRENCY ?? 3)),
);
const higgsfield =
  process.env.HIGGSFIELD_BIN ??
  "/Users/journeysuttonm5max/.local/node/bin/higgsfield";

const visualDirection =
  "Premium editorial e-commerce photography for a modern beach volleyball club platform. " +
  "Photoreal, warm sophisticated natural color, tactile fine 35mm grain, elevated coastal hospitality, " +
  "no visible brand names, no logos, no letters, no numbers, no text, no watermark, no illustration, no 3D render. " +
  "If people appear, photograph them candidly in athletic action with faces distant, turned away, cropped, or obscured. " +
  "Compose a polished 4:3 product frame with intentional negative space and a clear visual subject.";

const library = [
  [
    "club-community",
    "Inclusive beach volleyball club members gathered around an oceanfront court after an early morning session, towels and water nearby, genuine community warmth, not posed.",
  ],
  [
    "member-courts",
    "Two pristine reserved beach volleyball courts at sunrise with freshly raked sand, shaded lounge chairs, folded towels and chilled water, quiet premium member atmosphere, no people.",
  ],
  [
    "credit-pack",
    "A premium volleyball beside a small stack of elegant blank ceramic club tokens on clean sand, freshly prepared court and ocean softly behind, visual metaphor for flexible play credits.",
  ],
  [
    "training-bundle",
    "Curated beach volleyball training kit on a natural canvas mat: volleyball, resistance band, water bottle, towel and court clipboard with completely blank pages, oceanfront court behind.",
  ],
  [
    "private-lesson",
    "One-on-one beach volleyball lesson, athlete repeating a precise hand-setting drill while coach observes and gestures, calm open beach at first light, focused personal attention.",
  ],
  [
    "group-lesson",
    "Small mixed group beach volleyball lesson in an active passing drill, coach at center, authentic motion and supportive energy, bright coastal morning.",
  ],
  [
    "player-assessment",
    "Coach observing an athlete during a controlled beach volleyball movement assessment, cones and ball placed neatly, documentary side angle, thoughtful performance setting.",
  ],
  [
    "season-program",
    "Elevated view across three beach volleyball courts running coordinated progressive training stations, athletes moving between drills, cohesive season-program feeling.",
  ],
  [
    "premium-equipment",
    "Premium unbranded beach volleyball, court lines, sand rake and ball cart styled on immaculate sand, modern equipment product photography with ocean light.",
  ],
  [
    "club-apparel",
    "Unbranded premium coastal athletic apparel folded and layered with cap, towel and volleyball on a pale wood bench beside the beach, refined natural retail styling.",
  ],
].map(([id, prompt]) => ({ id, prompt }));

function run(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else
        rejectPromise(
          new Error(`${command} exited ${code}\n${stderr || stdout}`.trim()),
        );
    });
  });
}

async function exists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function generate(item) {
  const fileName = `duna-product-${item.id}.webp`;
  const destination = join(webOutput, fileName);
  if (await exists(destination)) {
    await copyFile(destination, join(hqOutput, fileName));
    process.stdout.write(`skip ${item.id}\n`);
    return;
  }
  process.stdout.write(`generate ${item.id}\n`);
  const { stdout } = await run(higgsfield, [
    "generate",
    "create",
    "gpt_image_2",
    "--prompt",
    `${visualDirection} ${item.prompt}`,
    "--aspect-ratio",
    "4:3",
    "--quality",
    "high",
    "--resolution",
    "1k",
    "--wait",
    "--wait-timeout",
    "20m",
    "--wait-interval",
    "5s",
    "--json",
  ]);
  const jobs = JSON.parse(stdout);
  const url = jobs?.[0]?.result_url;
  if (!url) throw new Error(`No result URL returned for ${item.id}`);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Download failed for ${item.id}: ${response.status}`);
  const temporaryPng = join(
    tmpdir(),
    `${basename(fileName, ".webp")}-${Date.now()}.png`,
  );
  await writeFile(temporaryPng, Buffer.from(await response.arrayBuffer()));
  try {
    await run("cwebp", [
      "-quiet",
      "-q",
      "84",
      "-m",
      "6",
      temporaryPng,
      "-o",
      destination,
    ]);
  } finally {
    await rm(temporaryPng, { force: true });
  }
  await copyFile(destination, join(hqOutput, fileName));
  process.stdout.write(`saved ${item.id}\n`);
}

await Promise.all([
  mkdir(webOutput, { recursive: true }),
  mkdir(hqOutput, { recursive: true }),
]);
let cursor = 0;
const workers = Array.from({ length: concurrency }, async () => {
  while (cursor < library.length) {
    const index = cursor++;
    await generate(library[index]);
  }
});
await Promise.all(workers);
process.stdout.write(`complete ${library.length} product images\n`);
