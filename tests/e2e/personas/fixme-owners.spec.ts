import { expect, test } from "@playwright/test";
import {
  GAP,
  personaSpecFiles,
  readAllJourneyTests,
  readPlanPackageIds,
} from "./support/journey-index";

/**
 * Keeps the journey specs honest: every `test.fixme` names the work package
 * that will make it pass (or `GAP` when no package delivers it yet), and
 * every id it names exists in docs/plan/web-hq-backend.md or
 * docs/plan/mobile.md. A later package removes its `fixme`; it never renames
 * one to an id the plans do not have.
 */
test.describe("persona journey owners", () => {
  const planIds = readPlanPackageIds();
  const tests = readAllJourneyTests();

  test("the plans list the work packages", () => {
    for (const id of ["R4", "S2", "H10", "B2", "P5", "M-P3a", "M-R2", "M-K1"]) {
      expect(planIds, `plan id ${id}`).toContain(id);
    }
  });

  test("every persona has a spec with journeys", () => {
    for (const file of personaSpecFiles) {
      expect(
        tests.filter((journey) => journey.file === file).length,
        `${file} has no journeys`,
      ).toBeGreaterThan(0);
    }
  });

  test("every fixme names its owning work package, and only real ones", () => {
    const problems: string[] = [];
    for (const journey of tests.filter((entry) => entry.fixme)) {
      const where = `${journey.file}:${journey.line} "${journey.title}"`;
      if (journey.owners.length === 0) {
        problems.push(
          `${where} names no work package: end the title with [ID] or [${GAP}]`,
        );
      }
      for (const owner of journey.owners) {
        if (owner !== GAP && !planIds.has(owner)) {
          problems.push(`${where} names "${owner}", which is not in the plans`);
        }
      }
      if (journey.owners.includes(GAP) && journey.owners.length > 1) {
        problems.push(`${where} is a gap and names a package: pick one`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("journey titles are unique and start with their persona code", () => {
    const codes: Record<string, string> = {
      "club-owner.spec.ts": "CO",
      "coach.spec.ts": "CH",
      "parent.spec.ts": "PA",
      "player.spec.ts": "PL",
      "facility-owner.spec.ts": "FO",
      "visitor.spec.ts": "VI",
    };
    const seen = new Set<string>();
    const problems: string[] = [];
    for (const journey of tests) {
      const step = journey.title.match(/^([A-Z]{2})-\d+\.\d+ /)?.[1];
      if (step !== codes[journey.file]) {
        problems.push(
          `${journey.file}:${journey.line} "${journey.title}" must start with ${codes[journey.file]}-<journey>.<step>`,
        );
      }
      const id = journey.title.split(" ")[0] ?? "";
      if (seen.has(id)) problems.push(`${id} is used twice`);
      seen.add(id);
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
});
