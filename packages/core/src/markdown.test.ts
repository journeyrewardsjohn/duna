import { describe, expect, it } from "vitest";
import { markdownToPlainText, parseMarkdown } from "./markdown";

describe("markdown parsing", () => {
  it("keeps emoji and formats the common waiver authoring syntax", () => {
    expect(
      parseMarkdown(
        "# 🏐 Participation\n\n**Read this** before *signing*.\n\n- Parent\n- Player",
      ),
    ).toMatchObject([
      { type: "heading", level: 1 },
      { type: "paragraph" },
      { type: "list", ordered: false },
    ]);
    expect(markdownToPlainText("# 🏐 Participation\n\n**Read this**")).toBe(
      "🏐 Participation Read this",
    );
  });

  it("only keeps safe http links", () => {
    expect(
      markdownToPlainText(
        "[Club](https://duna.coach) [bad](javascript:alert(1))",
      ),
    ).toBe("Club [bad](javascript:alert(1))");
  });
});
