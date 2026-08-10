import { afterEach, describe, expect, it, vi } from "vitest";
import {
  analyzeFloorplanSchematic,
  parseFloorplanAnalysis,
} from "./floorplan-analysis";

describe("floorplan analysis", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns a reviewable manual fallback without credentials", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    const result = await analyzeFloorplanSchematic(
      "https://example.com/plan.png",
    );
    expect(result.status).toBe("manual");
    expect(result.assets).toEqual([]);
  });

  it("rejects invalid normalized geometry and keeps valid detections", () => {
    const result = parseFloorplanAnalysis({
      summary: "Two visible spaces.",
      warnings: [],
      assets: [
        {
          label: "Court 1",
          kind: "court",
          shape: "rectangle",
          center: { x: 0.5, y: 0.5 },
          width: 0.2,
          height: 0.4,
          rotationDegrees: 4,
          confidence: 0.94,
        },
        {
          label: "Outside image",
          kind: "shape",
          shape: "rectangle",
          center: { x: 4, y: 0.5 },
          width: 0.2,
          height: 0.2,
          rotationDegrees: 0,
          confidence: 0.2,
        },
      ],
    });
    expect(result?.assets).toHaveLength(1);
    expect(result?.assets[0]?.label).toBe("Court 1");
  });
});
