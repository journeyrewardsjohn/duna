import { describe, expect, it } from "vitest";
import { resolveDunaHqUrl } from "./site-urls";

describe("Duna site URLs", () => {
  it("uses the canonical HQ domain when no deployment override exists", () => {
    expect(resolveDunaHqUrl()).toBe("https://hq.duna.coach");
    expect(resolveDunaHqUrl("not a URL")).toBe("https://hq.duna.coach");
    expect(resolveDunaHqUrl("https://duna-hq.vercel.app/settings")).toBe(
      "https://hq.duna.coach",
    );
  });

  it("keeps valid local development and hosted origins", () => {
    expect(resolveDunaHqUrl("http://localhost:3001/settings")).toBe(
      "http://localhost:3001",
    );
    expect(resolveDunaHqUrl("https://hq.duna.coach/")).toBe(
      "https://hq.duna.coach",
    );
  });
});
