import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function lines(value: string, maxCharacters = 92): readonly string[] {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((paragraph) => {
      if (!paragraph.trim()) return [""];
      const words = paragraph.trim().split(/\s+/);
      const wrapped: string[] = [];
      let line = "";
      for (const word of words) {
        if (`${line} ${word}`.trim().length > maxCharacters && line) {
          wrapped.push(line);
          line = word;
        } else {
          line = `${line} ${word}`.trim();
        }
      }
      if (line) wrapped.push(line);
      return wrapped;
    });
}

/** A compact, durable receipt of the exact text and evidence retained in Duna. */
export async function createWaiverReceiptPdf(input: {
  readonly organizationName: string;
  readonly title: string;
  readonly version: number;
  readonly markdown: string;
  readonly contentHash: string;
  readonly subjectName: string;
  readonly signerName: string;
  readonly signerRole: string;
  readonly relationship?: string;
  readonly occurredAt: Date;
  readonly expiresAt: Date;
  readonly acknowledgedSections: readonly string[];
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [612, 792];
  let page = pdf.addPage(pageSize);
  let y = 748;
  const write = (
    value: string,
    options?: { readonly bold?: boolean; readonly size?: number },
  ) => {
    const size = options?.size ?? 9;
    const font = options?.bold ? bold : regular;
    for (const line of lines(value, size >= 14 ? 62 : 96)) {
      if (y < 48) {
        page = pdf.addPage(pageSize);
        y = 748;
      }
      page.drawText(line, {
        x: 42,
        y,
        size,
        font,
        color: rgb(0.09, 0.12, 0.16),
      });
      y -= size + 4;
    }
  };
  write(`${input.organizationName} — Waiver execution receipt`, {
    bold: true,
    size: 16,
  });
  y -= 6;
  write(`Document: ${input.title} · Version ${input.version}`, { bold: true });
  write(
    `Signer: ${input.signerName} (${input.signerRole}${input.relationship ? `; ${input.relationship}` : ""})`,
  );
  write(`Covered participant: ${input.subjectName}`);
  write(
    `Agreed: ${input.occurredAt.toISOString()} · Valid until: ${input.expiresAt.toISOString()}`,
  );
  write(`Document hash: ${input.contentHash}`);
  write(
    `Acknowledged sections: ${input.acknowledgedSections.length ? input.acknowledgedSections.join(", ") : "None selected"}`,
  );
  y -= 10;
  write("Exact waiver text shown at signing", { bold: true, size: 12 });
  write(input.markdown.replace(/[#*_>`]/g, ""));
  return pdf.save();
}
