import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

function request(body: unknown, headers?: HeadersInit) {
  return new Request("https://duna.coach/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("Duna MCP transport", () => {
  it("negotiates the stable Streamable HTTP protocol", async () => {
    const response = await POST(
      request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-06-18" },
      }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("MCP-Protocol-Version")).toBe("2025-06-18");
    const payload = await response.json();
    expect(payload.result.protocolVersion).toBe("2025-06-18");
    expect(payload.result.capabilities.tools).toEqual({ listChanged: false });
  });

  it("lists discovery tools without exposing super-admin tools", async () => {
    const previous = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    try {
      const response = await POST(
        request({ jsonrpc: "2.0", id: "tools", method: "tools/list" }),
      );
      const payload = await response.json();
      const names = payload.result.tools.map(
        (tool: { name: string }) => tool.name,
      );
      expect(names).toContain("search_events");
      expect(names).toContain("find_booking_options");
      expect(names).not.toContain("resolve_player_identity");
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
      else process.env.NEXT_PUBLIC_DEMO_MODE = previous;
    }
  });

  it("rejects unsupported protocol versions", async () => {
    const response = await POST(
      request(
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { "mcp-protocol-version": "2024-11-05" },
      ),
    );
    expect(response.status).toBe(400);
  });

  it("rejects foreign browser origins and GET sessions", async () => {
    const response = await POST(
      request(
        { jsonrpc: "2.0", id: 1, method: "ping" },
        { origin: "https://attacker.example" },
      ),
    );
    expect(response.status).toBe(403);
    expect(GET().status).toBe(405);
  });
});
