import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

test("keeps PiJ state separate from Pi and defaults to assist mode", () => {
  const config = loadConfig({}, "/users/tester");
  assert.equal(config.home, "/users/tester/.pij/agent");
  assert.equal(config.mode, "assist");
  assert.equal(config.apiKey, undefined);
});

test("validates mode, deadline and HTTPS endpoint without including credential values", () => {
  for (const env of [
    { PIJ_MODE: "whatever" },
    { PIJ_JEV_TIMEOUT_MS: "0" },
    { PIJ_JEV_TIMEOUT_MS: "Infinity" },
    { PIJ_JEV_ENDPOINT: "http://example.com/v1/systemone" },
    { PIJ_JEV_ENDPOINT: "https://secret:password@example.com/v1/systemone" },
  ]) assert.throws(() => loadConfig(env), { name: "Error" });
  const config = loadConfig({ PIJ_MODE: "observe", PIJ_HOME: "~/custom", PIJ_JEV_TIMEOUT_MS: "500" }, "/users/tester");
  assert.equal(config.mode, "observe");
  assert.equal(config.home, "/users/tester/custom");
  assert.equal(config.timeoutMs, 500);
});

test("selects the matching Jev provider, credentials, model and endpoint", () => {
  const gateway = loadConfig({ AI_GATEWAY_API_KEY: "gateway-fixture" });
  assert.equal(gateway.provider, "vercel");
  assert.equal(gateway.apiKey, "gateway-fixture");
  assert.equal(gateway.model, "typesafe-ai/jev");
  assert.equal(gateway.endpoint, "https://ai-gateway.vercel.sh/v4/ai");
  const direct = loadConfig({ AI_GATEWAY_API_KEY: "gateway-fixture", TYPESAFE_API_KEY: "direct-fixture" });
  assert.equal(direct.provider, "typesafe");
  assert.equal(direct.apiKey, "direct-fixture");
  const explicit = loadConfig({ PIJ_JEV_PROVIDER: "vercel", TYPESAFE_API_KEY: "never-send-to-gateway" });
  assert.equal(explicit.apiKey, undefined);
  assert.throws(() => loadConfig({ PIJ_JEV_PROVIDER: "unknown" }));
});
