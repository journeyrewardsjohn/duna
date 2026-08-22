import { describe, expect, it } from "vitest";
import { isPublicHqRoute } from "./lib/public-routes";

describe("HQ public routes", () => {
  it("lets the bearer-protected Sand cron reach its route handler", () => {
    expect(isPublicHqRoute("/api/cron/sand")).toBe(true);
    expect(isPublicHqRoute("/api/cron/sand/other")).toBe(false);
  });

  it("lets the bearer-protected event operations cron reach its route handler", () => {
    expect(isPublicHqRoute("/api/cron/event-operations")).toBe(true);
    expect(isPublicHqRoute("/api/cron/event-operations/other")).toBe(false);
  });

  it("lets the bearer-protected Vision cron reach its route handler", () => {
    expect(isPublicHqRoute("/api/cron/vision-improvement")).toBe(true);
    expect(isPublicHqRoute("/api/cron/vision-improvement/other")).toBe(false);
  });

  it("keeps unrelated API routes behind WorkOS", () => {
    expect(isPublicHqRoute("/api/media/upload")).toBe(false);
    expect(isPublicHqRoute("/api/places/details")).toBe(false);
  });
});
