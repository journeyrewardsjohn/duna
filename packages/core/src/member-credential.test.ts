import { describe, expect, it } from "vitest";
import {
  encodeDunaMemberCredential,
  normalizeDunaMemberId,
  parseDunaMemberCredential,
} from "./member-credential";

describe("Duna member credentials", () => {
  const token =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("round trips an opaque member QR without exposing the short member ID", () => {
    const payload = encodeDunaMemberCredential(token);
    expect(payload).not.toContain("A1B2C3");
    expect(parseDunaMemberCredential(payload)).toEqual({ version: 1, token });
  });

  it("normalizes a six-character human member ID", () => {
    expect(normalizeDunaMemberId(" a1b2c3 ")).toBe("A1B2C3");
    expect(normalizeDunaMemberId("A1B2C")).toBeUndefined();
  });
});
