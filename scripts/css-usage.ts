import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import {
  countLines,
  hqGlobalSheets,
  parseCssRules,
  splitSelectorList,
  type CssRule,
} from "./hq-css-sheets";

/**
 * Reports which rules in the HQ global stylesheets nothing appears to use.
 *
 *   pnpm css:usage:hq             static report
 *   pnpm css:coverage:hq          static report + runtime coverage
 *
 * Static: a selector is unmatched when one of the classes it requires never
 * appears as a token in any `.ts`/`.tsx` under `apps/hq` or
 * `packages/ui/src`. Classes built from a template literal or concatenation
 * (`schedule-event--${kind}`) are matched by prefix: every source token that
 * ends in a BEM separator (`--`, `__`) is treated as a prefix, alongside the
 * reviewed list below.
 *
 * Runtime: Chromium CSS coverage is recorded over the visual route matrix
 * (every reachable route, light and dark, three viewports) and matched back
 * to source rules by file, media context, and selector. A rule the
 * matrix never applied is "unexercised". That is evidence, not proof: hover,
 * focus, dialogs, error states, and the routes demo mode cannot render are
 * outside the matrix.
 *
 * A rule is a safe deletion candidate only when it is both statically
 * unmatched and unexercised, and even then the deleting change must pass the
 * visual baselines.
 */
const repositoryRoot = process.cwd();
const outputDirectory = join(repositoryRoot, "reports", "hq-css-usage");
const coverageDirectory = join(outputDirectory, "coverage");

const sourceRoots = ["apps/hq", "packages/ui/src"];
const ignoredDirectories = new Set([
  ".eve",
  ".next",
  ".output",
  ".turbo",
  "node_modules",
]);

/**
 * Class prefixes that are always treated as referenced. Each entry names the
 * code that produces the class, because that code is invisible to a token
 * scan of the HQ sources.
 */
const allowedPrefixes: readonly { prefix: string; reason: string }[] = [
  {
    prefix: "is-",
    reason: "State classes toggled by interpolation and classList calls.",
  },
  {
    prefix: "schedule-event--",
    reason: "Calendar entries interpolate the event kind and status.",
  },
  {
    prefix: "mapboxgl-",
    reason: "Markup created by mapbox-gl at runtime.",
  },
];

const args = process.argv.slice(2);
const runRuntime = args.includes("--runtime");
const skipCoverageRun = args.includes("--reuse-coverage");

function sourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sourceFiles(path, files);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.(test|spec)\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(path);
    }
  }
  return files;
}

const files = sourceRoots.flatMap((root) =>
  sourceFiles(join(repositoryRoot, root)),
);
const tokens = new Set<string>();
for (const file of files) {
  for (const token of readFileSync(file, "utf8").match(/[\w-]+/g) ?? []) {
    tokens.add(token);
  }
}

// `card--${tone}` and `"card--" + tone` both leave a source token that ends
// in a separator. A BEM separator (`--`, `__`) only occurs in class names, so
// those tokens are applied as prefixes. A token ending in a single separator
// is usually an id or React key (`venue-${id}`); it is reported as a candidate
// and applied only once it is on the allowlist.
const separatorTokens = [...tokens].filter(
  (token) => /^[A-Za-z][\w-]*[-_]$/.test(token) && token.length >= 3,
);
const detectedPrefixes = separatorTokens.filter((token) =>
  /(--|__)$/.test(token),
);
const prefixes = [
  ...new Set([
    ...allowedPrefixes.map((entry) => entry.prefix),
    ...detectedPrefixes,
  ]),
];
const candidatePrefixes = separatorTokens.filter(
  (token) => !prefixes.includes(token),
);
const prefixHits = new Map<string, Set<string>>();
const candidateHits = new Map<string, Set<string>>();

type ClassMatch = "token" | "prefix" | "none";
const classMatches = new Map<string, ClassMatch>();

function record(hits: Map<string, Set<string>>, prefix: string, name: string) {
  const names = hits.get(prefix) ?? new Set<string>();
  names.add(name);
  hits.set(prefix, names);
}

function matchClass(name: string): ClassMatch {
  const known = classMatches.get(name);
  if (known) return known;
  let match: ClassMatch = "none";
  if (tokens.has(name)) {
    match = "token";
  } else {
    for (const prefix of prefixes) {
      if (!name.startsWith(prefix)) continue;
      match = "prefix";
      record(prefixHits, prefix, name);
    }
    if (match === "none") {
      for (const prefix of candidatePrefixes) {
        if (name.startsWith(prefix)) record(candidateHits, prefix, name);
      }
    }
  }
  classMatches.set(name, match);
  return match;
}

/** Start and end of the parenthesized group that opens at `open`. */
function groupEnd(selector: string, open: number): number {
  let depth = 0;
  for (let index = open; index < selector.length; index += 1) {
    if (selector[index] === "(") depth += 1;
    if (selector[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return selector.length - 1;
}

const alternativePseudo = /:(?:is|where|has|matches|-webkit-any|-moz-any)\(/;

/**
 * Rewrites one complex selector into the plain alternatives it can match:
 * `:not()` arguments are dropped (they require nothing), and `:is()`,
 * `:where()`, and `:has()` are expanded into one selector per argument.
 */
function expandSelector(selector: string, budget = { left: 256 }): string[] {
  const negation = selector.indexOf(":not(");
  if (negation !== -1) {
    const close = groupEnd(selector, negation + 4);
    return expandSelector(
      `${selector.slice(0, negation)}${selector.slice(close + 1)}`,
      budget,
    );
  }
  const group = alternativePseudo.exec(selector);
  if (!group) return [selector];
  const open = group.index + group[0].length - 1;
  const close = groupEnd(selector, open);
  const before = selector.slice(0, group.index);
  const after = selector.slice(close + 1);
  return splitSelectorList(selector.slice(open + 1, close)).flatMap(
    (alternative) => {
      budget.left -= 1;
      // Too many combinations to enumerate: assume it can match.
      if (budget.left < 0) return [""];
      return expandSelector(`${before} ${alternative} ${after}`, budget);
    },
  );
}

function classesIn(selector: string): string[] {
  const withoutAttributes = selector.replace(/\[[^\]]*\]/g, " ");
  return [...withoutAttributes.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(
    (match) => match[1] ?? "",
  );
}

/** Classes that keep a selector from matching, or [] when it can match. */
function missingClasses(selector: string): string[] {
  let fewest: string[] | undefined;
  for (const alternative of expandSelector(selector)) {
    const missing = classesIn(alternative).filter(
      (name) => matchClass(name) === "none",
    );
    if (missing.length === 0) return [];
    if (!fewest || missing.length < fewest.length) fewest = missing;
  }
  return [...new Set(fewest ?? [])];
}

interface RuleFinding {
  readonly line: number;
  readonly endLine: number;
  readonly selector: string;
  readonly context: readonly string[];
  readonly missing: readonly string[];
}

interface SheetAnalysis {
  readonly file: string;
  readonly lines: number;
  readonly rules: readonly CssRule[];
  readonly dead: ReadonlySet<CssRule>;
  readonly report: {
    file: string;
    lines: number;
    rules: number;
    classes: number;
    unmatchedClasses: number;
    prefixMatchedClasses: number;
    unmatchedRules: number;
    unmatchedRuleLines: number;
    partlyUnmatchedRules: number;
    unmatchedSelectors: number;
  };
  readonly unmatchedRules: RuleFinding[];
  readonly partlyUnmatchedRules: RuleFinding[];
  readonly unmatchedClassNames: string[];
}

function analyzeSheet(file: string): SheetAnalysis {
  const css = readFileSync(join(repositoryRoot, file), "utf8");
  const rules = parseCssRules(css);
  const classNames = new Set<string>();
  const dead = new Set<CssRule>();
  const unmatchedRules: RuleFinding[] = [];
  const partlyUnmatchedRules: RuleFinding[] = [];
  let unmatchedSelectors = 0;
  let unmatchedRuleLines = 0;

  for (const rule of rules) {
    const selectors = splitSelectorList(rule.selector);
    const missingBySelector = selectors.map((selector) => {
      for (const name of classesIn(selector)) classNames.add(name);
      return missingClasses(selector);
    });
    const deadSelectors = missingBySelector.filter(
      (missing) => missing.length > 0,
    );
    if (deadSelectors.length === 0) continue;
    unmatchedSelectors += deadSelectors.length;
    const finding: RuleFinding = {
      line: rule.startLine,
      endLine: rule.endLine,
      selector: rule.selector,
      context: rule.context,
      missing: [...new Set(deadSelectors.flat())].sort(),
    };
    if (deadSelectors.length === selectors.length) {
      dead.add(rule);
      unmatchedRules.push(finding);
      unmatchedRuleLines += rule.endLine - rule.startLine + 1;
    } else {
      partlyUnmatchedRules.push(finding);
    }
  }

  const names = [...classNames];
  const unmatchedClassNames = names
    .filter((name) => matchClass(name) === "none")
    .sort();
  return {
    file,
    lines: countLines(css),
    rules,
    dead,
    report: {
      file,
      lines: countLines(css),
      rules: rules.length,
      classes: names.length,
      unmatchedClasses: unmatchedClassNames.length,
      prefixMatchedClasses: names.filter(
        (name) => matchClass(name) === "prefix",
      ).length,
      unmatchedRules: unmatchedRules.length,
      unmatchedRuleLines,
      partlyUnmatchedRules: partlyUnmatchedRules.length,
      unmatchedSelectors,
    },
    unmatchedRules,
    partlyUnmatchedRules,
    unmatchedClassNames,
  };
}

function sum<Row>(rows: readonly Row[], pick: (row: Row) => number): number {
  return rows.reduce((total, row) => total + pick(row), 0);
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "0.0%" : `${((part / whole) * 100).toFixed(1)}%`;
}

function table(header: string[], rows: (string | number)[][]): string {
  const cells = [header, ...rows.map((row) => row.map(String))];
  const widths = header.map((_, column) =>
    Math.max(...cells.map((row) => (row[column] ?? "").length)),
  );
  return cells
    .map((row) =>
      row
        .map((cell, column) =>
          column === 0
            ? cell.padEnd(widths[column] ?? 0)
            : cell.padStart(widths[column] ?? 0),
        )
        .join("  "),
    )
    .join("\n");
}

function writeJson(name: string, value: unknown): string {
  mkdirSync(outputDirectory, { recursive: true });
  const path = join(outputDirectory, name);
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  return relative(repositoryRoot, path);
}

const sheets = hqGlobalSheets(repositoryRoot).map(analyzeSheet);
const staticTotals = {
  lines: sum(sheets, (sheet) => sheet.report.lines),
  rules: sum(sheets, (sheet) => sheet.report.rules),
  unmatchedRules: sum(sheets, (sheet) => sheet.report.unmatchedRules),
  unmatchedRuleLines: sum(sheets, (sheet) => sheet.report.unmatchedRuleLines),
  partlyUnmatchedRules: sum(
    sheets,
    (sheet) => sheet.report.partlyUnmatchedRules,
  ),
  unmatchedSelectors: sum(sheets, (sheet) => sheet.report.unmatchedSelectors),
};
const prefixReport = [...prefixHits.entries()]
  .map(([prefix, hits]) => ({
    prefix,
    source: allowedPrefixes.some((entry) => entry.prefix === prefix)
      ? "allowlist"
      : "detected",
    classes: hits.size,
  }))
  .sort((left, right) => right.classes - left.classes);

const candidateReport = [...candidateHits.entries()]
  .map(([prefix, hits]) => ({ prefix, classes: [...hits].sort() }))
  .sort((left, right) => right.classes.length - left.classes.length);

const staticPath = writeJson("static.json", {
  generatedBy: "scripts/css-usage.ts",
  sources: { roots: sourceRoots, files: files.length, tokens: tokens.size },
  allowedPrefixes,
  prefixes: prefixReport,
  prefixCandidates: candidateReport,
  totals: staticTotals,
  files: sheets.map((sheet) => ({
    ...sheet.report,
    unmatchedClassNames: sheet.unmatchedClassNames,
    unmatchedRuleList: sheet.unmatchedRules,
    partlyUnmatchedRuleList: sheet.partlyUnmatchedRules,
  })),
});

console.log("HQ global CSS: static usage");
console.log(
  `Scanned ${files.length} source files under ${sourceRoots.join(", ")}.\n`,
);
console.log(
  table(
    [
      "sheet",
      "lines",
      "rules",
      "unmatched rules",
      "unmatched lines",
      "share of lines",
      "partly unmatched",
    ],
    [
      ...sheets.map((sheet) => [
        sheet.file,
        sheet.report.lines,
        sheet.report.rules,
        sheet.report.unmatchedRules,
        sheet.report.unmatchedRuleLines,
        percent(sheet.report.unmatchedRuleLines, sheet.report.lines),
        sheet.report.partlyUnmatchedRules,
      ]),
      [
        "total",
        staticTotals.lines,
        staticTotals.rules,
        staticTotals.unmatchedRules,
        staticTotals.unmatchedRuleLines,
        percent(staticTotals.unmatchedRuleLines, staticTotals.lines),
        staticTotals.partlyUnmatchedRules,
      ],
    ],
  ),
);
console.log(
  `\n${prefixReport.length} prefixes matched classes that no source token names in full. Largest:`,
);
console.log(
  table(
    ["prefix", "source", "classes"],
    prefixReport
      .slice(0, 8)
      .map((row) => [row.prefix, row.source, row.classes]),
  ),
);
if (candidateReport.length > 0) {
  console.log(
    "\nNot applied: source tokens ending in a single separator that would match an unmatched class. Add one to allowedPrefixes only if it builds a class name:",
  );
  console.log(
    table(
      ["token", "classes it would match"],
      candidateReport.map((row) => [row.prefix, row.classes.length]),
    ),
  );
}
console.log(`\nWrote ${staticPath}`);

// ---------------------------------------------------------------------------
// Runtime coverage

interface CoverageFragment {
  readonly route: string;
  readonly theme: string;
  readonly project: string;
  readonly sheets: readonly {
    readonly hash: string;
    readonly ranges: readonly { start: number; end: number }[];
  }[];
}

/** `/* [project]/apps/hq/app/globals.css [app-client] (css) *\/` */
const moduleMarker = /\/\* \[project\]\/(\S+) \[[^\]]*\] \(css\) \*\//g;

function normalizeSelector(selector: string): string {
  return splitSelectorList(selector)
    .map((part) =>
      part
        .replace(/\s+/g, " ")
        .replace(/\s*([>+~,()])\s*/g, "$1")
        .replace(/["']/g, "")
        .trim(),
    )
    .sort()
    .join(",");
}

/**
 * Identity of a rule that survives the bundler: its source file, its
 * conditional context, and its selector list. Every rule sharing a key
 * matches the same elements, so one applied copy means all of them apply.
 */
function ruleKey(file: string, rule: CssRule): string {
  const context = rule.context
    .map((entry) => entry.replace(/\s+/g, " ").trim())
    .join(" > ");
  return `${file} | ${context} | ${normalizeSelector(rule.selector)}`;
}

function runtimeReport(): void {
  if (!skipCoverageRun) {
    rmSync(coverageDirectory, { recursive: true, force: true });
    const run = spawnSync(
      "pnpm",
      [
        "exec",
        "playwright",
        "test",
        "--config",
        "playwright.hq-visual.config.ts",
        "--project=coverage-desktop",
        "--project=coverage-tablet",
        "--project=coverage-mobile",
      ],
      {
        cwd: repositoryRoot,
        stdio: "inherit",
        env: {
          ...process.env,
          HQ_VISUAL_SERVER: "dev",
          HQ_CSS_COVERAGE_DIR: coverageDirectory,
        },
      },
    );
    if (run.status !== 0) {
      console.error(
        "\nThe coverage run did not finish cleanly, so its numbers would undercount usage. Fix the failing routes and run it again.",
      );
      process.exit(run.status ?? 1);
    }
  }

  const fragmentDirectory = join(coverageDirectory, "fragments");
  if (!existsSync(fragmentDirectory)) {
    console.error(`No coverage fragments in ${fragmentDirectory}.`);
    process.exit(1);
  }
  const fragments = readdirSync(fragmentDirectory)
    .filter((name) => name.endsWith(".json"))
    .map(
      (name) =>
        JSON.parse(
          readFileSync(join(fragmentDirectory, name), "utf8"),
        ) as CoverageFragment,
    );

  const usedRanges = new Map<string, { start: number; end: number }[]>();
  for (const fragment of fragments) {
    for (const sheet of fragment.sheets) {
      const ranges = usedRanges.get(sheet.hash) ?? [];
      ranges.push(...sheet.ranges);
      usedRanges.set(sheet.hash, ranges);
    }
  }

  // The development server concatenates source sheets into one stylesheet
  // and marks where each begins. Its source map does not survive the
  // pretty-printer (multi-line values shift every later line), so rules are
  // matched to their source by file, context, and selector instead.
  const hqSheets = new Set(sheets.map((sheet) => sheet.file));
  const servedKeys = new Set<string>();
  const usedKeys = new Set<string>();
  for (const [hash, ranges] of usedRanges) {
    const served = readFileSync(
      join(coverageDirectory, "sheets", `${hash}.css`),
      "utf8",
    );
    const modules = Array.from(served.matchAll(moduleMarker), (match) => ({
      start: match.index,
      file: match[1] ?? "",
    }));
    if (modules.length === 0) {
      throw new Error(
        `Stylesheet ${hash} has no source markers. Runtime coverage needs the development server (HQ_VISUAL_SERVER=dev).`,
      );
    }
    const merged = [...ranges].sort((left, right) => left.start - right.start);
    for (const rule of parseCssRules(served)) {
      let file: string | undefined;
      for (const module of modules) {
        if (module.start <= rule.start) file = module.file;
      }
      if (!file || !hqSheets.has(file)) continue;
      const key = ruleKey(file, rule);
      servedKeys.add(key);
      if (
        merged.some((range) => range.start < rule.end && range.end > rule.start)
      ) {
        usedKeys.add(key);
      }
    }
  }

  const runtimeFiles = sheets.map((sheet) => {
    const seen = sheet.rules.filter((rule) =>
      servedKeys.has(ruleKey(sheet.file, rule)),
    );
    const idle = seen.filter(
      (rule) => !usedKeys.has(ruleKey(sheet.file, rule)),
    );
    const idleDead = idle.filter((rule) => sheet.dead.has(rule));
    const usedDead = seen.filter(
      (rule) => sheet.dead.has(rule) && usedKeys.has(ruleKey(sheet.file, rule)),
    );
    const span = (rules: readonly CssRule[]) =>
      sum(rules, (rule) => rule.endLine - rule.startLine + 1);
    const describe = (rule: CssRule) => ({
      line: rule.startLine,
      endLine: rule.endLine,
      selector: rule.selector,
      context: rule.context,
    });
    return {
      file: sheet.file,
      lines: sheet.report.lines,
      rules: sheet.rules.length,
      // Rules the bundler rewrote beyond recognition are left unclassified.
      unclassifiedRules: sheet.rules.length - seen.length,
      exercisedRules: seen.length - idle.length,
      unexercisedRules: idle.length,
      unexercisedRuleLines: span(idle),
      unmatchedAndUnexercisedRules: idleDead.length,
      unmatchedAndUnexercisedRuleLines: span(idleDead),
      unmatchedButExercisedRules: usedDead.length,
      unexercisedRuleList: idle.map((rule) => ({
        ...describe(rule),
        staticallyUnmatched: sheet.dead.has(rule),
      })),
      unmatchedButExercisedRuleList: usedDead.map(describe),
    };
  });

  const runtimeTotals = {
    lines: sum(runtimeFiles, (file) => file.lines),
    rules: sum(runtimeFiles, (file) => file.rules),
    unclassifiedRules: sum(runtimeFiles, (file) => file.unclassifiedRules),
    exercisedRules: sum(runtimeFiles, (file) => file.exercisedRules),
    unexercisedRules: sum(runtimeFiles, (file) => file.unexercisedRules),
    unexercisedRuleLines: sum(
      runtimeFiles,
      (file) => file.unexercisedRuleLines,
    ),
    unmatchedAndUnexercisedRules: sum(
      runtimeFiles,
      (file) => file.unmatchedAndUnexercisedRules,
    ),
    unmatchedAndUnexercisedRuleLines: sum(
      runtimeFiles,
      (file) => file.unmatchedAndUnexercisedRuleLines,
    ),
    unmatchedButExercisedRules: sum(
      runtimeFiles,
      (file) => file.unmatchedButExercisedRules,
    ),
  };

  const pages = new Set(
    fragments.map(
      (fragment) => `${fragment.project}/${fragment.route}/${fragment.theme}`,
    ),
  );
  const runtimePath = writeJson("runtime.json", {
    generatedBy: "scripts/css-usage.ts --runtime",
    matrix: {
      pages: pages.size,
      routes: new Set(fragments.map((fragment) => fragment.route)).size,
      projects: [...new Set(fragments.map((fragment) => fragment.project))],
      themes: [...new Set(fragments.map((fragment) => fragment.theme))],
    },
    totals: runtimeTotals,
    files: runtimeFiles,
  });

  console.log(
    `\nHQ global CSS: runtime coverage over ${pages.size} page loads`,
  );
  console.log(
    table(
      [
        "sheet",
        "rules",
        "exercised",
        "unexercised",
        "unexercised lines",
        "unmatched + unexercised",
        "lines",
        "unmatched but exercised",
      ],
      [
        ...runtimeFiles.map((file) => [
          file.file,
          file.rules,
          file.exercisedRules,
          file.unexercisedRules,
          file.unexercisedRuleLines,
          file.unmatchedAndUnexercisedRules,
          file.unmatchedAndUnexercisedRuleLines,
          file.unmatchedButExercisedRules,
        ]),
        [
          "total",
          runtimeTotals.rules,
          runtimeTotals.exercisedRules,
          runtimeTotals.unexercisedRules,
          runtimeTotals.unexercisedRuleLines,
          runtimeTotals.unmatchedAndUnexercisedRules,
          runtimeTotals.unmatchedAndUnexercisedRuleLines,
          runtimeTotals.unmatchedButExercisedRules,
        ],
      ],
    ),
  );
  if (runtimeTotals.unmatchedButExercisedRules > 0) {
    console.log(
      "\n“Unmatched but exercised” rules were applied in the browser although no source token names their classes. Each one is a class built in a way the static scan cannot see: add its prefix to allowedPrefixes before trusting the static list.",
    );
  }
  console.log(`\nWrote ${runtimePath}`);
}

if (runRuntime) runtimeReport();
