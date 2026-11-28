/**
 * Regenerates the Tideline token outputs from the design source.
 *
 *   pnpm tideline:tokens           write tokens.css and tokens.ts
 *   pnpm tideline:tokens --check   exit 1 when the generated files are stale
 *
 * To take a new design revision, replace
 * `packages/ui/src/tideline/tokens/tokens.json` and run the first command. Names the
 * code needs before design publishes them live in `tokens.additions.json`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { format } from "prettier";
import {
  buildTidelineTokensCss,
  buildTidelineTokensTs,
  mergeTidelineAdditions,
  type TidelineTokenSource,
} from "../packages/ui/src/tideline/tokens/token-build";

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const directory = join(root, "packages/ui/src/tideline/tokens");
  const sourcePath = join(directory, "tokens.json");
  const check = process.argv.includes("--check");

  const rawSource = readFileSync(sourcePath, "utf8");
  const additionsPath = join(directory, "tokens.additions.json");
  const rawAdditions = readFileSync(additionsPath, "utf8");
  const source = mergeTidelineAdditions(
    JSON.parse(rawSource) as TidelineTokenSource,
    JSON.parse(rawAdditions) as Partial<TidelineTokenSource>,
  );

  const outputs: Array<[path: string, content: string]> = [
    // The design export is minified differently on each drop; keep it stable.
    [sourcePath, await format(rawSource, { parser: "json" })],
    [additionsPath, await format(rawAdditions, { parser: "json" })],
    [
      join(directory, "tokens.css"),
      await format(buildTidelineTokensCss(source), { parser: "css" }),
    ],
    [
      join(directory, "tokens.ts"),
      await format(buildTidelineTokensTs(source), { parser: "typescript" }),
    ],
  ];

  const stale: string[] = [];
  for (const [path, content] of outputs) {
    let current = "";
    try {
      current = readFileSync(path, "utf8");
    } catch {
      current = "";
    }
    if (current === content) continue;
    stale.push(relative(root, path));
    if (!check) writeFileSync(path, content);
  }

  if (check && stale.length > 0) {
    console.error(
      `Tideline tokens are stale: ${stale.join(", ")}. Run \`pnpm tideline:tokens\`.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    stale.length > 0
      ? `Tideline tokens written: ${stale.join(", ")}`
      : "Tideline tokens are up to date.",
  );
}

void main();
