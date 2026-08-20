import { demoOrganization } from "@duna/core/demo";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { createTrainingPracticePlanPdf } from "./training-pdf";
import { loadDemoTrainingWorkspace } from "./training-service";

describe("training practice PDF", () => {
  it("creates a one-page blank Duna run sheet", async () => {
    const bytes = await createTrainingPracticePlanPdf();
    const document = await PDFDocument.load(bytes);
    expect(bytes.byteLength).toBeGreaterThan(4_000);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe("Duna Practice Run Sheet");
  });

  it("renders a saved practice plan without mutating its blocks", async () => {
    const workspace = loadDemoTrainingWorkspace(
      demoOrganization.id,
      new Date("2026-08-19T14:00:00.000Z"),
    );
    const plan = workspace.practicePlans[0]!;
    const blocksBefore = structuredClone(plan.blocks);
    const bytes = await createTrainingPracticePlanPdf({
      plan,
      organizationName: demoOrganization.name,
      coachName: "Coach Jordan",
      dateLabel: "Aug 19, 2026",
    });
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(Math.ceil(plan.blocks.length / 4));
    expect(document.getTitle()).toBe(plan.title);
    expect(plan.blocks).toEqual(blocksBefore);
  });
});
