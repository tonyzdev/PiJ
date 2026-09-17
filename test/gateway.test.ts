import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { JevClient, type Questions } from "../src/jev.js";

const questions: Questions = {
  relevant: { type: "noul", instructions: "Is this relevant?" },
  category: { type: "choice", instructions: "Choose a category.", criteria: { code: "Code defect", environment: "Missing executable" } },
};
const answer = {
  answers: { relevant: { type: "boolean", probability: 0.9 }, category: { type: "choice", choice: "environment", probabilities: { code: 0.1, environment: 0.9 } } },
  usage: { inputTokens: 123, outputTokens: 0 },
  providerMetadata: { typesafe: { confidence: { category: 0.8 } } },
};

test("Vercel uses the evaluation protocol and normalizes boolean and confidence metadata", async (t) => {
  let calls = 0;
  const http = createServer(async (req, res) => {
    calls++;
    assert.equal(req.url, "/v4/ai/evaluation-model");
    assert.equal(req.headers.authorization, "Bearer gateway-fixture");
    assert.equal(req.headers["ai-model-id"], "typesafe-ai/jev");
    let text = "";
    for await (const chunk of req) text += String(chunk);
    const body = JSON.parse(text);
    assert.equal(body.questions.relevant.type, "boolean");
    assert.equal(body.questions.category.type, "choice");
    assert.deepEqual(body.state, { error: "command not found" });
    assert.equal(body.providerOptions.gateway.zeroDataRetention, true);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(answer));
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  t.after(() => { http.closeAllConnections(); http.close(); });
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const client = new JevClient({ provider: "vercel", apiKey: "gateway-fixture", endpoint: `http://127.0.0.1:${address.port}/v4/ai`, model: "typesafe-ai/jev" });
  const result = await client.evaluate({ error: "command not found" }, questions);
  assert.equal(result.status, "ok");
  if (result.status !== "ok") return;
  assert.deepEqual(result.answers.relevant, { type: "noul", noul: 0.9 });
  assert.equal(result.answers.category?.type === "choice" && result.answers.category.confidence, 0.8);
  assert.equal(result.inputTokens, 123);
  await client.evaluate({ error: "command not found" }, questions);
  assert.equal(calls, 1);
});

for (const scenario of ["rate-limit", "malformed", "timeout", "oversized"] as const) {
  test(`Vercel ${scenario} preserves bounded fallback without retries or raw error leakage`, async (t) => {
    let calls = 0;
    const http = createServer(async (req, res) => {
      calls++;
      for await (const _ of req) { /* Drain. */ }
      if (scenario === "timeout") await new Promise((resolve) => setTimeout(resolve, 150));
      res.writeHead(scenario === "rate-limit" ? 429 : 200, { "Content-Type": "application/json" });
      res.end(scenario === "oversized" ? "x".repeat(1_000_001) : JSON.stringify(scenario === "rate-limit" ? { error: "do-not-log-secret" } : scenario === "malformed" ? { answers: {} } : answer));
    });
    http.listen(0, "127.0.0.1");
    await once(http, "listening");
    t.after(() => { http.closeAllConnections(); http.close(); });
    const address = http.address();
    assert.ok(address && typeof address === "object");
    const client = new JevClient({ provider: "vercel", apiKey: "gateway-fixture", endpoint: `http://127.0.0.1:${address.port}/v4/ai`, timeoutMs: scenario === "timeout" ? 50 : 1800 });
    const result = await client.evaluate("fixture", questions);
    assert.equal(result.status === "fallback" && result.reason, scenario === "rate-limit" ? "http_429" : scenario === "timeout" ? "timeout" : "invalid_response");
    assert.equal(calls, 1);
    assert.ok(!JSON.stringify(result).includes("do-not-log-secret"));
  });
}

test("Vercel preserves valid rounded distributions without renormalizing scores", async (t) => {
  const http = createServer(async (req, res) => {
    for await (const _ of req) { /* Drain. */ }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ answers: { pick: { type: "choice", choice: "a", probabilities: { a: 0.33, b: 0.33, c: 0.33 } } }, rounding: { probabilityDecimals: 2 }, usage: { inputTokens: 10, outputTokens: 0 }, providerMetadata: { typesafe: { confidence: { pick: 0.2 } } } }));
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  t.after(() => { http.closeAllConnections(); http.close(); });
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const result = await new JevClient({ provider: "vercel", apiKey: "fixture", endpoint: `http://127.0.0.1:${address.port}` }).evaluate("fixture", { pick: { type: "choice", instructions: "Choose", criteria: { a: "A", b: "B", c: "C" } } });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.status === "ok" && result.answers.pick?.type === "choice" && result.answers.pick.probabilities, { a: 0.33, b: 0.33, c: 0.33 });
});
