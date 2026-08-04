#!/usr/bin/env node

import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const webOutput = join(root, "apps/web/public/media/event-library");
const hqOutput = join(root, "apps/hq/public/media/event-library");
const concurrency = Math.max(
  1,
  Math.min(6, Number.parseInt(process.env.DUNA_MEDIA_CONCURRENCY ?? "4", 10)),
);

const visualDirection =
  "Premium editorial sports photography for a modern beach volleyball platform. " +
  "Photoreal, kinetic, sophisticated natural color, authentic fine 35mm grain, " +
  "high shutter speed, tactile sand and light, no visible brand names, no logos, " +
  "no text, no watermark, no illustration, no 3D render, no artificial plastic skin. " +
  "People must be in active play with faces distant, turned away, cropped, or obscured. " +
  "Compose a wide 16:9 frame with useful negative space for an event title.";

const library = [
  {
    id: "sunrise-tournament",
    prompt:
      "Wide doubles tournament at sunrise, ocean horizon, referee stand, jump attack and block, sand spray glowing in warm backlight.",
  },
  {
    id: "night-league",
    prompt:
      "Competitive beach volleyball league under tall court lights after blue-hour sunset, packed but softly blurred sideline, dramatic serve receive.",
  },
  {
    id: "womens-championship",
    prompt:
      "Elite women's beach volleyball championship, powerful full-extension dive across clean white sand, teammate ready behind, electric blue venue accents.",
  },
  {
    id: "mens-open",
    prompt:
      "Men's open beach volleyball, close low angle of an explosive jump serve with airborne sand, sun flare, crowd abstracted into soft color.",
  },
  {
    id: "coed-social",
    prompt:
      "Joyful coed beach volleyball pickup at golden hour, real athletic motion and a post-point high five, inclusive community energy, not posed.",
  },
  {
    id: "junior-clinic",
    prompt:
      "Youth beach volleyball clinic photographed respectfully from behind at a distance, coach demonstrating platform passing, bright morning, cones and balls neatly arranged.",
  },
  {
    id: "elite-clinic",
    prompt:
      "Advanced beach volleyball clinic, small group studying a coach's blocking footwork at the net, editorial documentary composition, overcast soft coastal light.",
  },
  {
    id: "private-coaching",
    prompt:
      "One-on-one beach volleyball coaching session, athlete practicing hand setting while coach observes, minimalist empty beach, calm early-morning light.",
  },
  {
    id: "grass-tournament",
    prompt:
      "Summer grass volleyball tournament in a coastal park, four-person rally, lush green surface, crisp midday light, community tents far in the background.",
  },
  {
    id: "indoor-sand",
    prompt:
      "Architectural indoor sand volleyball facility with warm ceiling lights, clean navy structure, athletes in a fast defensive rally, premium hospitality atmosphere.",
  },
  {
    id: "beach-sixes",
    prompt:
      "Six-person beach volleyball match seen from an elevated sideline, organized formations and a fast rally, broad shoreline and lively summer atmosphere.",
  },
  {
    id: "king-of-the-beach",
    prompt:
      "King of the beach format, three athletes converging around a powerful net attack, cinematic side light, graphic shadows across untouched sand.",
  },
  {
    id: "queen-of-the-beach",
    prompt:
      "Queen of the beach competition, athlete rising for a precise cut shot while defenders read the play, elegant strong motion, soft peach sunset.",
  },
  {
    id: "junior-showcase",
    prompt:
      "Junior beach volleyball showcase photographed from high in the stands, multiple courts running simultaneously, families as soft background shapes, optimistic coastal morning.",
  },
  {
    id: "golden-hour-pickup",
    prompt:
      "Casual high-level pickup match on an open public beach at golden hour, long shadows, silhouettes in a real rally, understated cinematic warmth.",
  },
  {
    id: "oceanfront-finals",
    prompt:
      "Oceanfront championship final with a full but tastefully blurred stadium, decisive block at the net, late afternoon light and airborne sand.",
  },
  {
    id: "community-huddle",
    prompt:
      "Beach volleyball community huddle from overhead after play, hands meeting in the center, varied athletic arms and colorful towels, candid documentary energy.",
  },
  {
    id: "court-rental",
    prompt:
      "Pristine bookable beach volleyball court just after sunrise, freshly raked sand, taut net, two volleyballs and distant ocean, no people, serene premium facility image.",
  },
  {
    id: "wellness-warmup",
    prompt:
      "Volleyball athletes doing a guided mobility and yoga warmup beside the court before play, calm dawn mist, soft sand textures, faces not visible.",
  },
  {
    id: "weather-training",
    prompt:
      "Committed beach volleyball practice under dramatic coastal clouds after light rain, athletic passing drill, moody steel-blue sky with a narrow warm horizon.",
  },
];

function run(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
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
  const fileName = `duna-event-${item.id}.webp`;
  const destination = join(webOutput, fileName);
  if (await exists(destination)) {
    await copyFile(destination, join(hqOutput, fileName));
    process.stdout.write(`skip ${item.id}\n`);
    return;
  }

  process.stdout.write(`generate ${item.id}\n`);
  const { stdout } = await run("higgsfield", [
    "generate",
    "create",
    "gpt_image_2",
    "--prompt",
    `${visualDirection} ${item.prompt}`,
    "--aspect-ratio",
    "16:9",
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
  if (!response.ok) {
    throw new Error(`Download failed for ${item.id}: ${response.status}`);
  }
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
    const index = cursor;
    cursor += 1;
    await generate(library[index]);
  }
});

await Promise.all(workers);
process.stdout.write(`complete ${library.length} event images\n`);
