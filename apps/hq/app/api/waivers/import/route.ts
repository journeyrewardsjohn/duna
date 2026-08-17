import { PDFParse } from "pdf-parse";
import { extractRawText } from "mammoth";

export const runtime = "nodejs";
export const maxDuration = 60;

type ProposedSection = {
  readonly title: string;
  readonly anchor: string;
  readonly acknowledgementRecommended: boolean;
};

function cleanText(value: string) {
  return value
    .replaceAll(String.fromCharCode(0), "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.(pdf|docx|md|markdown|txt)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fallbackSections(text: string): readonly ProposedSection[] {
  const patterns = [
    ["Assumption of risk", /assumption of risk/i],
    [
      "Release of liability",
      /release(?:\s+of)?\s+liability|release and waiver/i,
    ],
    ["Indemnification", /indemnif/i],
    ["Arbitration and class action waiver", /arbitrat|class action/i],
  ] as const;
  return patterns.flatMap(([title, expression]) => {
    const match = text.match(expression);
    return match?.[0]
      ? [
          {
            title,
            anchor: match[0],
            acknowledgementRecommended: true,
          },
        ]
      : [];
  });
}

function excerptForAnchor(text: string, anchor: string) {
  const index = text.toLowerCase().indexOf(anchor.toLowerCase());
  if (index < 0) return anchor;
  const nextBreak = text.indexOf("\n\n", index + anchor.length);
  return text.slice(index, nextBreak < 0 ? index + 2_000 : nextBreak).trim();
}

async function identifySections(input: {
  readonly title: string;
  readonly text: string;
}): Promise<{
  readonly sections: readonly ProposedSection[];
  readonly modelUsed: "openai" | "guided-fallback";
}> {
  const credential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!credential) {
    return {
      sections: fallbackSections(input.text),
      modelUsed: "guided-fallback",
    };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model:
          process.env.AI_GATEWAY_WAIVER_IMPORT_MODEL?.trim() ||
          "openai/gpt-5.6-luna",
        store: false,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You are preparing a review-only waiver import. Never rewrite legal text, give legal advice, or claim enforceability. Identify up to eight important sections in the supplied document. Return the exact opening phrase of each section as anchor, plus whether a separate affirmative acknowledgement is worth offering. Prioritize assumption of risk, release/waiver, indemnity, arbitration, class action, medical authorization, photo/media, and cancellation terms when present.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Document title: ${input.title}\n\n${input.text.slice(0, 100_000)}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "waiver_import_sections",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["sections"],
              properties: {
                sections: {
                  type: "array",
                  maxItems: 8,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["title", "anchor", "acknowledgementRecommended"],
                    properties: {
                      title: { type: "string", minLength: 1, maxLength: 160 },
                      anchor: { type: "string", minLength: 1, maxLength: 240 },
                      acknowledgementRecommended: { type: "boolean" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("AI import did not complete.");
    const payload = (await response.json()) as {
      output_text?: string;
      output?: readonly {
        content?: readonly { type?: string; text?: string }[];
      }[];
    };
    const text =
      payload.output_text ??
      payload.output
        ?.flatMap((entry) => entry.content ?? [])
        .find(
          (entry) =>
            (entry.type === "output_text" || entry.type === "text") &&
            typeof entry.text === "string",
        )?.text;
    const parsed = JSON.parse(text ?? "{}") as { sections?: unknown };
    const sections = Array.isArray(parsed.sections)
      ? parsed.sections.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const section = entry as Record<string, unknown>;
          return typeof section.title === "string" &&
            typeof section.anchor === "string" &&
            typeof section.acknowledgementRecommended === "boolean"
            ? [
                {
                  title: section.title.slice(0, 160),
                  anchor: section.anchor.slice(0, 240),
                  acknowledgementRecommended:
                    section.acknowledgementRecommended,
                },
              ]
            : [];
        })
      : [];
    return { sections, modelUsed: "openai" };
  } catch {
    return {
      sections: fallbackSections(input.text),
      modelUsed: "guided-fallback",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "Choose a PDF, DOCX, Markdown, or text file." },
      { status: 400 },
    );
  }
  if (file.size === 0 || file.size > 12_000_000) {
    return Response.json(
      { error: "Use a non-empty document smaller than 12 MB." },
      { status: 400 },
    );
  }
  const filename = file.name || "waiver";
  const extension = filename.split(".").pop()?.toLowerCase();
  try {
    let extracted = "";
    if (["md", "markdown", "txt"].includes(extension ?? "")) {
      extracted = await file.text();
    } else if (extension === "docx") {
      const result = await extractRawText({
        buffer: Buffer.from(await file.arrayBuffer()),
      });
      extracted = result.value;
    } else if (extension === "pdf") {
      const parser = new PDFParse({
        data: new Uint8Array(await file.arrayBuffer()),
      });
      const result = await parser.getText();
      await parser.destroy();
      extracted = result.text;
    } else {
      return Response.json(
        {
          error: "Duna supports PDF, DOCX, Markdown, and text waiver imports.",
        },
        { status: 400 },
      );
    }
    const markdown = cleanText(extracted);
    if (markdown.length < 20) {
      return Response.json(
        {
          error:
            "Duna could not extract enough readable text. Try a text-based PDF or paste the document.",
        },
        { status: 422 },
      );
    }
    const analysis = await identifySections({
      title: titleFromFilename(filename),
      text: markdown,
    });
    return Response.json({
      title: titleFromFilename(filename),
      markdown,
      modelUsed: analysis.modelUsed,
      keySections: analysis.sections.map((section, index) => ({
        id: `section-${index + 1}`,
        title: section.title,
        markdown: excerptForAnchor(markdown, section.anchor),
        acknowledgementRequired: section.acknowledgementRecommended,
      })),
    });
  } catch {
    return Response.json(
      {
        error:
          "Duna could not read this document. Try another file or paste its text.",
      },
      { status: 422 },
    );
  }
}
