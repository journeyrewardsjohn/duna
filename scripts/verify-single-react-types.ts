import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Fails when more than one version of `@types/react` is in the workspace.
 *
 * Why the whole workspace and not only what `apps/web` and `apps/hq` declare:
 * third-party type declarations that import "react" without depending on
 * `@types/react` (Next's own `.d.ts` files, for one) resolve it through pnpm's
 * hoisted `node_modules/.pnpm/node_modules/@types/react`. With two versions
 * installed, which one is hoisted depends on install history, so the web apps
 * and the shared packages they compile (`packages/ui`, `packages/observability`)
 * can meet two unrelated copies of the React types in one type-check. That is
 * how the HQ production build on Vercel failed while CI stayed green.
 */
const repositoryRoot = process.cwd();
const lockfileFlag = process.argv.indexOf("--lockfile");
const lockfilePath =
  lockfileFlag > -1 && process.argv[lockfileFlag + 1]
    ? resolve(process.argv[lockfileFlag + 1])
    : join(repositoryRoot, "pnpm-lock.yaml");

const howToFix = [
  "How to fix:",
  '  1. Pick one version and set it in pnpm-workspace.yaml under `overrides: "@types/react": <version>`.',
  "     Use the version that matches the React the apps actually run (Next's vendored React for the",
  "     web apps, the React Native runtime for the iOS apps).",
  "  2. Run `pnpm install --no-frozen-lockfile` to regenerate pnpm-lock.yaml (never edit it by hand).",
  "  3. Run this check again: `pnpm verify:single-react-types`.",
  "See docs/OPERATIONS.md, section Production deploys.",
].join("\n");

function lockfileVersions() {
  const lockfile = readFileSync(lockfilePath, "utf8");
  const versions = new Set<string>();
  for (const match of lockfile.matchAll(
    /^ {2}'@types\/react@([^'(]+)'(?:\([^)]*\))?:/gm,
  )) {
    versions.add(match[1]);
  }
  return versions;
}

/**
 * The copies that type-checks can actually reach in the installed tree: the
 * hoisted fallback and each workspace package's own link. Orphaned folders
 * that pnpm leaves in node_modules/.pnpm are ignored because nothing links
 * to them.
 */
function installedVersions() {
  const links = [
    join(repositoryRoot, "node_modules", ".pnpm", "node_modules"),
    join(repositoryRoot, "node_modules"),
  ];
  for (const group of ["apps", "packages"]) {
    const groupPath = join(repositoryRoot, group);
    if (!existsSync(groupPath)) continue;
    for (const name of readdirSync(groupPath)) {
      links.push(join(groupPath, name, "node_modules"));
    }
  }
  const versions = new Map<string, string[]>();
  for (const modules of links) {
    const typesPath = join(modules, "@types", "react", "package.json");
    if (!existsSync(typesPath)) continue;
    const { version } = JSON.parse(
      readFileSync(realpathSync(typesPath), "utf8"),
    ) as { version: string };
    const where = modules.slice(repositoryRoot.length + 1);
    versions.set(version, [...(versions.get(version) ?? []), where]);
  }
  return versions;
}

const fromLockfile = lockfileVersions();
const installed =
  lockfileFlag > -1 ? new Map<string, string[]>() : installedVersions();
const problems: string[] = [];

if (fromLockfile.size === 0) {
  problems.push("pnpm-lock.yaml lists no @types/react at all.");
}
if (fromLockfile.size > 1) {
  problems.push(
    `pnpm-lock.yaml resolves @types/react to ${fromLockfile.size} versions: ${[...fromLockfile].sort().join(", ")}.`,
  );
}
if (installed.size > 1) {
  problems.push(
    `The installed tree links ${installed.size} versions of @types/react:\n` +
      [...installed]
        .map(([version, where]) => `  ${version}: ${where.join(", ")}`)
        .join("\n") +
      "\nIf the lockfile is clean, reinstall with `pnpm install --frozen-lockfile`.",
  );
}

if (problems.length > 0) {
  console.error(
    "More than one copy of the React types is reachable from apps/web, apps/hq and the packages they compile.\n",
  );
  console.error(problems.join("\n"));
  console.error(`\n${howToFix}`);
  process.exit(1);
}

console.log(
  `Single React types verified: every workspace package type-checks against @types/react@${[...fromLockfile][0]}.`,
);
