import { describe, expect, it } from "vitest";
import {
  canonicalPublicWebOrigin,
  canonicalPublicWebUrl,
} from "./public-web-url";

describe("canonicalPublicWebOrigin", () => {
  it("replaces internal Vercel origins with the public Duna domain", () => {
    expect(canonicalPublicWebOrigin("https://duna-web.vercel.app")).toBe(
      "https://duna.coach",
    );
    expect(
      canonicalPublicWebOrigin(
        "https://duna-web-git-feature-suttonx.vercel.app",
      ),
    ).toBe("https://duna.coach");
  });

  it("keeps an explicit local or custom public origin", () => {
    expect(canonicalPublicWebOrigin("http://localhost:3000/path")).toBe(
      "http://localhost:3000",
    );
    expect(canonicalPublicWebOrigin("https://staging.duna.coach/path")).toBe(
      "https://staging.duna.coach",
    );
  });

  it("builds an encoded canonical public URL", () => {
    expect(
      canonicalPublicWebUrl(
        "/join/team/6fc1948b463e4f588e99e2d13f26e6551b7049952c1f489a869bf157c716ed26",
        "https://duna-web.vercel.app",
      ),
    ).toBe(
      "https://duna.coach/join/team/6fc1948b463e4f588e99e2d13f26e6551b7049952c1f489a869bf157c716ed26",
    );
  });
});
