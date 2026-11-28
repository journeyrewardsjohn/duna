import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads the persona specs and the two plan files without a browser. Used by
 * fixme-owners.spec.ts (every `test.fixme` names a real work package) and by
 * coverage.ts (the journey coverage table for pull-request descriptions).
 */
// Resolved from the working directory: Playwright and `pnpm` scripts both run
// from the repository root.
export const repoRoot = process.cwd();
export const personasDir = path.join(repoRoot, "tests/e2e/personas");

/** Marks a step no work package delivers yet: a gap for the orchestrator. */
export const GAP = "GAP";

export interface JourneyTest {
  readonly file: string;
  readonly title: string;
  readonly fixme: boolean;
  /** Work-package ids named in the title's trailing `[...]`. */
  readonly owners: readonly string[];
  readonly line: number;
}

export const personaSpecFiles = [
  "club-owner.spec.ts",
  "coach.spec.ts",
  "parent.spec.ts",
  "player.spec.ts",
  "facility-owner.spec.ts",
  "visitor.spec.ts",
] as const;

const testCall = /\btest(\.fixme)?\(\s*(["'`])((?:\\.|(?!\2)[^\\])*)\2/g;

/** Every `test(...)` and `test.fixme(...)` with a literal title in a file. */
export function readJourneyTests(file: string): JourneyTest[] {
  const source = readFileSync(path.join(personasDir, file), "utf8");
  const tests: JourneyTest[] = [];
  for (const match of source.matchAll(testCall)) {
    const title = match[3] ?? "";
    const owners =
      title
        .match(/\[([^\]]+)\]\s*$/)?.[1]
        ?.split(",")
        .map((id) => id.trim())
        .filter(Boolean) ?? [];
    tests.push({
      file,
      title,
      fixme: Boolean(match[1]),
      owners,
      line: source.slice(0, match.index).split("\n").length,
    });
  }
  return tests;
}

export function readAllJourneyTests(): JourneyTest[] {
  const present = new Set(readdirSync(personasDir));
  return personaSpecFiles
    .filter((file) => present.has(file))
    .flatMap((file) => readJourneyTests(file));
}

const expandRange = (prefix: string, from: string, to: string) => {
  const ids: string[] = [];
  for (let code = from.charCodeAt(0); code <= to.charCodeAt(0); code += 1) {
    ids.push(`${prefix}${String.fromCharCode(code)}`);
  }
  return ids;
};

/**
 * Work-package ids from docs/plan/web-hq-backend.md (unprefixed) and
 * docs/plan/mobile.md (written `M-<id>` outside that file, per
 * docs/plan/README.md).
 */
export function readPlanPackageIds(): Set<string> {
  const ids = new Set<string>();
  const web = readFileSync(
    path.join(repoRoot, "docs/plan/web-hq-backend.md"),
    "utf8",
  );
  for (const [, id] of web.matchAll(/^\|\s*([A-Z]\d+[a-z]?)\s*\|/gm)) {
    if (id) ids.add(id);
  }
  // "F5b–e, F6b–d" rows and the wave-3 schema step "W3-0".
  for (const [, prefix, from, to] of web.matchAll(
    /\b([A-Z]\d)([a-z])–([a-z])\b/g,
  )) {
    if (prefix && from && to)
      expandRange(prefix, from, to).forEach((id) => ids.add(id));
  }
  if (/\bW3-0\b/.test(web)) ids.add("W3-0");

  const mobile = readFileSync(
    path.join(repoRoot, "docs/plan/mobile.md"),
    "utf8",
  );
  const workPackages = mobile.slice(mobile.indexOf("## 5. Work packages"));
  for (const [, id] of workPackages.matchAll(/^\|\s*([A-Z]\d+[a-z]?)\b/gm)) {
    if (id) ids.add(`M-${id}`);
  }
  const waveFive = workPackages.match(/\*\*Wave 5:[^\n]*/)?.[0] ?? "";
  for (const [, id] of waveFive.matchAll(/\b([KX]\d)\b/g)) {
    if (id) ids.add(`M-${id}`);
  }
  return ids;
}

export interface CoverageRow {
  readonly file: string;
  readonly implemented: number;
  readonly fixme: number;
  readonly gaps: number;
  readonly total: number;
}

export function coverage(tests: readonly JourneyTest[]): CoverageRow[] {
  return personaSpecFiles.map((file) => {
    const own = tests.filter((test) => test.file === file);
    const fixme = own.filter((test) => test.fixme);
    return {
      file,
      implemented: own.length - fixme.length,
      fixme: fixme.length,
      gaps: fixme.filter((test) => test.owners.includes(GAP)).length,
      total: own.length,
    };
  });
}
