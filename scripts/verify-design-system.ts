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
  "docs/design/duna-design-system-v3.md",
  "docs/design/duna-implementation-audit.md",
  "docs/design/duna-mobile-design-guide.md",
  "docs/design/duna-theming-light-dark.md",
  "apps/web/app/design-v3.css",
  "apps/web/app/not-found.tsx",
  "apps/hq/app/design-v3.css",
  "apps/web/public/brand/duna-mark.svg",
  "apps/web/public/media/brand/imagery-log.json",
  "apps/web/public/media/brand/duna-home-hero-motion-v1.mp4",
  "apps/web/public/media/brand/duna-home-rally-v3.avif",
  "apps/web/public/media/brand/duna-home-rally-v3.webp",
  "apps/web/public/media/brand/duna-pro-hero-v3.avif",
  "apps/web/public/media/brand/duna-pro-hero-v3.webp",
  "apps/web/public/media/brand/duna-event-venue-hamburg-v1.avif",
  "apps/web/public/media/brand/duna-event-venue-hamburg-v1.webp",
  "apps/player/assets/duna-hero.mp4",
  "apps/player/assets/duna-hero-poster.jpg",
  "apps/player/assets/icon-dark.png",
  "apps/player/assets/icon-tinted.png",
  "apps/player/assets/monochrome-icon.png",
  "apps/pro/assets/icon-light.png",
  "apps/pro/assets/icon-tinted.png",
  "apps/pro/assets/monochrome-icon.png",
  "packages/ui/src/brand.ts",
  "packages/ui/src/brand.test.ts",
];

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) violations.push(`${file} is missing`);
}

const webV3Css = readFileSync(join(root, "apps/web/app/design-v3.css"), "utf8");
const requiredContrastContracts = [
  "--campaign-hero-ink",
  ':root[data-theme="dark"] .pro-tour-hero__veil',
  ".athlete-hero-card--result .duna-badge",
  ".club-marketing-secondary",
  ".event-public__booking > a:not(.secondary)",
  ".not-found-v3",
] as const;
for (const contract of requiredContrastContracts) {
  if (!webV3Css.includes(contract)) {
    violations.push(`apps/web/app/design-v3.css must preserve ${contract}`);
  }
}

const heroMotionPath = join(
  root,
  "apps/web/public/media/brand/duna-home-hero-motion-v1.mp4",
);
if (
  existsSync(heroMotionPath) &&
  statSync(heroMotionPath).size > 6 * 1024 * 1024
) {
  violations.push("The ambient hero motion plate must stay below 6 MiB");
}

for (const app of ["player", "pro"] as const) {
  const configPath = join(root, "apps", app, "app.json");
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
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
    violations.push(`apps/${app}/app.json must match the device appearance`);
  }
  const iosIcon = config.expo?.ios?.icon;
  if (!iosIcon?.light || !iosIcon.dark || !iosIcon.tinted) {
    violations.push(`apps/${app}/app.json must declare iOS icon variants`);
  } else {
    for (const iconPath of [iosIcon.light, iosIcon.dark, iosIcon.tinted]) {
      if (!existsSync(join(root, "apps", app, iconPath))) {
        violations.push(`apps/${app}/${iconPath} is missing`);
      }
    }
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

const forbiddenLegacyColors = new Set(["#0b2440", "#3d81b9", "#235a96"]);

const designSources = [
  ...sourceFiles(join(root, "apps")),
  ...sourceFiles(join(root, "packages")),
];

for (const file of designSources) {
  if (extname(file) === ".css") {
    const fileLabel = relative(root, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      const tracking = line.match(/letter-spacing:\s*(-?\d*\.?\d+)em/);
      if (tracking?.[1] && Number(tracking[1]) < -0.03) {
        violations.push(
          `${fileLabel}:${index + 1} tracks tighter than -0.030em`,
        );
      }
      for (const match of line.matchAll(/#[\da-fA-F]{6}/g)) {
        if (forbiddenLegacyColors.has(match[0].toLowerCase())) {
          violations.push(
            `${fileLabel}:${index + 1} uses a forbidden legacy brand color`,
          );
        }
      }
    });
    continue;
  }
  if (![".ts", ".tsx"].includes(extname(file))) continue;
  const fileLabel = relative(root, file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/data-zone=["'{]*performance/.test(line)) {
      violations.push(
        `${fileLabel}:${index + 1} uses the retired performance zone; use athletic or live`,
      );
    }

    for (const match of line.matchAll(/#[\da-fA-F]{6}/g)) {
      if (forbiddenLegacyColors.has(match[0].toLowerCase())) {
        violations.push(
          `${fileLabel}:${index + 1} uses a forbidden legacy brand color`,
        );
      }
    }

    if (/[\u{1F1E6}-\u{1F1FF}]/u.test(line)) {
      violations.push(`${fileLabel}:${index + 1} renders an emoji flag`);
    }

    if (
      (fileLabel.startsWith("apps/player/") ||
        fileLabel.startsWith("apps/pro/")) &&
      [...line.matchAll(/#[\da-fA-F]{6}/g)].some((match) =>
        retiredPaletteColors.has(match[0].toLowerCase()),
      )
    ) {
      violations.push(
        `${fileLabel}:${index + 1} uses a retired pre-Golden Hour color`,
      );
    }

    const appearsUserFacing =
      /["'`][^"'`]*\bSandRatings?\b[^"'`]*["'`]/.test(line) ||
      />[^<]*\bSandRatings?\b/.test(line);
    const allowed = allowedInternalSandRating.some((pattern) =>
      pattern.test(pattern.source.includes("test") ? fileLabel : line),
    );
    if (fileLabel.startsWith("apps/") && appearsUserFacing && !allowed) {
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
  "Design system verified: v3 references, zoning, typography limits, club/player identity, icon variants, generated imagery, theme contrast, recovery, naming, and country-code policy are intact.",
);
