/**
 * Regenerates the Tideline token outputs from the design contract.
 *
 *   pnpm tideline:tokens           write tokens.json, tokens.css, tokens.root.css,
 *                                  tokens.ts and the React Native tokens.native.ts
 *   pnpm tideline:tokens --check   exit 1 when a generated file is stale
 *
 * The source of truth is the contract's `docs/design/tideline-4.1.1/tokens.json`.
 * The build applies the canonical renames and retirements and promotes the
 * contract's `$duna` zone and icon decisions into tokens
 * (`canonicalTidelineSource`), writing `packages/ui/src/tideline/tokens/tokens.json`,
 * the code source that web (`tokens.css`, `tokens.ts`) and native builders read.
 * `tokens.root.css` carries the same custom properties on `:root` for the
 * legacy stylesheets (variables only; see docs/design/legacy-aliases.md).
 * Names the code needs before design publishes them live in
 * `tokens.additions.json`. To take a new design revision, replace the contract
 * file and run the first command.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { format } from "prettier";
import {
  buildTidelineNativeTokensTs,
  buildTidelineRootTokensCss,
  buildTidelineTokensCss,
  buildTidelineTokensTs,
  canonicalTidelineSource,
  mergeTidelineAdditions,
  TIDELINE_CONTRACT_TOKENS,
  type TidelineTokenSource,
} from "../packages/ui/src/tideline/tokens/token-build";

async function main() {
  const root = resolve(import.meta.dirname, "..");
  const directory = join(root, "packages/ui/src/tideline/tokens");
  const sourcePath = join(directory, "tokens.json");
  const check = process.argv.includes("--check");

  const contractPath = join(root, TIDELINE_CONTRACT_TOKENS);
  const canonical = canonicalTidelineSource(
    JSON.parse(readFileSync(contractPath, "utf8")) as TidelineTokenSource,
  );
  const rawSource = JSON.stringify(canonical);
  const additionsPath = join(directory, "tokens.additions.json");
  const rawAdditions = readFileSync(additionsPath, "utf8");
  const source = mergeTidelineAdditions(
    canonical,
    JSON.parse(rawAdditions) as Partial<TidelineTokenSource>,
  );

  const outputs: Array<[path: string, content: string]> = [
    [sourcePath, await format(rawSource, { parser: "json" })],
    [additionsPath, await format(rawAdditions, { parser: "json" })],
    [
      join(directory, "tokens.css"),
      await format(buildTidelineTokensCss(source), { parser: "css" }),
    ],
    [
      join(directory, "tokens.root.css"),
      await format(buildTidelineRootTokensCss(source), { parser: "css" }),
    ],
    [
      join(directory, "tokens.ts"),
      await format(buildTidelineTokensTs(source), { parser: "typescript" }),
    ],
    [
      join(root, "packages/ui/src/native/tokens/tokens.native.ts"),
      await format(buildTidelineNativeTokensTs(source), {
        parser: "typescript",
      }),
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
    if (!check) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    }
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
