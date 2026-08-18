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

  const lines = readFileSync(file, "utf8").split("\n");
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
