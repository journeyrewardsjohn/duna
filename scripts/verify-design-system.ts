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
  "docs/design/duna-font-usage-guide.md",
  "docs/design/duna-design-system.md",
  "docs/design/duna-design-system-v3.md",
  "docs/design/duna-implementation-audit.md",
  "docs/design/duna-mobile-design-guide.md",
  "docs/design/duna-theming-light-dark.md",
  "docs/licenses/Archivo-OFL-1.1.txt",
  "apps/web/app/design-v3.css",
  "apps/web/app/homepage.module.css",
  "apps/web/app/not-found.tsx",
  "apps/web/components/home-sand-world.tsx",
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

const archivoInstanceFiles = [
  "Archivo-Score.ttf",
  "Archivo-Monument.ttf",
  "Archivo-Hero.ttf",
  "Archivo-Block.ttf",
  "Archivo-Table.ttf",
  "Archivo-Chip.ttf",
  "Archivo-Wordmark.ttf",
] as const;

for (const app of ["player", "pro"] as const) {
  for (const fontFile of archivoInstanceFiles) {
    requiredFiles.push(`apps/${app}/assets/fonts/${fontFile}`);
  }
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) violations.push(`${file} is missing`);
}

const homepageSource = readFileSync(
  join(root, "apps/web/app/page.tsx"),
  "utf8",
);
const homepageSandSource = readFileSync(
  join(root, "apps/web/components/home-sand-world.tsx"),
  "utf8",
);
for (const contract of [
  "HomeSandWorld",
  "data-sand-world",
  'data-zone="live"',
] as const) {
  if (!homepageSource.includes(contract)) {
    violations.push(`apps/web/app/page.tsx must preserve ${contract}`);
  }
}
for (const contract of [
  "prefers-reduced-motion: reduce",
  "connection?.saveData",
  "softwareRenderer",
  'canvas.dataset.renderer = "fallback"',
  "IntersectionObserver",
] as const) {
  if (!homepageSandSource.includes(contract)) {
    violations.push(
      `apps/web/components/home-sand-world.tsx must preserve ${contract}`,
    );
  }
}

const agentsContract = readFileSync(join(root, "AGENTS.md"), "utf8");
const designIndex = readFileSync(join(root, "docs/design/README.md"), "utf8");
const fontGuide = readFileSync(
  join(root, "docs/design/duna-font-usage-guide.md"),
  "utf8",
);
for (const [file, content] of [
  ["AGENTS.md", agentsContract],
  ["docs/design/README.md", designIndex],
] as const) {
  if (!content.includes("duna-font-usage-guide.md")) {
    violations.push(`${file} must reference the authoritative font guide`);
  }
}
if (!fontGuide.includes("Duna ships exactly two brand typefaces")) {
  violations.push(
    "docs/design/duna-font-usage-guide.md must preserve the two-family rule",
  );
}
if (/Fraunces|Figtree|JetBrains Mono/i.test(fontGuide)) {
  violations.push(
    "docs/design/duna-font-usage-guide.md must not restore a third product family",
  );
}

const sharedTypographyCss = readFileSync(
  join(root, "packages/ui/src/styles.css"),
  "utf8",
);
for (const contract of [
  '--font-display: "Fellix", sans-serif',
  '--font-body: "Fellix", sans-serif',
  "--font-heading: var(--font-display)",
  "--font-ui: var(--font-body)",
  "--font-sans: var(--font-body)",
  '--font-data: "Archivo Variable", "Archivo", "Fellix", sans-serif',
] as const) {
  if (!sharedTypographyCss.includes(contract)) {
    violations.push(
      `packages/ui/src/styles.css must preserve the two-family contract ${contract}`,
    );
  }
}
const typographyTokens = readFileSync(
  join(root, "packages/ui/src/tokens.ts"),
  "utf8",
);
for (const contract of [
  'display: "Fellix"',
  'body: "Fellix"',
  'data: "Archivo"',
  'mono: "Archivo"',
] as const) {
  if (!typographyTokens.includes(contract)) {
    violations.push(
      `packages/ui/src/tokens.ts must preserve the two-family contract ${contract}`,
    );
  }
}
for (const app of ["web", "hq"] as const) {
  const manifestPath = join(root, "apps", app, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    readonly dependencies?: Readonly<Record<string, string>>;
  };
  for (const dependency of Object.keys(manifest.dependencies ?? {})) {
    if (
      (dependency.startsWith("@fontsource") ||
        dependency.startsWith("@expo-google-fonts")) &&
      dependency !== "@fontsource-variable/archivo"
    ) {
      violations.push(
        `apps/${app}/package.json loads a third product family through ${dependency}`,
      );
    }
  }
  const layoutSource = readFileSync(
    join(root, "apps", app, "app/layout.tsx"),
    "utf8",
  );
  for (const match of layoutSource.matchAll(
    /import ["']([^"']*fontsource[^"']*)["']/g,
  )) {
    if (match[1] !== "@fontsource-variable/archivo") {
      violations.push(
        `apps/${app}/app/layout.tsx loads a third product family through ${match[1]}`,
      );
    }
  }
}
for (const contract of ["--signal-text: #52630f", "--signal-text: #c9e265"]) {
  if (!sharedTypographyCss.includes(contract)) {
    violations.push(
      `packages/ui/src/styles.css must preserve the accessible signal ink ${contract}`,
    );
  }
}
const numericTierContracts = [
  [".duna-numeric--score", '"wdth" 64', '"wght" 900'],
  [".duna-numeric--monument", '"wdth" 122', '"wght" 900'],
  [".duna-numeric--hero", '"wdth" 108', '"wght" 800'],
  [".duna-numeric--block", '"wdth" 94', '"wght" 800'],
  [".duna-numeric--table", '"wdth" 78', '"wght" 700'],
  [".duna-numeric--chip", '"wdth" 78', '"wght" 700'],
] as const;
for (const [selector, width, weight] of numericTierContracts) {
  const selectorStart = sharedTypographyCss.indexOf(selector);
  const ruleEnd = sharedTypographyCss.indexOf("}", selectorStart);
  const rule = sharedTypographyCss.slice(selectorStart, ruleEnd);
  if (selectorStart < 0 || !rule.includes(width) || !rule.includes(weight)) {
    violations.push(
      `packages/ui/src/styles.css must preserve ${selector} at ${width} / ${weight}`,
    );
  }
}
const numericTierSizes = [
  ["score", "clamp(4.5rem, 8vw, 8.75rem)"],
  ["monument", "clamp(7.5rem, 12vw, 12.5rem)"],
  ["hero", "clamp(2.5rem, 4vw, 3.5rem)"],
  ["block", "clamp(2rem, 3vw, 2.875rem)"],
  ["table", "clamp(0.8125rem, 1.25vw, 1.1875rem)"],
  ["chip", "clamp(0.75rem, 1vw, 0.8125rem)"],
] as const;
for (const [tier, size] of numericTierSizes) {
  if (!sharedTypographyCss.includes(size)) {
    violations.push(
      `packages/ui/src/styles.css must preserve the ${tier} tier size ${size}`,
    );
  }
}

const uiWebSource = readFileSync(join(root, "packages/ui/src/web.tsx"), "utf8");
for (const tier of ["score", "monument", "hero", "block", "table", "chip"]) {
  if (!uiWebSource.includes(`"${tier}"`)) {
    violations.push(
      `packages/ui/src/web.tsx must expose the ${tier} numeric tier`,
    );
  }
}

const webV3Css = readFileSync(join(root, "apps/web/app/design-v3.css"), "utf8");
const hqV3Css = readFileSync(join(root, "apps/hq/app/design-v3.css"), "utf8");
const webGlobalCss = readFileSync(
  join(root, "apps/web/app/globals.css"),
  "utf8",
);
for (const [file, source] of [
  ["apps/web/app/design-v3.css", webV3Css],
  ["apps/hq/app/design-v3.css", hqV3Css],
] as const) {
  const selector = ".duna-numeric[data-numeric-tier].duna-numeric--monument";
  const selectorStart = source.indexOf(selector);
  const ruleEnd = source.indexOf("}", selectorStart);
  const rule = source.slice(selectorStart, ruleEnd);
  if (
    selectorStart < 0 ||
    !rule.includes('font-feature-settings: "pnum" 1') ||
    !rule.includes("font-variant-numeric: proportional-nums")
  ) {
    violations.push(
      `${file} must override the tabular base with proportional Monument spacing`,
    );
  }
}
const liveMatchScoreboardSource = readFileSync(
  join(root, "apps/web/components/pro-live-match-scoreboard.tsx"),
  "utf8",
);
const requiredContrastContracts = [
  "--campaign-hero-ink",
  ':root[data-theme="dark"] .pro-tour-hero__veil',
  ".athlete-hero-card--result .duna-badge",
  ".athlete-stage > .athlete-stat-deck article > small",
  ".duna-numeric:not(.match-history-card__sets)",
  ".club-marketing-secondary",
  ".event-public__booking > a:not(.secondary)",
  ".not-found-v3",
] as const;
for (const contract of requiredContrastContracts) {
  if (!webV3Css.includes(contract)) {
    violations.push(`apps/web/app/design-v3.css must preserve ${contract}`);
  }
}
if (
  !webV3Css.includes(
    ".athlete-hero-card--result .duna-badge {\n  color: var(--text-2);",
  )
) {
  violations.push(
    "apps/web/app/design-v3.css must preserve readable result badges in light mode",
  );
}
if (
  !webGlobalCss.includes(
    ".pro-live-scoreboard__team--winner .pro-live-scoreboard__match-points {\n  background: color-mix(in srgb, var(--gain) 14%, var(--surface-2));\n  color: var(--text-1);",
  )
) {
  violations.push(
    "apps/web/app/globals.css must preserve accessible winner-score ink and emphasis in light mode",
  );
}
for (const [selector, size] of [
  [
    ".pro-live-stats__metric > .duna-numeric--block",
    "font-size: clamp(2rem, 2vw, 2.25rem)",
  ],
  [
    ".pro-live-stats__player dd .duna-numeric--block",
    "font-size: clamp(2rem, 1.8vw, 2.125rem)",
  ],
] as const) {
  const selectorStart = webV3Css.indexOf(selector);
  const ruleEnd = webV3Css.indexOf("}", selectorStart);
  const rule = webV3Css.slice(selectorStart, ruleEnd);
  if (selectorStart < 0 || !rule.includes(size)) {
    violations.push(
      `apps/web/app/design-v3.css must preserve ${selector} within the compact Block tier`,
    );
  }
}
for (const contract of [
  '<Numeric tier="block">{stat.total}</Numeric>',
  '<Numeric tier="block">{stat.a}</Numeric>',
  '<Numeric tier="block">{stat.b}</Numeric>',
] as const) {
  if (!liveMatchScoreboardSource.includes(contract)) {
    violations.push(
      `apps/web/components/pro-live-match-scoreboard.tsx must preserve ${contract} for compact Block statistics`,
    );
  }
}
for (const [contract, message] of [
  [
    "font-size: clamp(2rem, 3vw, 2.875rem);",
    "homepage proof numerals must remain within the Block tier",
  ],
  [
    ".campaign-operator__metric--hero strong .duna-numeric {",
    "operator hero values must preserve an explicit Archivo tier",
  ],
  [
    ".rating-orbit--compact .rating-orbit__content > .duna-numeric {",
    "compact rating orbits must preserve an explicit Block tier",
  ],
] as const) {
  if (!webGlobalCss.includes(contract)) {
    violations.push(`apps/web/app/globals.css ${message}`);
  }
}
for (const selector of [
  ".rankings-v2__list-header > span",
  ".rankings-list-header > span",
] as const) {
  const selectorStart = webGlobalCss.indexOf(selector);
  const ruleEnd = webGlobalCss.indexOf("}", selectorStart);
  const rule = webGlobalCss.slice(selectorStart, ruleEnd);
  if (selectorStart < 0 || !rule.includes("font-size: 0.8125rem")) {
    violations.push(
      `apps/web/app/globals.css must keep ${selector} at the 13px Table minimum`,
    );
  }
}

const regressionContracts = [
  {
    file: "apps/web/components/pro-match-detail.tsx",
    includes: "match.liveScore?.status ?? match.status",
    message: "must derive its live state from the live score feed",
  },
  {
    file: "apps/web/components/pro-live-match-scoreboard.tsx",
    includes: 'tier="score"',
    message: "must preserve the live Score numeral tier",
  },
  {
    file: "apps/web/components/pro-player-discovery.tsx",
    includes: 'tier="monument"',
    message: "must preserve monumental player ranks",
  },
  {
    file: "apps/web/app/rankings/page.tsx",
    includes: '<Numeric tier="monument">#{row.rank}</Numeric>',
    message: "must preserve monumental podium ranks",
  },
  {
    file: "apps/web/app/players/[handle]/page.tsx",
    includes: 'className="athlete-hero__rank-mark"',
    message: "must preserve the rank-led player identity",
  },
  {
    file: "apps/web/components/rating-orbit.tsx",
    includes: 'tier={compact ? "block" : "hero"}',
    message: "must preserve Block and Hero rating numerals by orbit size",
  },
] as const;
for (const contract of regressionContracts) {
  const source = readFileSync(join(root, contract.file), "utf8");
  if (!source.includes(contract.includes)) {
    violations.push(`${contract.file} ${contract.message}`);
  }
}

const proEventSource = readFileSync(
  join(root, "apps/web/components/pro-event-detail.tsx"),
  "utf8",
);
if (proEventSource.includes("pro-event-venue-plate")) {
  violations.push(
    "apps/web/components/pro-event-detail.tsx must not restore the decorative full-page venue plate",
  );
}
if (
  existsSync(join(root, "apps/web/app/qa-font-system/page.tsx")) ||
  existsSync(join(root, "apps/web/app/qa-font-system/directory/page.tsx"))
) {
  violations.push("Temporary font-system browser fixtures must not ship");
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

  const fontLoaderPath = join(root, "apps", app, "fellix-text.tsx");
  const fontLoader = readFileSync(fontLoaderPath, "utf8");
  for (const fontFile of archivoInstanceFiles) {
    if (!fontLoader.includes(`./assets/fonts/${fontFile}`)) {
      violations.push(
        `apps/${app}/fellix-text.tsx must load the local ${fontFile} instance`,
      );
    }
    const instancePath = join(root, "apps", app, "assets/fonts", fontFile);
    if (existsSync(instancePath) && statSync(instancePath).size < 30_000) {
      violations.push(
        `apps/${app}/assets/fonts/${fontFile} is not a full font`,
      );
    }
  }
  for (const forbiddenFont of [
    "@expo-google-fonts/archivo",
    "Fraunces",
    "Instrument Serif",
    "Figtree",
  ]) {
    if (fontLoader.includes(forbiddenFont)) {
      violations.push(
        `apps/${app}/fellix-text.tsx must not load ${forbiddenFont}`,
      );
    }
  }

  const packageManifest = readFileSync(
    join(root, "apps", app, "package.json"),
    "utf8",
  );
  if (packageManifest.includes("@expo-google-fonts/archivo")) {
    violations.push(
      `apps/${app}/package.json must use the six bundled Archivo instances`,
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

const forbiddenProductFamily =
  /Fraunces|Figtree|JetBrains(?: Mono)?|Instrument Serif|Awesome Serif/i;

for (const file of designSources) {
  const fileLabel = relative(root, file);
  if (forbiddenProductFamily.test(fileLabel)) {
    violations.push(`${fileLabel} is a retired or third-family font asset`);
  }
  if (
    /\.(?:woff2?|ttf|otf)$/i.test(fileLabel) &&
    !/(?:Fellix|Archivo)/i.test(fileLabel)
  ) {
    violations.push(`${fileLabel} is not an approved Fellix or Archivo asset`);
  }
  if (extname(file) === ".css") {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (/font-stretch\s*:/.test(line)) {
        violations.push(
          `${fileLabel}:${index + 1} uses font-stretch; use font-variation-settings`,
        );
      }
      if (/Instrument (?:Serif|Sans)/i.test(line)) {
        violations.push(
          `${fileLabel}:${index + 1} references a retired Instrument font`,
        );
      }
      if (
        forbiddenProductFamily.test(line) ||
        /font-family\s*:[^;]*(?:,\s*serif\b|:\s*serif\b)/i.test(line)
      ) {
        violations.push(
          `${fileLabel}:${index + 1} references a third product font family`,
        );
      }
      if (/data-zone=["']performance["']/.test(line)) {
        violations.push(
          `${fileLabel}:${index + 1} uses the retired performance zone`,
        );
      }
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
  const source = readFileSync(file, "utf8");
  if (/<Numeric\b[^>]*>\s*[A-Za-z][^<{]*<\/Numeric>/s.test(source)) {
    violations.push(
      `${fileLabel} wraps a literal word in Numeric; Archivo is numerals only`,
    );
  }
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    if (/data-zone=["'{]*performance/.test(line)) {
      violations.push(
        `${fileLabel}:${index + 1} uses the retired performance zone; use athletic or live`,
      );
    }

    if (/Instrument (?:Serif|Sans)|@fontsource\/instrument-/i.test(line)) {
      violations.push(
        `${fileLabel}:${index + 1} references a retired Instrument font`,
      );
    }

    if (forbiddenProductFamily.test(line)) {
      violations.push(
        `${fileLabel}:${index + 1} references a third product font family`,
      );
    }

    if (/fontStretch\s*:/.test(line)) {
      violations.push(
        `${fileLabel}:${index + 1} uses fontStretch; use a named Archivo tier`,
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
  "Design system verified: Fellix and Archivo are the only Duna families, six precise Archivo tiers, local app instances, semantic zoning, contrast, identity, icons, imagery, recovery, naming, and country-code policy are intact.",
);
