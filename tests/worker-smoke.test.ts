import { describe, expect, it, vi } from "vitest";

import { handleRequest } from "../src/worker/index";

describe("download Worker", () => {
  it("forwards the exact product request to ASSETS and preserves its response body", async () => {
    const request = new Request("https://cmtraceopen.com/guides/");
    const response = new Response("static asset");
    const fetch = vi.fn(async () => response);
    const env = { ASSETS: { fetch } } as unknown as Env;

    const result = await handleRequest(request, env);

    await expect(result.text()).resolves.toBe("static asset");
    expect(result.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(request);
  });
});
