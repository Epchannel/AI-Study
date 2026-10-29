import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, saveSession, streamMessage } from "./academy-api";

const fetchMock = vi.fn();
beforeEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());

function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function stream(parts: string[]) { return new Response(new ReadableStream({ start(controller) { parts.forEach(p => controller.enqueue(new TextEncoder().encode(p))); controller.close(); } })); }

describe("academy gateway transport", () => {
  it("keeps gateway request IDs in HTTP and streaming failures", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "Gateway quá thời gian" }), { status: 504, headers: { "X-Request-Id": "request-123" } }));
    await expect(api("/career/report", "POST")).rejects.toThrow("Mã yêu cầu: request-123");
    fetchMock.mockResolvedValue(stream(['event: error\ndata: {"message":"Gateway timeout", "request_id":"stream-456"}\n\n']));
    await expect(streamMessage("1", "Hello", new AbortController().signal, vi.fn(), vi.fn())).rejects.toThrow("Mã yêu cầu: stream-456");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("attaches the academy account, refreshes rejected authentication once, and keeps form boundaries", async () => {
    saveSession({ access_token: "old-test-token", refresh_token: "refresh-test-token" });
    fetchMock.mockResolvedValueOnce(response({}, 401)).mockResolvedValueOnce(response({ access_token: "new-test-token", refresh_token: "new-refresh" })).mockResolvedValueOnce(response({ id: "uploaded" }));
    const form = new FormData(); form.set("file", new File(["notes"], "notes.txt"));
    expect(await api("/classes/class-1/materials", "POST", form)).toEqual({ id: "uploaded" });
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer old-test-token");
    expect(fetchMock.mock.calls[2][1].headers.get("Authorization")).toBe("Bearer new-test-token");
    expect(fetchMock.mock.calls[2][1].headers.has("Content-Type")).toBe(false);
  });

  it("does not automatically retry a rejected generation", async () => {
    fetchMock.mockResolvedValue(response({ detail: "Gateway unavailable" }, 503));
    await expect(api("/assets/generate", "POST", { topic: "Toán" })).rejects.toThrow("Gateway unavailable");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles split SSE events and requires the terminal marker", async () => {
    fetchMock.mockResolvedValue(stream(['event: sources\r', '\ndata: []\r\n\r', '\nevent: content\r\ndata: {"text":"Chào em"}\r\n\r\nevent: done\r\ndata: {"thread_id":"1"}\r\n\r\n']));
    const text = vi.fn(), sources = vi.fn();
    await streamMessage("1", "Hello", new AbortController().signal, text, sources);
    expect(text).toHaveBeenCalledWith("Chào em");
    expect(sources).toHaveBeenCalledWith([]);
    fetchMock.mockResolvedValue(stream(['event: content\ndata: {"text":"partial"}\n\n']));
    await expect(streamMessage("1", "Hello", new AbortController().signal, text, sources)).rejects.toThrow("trước khi hoàn tất");
  });
});
