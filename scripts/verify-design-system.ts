/**
 * Design-system verifier (`pnpm verify:design-system`, part of `pnpm verify`).
 *
 * The contract is the Duna Design System (Tideline 4.1.1):
 * docs/design/tideline-4.1.1/README.md. This script is data-driven:
 *
 * - Per-surface contracts live in `scripts/design-contracts/<surface>.ts`.
 *   Checks marked `legacy` pin pre-Tideline literals and are deleted by the
 *   surface's own work package when it migrates.
 * - Repository-wide rules below protect accessibility, honesty and naming and
 *   accept both the legacy fonts and the Tideline fonts (Jost, Geist, Geist
 *   Mono).
 * - The Tideline guard (`scripts/design-contracts/tideline-guard.ts`) runs
 *   only on `packages/ui/src/tideline/**` and paths a contract lists as
 *   `migrated`: no retired orange, Solar only in live states, no `!important`,
 *   no infrastructure vendor names in user-facing strings.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { hq } from "./design-contracts/hq";
import { player } from "./design-contracts/player";
import { pro } from "./design-contracts/pro";
import { publicWeb } from "./design-contracts/public";
import { shared } from "./design-contracts/shared";
import {
  checkTidelineSource,
  isTokenSource,
  selfTest,
} from "./design-contracts/tideline-guard";
import type {
  ContractCheck,
  SurfaceContract,
  TidelineRule,
} from "./design-contracts/types";
import { web } from "./design-contracts/web";

const root = process.cwd();
const violations: string[] = [];
const contracts: readonly SurfaceContract[] = [
  shared,
  hq,
  publicWeb,
  web,
  player,
  pro,
];
const ignoredDirectories = new Set([
  ".expo",
  ".next",
  ".turbo",
  "build",
  "dist",
  "node_modules",
]);

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    if (ignoredDirectories.has(entry)) return [];
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

const fileCache = new Map<string, string | null>();
function read(path: string): string | null {
  if (!fileCache.has(path)) {
    const absolute = join(root, path);
    fileCache.set(
      path,
      existsSync(absolute) && statSync(absolute).isFile()
        ? readFileSync(absolute, "utf8")
        : null,
    );
  }
  return fileCache.get(path) ?? null;
}

function tag(check: ContractCheck) {
  return check.legacy ? ` [${check.legacy}]` : "";
}

function requireSource(path: string, check: ContractCheck) {
  const source = read(path);
  if (source === null) violations.push(`${path} is missing${tag(check)}`);
  return source;
}

const declarationSources = new Map<
  string,
  { label: string; source: string }[]
>();
function scriptSources(directory: string) {
  if (!declarationSources.has(directory)) {
    declarationSources.set(
      directory,
      sourceFiles(join(root, directory))
        .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
        .map((file) => ({
          label: relative(root, file),
          source: readFileSync(file, "utf8"),
        })),
    );
  }
  return declarationSources.get(directory) ?? [];
}

function sourceDeclaring(
  directory: string,
  declaration: string,
  check: ContractCheck,
) {
  const matches = scriptSources(directory).filter(({ source }) =>
    source.includes(declaration),
  );
  if (matches.length === 1 && matches[0]) return matches[0];
  violations.push(
    matches.length === 0
      ? `${directory} must declare ${declaration}${tag(check)}`
      : `${directory} must declare ${declaration} exactly once; found ${matches
          .map(({ label }) => label)
          .join(", ")}${tag(check)}`,
  );
  return null;
}

function cssRuleBody(source: string, selector: string) {
  const start = source.indexOf(selector);
  if (start < 0) return null;
  return source.slice(start, source.indexOf("}", start));
}

function runCheck(check: ContractCheck) {
  if (check.when && !existsSync(join(root, check.when))) return;
  switch (check.kind) {
    case "exists":
      if (!existsSync(join(root, check.path))) {
        violations.push(
          `${check.message ?? `${check.path} is missing`}${tag(check)}`,
        );
      }
      return;
    case "absent":
      if (existsSync(join(root, check.path))) {
        violations.push(
          `${check.message ?? `${check.path} must not exist`}${tag(check)}`,
        );
      }
      return;
    case "includes": {
      const source = requireSource(check.file, check);
      if (source === null) return;
      for (const value of check.values) {
        if (!source.includes(value)) {
          violations.push(
            `${check.message ?? `${check.file} must preserve`}: ${JSON.stringify(value)}${tag(check)}`,
          );
        }
      }
      return;
    }
    case "excludes": {
      const source = read(check.file);
      if (source === null) return;
      for (const value of check.values) {
        if (source.includes(value)) {
          violations.push(
            `${check.message ?? `${check.file} must not contain`}: ${JSON.stringify(value)}${tag(check)}`,
          );
        }
      }
      return;
    }
    case "cssRule": {
      const source = requireSource(check.file, check);
      if (source === null) return;
      const body = cssRuleBody(source, check.selector);
      for (const value of check.values) {
        if (body === null || !body.includes(value)) {
          violations.push(
            `${check.message ?? `${check.file} must keep ${check.selector} with ${value}`}${tag(check)}`,
          );
        }
      }
      return;
    }
    case "declares": {
      const sources = check.declarations.map((declaration) =>
        sourceDeclaring(check.root, declaration, check),
      );
      if (sources.some((source) => source === null)) return;
      const combined = sources.map((entry) => entry?.source ?? "").join("\n");
      const label = sources.map((entry) => entry?.label).join(", ");
      for (const value of check.values) {
        if (!combined.includes(value)) {
          violations.push(
            `${label}: ${check.message ?? "must preserve"}: ${JSON.stringify(value)}${tag(check)}`,
          );
        }
      }
      return;
    }
    case "declaresInOrder": {
      const entry = sourceDeclaring(check.root, check.declaration, check);
      if (!entry) return;
      const positions = check.markers.map((marker) =>
        entry.source.indexOf(marker),
      );
      const ordered =
        positions.every((position) => position >= 0) &&
        positions.every(
          (position, index) =>
            index === 0 || position > (positions[index - 1] ?? -1),
        );
      if (!ordered) {
        violations.push(
          `${entry.label}: ${check.message ?? `must keep the order ${check.markers.join(" → ")}`}${tag(check)}`,
        );
      }
      return;
    }
    case "treeExcludes":
      for (const { label, source } of scriptSources(check.root)) {
        for (const value of check.values) {
          if (source.includes(value)) {
            violations.push(
              `${label}: ${check.message ?? "must not contain"}: ${JSON.stringify(value)}${tag(check)}`,
            );
          }
        }
      }
      return;
    case "maxBytes": {
      const absolute = join(root, check.path);
      if (existsSync(absolute) && statSync(absolute).size > check.bytes) {
        violations.push(
          `${check.message ?? `${check.path} is larger than ${check.bytes} bytes`}${tag(check)}`,
        );
      }
      return;
    }
    case "expoAppConfig": {
      const configPath = `apps/${check.app}/app.json`;
      const source = requireSource(configPath, check);
      if (source === null) return;
      const config = JSON.parse(source) as {
        readonly expo?: {
          readonly userInterfaceStyle?: string;
          readonly ios?: {
            readonly icon?: {
              readonly light?: string;
              readonly dark?: string;
              readonly tinted?: string;
            };
          };
          readonly android?: {
            readonly adaptiveIcon?: {
              readonly foregroundImage?: string;
              readonly monochromeImage?: string;
            };
          };
        };
      };
      if (config.expo?.userInterfaceStyle !== "automatic") {
        violations.push(`${configPath} must match the device appearance`);
      }
      const iosIcon = config.expo?.ios?.icon;
      if (!iosIcon?.light || !iosIcon.dark || !iosIcon.tinted) {
        violations.push(`${configPath} must declare iOS icon variants`);
      } else {
        for (const iconPath of [iosIcon.light, iosIcon.dark, iosIcon.tinted]) {
          if (!existsSync(join(root, "apps", check.app, iconPath))) {
            violations.push(`apps/${check.app}/${iconPath} is missing`);
          }
        }
      }
      const adaptive = config.expo?.android?.adaptiveIcon;
      if (!adaptive?.foregroundImage || !adaptive.monochromeImage) {
        violations.push(
          `${configPath} must declare adaptive and monochrome Android icons`,
        );
      }
      return;
    }
    case "fontLoader": {
      const source = requireSource(check.loader, check);
      if (source === null) return;
      for (const match of source.matchAll(/\.\/assets\/fonts\/([^"'`)\s]+)/g)) {
        const fontPath = join(
          root,
          "apps",
          check.app,
          "assets/fonts",
          match[1] ?? "",
        );
        if (!existsSync(fontPath)) {
          violations.push(
            `${check.loader} loads ${match[1]}, which is missing`,
          );
        } else if (statSync(fontPath).size < 30_000) {
          violations.push(
            `apps/${check.app}/assets/fonts/${match[1]} is not a full font`,
          );
        }
      }
      for (const family of check.forbidden) {
        if (source.includes(family)) {
          violations.push(`${check.loader} must not load ${family}`);
        }
      }
      return;
    }
    case "noFontPackages": {
      const manifestSource = requireSource(
        `apps/${check.app}/package.json`,
        check,
      );
      if (manifestSource !== null) {
        const manifest = JSON.parse(manifestSource) as {
          readonly dependencies?: Readonly<Record<string, string>>;
        };
        for (const dependency of Object.keys(manifest.dependencies ?? {})) {
          if (
            dependency.startsWith("@fontsource") ||
            dependency.startsWith("@expo-google-fonts")
          ) {
            violations.push(
              `apps/${check.app}/package.json loads a product font through ${dependency}; use the shared font module`,
            );
          }
        }
      }
      const layout = read(`apps/${check.app}/app/layout.tsx`) ?? "";
      for (const match of layout.matchAll(
        /import ["']([^"']*fontsource[^"']*)["']/g,
      )) {
        violations.push(
          `apps/${check.app}/app/layout.tsx must not load fonts through ${match[1]}`,
        );
      }
      return;
    }
    case "imageryLog": {
      const source = requireSource(check.file, check);
      if (source === null) return;
      const directory = join(root, check.file, "..");
      const imageryLog = JSON.parse(source) as {
        readonly assets?: readonly {
          readonly name?: string;
          readonly outputNames?: readonly string[];
        }[];
      };
      for (const asset of imageryLog.assets ?? []) {
        if (!asset.name) {
          violations.push("imagery-log.json contains an unnamed asset");
          continue;
        }
        if (asset.name.startsWith("product-library/")) {
          if (!asset.outputNames?.length) {
            violations.push(
              `${asset.name} must declare its product-library outputs`,
            );
            continue;
          }
          for (const outputName of asset.outputNames) {
            if (!existsSync(join(root, outputName))) {
              violations.push(
                `${outputName} is missing from the product library`,
              );
            }
          }
          continue;
        }
        for (const extension of ["avif", "webp"]) {
          if (!existsSync(join(directory, `${asset.name}.${extension}`))) {
            violations.push(
              `${asset.name}.${extension} is missing from brand media`,
            );
          }
        }
      }
      return;
    }
  }
}

for (const contract of contracts) {
  for (const check of contract.checks) runCheck(check);
}

// ---------------------------------------------------------------------------
// Repository-wide rules (legacy and Tideline code alike).
// ---------------------------------------------------------------------------

/** Product font families: Tideline (Jost, Geist, Geist Mono) and legacy files still shipping. */
const approvedFontFile = /(?:Jost|Geist|Satoshi|Fellix|Archivo)/i;
const forbiddenProductFamily =
  /Fraunces|Figtree|JetBrains(?: Mono)?|Instrument Serif|Awesome Serif/i;
const forbiddenLegacyColors = new Set(["#0b2440", "#3d81b9", "#235a96"]);
const retiredPaletteColors = new Set([
  "#f8f7f3",
  "#101828",
  "#173a67",
  "#235a96",
  "#2367a8",
  "#63e3db",
  "#ff6a3d",
  "#10263d",
  "#86c9ef",
]);
const allowedInternalSandRating = [
  /basis\s*[:=].*["']SandRating["']/,
  /match\.prediction\.basis\s*===\s*["']SandRating["']/,
];

const designSources = [
  ...sourceFiles(join(root, "apps")),
  ...sourceFiles(join(root, "packages")),
];

for (const file of designSources) {
  const fileLabel = relative(root, file);
  if (forbiddenProductFamily.test(fileLabel)) {
    violations.push(`${fileLabel} is a retired or third-family font asset`);
  }
  if (
    /\.(?:woff2?|ttf|otf)$/i.test(fileLabel) &&
    !approvedFontFile.test(fileLabel)
  ) {
    violations.push(
      `${fileLabel} is not an approved Duna font asset (Jost, Geist, Geist Mono; legacy Satoshi/Fellix/Archivo)`,
    );
  }
  if (extname(file) === ".css") {
    const tokenSource = isTokenSource(fileLabel);
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, index) => {
        const at = `${fileLabel}:${index + 1}`;
        if (/font-stretch\s*:/.test(line)) {
          violations.push(`${at} uses font-stretch; use a named weight`);
        }
        if (/Instrument (?:Serif|Sans)/i.test(line)) {
          violations.push(`${at} references a retired Instrument font`);
        }
        if (
          forbiddenProductFamily.test(line) ||
          /font-family\s*:[^;]*(?:,\s*serif\b|:\s*serif\b)/i.test(line)
        ) {
          violations.push(
            `${at} references a third product font family or a serif`,
          );
        }
        if (/data-zone=["']performance["']/.test(line)) {
          violations.push(`${at} uses the retired performance zone`);
        }
        const tracking = line.match(/letter-spacing:\s*(-?\d*\.?\d+)em/);
        if (!tokenSource && tracking?.[1] && Number(tracking[1]) < -0.03) {
          violations.push(`${at} tracks tighter than -0.030em`);
        }
        for (const match of line.matchAll(/#[\da-fA-F]{6}/g)) {
          if (forbiddenLegacyColors.has(match[0].toLowerCase())) {
            violations.push(`${at} uses a forbidden legacy brand color`);
          }
        }
      });
    continue;
  }
  if (![".ts", ".tsx"].includes(extname(file))) continue;
  const source = readFileSync(file, "utf8");
  if (/<Numeric\b[^>]*>\s*[A-Za-z][^<{]*<\/Numeric>/s.test(source)) {
    violations.push(
      `${fileLabel} wraps a literal word in Numeric; numeric treatment is values only`,
    );
  }
  source.split("\n").forEach((line, index) => {
    const at = `${fileLabel}:${index + 1}`;
    if (/data-zone=["'{]*performance/.test(line)) {
      violations.push(
        `${at} uses the retired performance zone; use athletic or live`,
      );
    }
    if (/Instrument (?:Serif|Sans)|@fontsource\/instrument-/i.test(line)) {
      violations.push(`${at} references a retired Instrument font`);
    }
    if (forbiddenProductFamily.test(line)) {
      violations.push(`${at} references a third product font family`);
    }
    if (/fontStretch\s*:/.test(line)) {
      violations.push(`${at} uses fontStretch; use a named font weight`);
    }
    for (const match of line.matchAll(/#[\da-fA-F]{6}/g)) {
      if (forbiddenLegacyColors.has(match[0].toLowerCase())) {
        violations.push(`${at} uses a forbidden legacy brand color`);
      }
    }
    if (/[\u{1F1E6}-\u{1F1FF}]/u.test(line)) {
      violations.push(`${at} renders an emoji flag`);
    }
    if (
      (fileLabel.startsWith("apps/player/") ||
        fileLabel.startsWith("apps/pro/")) &&
      [...line.matchAll(/#[\da-fA-F]{6}/g)].some((match) =>
        retiredPaletteColors.has(match[0].toLowerCase()),
      )
    ) {
      violations.push(`${at} uses a retired pre-Golden Hour color`);
    }
    const appearsUserFacing =
      /["'`][^"'`]*\bSandRatings?\b[^"'`]*["'`]/.test(line) ||
      />[^<]*\bSandRatings?\b/.test(line);
    const allowed =
      /pro-seo\.test\.ts/.test(fileLabel) ||
      allowedInternalSandRating.some((pattern) => pattern.test(line));
    if (fileLabel.startsWith("apps/") && appearsUserFacing && !allowed) {
      violations.push(`${at} must spell user-facing Sand Rating as two words`);
    }
  });
}

// ---------------------------------------------------------------------------
// Tideline guard: migrated code only.
// ---------------------------------------------------------------------------

violations.push(...selfTest());

const migratedPrefixes = contracts.flatMap((contract) => contract.migrated);
const exemptions = contracts.flatMap(
  (contract) => contract.tidelineExemptions ?? [],
);
const guardedExtensions = /\.(?:css|[cm]?[jt]sx?|json)$/;
let guardedFiles = 0;
for (const file of designSources) {
  const fileLabel = relative(root, file);
  if (!guardedExtensions.test(fileLabel)) continue;
  if (
    !migratedPrefixes.some(
      (prefix) => fileLabel === prefix || fileLabel.startsWith(prefix),
    )
  ) {
    continue;
  }
  guardedFiles += 1;
  const skip = new Set<TidelineRule>(
    exemptions
      .filter(
        (exemption) =>
          fileLabel === exemption.path || fileLabel.startsWith(exemption.path),
      )
      .flatMap((exemption) => exemption.rules),
  );
  for (const finding of checkTidelineSource(
    fileLabel,
    readFileSync(file, "utf8"),
    skip,
  )) {
    violations.push(
      `${fileLabel}:${finding.line} ${finding.message} [Tideline guard: ${finding.rule}]`,
    );
  }
}

if (violations.length > 0) {
  console.error("Duna design-system verification failed:\n");
  console.error(violations.join("\n"));
  console.error(
    "\nContract: docs/design/tideline-4.1.1/README.md. Contracts per surface: scripts/design-contracts/. A [legacy: …] failure means the pinned pre-Tideline code changed: if your package migrated that surface, delete the legacy check in the same PR.",
  );
  process.exit(1);
}

const legacyCount = contracts.reduce(
  (count, contract) =>
    count + contract.checks.filter((check) => check.legacy).length,
  0,
);
console.log(
  `Design system verified against the Duna Design System (Tideline 4.1.1) contract: ${contracts.length} surface contracts (${legacyCount} legacy pins awaiting migration), repository-wide accessibility and naming rules, and the Tideline guard on ${guardedFiles} migrated files.`,
);
