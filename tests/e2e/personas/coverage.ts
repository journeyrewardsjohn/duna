/**
 * Prints the persona journey coverage table for a pull-request description:
 *
 *   pnpm test:personas:coverage            # Markdown table
 *   pnpm test:personas:coverage --gaps     # also list steps with no package
 *   pnpm test:personas:coverage --owner H10  # the fixme steps a package owns
 *
 * "Passing" counts implemented steps: CI runs every one of them, so on a green
 * build each is passing. "fixme" steps wait for the package in their title.
 */
import { coverage, GAP, readAllJourneyTests } from "./support/journey-index";
import { personas } from "./support/personas";

const args = process.argv.slice(2);
const tests = readAllJourneyTests();
const rows = coverage(tests);

const personaLabel = (file: string) =>
  Object.values(personas).find((persona) => file.startsWith(persona.id))
    ?.label ?? file;

const lines = [
  "| Persona | Passing on main | fixme (planned) | of which gaps | Total |",
  "| ------- | --------------- | --------------- | ------------- | ----- |",
  ...rows.map(
    (row) =>
      `| ${personaLabel(row.file)} | ${row.implemented} | ${row.fixme} | ${row.gaps} | ${row.total} |`,
  ),
];
const sum = (key: "implemented" | "fixme" | "gaps" | "total") =>
  rows.reduce((total, row) => total + row[key], 0);
lines.push(
  `| **All** | **${sum("implemented")}** | **${sum("fixme")}** | **${sum("gaps")}** | **${sum("total")}** |`,
);
console.log(lines.join("\n"));

if (args.includes("--gaps")) {
  console.log("\nSteps with no work package (GAP):");
  for (const test of tests.filter((entry) => entry.owners.includes(GAP))) {
    console.log(`- ${test.title.replace(/\s*\[GAP\]$/, "")} (${test.file})`);
  }
}

const ownerIndex = args.indexOf("--owner");
const owner = ownerIndex >= 0 ? args[ownerIndex + 1] : undefined;
if (owner) {
  console.log(`\nfixme steps owned by ${owner}:`);
  for (const test of tests.filter(
    (entry) => entry.fixme && entry.owners.includes(owner),
  )) {
    console.log(`- ${test.title} (${test.file}:${test.line})`);
  }
}
