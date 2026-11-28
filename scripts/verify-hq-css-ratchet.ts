import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { countLines, hqGlobalSheets } from "./hq-css-sheets";

/**
 * Fails when the legacy HQ global stylesheets grow.
 *
 *   pnpm verify:hq-css-ratchet             compare against the baseline
 *   pnpm verify:hq-css-ratchet --update    record a smaller or split state
 *
 * HQ ships seven global sheets that are layered by import order. Until they
 * are split into tokens, layers, and component styles, new styling belongs in
 * `packages/ui` primitives or a CSS module, not in these files. The baseline
 * in `hq-css-ratchet.json` can only move down: `--update` lowers counts,
 * drops deleted sheets, and registers new sheets while the total does not
 * rise. Raising a number means editing the JSON by hand, in review.
 */
const repositoryRoot = process.cwd();
const baselinePath = join(repositoryRoot, "scripts", "hq-css-ratchet.json");

interface Baseline {
  readonly description: string;
  readonly totalLines: number;
  readonly sheets: Readonly<Record<string, number>>;
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as Baseline;
const current = Object.fromEntries(
  hqGlobalSheets(repositoryRoot).map((sheet) => [
    sheet,
    countLines(readFileSync(join(repositoryRoot, sheet), "utf8")),
  ]),
);
const currentTotal = Object.values(current).reduce(
  (total, lines) => total + lines,
  0,
);

const grown: string[] = [];
const unregistered: string[] = [];
for (const [sheet, lines] of Object.entries(current)) {
  const allowed = baseline.sheets[sheet];
  if (allowed === undefined) {
    unregistered.push(`${sheet} (${lines} lines)`);
  } else if (lines > allowed) {
    grown.push(`${sheet}: ${allowed} -> ${lines} (+${lines - allowed})`);
  }
}
const totalGrew = currentTotal > baseline.totalLines;

if (process.argv.includes("--update")) {
  if (grown.length > 0 || totalGrew) {
    console.error(
      "HQ CSS ratchet: --update only records reductions and splits.",
    );
    for (const line of grown) console.error(`  ${line}`);
    if (totalGrew) {
      console.error(
        `  total: ${baseline.totalLines} -> ${currentTotal} (+${currentTotal - baseline.totalLines})`,
      );
    }
    process.exit(1);
  }
  const next: Baseline = {
    description: baseline.description,
    totalLines: currentTotal,
    sheets: current,
  };
  writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `HQ CSS ratchet baseline updated: ${baseline.totalLines} -> ${currentTotal} lines across ${Object.keys(current).length} sheets.`,
  );
  process.exit(0);
}

if (grown.length > 0 || unregistered.length > 0 || totalGrew) {
  console.error("HQ CSS ratchet failed: the legacy global sheets grew.\n");
  for (const line of grown) console.error(`  ${line}`);
  for (const line of unregistered) {
    console.error(`  new global sheet not in the baseline: ${line}`);
  }
  if (totalGrew) {
    console.error(
      `  total: ${baseline.totalLines} -> ${currentTotal} (+${currentTotal - baseline.totalLines})`,
    );
  }
  console.error(
    "\nPut new styling in a packages/ui primitive or a CSS module. If this change splits a sheet without adding lines, run `pnpm verify:hq-css-ratchet --update` and commit scripts/hq-css-ratchet.json.",
  );
  process.exit(1);
}

const reducible = Object.entries(current).filter(
  ([sheet, lines]) => lines < (baseline.sheets[sheet] ?? lines),
);
const removed = Object.keys(baseline.sheets).filter(
  (sheet) => !(sheet in current),
);
console.log(
  `HQ CSS ratchet passed: ${currentTotal} lines across ${Object.keys(current).length} global sheets (baseline ${baseline.totalLines}).`,
);
if (reducible.length > 0 || removed.length > 0) {
  console.log(
    "The sheets shrank. Lock it in with `pnpm verify:hq-css-ratchet --update`.",
  );
}
