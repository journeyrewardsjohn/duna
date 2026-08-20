#!/usr/bin/env python3
"""Generate Duna's original printable blank practice run sheet."""

from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


INK = HexColor("#10233F")
TEAL = HexColor("#11A58C")
MINT = HexColor("#E4F6F1")
PURPLE = HexColor("#7866E6")
PAPER = HexColor("#F7F8FA")
LINE = HexColor("#CFD8E3")
MUTED = HexColor("#65758B")
ZONE = HexColor("#B7C2D1")
WHITE = HexColor("#FFFFFF")


def text(c: canvas.Canvas, value: str, x: float, y: float, size: float, *,
         color: Color = INK, font: str = "Helvetica", tracking: float = 0) -> None:
    c.setFillColor(color)
    c.setFont(font, size)
    if tracking:
        cursor = x
        for char in value:
            c.drawString(cursor, y, char)
            cursor += stringWidth(char, font, size) + tracking
    else:
        c.drawString(x, y, value)


def field(c: canvas.Canvas, label: str, x: float, y: float, width: float) -> None:
    text(c, label.upper(), x, y + 8, 5.8, color=MUTED, font="Helvetica-Bold", tracking=0.8)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(x, y, x + width, y)


def court(c: canvas.Canvas, x: float, y: float, width: float, height: float) -> None:
    c.setFillColor(WHITE)
    c.rect(x, y, width, height, fill=1, stroke=0)
    c.setStrokeColor(INK)
    c.setLineWidth(1.35)
    c.rect(x, y, width, height, fill=0, stroke=1)

    # Regulation attack lines sit 3m from the net on an 18m court.
    c.setLineWidth(0.85)
    c.line(x, y + height / 3, x + width, y + height / 3)
    c.line(x, y + height * 2 / 3, x + width, y + height * 2 / 3)
    c.setLineWidth(2.8)
    c.line(x, y + height / 2, x + width, y + height / 2)

    zone_rows = (
        (5 / 6, ("1", "6", "5")),
        (7 / 12, ("2", "3", "4")),
        (5 / 12, ("4", "3", "2")),
        (1 / 6, ("5", "6", "1")),
    )
    for py, labels in zone_rows:
        for column, label in enumerate(labels):
            cx = x + width * (column * 2 + 1) / 6
            label_width = stringWidth(label, "Helvetica", 8.2)
            text(
                c,
                label,
                cx - label_width / 2,
                y + height * py - 2.8,
                8.2,
                color=ZONE,
            )


def segment_card(c: canvas.Canvas, index: int, x: float, y: float,
                 width: float, height: float) -> None:
    c.setFillColor(WHITE)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(x, y, width, height, 10, fill=1, stroke=1)

    badge_x, badge_y = x + 12, y + height - 30
    c.setFillColor(TEAL if index % 2 else PURPLE)
    c.roundRect(badge_x, badge_y, 27, 18, 5, fill=1, stroke=0)
    text(c, f"{index:02d}", badge_x + 6.5, badge_y + 5.1, 6.8, color=WHITE, font="Helvetica-Bold")
    text(c, "SEGMENT / DRILL", badge_x + 36, badge_y + 5.2, 7.2, font="Helvetica-Bold", tracking=0.28)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(badge_x + 115, badge_y + 5, x + width - 12, badge_y + 5)
    c.line(x + 12, y + height - 42, x + width - 12, y + height - 42)

    court_x, court_y = x + 12, y + 18
    court_w, court_h = 120, height - 73
    court(c, court_x, court_y, court_w, court_h)

    notes_x = court_x + court_w + 12
    notes_w = x + width - notes_x - 12
    field(c, "Focus", notes_x, y + height - 64, notes_w)
    field(c, "Minutes", notes_x, y + height - 93, notes_w * 0.43)
    field(c, "Load 1-10", notes_x + notes_w * 0.53, y + height - 93, notes_w * 0.47)
    text(c, "COACH CUES / ROTATION", notes_x, y + height - 116, 5.3, color=MUTED, font="Helvetica-Bold", tracking=0.35)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.55)
    for offset in (132, 151, 170, 189, 208, 227, 246):
        line_y = y + height - offset
        c.line(notes_x, line_y, notes_x + notes_w, line_y)


def generate(output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    page_width, page_height = letter
    c = canvas.Canvas(str(output), pagesize=letter)
    c.setTitle("Duna Practice Run Sheet")
    c.setAuthor("Duna")
    c.setSubject("Blank practice-planning worksheet for coaches")
    c.setFillColor(PAPER)
    c.rect(0, 0, page_width, page_height, fill=1, stroke=0)

    margin = 38
    text(c, "DUNA", margin, page_height - 48, 9, color=TEAL, font="Helvetica-Bold", tracking=2.2)
    text(c, "PRACTICE", margin, page_height - 79, 25, font="Helvetica-Bold")
    text(c, "RUN SHEET", margin + 142, page_height - 79, 25, color=TEAL, font="Helvetica-Bold")
    text(c, "PLAN THE INTENT. COACH THE RESPONSE.", page_width - 241, page_height - 49, 6.2, color=MUTED, font="Helvetica-Bold", tracking=0.8)
    c.setStrokeColor(INK)
    c.setLineWidth(2.2)
    c.line(margin, page_height - 91, page_width - margin, page_height - 91)

    meta_y = page_height - 120
    field(c, "Team / group", margin, meta_y, 118)
    field(c, "Coach", margin + 132, meta_y, 98)
    field(c, "Date", margin + 244, meta_y, 80)
    field(c, "Start", margin + 338, meta_y, 65)
    field(c, "Planned load", margin + 417, meta_y, page_width - margin - (margin + 417))

    summary_y = page_height - 156
    c.setFillColor(MINT)
    c.roundRect(margin, summary_y, page_width - 2 * margin, 24, 7, fill=1, stroke=0)
    text(c, "PURPOSE", margin + 10, summary_y + 8, 5.8, color=TEAL, font="Helvetica-Bold", tracking=0.8)
    c.setStrokeColor(Color(0.06, 0.45, 0.38, alpha=0.35))
    c.setLineWidth(0.6)
    c.line(margin + 66, summary_y + 8, page_width - margin - 10, summary_y + 8)

    gap = 12
    card_width = (page_width - 2 * margin - gap) / 2
    card_height = 272
    first_y = summary_y - 14 - card_height
    for index in range(1, 5):
        column = (index - 1) % 2
        row = (index - 1) // 2
        card_x = margin + column * (card_width + gap)
        card_y = first_y - row * (card_height + 12)
        segment_card(c, index, card_x, card_y, card_width, card_height)

    footer_y = 25
    c.setStrokeColor(INK)
    c.setLineWidth(1.5)
    c.line(margin, footer_y + 15, page_width - margin, footer_y + 15)
    text(c, "DUNA PRACTICE RUN SHEET", margin, footer_y, 5.8, color=MUTED, font="Helvetica-Bold", tracking=0.7)
    text(c, "TOTAL MINUTES", 240, footer_y, 5.8, color=MUTED, font="Helvetica-Bold", tracking=0.7)
    c.setStrokeColor(LINE)
    c.line(318, footer_y, 365, footer_y)
    text(c, "ACTUAL LOAD", 390, footer_y, 5.8, color=MUTED, font="Helvetica-Bold", tracking=0.7)
    c.line(458, footer_y, 505, footer_y)
    text(c, "01 / 01", page_width - margin - 30, footer_y, 5.8, color=MUTED, font="Helvetica-Bold")

    c.showPage()
    c.save()


if __name__ == "__main__":
    project_root = Path(__file__).resolve().parents[1]
    generate(project_root / "output" / "pdf" / "duna-practice-run-sheet.pdf")
