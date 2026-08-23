import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const repositoryRoot = process.cwd();
const sourceRoots = ["apps", "packages"];
const ignoredDirectories = new Set([
  ".expo",
  ".next",
  ".turbo",
  "build",
  "dist",
  "node_modules",
]);
const violations: string[] = [];
const minimumFontSizePx = 12;
const minimumFontSizeRem = 0.75;

function nativeTextImports(source: string) {
  return [
    ...source.matchAll(
      /import\s*\{([\s\S]*?)\}\s*from\s*["']react-native["']/g,
    ),
  ]
    .flatMap((match) => match[1].split(","))
    .map(
      (binding) =>
        binding
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0],
    )
    .filter((binding) => binding === "Text" || binding === "TextInput");
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory).flatMap((entry) => {
    if (ignoredDirectories.has(entry)) return [];
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return [path];
  });
}

function belowMinimum(value: string, unit: string) {
  const numericValue = Number.parseFloat(value);
  return unit === "rem"
    ? numericValue < minimumFontSizeRem
    : numericValue < minimumFontSizePx;
}

for (const file of sourceRoots.flatMap((root) => sourceFiles(root))) {
  const extension = extname(file);
  if (![".css", ".ts", ".tsx"].includes(extension)) continue;

  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  if (
    extension === ".tsx" &&
    ["player", "pro"].some((app) => file.includes(join("apps", app))) &&
    !file.endsWith("satoshi-text.tsx")
  ) {
    const nativeBindings = nativeTextImports(source);
    if (nativeBindings.length > 0) {
      violations.push(
        `${relative(repositoryRoot, file)} imports native ${nativeBindings.join(", ")} instead of the Satoshi translation layer`,
      );
    }
  }
  lines.forEach((line, index) => {
    if (extension === ".css") {
      for (const declaration of line.matchAll(
        /(?:font-size\s*:|font\s*:)([^;]+)/g,
      )) {
        const values = [
          ...declaration[1].matchAll(/([0-9]*\.?[0-9]+)(rem|px)/g),
        ];
        const maxHasReadableFloor =
          declaration[1].includes("max(") &&
          values.some((match) => !belowMinimum(match[1], match[2]));

        for (const match of values) {
          if (!maxHasReadableFloor && belowMinimum(match[1], match[2])) {
            violations.push(
              `${relative(repositoryRoot, file)}:${index + 1} uses ${match[1]}${match[2]}`,
            );
          }
        }
      }
    } else {
      for (const match of line.matchAll(/fontSize\s*:\s*([0-9]*\.?[0-9]+)/g)) {
        if (Number.parseFloat(match[1]) < minimumFontSizePx) {
          violations.push(
            `${relative(repositoryRoot, file)}:${index + 1} uses ${match[1]}px`,
          );
        }
      }
    }
  });
}

if (violations.length > 0) {
  console.error("Typography below Duna's 12px readability floor:\n");
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Readable typography verified: no product font is below 12px.");
