export interface FloorplanDetectedAsset {
  readonly label: string;
  readonly kind: "court" | "shape" | "ticketed-space" | "table" | "amenity";
  readonly shape: "rectangle" | "circle";
  readonly center: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly height: number;
  readonly rotationDegrees: number;
  readonly capacity?: number;
  readonly confidence: number;
}

export interface FloorplanAnalysisProposal {
  readonly status: "ready" | "manual";
  readonly summary: string;
  readonly assets: readonly FloorplanDetectedAsset[];
  readonly warnings: readonly string[];
}

function outputText(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const payload = value as {
    readonly output_text?: unknown;
    readonly output?: readonly {
      readonly content?: readonly {
        readonly type?: unknown;
        readonly text?: unknown;
      }[];
    }[];
  };
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (
        (content.type === "output_text" || content.type === "text") &&
        typeof content.text === "string"
      ) {
        return content.text;
      }
    }
  }
  return undefined;
}

function finiteUnit(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
    ? value
    : undefined;
}

export function parseFloorplanAnalysis(
  value: unknown,
): FloorplanAnalysisProposal | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.summary !== "string" ||
    !Array.isArray(record.assets) ||
    !Array.isArray(record.warnings)
  ) {
    return undefined;
  }
  const assets = record.assets.flatMap(
    (candidate): FloorplanDetectedAsset[] => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      ) {
        return [];
      }
      const item = candidate as Record<string, unknown>;
      const center = item.center as Record<string, unknown> | undefined;
      const x = finiteUnit(center?.x);
      const y = finiteUnit(center?.y);
      const width = finiteUnit(item.width);
      const height = finiteUnit(item.height);
      const kind = item.kind;
      const shape = item.shape;
      if (
        typeof item.label !== "string" ||
        !["court", "shape", "ticketed-space", "table", "amenity"].includes(
          String(kind),
        ) ||
        (shape !== "rectangle" && shape !== "circle") ||
        x === undefined ||
        y === undefined ||
        width === undefined ||
        height === undefined ||
        width <= 0 ||
        height <= 0 ||
        typeof item.rotationDegrees !== "number" ||
        typeof item.confidence !== "number"
      ) {
        return [];
      }
      return [
        {
          label: item.label.slice(0, 120),
          kind: kind as FloorplanDetectedAsset["kind"],
          shape,
          center: { x, y },
          width,
          height,
          rotationDegrees: Math.max(-360, Math.min(360, item.rotationDegrees)),
          ...(typeof item.capacity === "number" && item.capacity > 0
            ? { capacity: Math.round(item.capacity) }
            : {}),
          confidence: Math.max(0, Math.min(1, item.confidence)),
        },
      ];
    },
  );
  return {
    status: "ready",
    summary: record.summary.slice(0, 1_000),
    assets,
    warnings: record.warnings
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.slice(0, 300))
      .slice(0, 20),
  };
}

const manualProposal: FloorplanAnalysisProposal = {
  status: "manual",
  summary:
    "The schematic is uploaded. AI detection is unavailable in this environment, so the floorplan is ready for manual tracing.",
  assets: [],
  warnings: ["No AI gateway credential is configured."],
};

export async function analyzeFloorplanSchematic(
  imageUrl: string,
): Promise<FloorplanAnalysisProposal> {
  const credential =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_OIDC_TOKEN?.trim();
  if (!credential) return manualProposal;
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
          process.env.AI_GATEWAY_VENUE_LAYOUT_MODEL?.trim() ||
          "openai/gpt-5.6-luna",
        store: false,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Analyze an indoor venue schematic. Detect only clearly visible courts, rooms, seating zones, restrooms, tables, and operational spaces. Return normalized coordinates from 0 to 1 relative to the image. Do not infer hidden spaces. Capacity is optional and must only be returned when explicitly labeled or safely countable. Operators will review every result before saving.",
              },
            ],
          },
          {
            role: "user",
            content: [
              { type: "input_image", image_url: imageUrl, detail: "high" },
              {
                type: "input_text",
                text: "Convert this schematic into a reviewable venue floorplan proposal.",
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "venue_floorplan_proposal",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["summary", "assets", "warnings"],
              properties: {
                summary: { type: "string" },
                warnings: { type: "array", items: { type: "string" } },
                assets: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "label",
                      "kind",
                      "shape",
                      "center",
                      "width",
                      "height",
                      "rotationDegrees",
                      "confidence",
                    ],
                    properties: {
                      label: { type: "string" },
                      kind: {
                        type: "string",
                        enum: [
                          "court",
                          "shape",
                          "ticketed-space",
                          "table",
                          "amenity",
                        ],
                      },
                      shape: { type: "string", enum: ["rectangle", "circle"] },
                      center: {
                        type: "object",
                        additionalProperties: false,
                        required: ["x", "y"],
                        properties: {
                          x: { type: "number", minimum: 0, maximum: 1 },
                          y: { type: "number", minimum: 0, maximum: 1 },
                        },
                      },
                      width: {
                        type: "number",
                        exclusiveMinimum: 0,
                        maximum: 1,
                      },
                      height: {
                        type: "number",
                        exclusiveMinimum: 0,
                        maximum: 1,
                      },
                      rotationDegrees: {
                        type: "number",
                        minimum: -360,
                        maximum: 360,
                      },
                      capacity: { type: ["integer", "null"], minimum: 1 },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
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
    if (!response.ok) {
      throw new Error(
        `Floorplan analysis failed with status ${response.status}.`,
      );
    }
    const payload = (await response.json()) as unknown;
    const text = outputText(payload);
    const proposal = text
      ? parseFloorplanAnalysis(JSON.parse(text))
      : undefined;
    if (!proposal)
      throw new Error("Floorplan analysis returned invalid geometry.");
    return proposal;
  } finally {
    clearTimeout(timeout);
  }
}
