import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { JevClient, type Questions } from "../src/jev.js";

const questions: Questions = {
  category: { type: "choice", instructions: "Classify the failure.", criteria: { code: "Code defect", network: "Network failure" } },
};
const response = {
  model: "jev-test",
  answers: { category: { type: "choice", choice: "network", probabilities: { code: 0.1, network: 0.9 }, confidence: 0.8 } },
  usage: { input_tokens: 123, output_tokens: 0 },
};

async function server(t: test.TestContext, reply: (body: unknown) => { status?: number; body?: unknown; delay?: number }) {
  let calls = 0;
  const http = createServer(async (req, res) => {
    calls++;
    assert.equal(req.url, "/v1/systemone");
    assert.equal(req.headers.authorization, "Bearer local-fixture-key");
    let text = "";
    for await (const chunk of req) text += String(chunk);
    const result = reply(JSON.parse(text));
    if (result.delay) await new Promise((resolve) => setTimeout(resolve, result.delay));
    res.writeHead(result.status ?? 200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.body ?? response));
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  t.after(() => { http.closeAllConnections(); http.close(); });
  const address = http.address();
  assert.ok(address && typeof address === "object");
  return { endpoint: `http://127.0.0.1:${address.port}/v1/systemone`, calls: () => calls };
}

test("evaluates typed questions against the HTTP API and reuses successful results", async (t) => {
  const api = await server(t, (body) => {
    assert.deepEqual(body, { model: "jev-test", state: { error: "ECONNRESET" }, questions });
    return {};
  });
  const client = new JevClient({ apiKey: "local-fixture-key", endpoint: api.endpoint, model: "jev-test" });
  const result = await client.evaluate({ error: "ECONNRESET" }, questions);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.equal(result.answers.category?.type, "choice");
  assert.equal(result.inputTokens, 123);
  assert.equal(result.cached, false);
  const cached = await client.evaluate({ error: "ECONNRESET" }, questions);
  assert.equal(cached.status === "ok" && cached.cached, true);
  assert.equal(api.calls(), 1);
});

test("rejects an option outside the requested candidate set", async (t) => {
  const api = await server(t, () => ({ body: { ...response, answers: { category: { ...response.answers.category, choice: "run_shell" } } } }));
  const client = new JevClient({ apiKey: "local-fixture-key", endpoint: api.endpoint });
  assert.equal((await client.evaluate("failure", questions)).status, "fallback");
});

test("rejects incomplete, non-normalized and out-of-range probability distributions", async (t) => {
  for (const probabilities of [{ code: 0.1 }, { code: 0.8, network: 0.8 }, { code: -0.1, network: 1.1 }]) {
    const api = await server(t, () => ({ body: { ...response, answers: { category: { ...response.answers.category, probabilities } } } }));
    const result = await new JevClient({ apiKey: "local-fixture-key", endpoint: api.endpoint }).evaluate("failure", questions);
    assert.equal(result.status === "fallback" && result.reason, "invalid_response");
  }
});

test("missing key never attempts a network request", async () => {
  const result = await new JevClient({}).evaluate("text", questions);
  assert.equal(result.status === "fallback" && result.reason, "missing_key");
});

test("enforces a total deadline and user cancellation", async (t) => {
  const api = await server(t, () => ({ delay: 150 }));
  const client = new JevClient({ apiKey: "local-fixture-key", endpoint: api.endpoint, timeoutMs: 25 });
  const result = await client.evaluate("timeout", questions);
  assert.equal(result.status === "fallback" && result.reason, "timeout");
  const controller = new AbortController();
  controller.abort();
  const cancelled = await client.evaluate("cancelled", questions, controller.signal);
  assert.equal(cancelled.status === "fallback" && cancelled.reason, "cancelled");
});

test("rate limits fall back without retrying or retaining raw error text", async (t) => {
  const api = await server(t, () => ({ status: 429, body: { error: "do not log this secret" } }));
  const result = await new JevClient({ apiKey: "local-fixture-key", endpoint: api.endpoint }).evaluate("text", questions);
  assert.equal(result.status === "fallback" && result.reason, "http_429");
  assert.equal(api.calls(), 1);
  assert.ok(!JSON.stringify(result).includes("secret"));
});

test("bounds the request before sending it", async (t) => {
  const api = await server(t, () => ({}));
  const client = new JevClient({ apiKey: "local-fixture-key", endpoint: api.endpoint, maxRequestBytes: 256 });
  const result = await client.evaluate("x".repeat(1000), questions);
  assert.equal(result.status === "fallback" && result.reason, "input_limit");
  assert.equal(api.calls(), 0);
});
