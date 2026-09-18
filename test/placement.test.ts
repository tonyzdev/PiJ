import assert from "node:assert/strict";
import test from "node:test";
import { filterOutput, auditFinish } from "../eval/placement.js";
import type { DecisionProvider } from "../src/decisions.js";
const provider: DecisionProvider = { evaluate: async (_state, questions) => ({ status: "ok", model: "fixture", latencyMs: 1, inputTokens: 10, outputTokens: 3, cached: false, answers: Object.fromEntries(Object.keys(questions).map(id => [id, { type: "noul", noul: id === "c1" || id === "r0" ? 0.9 : 0.1 }])) }) };
const text = Array.from({ length: 48 }, (_, i) => `original line ${i + 1} ${i === 12 ? "middle sentinel" : "data"}`).join("\n");
test("output ranking changes retained evidence, preserves exact lines and original order", async () => {
    const local = await filterOutput({ mode: "local", task: "find sentinel", intent: "read source", text });
    const ranked = await filterOutput({ mode: "jev", task: "find sentinel", intent: "read source", text, provider });
    assert.ok(!local.text.includes("middle sentinel"));
    assert.ok(ranked.text.includes("middle sentinel"));
    assert.deepEqual(ranked.selected, [{ start: 1, end: 12 }, { start: 13, end: 24 }]);
    assert.ok(ranked.text.includes("original line 13 middle sentinel"));
    assert.ok(ranked.text.indexOf("original line 1 data") < ranked.text.indexOf("original line 13 middle sentinel"));
    assert.equal(ranked.omittedChunks, 2);
});
test("output failure, malformed response and pre-abort cannot discard evidence", async () => {
    for (const bad of [{ evaluate: async () => ({ status: "fallback" as const, reason: "timeout" as const, latencyMs: 1 }) }, { evaluate: async () => ({ status: "ok" as const, model: "fixture", latencyMs: 1, inputTokens: 1, outputTokens: 1, cached: false, answers: {} }) }]) {
        assert.equal((await filterOutput({ mode: "jev", task: "task", intent: "", text, provider: bad })).text, text);
    }
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(filterOutput({ mode: "jev", task: "task", intent: "", text, provider, signal: controller.signal }));
});
test("completion audit uses public requirements individually and reports uncertain evidence as gaps", async () => {
    const result = await auditFinish({ mode: "jev", task: "task", requirements: ["preserve API", "add production regression tests"], files: { "src/a.ts": "export const x=1" }, observations: [], finalText: "done", provider });
    assert.deepEqual(result.gaps, ["add production regression tests"]);
    const local = await auditFinish({ mode: "local", task: "task", requirements: ["preserve API", "add production regression tests"], files: {}, observations: [], finalText: "done" });
    assert.deepEqual(local.gaps, ["preserve API", "add production regression tests"]);
});
test("oversize complete-file completion evidence skips the call rather than truncating files", async () => {
    let calls = 0;
    const result = await auditFinish({ mode: "jev", task: "task", requirements: ["requirement"], files: { "src/large.ts": "x".repeat(61000) }, observations: [], finalText: "done", provider: { evaluate: async (...args) => { calls++; return provider.evaluate(...args); } } });
    assert.equal(calls, 0);
    assert.deepEqual(result.gaps, []);
    assert.equal(result.skipped, "input_limit");
});
test("actual runner rejects mixed placement interventions before requiring a key", async () => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    for (const args of [["--placement", "output-jev", "--dependency-evidence", "jev"], ["--placement", "finish-jev", "--project-evidence", "jev"], ["--placement", "checkpoint-jev", "--checkpoint", "jev"]]) {
        await assert.rejects(promisify(execFile)(process.execPath, ["--import", "tsx", "eval/checkpoint-run.ts", ...args], { env: { PATH: process.env.PATH }, timeout: 10000 }), e => e instanceof Error && "stderr" in e && String(e.stderr).includes("Placement must be isolated"));
    }
});

test("verification recognition distinguishes executable commands from read/search arguments", async () => {
    const { isVerificationCommand } = await import("../eval/placement-extension.js");
    for (const command of ["npm test", "npm run check", "cd project && npx tsx --test test/a.ts", "node --import tsx --test test/a.ts", "npx tsc --noEmit", "pnpm build"]) assert.equal(isVerificationCommand(command), true, command);
    for (const command of ["cat test/ui.test.ts", "sed -n '1,200p' test/integration.test.ts", "rg 'check' src", "cat src/build.ts"]) assert.equal(isVerificationCommand(command), false, command);
});
