import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const violations: string[] = [];
const ignoredDirectories = new Set([
  ".expo",
  ".next",
  ".turbo",
  "build",
  "dist",
  "node_modules",
]);

const requiredFiles = [
  "AGENTS.md",
  "docs/design/duna-design-system.md",
  "docs/design/duna-mobile-design-guide.md",
  "docs/design/duna-theming-light-dark.md",
  "apps/web/public/brand/duna-mark.svg",
  "apps/web/public/media/brand/imagery-log.json",
  "apps/player/assets/icon-dark.png",
  "apps/player/assets/icon-tinted.png",
  "apps/player/assets/monochrome-icon.png",
  "apps/pro/assets/icon-light.png",
  "apps/pro/assets/icon-tinted.png",
  "apps/pro/assets/monochrome-icon.png",
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) violations.push(`${file} is missing`);
}

for (const app of ["player", "pro"] as const) {
  const configPath = join(root, "apps", app, "app.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    readonly expo?: {
      readonly userInterfaceStyle?: string;
      readonly ios?: { readonly icon?: unknown };
      readonly android?: {
        readonly adaptiveIcon?: {
          readonly foregroundImage?: string;
          readonly monochromeImage?: string;
        };
      };
    };
  };
  if (config.expo?.userInterfaceStyle !== "automatic") {
    violations.push(`apps/${app}/app.json must match the device appearance`);
  }
  if (typeof config.expo?.ios?.icon !== "object") {
    violations.push(`apps/${app}/app.json must declare iOS icon variants`);
  }
  if (
    !config.expo?.android?.adaptiveIcon?.foregroundImage ||
    !config.expo.android.adaptiveIcon.monochromeImage
  ) {
    violations.push(
      `apps/${app}/app.json must declare adaptive and monochrome Android icons`,
    );
  }
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((entry) => {
    if (ignoredDirectories.has(entry)) return [];
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

const allowedInternalSandRating = [
  /basis\s*[:=].*["']SandRating["']/,
  /match\.prediction\.basis\s*===\s*["']SandRating["']/,
  /pro-seo\.test\.ts/,
];

for (const file of sourceFiles(join(root, "apps"))) {
  if (![".ts", ".tsx"].includes(extname(file))) continue;
  const fileLabel = relative(root, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/[\u{1F1E6}-\u{1F1FF}]/u.test(line)) {
      violations.push(`${fileLabel}:${index + 1} renders an emoji flag`);
    }

    const appearsUserFacing =
      /["'`][^"'`]*\bSandRatings?\b[^"'`]*["'`]/.test(line) ||
      />[^<]*\bSandRatings?\b/.test(line);
    const allowed = allowedInternalSandRating.some((pattern) =>
      pattern.test(pattern.source.includes("test") ? fileLabel : line),
    );
    if (appearsUserFacing && !allowed) {
      violations.push(
        `${fileLabel}:${index + 1} must spell user-facing Sand Rating as two words`,
      );
    }
  });
}

const imageryDirectory = join(root, "apps/web/public/media/brand");
const imageryLog = JSON.parse(
  readFileSync(join(imageryDirectory, "imagery-log.json"), "utf8"),
) as { readonly assets?: readonly { readonly name?: string }[] };
for (const asset of imageryLog.assets ?? []) {
  if (!asset.name) {
    violations.push("imagery-log.json contains an unnamed asset");
    continue;
  }
  for (const extension of ["avif", "webp"]) {
    if (!existsSync(join(imageryDirectory, `${asset.name}.${extension}`))) {
      violations.push(`${asset.name}.${extension} is missing from brand media`);
    }
  }
}

if (violations.length > 0) {
  console.error("Duna design-system verification failed:\n");
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log(
  "Design system verified: references, icon variants, generated imagery, theme behavior, naming, and country-code policy are intact.",
);
