import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/secretaria/chat/route";

describe("POST /api/secretaria/chat", () => {
  it("rejects invalid JSON", async () => {
    const response = await POST(new Request("http://localhost/api/secretaria/chat", { method: "POST", body: "not-json" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-json" });
  });

  it("rejects a missing message", async () => {
    const response = await POST(new Request("http://localhost/api/secretaria/chat", { method: "POST", body: JSON.stringify({}) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "message-required" });
  });

  it("returns a no-store conversation response", async () => {
    const response = await POST(new Request("http://localhost/api/secretaria/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "Oi" }) }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(data.reply).toContain("secretária virtual");
    expect(data.demoNotice).toContain("Protótipo");
  });

  it("rejects oversized messages", async () => {
    const response = await POST(new Request("http://localhost/api/secretaria/chat", { method: "POST", body: JSON.stringify({ message: "x".repeat(501) }) }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "message-too-long" });
  });
});
