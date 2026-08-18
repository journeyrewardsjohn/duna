import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHiggsfieldImage,
  getHiggsfieldJob,
  uploadHiggsfieldReference,
} from "./higgsfield";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Higgsfield artwork provider", () => {
  it("uploads a Duna-owned reference and confirms it before generation", async () => {
    vi.stubEnv("HIGGSFIELD_API_TOKEN", "test-token");
    vi.stubEnv("HIGGSFIELD_WORKSPACE_ID", "test-workspace");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "00000000-0000-4000-8000-000000000001",
          upload_url: "https://uploads.example.test/reference.jpg",
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json({ accepted: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadHiggsfieldReference("https://example.test/reference.jpg"),
    ).resolves.toBe("00000000-0000-4000-8000-000000000001");

    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      "/developer/v2alpha/media?type=image",
    );
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(String(fetchMock.mock.calls[3]?.[0])).toContain(
      "/developer/v2alpha/media/00000000-0000-4000-8000-000000000001/confirm?type=image",
    );
  });

  it("submits and retrieves an image job through the developer API", async () => {
    vi.stubEnv("HIGGSFIELD_API_TOKEN", "test-token");
    vi.stubEnv("HIGGSFIELD_WORKSPACE_ID", "test-workspace");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          id: "00000000-0000-4000-8000-000000000011",
          status: "queued",
          job_type: "gpt_image_2",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "00000000-0000-4000-8000-000000000011",
          status: "completed",
          job_type: "gpt_image_2",
          result_url: "https://cdn.example.test/poster.png",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createHiggsfieldImage({
        jobType: "gpt_image_2",
        prompt: "A beach-volleyball profile hero.",
        imageReferenceIds: ["00000000-0000-4000-8000-000000000001"],
        aspectRatio: "16:9",
        resolution: "2k",
        quality: "high",
      }),
    ).resolves.toMatchObject({ status: "queued", jobType: "gpt_image_2" });
    await expect(
      getHiggsfieldJob("00000000-0000-4000-8000-000000000011"),
    ).resolves.toMatchObject({
      status: "completed",
      resultUrl: "https://cdn.example.test/poster.png",
    });

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "/developer/v2alpha/images/gpt_image_2/generations",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      params: {
        prompt: "A beach-volleyball profile hero.",
        aspect_ratio: "16:9",
        resolution: "2k",
        quality: "high",
        image_references: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            type: "media_input",
          },
        ],
      },
    });
  });
});
