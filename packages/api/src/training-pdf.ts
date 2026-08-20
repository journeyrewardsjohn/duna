import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import type { TrainingPracticePlan } from "./training-contracts";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 38;
const INK = rgb(16 / 255, 35 / 255, 63 / 255);
const TEAL = rgb(17 / 255, 165 / 255, 140 / 255);
const MINT = rgb(228 / 255, 246 / 255, 241 / 255);
const PURPLE = rgb(120 / 255, 102 / 255, 230 / 255);
const PAPER = rgb(247 / 255, 248 / 255, 250 / 255);
const LINE = rgb(207 / 255, 216 / 255, 227 / 255);
const MUTED = rgb(101 / 255, 117 / 255, 139 / 255);
const ZONE = rgb(183 / 255, 194 / 255, 209 / 255);
const WHITE = rgb(1, 1, 1);

type PrintableBlock = {
  readonly title: string;
  readonly durationMinutes?: number;
  readonly intensity?: number;
  readonly focusArea?: string;
  readonly touchesTypical?: number;
  readonly jumpsTypical?: number;
  readonly instructions?: string;
};

function safe(value: string): string {
  return value
    .replaceAll(/[\u2010-\u2015]/g, "-")
    .replaceAll(/[\u2018\u2019]/g, "'")
    .replaceAll(/[\u201c\u201d]/g, '"')
    .replaceAll(/[^\x20-\x7e]/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maximum: number): string {
  const normalized = safe(value);
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, Math.max(0, maximum - 3)).trim()}...`;
}

function wrapWords(
  value: string,
  maximum: number,
  maximumLines: number,
): readonly string[] {
  const words = safe(value).split(" ").filter(Boolean);
  const result: string[] = [];
  let current = "";
  for (const word of words) {
    const next = `${current} ${word}`.trim();
    if (next.length > maximum && current) {
      result.push(current);
      current = word;
      if (result.length === maximumLines) break;
    } else {
      current = next;
    }
  }
  if (current && result.length < maximumLines) result.push(current);
  if (safe(value).length > result.join(" ").length && result.length) {
    const last = result.length - 1;
    result[last] = truncate(`${result[last]}...`, maximum);
  }
  return result;
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  value: string,
  x: number,
  y: number,
  size: number,
  color: RGB = INK,
): void {
  page.drawText(safe(value), { x, y, size, font, color });
}

function drawField(
  page: PDFPage,
  bold: PDFFont,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
): void {
  drawText(page, bold, label.toUpperCase(), x, y + 9, 5.7, MUTED);
  if (value) drawText(page, bold, truncate(value, 30), x, y - 1, 7.5, INK);
  page.drawLine({
    start: { x, y: y - 4 },
    end: { x: x + width, y: y - 4 },
    thickness: 0.65,
    color: LINE,
  });
}

function drawCourt(
  page: PDFPage,
  regular: PDFFont,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: WHITE,
    borderColor: INK,
    borderWidth: 1.35,
  });
  page.drawLine({
    start: { x, y: y + height / 3 },
    end: { x: x + width, y: y + height / 3 },
    thickness: 0.85,
    color: INK,
  });
  page.drawLine({
    start: { x, y: y + (height * 2) / 3 },
    end: { x: x + width, y: y + (height * 2) / 3 },
    thickness: 0.85,
    color: INK,
  });
  page.drawLine({
    start: { x, y: y + height / 2 },
    end: { x: x + width, y: y + height / 2 },
    thickness: 2.8,
    color: INK,
  });
  const zoneRows = [
    { y: 5 / 6, labels: ["1", "6", "5"] },
    { y: 7 / 12, labels: ["2", "3", "4"] },
    { y: 5 / 12, labels: ["4", "3", "2"] },
    { y: 1 / 6, labels: ["5", "6", "1"] },
  ];
  for (const row of zoneRows) {
    for (const [column, label] of row.labels.entries()) {
      const size = 8.2;
      const centerX = x + (width * (column * 2 + 1)) / 6;
      drawText(
        page,
        regular,
        label,
        centerX - regular.widthOfTextAtSize(label, size) / 2,
        y + height * row.y - 2.8,
        size,
        ZONE,
      );
    }
  }
}

function drawCard(input: {
  readonly page: PDFPage;
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly block: PrintableBlock;
  readonly number: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): void {
  const { page, regular, bold, block, number, x, y, width, height } = input;
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.8,
  });
  page.drawRectangle({
    x: x + 12,
    y: y + height - 30,
    width: 27,
    height: 18,
    color: number % 2 ? TEAL : PURPLE,
  });
  drawText(
    page,
    bold,
    String(number).padStart(2, "0"),
    x + 18.5,
    y + height - 24.8,
    6.8,
    WHITE,
  );
  drawText(
    page,
    bold,
    truncate(block.title || "Segment / drill", 31),
    x + 48,
    y + height - 24.7,
    7.3,
    INK,
  );
  if (!safe(block.title)) {
    page.drawLine({
      start: { x: x + 127, y: y + height - 24.5 },
      end: { x: x + width - 12, y: y + height - 24.5 },
      thickness: 0.7,
      color: LINE,
    });
  }
  page.drawLine({
    start: { x: x + 12, y: y + height - 42 },
    end: { x: x + width - 12, y: y + height - 42 },
    thickness: 0.7,
    color: LINE,
  });

  const courtX = x + 12;
  const courtY = y + 18;
  const courtWidth = 120;
  drawCourt(page, regular, courtX, courtY, courtWidth, height - 73);

  const notesX = courtX + courtWidth + 12;
  const notesWidth = x + width - notesX - 12;
  drawField(
    page,
    bold,
    "Focus",
    block.focusArea ?? "",
    notesX,
    y + height - 64,
    notesWidth,
  );
  drawField(
    page,
    bold,
    "Minutes",
    block.durationMinutes ? String(block.durationMinutes) : "",
    notesX,
    y + height - 93,
    notesWidth * 0.43,
  );
  drawField(
    page,
    bold,
    "Load 1-10",
    block.intensity ? String(block.intensity) : "",
    notesX + notesWidth * 0.53,
    y + height - 93,
    notesWidth * 0.47,
  );
  drawText(
    page,
    bold,
    "COACH CUES / ROTATION",
    notesX,
    y + height - 116,
    5.3,
    MUTED,
  );
  const cueLines = wrapWords(block.instructions ?? "", 31, 7);
  for (let line = 0; line < 7; line += 1) {
    const lineY = y + height - 132 - line * 19;
    if (cueLines[line]) {
      drawText(page, regular, cueLines[line]!, notesX, lineY + 3, 5.8, INK);
    }
    page.drawLine({
      start: { x: notesX, y: lineY },
      end: { x: notesX + notesWidth, y: lineY },
      thickness: 0.55,
      color: LINE,
    });
  }
  if (block.touchesTypical || block.jumpsTypical) {
    drawText(
      page,
      bold,
      `${block.touchesTypical ?? 0} touch opp. / ${block.jumpsTypical ?? 0} jump opp.`,
      notesX,
      y + 9,
      5.2,
      MUTED,
    );
  }
}

function drawDebrief(input: {
  readonly page: PDFPage;
  readonly bold: PDFFont;
  readonly y: number;
  readonly height: number;
}): void {
  const { page, bold, y, height } = input;
  page.drawRectangle({
    x: MARGIN,
    y,
    width: PAGE_WIDTH - 2 * MARGIN,
    height,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.8,
  });
  drawText(page, bold, "AFTER PRACTICE", MARGIN + 14, y + height - 25, 7, TEAL);
  drawText(
    page,
    bold,
    "Record the response, not just the plan.",
    MARGIN + 110,
    y + height - 25,
    8,
    INK,
  );
  drawField(
    page,
    bold,
    "Actual load 0-100",
    "",
    MARGIN + 14,
    y + height - 54,
    112,
  );
  drawField(
    page,
    bold,
    "Coach RPE 1-10",
    "",
    MARGIN + 142,
    y + height - 54,
    96,
  );
  drawField(
    page,
    bold,
    "Athlete responses",
    "",
    MARGIN + 254,
    y + height - 54,
    118,
  );
  drawField(
    page,
    bold,
    "Completed minutes",
    "",
    MARGIN + 388,
    y + height - 54,
    120,
  );
  const sections =
    height > 220
      ? [
          "WHAT CHANGED IN THE SESSION?",
          "WHAT TRANSFERRED UNDER PRESSURE?",
          "WHAT SHOULD THE NEXT PRACTICE PICK UP?",
        ]
      : ["WHAT CHANGED?", "WHAT SHOULD THE NEXT PRACTICE PICK UP?"];
  const sectionTop = y + height - 92;
  const sectionHeight = (height - 105) / sections.length;
  for (const [index, label] of sections.entries()) {
    const top = sectionTop - index * sectionHeight;
    drawText(page, bold, label, MARGIN + 14, top, 5.8, MUTED);
    for (let line = 1; line <= (height > 220 ? 3 : 2); line += 1) {
      const lineY = top - 10 - line * 13;
      page.drawLine({
        start: { x: MARGIN + 14, y: lineY },
        end: { x: PAGE_WIDTH - MARGIN - 14, y: lineY },
        thickness: 0.55,
        color: LINE,
      });
    }
  }
}

function drawCompactDebrief(input: {
  readonly page: PDFPage;
  readonly bold: PDFFont;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): void {
  const { page, bold, x, y, width, height } = input;
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: WHITE,
    borderColor: LINE,
    borderWidth: 0.8,
  });
  drawText(page, bold, "AFTER PRACTICE", x + 14, y + height - 25, 6.2, TEAL);
  drawText(page, bold, "REFLECT & ADAPT", x + 112, y + height - 25, 7.3, INK);
  page.drawLine({
    start: { x: x + 14, y: y + height - 42 },
    end: { x: x + width - 14, y: y + height - 42 },
    thickness: 0.7,
    color: LINE,
  });
  drawField(page, bold, "Actual load 0-100", "", x + 14, y + height - 69, 102);
  drawField(
    page,
    bold,
    "Coach RPE 1-10",
    "",
    x + 132,
    y + height - 69,
    width - 146,
  );

  const sections = [
    { label: "WHAT CHANGED?", top: y + height - 104, lines: 4 },
    {
      label: "WHAT SHOULD THE NEXT PRACTICE PICK UP?",
      top: y + height - 187,
      lines: 4,
    },
  ];
  for (const section of sections) {
    drawText(page, bold, section.label, x + 14, section.top, 5.7, MUTED);
    for (let line = 1; line <= section.lines; line += 1) {
      const lineY = section.top - 4 - line * 15;
      page.drawLine({
        start: { x: x + 14, y: lineY },
        end: { x: x + width - 14, y: lineY },
        thickness: 0.55,
        color: LINE,
      });
    }
  }
}

function drawPageHeader(input: {
  readonly page: PDFPage;
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly title: string;
  readonly purpose: string;
  readonly teamName: string;
  readonly coachName: string;
  readonly dateLabel: string;
  readonly plannedLoad?: number;
  readonly pageNumber: number;
  readonly totalPages: number;
}): void {
  const { page, regular, bold } = input;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
    color: PAPER,
  });
  drawText(page, bold, "DUNA", MARGIN, 746, 9, TEAL);
  drawText(
    page,
    bold,
    truncate(input.title || "PRACTICE RUN SHEET", 42),
    MARGIN,
    708,
    23,
    INK,
  );
  drawText(
    page,
    bold,
    "PLAN THE INTENT. COACH THE RESPONSE.",
    371,
    746,
    5.8,
    MUTED,
  );
  page.drawLine({
    start: { x: MARGIN, y: 695 },
    end: { x: PAGE_WIDTH - MARGIN, y: 695 },
    thickness: 2.2,
    color: INK,
  });
  drawField(page, bold, "Team / group", input.teamName, MARGIN, 666, 118);
  drawField(page, bold, "Coach", input.coachName, 170, 666, 98);
  drawField(page, bold, "Date", input.dateLabel, 282, 666, 80);
  drawField(
    page,
    bold,
    "Planned load",
    input.plannedLoad ? `${input.plannedLoad} / 100` : "",
    376,
    666,
    198,
  );
  page.drawRectangle({
    x: MARGIN,
    y: 626,
    width: PAGE_WIDTH - 2 * MARGIN,
    height: 24,
    color: MINT,
  });
  drawText(page, bold, "PURPOSE", MARGIN + 10, 634, 5.8, TEAL);
  drawText(
    page,
    regular,
    truncate(input.purpose, 108),
    MARGIN + 66,
    634,
    7,
    INK,
  );
  page.drawLine({
    start: { x: MARGIN, y: 40 },
    end: { x: PAGE_WIDTH - MARGIN, y: 40 },
    thickness: 1.5,
    color: INK,
  });
  drawText(page, bold, "DUNA PRACTICE RUN SHEET", MARGIN, 25, 5.6, MUTED);
  drawText(
    page,
    bold,
    `${String(input.pageNumber).padStart(2, "0")} / ${String(input.totalPages).padStart(2, "0")}`,
    PAGE_WIDTH - MARGIN - 31,
    25,
    5.6,
    MUTED,
  );
}

/** Build an original, print-ready Duna run sheet with up to four blocks per page. */
export async function createTrainingPracticePlanPdf(input?: {
  readonly plan?: TrainingPracticePlan;
  readonly organizationName?: string;
  readonly coachName?: string;
  readonly dateLabel?: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(input?.plan?.title ?? "Duna Practice Run Sheet");
  pdf.setAuthor("Duna");
  pdf.setSubject("Practice planning and coach run sheet");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sourceBlocks: readonly PrintableBlock[] = input?.plan?.blocks.length
    ? input.plan.blocks
    : Array.from({ length: 4 }, () => ({ title: "" }));
  const totalPages = Math.max(1, Math.ceil(sourceBlocks.length / 4));
  const cardWidth = (PAGE_WIDTH - 2 * MARGIN - 12) / 2;
  const cardHeight = 271;

  for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageHeader({
      page,
      regular,
      bold,
      title: input?.plan?.title ?? "PRACTICE RUN SHEET",
      purpose: input?.plan?.purpose ?? "",
      teamName: input?.organizationName ?? "",
      coachName: input?.coachName ?? "",
      dateLabel: input?.dateLabel ?? "",
      plannedLoad: input?.plan?.plannedLoad,
      pageNumber: pageIndex + 1,
      totalPages,
    });
    const pageBlocks = sourceBlocks.slice(pageIndex * 4, pageIndex * 4 + 4);
    for (let index = 0; index < pageBlocks.length; index += 1) {
      const column = index % 2;
      const row = Math.floor(index / 2);
      drawCard({
        page,
        regular,
        bold,
        block: pageBlocks[index]!,
        number: pageIndex * 4 + index + 1,
        x: MARGIN + column * (cardWidth + 12),
        y: 341 - row * 283,
        width: cardWidth,
        height: cardHeight,
      });
    }
    if (input?.plan && pageIndex === totalPages - 1) {
      if (pageBlocks.length <= 2) {
        drawDebrief({
          page,
          bold,
          y: 58,
          height: 271,
        });
      } else if (pageBlocks.length === 3) {
        drawCompactDebrief({
          page,
          bold,
          x: MARGIN + cardWidth + 12,
          y: 58,
          width: cardWidth,
          height: cardHeight,
        });
      }
    }
  }
  return pdf.save();
}
