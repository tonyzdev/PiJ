import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, SettingsManager, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import cliControl from "../eval/cli-control.js";
import { installEvalBudget, type EvalBudgets } from "../eval/budget.js";
import { captureSourceProvenance } from "../eval/provenance.js";

const exec = promisify(execFile);
const defaults: EvalBudgets = { turns: 2, seconds: 10, tokens: 100000, maxOutputTokens: 16384 };

async function fixture(t: test.TestContext, limits: Partial<EvalBudgets> = {}, options: { cli?: boolean; final?: boolean; truncated?: boolean } = {}) {
  const cwd = await mkdtemp(join(tmpdir(), "pij-budget-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await writeFile(join(cwd, "fixture.txt"), "fixture\n");
  let calls = 0;
  const outputLimits: number[] = [];
  const http = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += String(chunk);
    const payload = JSON.parse(body) as Record<string, unknown>;
    const limits = [payload.max_tokens, payload.max_completion_tokens, payload.max_output_tokens].filter((value) => value !== undefined);
    assert.equal(limits.length, 1, "send one provider-specific output limit");
    outputLimits.push(limits[0] as number);
    calls++;
    // A finite fixture guard makes a broken cutoff fail quickly instead of hanging.
    const tool = !options.final && calls <= 6;
    const delta = tool ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${calls}`, type: "function", function: { name: "read", arguments: JSON.stringify({ path: "fixture.txt" }) } }] } : { role: "assistant", content: "Fixture complete." };
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(`data: ${JSON.stringify({ id: `r${calls}`, object: "chat.completion.chunk", model: "fixture", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: `r${calls}`, object: "chat.completion.chunk", model: "fixture", choices: [{ index: 0, delta: {}, finish_reason: tool ? options.truncated ? "length" : "tool_calls" : "stop" }], usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  t.after(() => { http.closeAllConnections(); http.close(); });
  const address = http.address();
  assert.ok(address && typeof address === "object");
  const home = join(cwd, "home");
  const runtime = await ModelRuntime.create({ authPath: join(home, "auth.json"), modelsPath: null, refreshOnCreate: false });
  runtime.registerProvider("fixture", { baseUrl: `http://127.0.0.1:${address.port}/v1`, api: "openai-completions", apiKey: "local-fixture", models: [{ id: "fixture", name: "fixture", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 32768 }] });
  const settings = SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } });
  let budget!: ReturnType<typeof installEvalBudget>;
  let control: ExtensionFactory = (pi) => { budget = installEvalBudget(pi, { ...defaults, ...limits }); };
  if (options.cli) {
    const env = { PIJ_EVAL_WORKSPACE: cwd, PIJ_EVAL_STATS: join(cwd, "stats.json"), PIJ_EVAL_TURNS: "2", PIJ_EVAL_TOKENS: "100000", PIJ_EVAL_MAX_OUTPUT_TOKENS: "16384" };
    const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    t.after(() => { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
    control = cliControl;
  }
  const resources = new DefaultResourceLoader({ cwd, agentDir: home, settingsManager: settings, noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, agentsFilesOverride: () => ({ agentsFiles: [] }), extensionFactories: [control] });
  await resources.reload();
  assert.deepEqual(resources.getExtensions().errors, []);
  const { session } = await createAgentSession({ cwd, agentDir: home, modelRuntime: runtime, model: runtime.getModel("fixture", "fixture"), settingsManager: settings, resourceLoader: resources, sessionManager: SessionManager.inMemory() });
  t.after(() => session.dispose());
  await session.bindExtensions({});
  await session.prompt("Read the fixture repeatedly.");
  assert.equal(session.isIdle, true);
  return { calls, outputLimits, snapshot: budget?.snapshot() };
}

test("evaluation budget stops a real Pi tool loop before request three", { timeout: 10000 }, async (t) => {
  const result = await fixture(t);
  assert.equal(result.calls, 2);
  assert.deepEqual(result.outputLimits, [16384, 16384]);
  assert.equal(result.snapshot?.requests, 2);
  assert.equal(result.snapshot?.tokens, 20);
  assert.equal(result.snapshot?.termination, "budget");
  assert.equal(result.snapshot?.budgetReason, "requests");
  assert.deepEqual(result.snapshot?.calls, { read: 2 });
  assert.deepEqual(result.snapshot?.usage, { input: 14, output: 6, cacheRead: 0, cacheWrite: 0, estimatedUsd: 0 });
});

test("reported token usage stops the next request and bounds remaining output allowance", async (t) => {
  const result = await fixture(t, { turns: 10, tokens: 25 });
  assert.equal(result.calls, 3);
  assert.deepEqual(result.outputLimits, [25, 15, 5]);
  assert.equal(result.snapshot?.tokens, 30, "actual usage remains honest when previously unknown input crosses the admission limit");
  assert.equal(result.snapshot?.budgetReason, "tokens");
});

test("truncated tool-call responses also stop at the request boundary", async (t) => {
  const result = await fixture(t, { maxOutputTokens: 6 }, { truncated: true });
  assert.equal(result.calls, 2);
  assert.deepEqual(result.outputLimits, [6, 6]);
  assert.equal(result.snapshot?.termination, "budget");
});

test("a final answer at the boundary completes without a false budget failure", async (t) => {
  const result = await fixture(t, { turns: 1, tokens: 10 }, { final: true });
  assert.equal(result.calls, 1);
  assert.equal(result.snapshot?.termination, "completed");
});

test("real CLI control uses the same cutoff and expanded output budget", { skip: process.platform !== "darwin" }, async (t) => {
  const result = await fixture(t, {}, { cli: true });
  assert.equal(result.calls, 2);
  assert.deepEqual(result.outputLimits, [16384, 16384]);
});

test("dogfood rejects invalid budgets before requesting credentials or preparing a clone", async () => {
  for (const [option, value, field] of [["turns", "0", "turns"], ["turns", "NaN", "turns"], ["max-output-tokens", "-1", "maxOutputTokens"]]) {
    await assert.rejects(exec(process.execPath, ["--import", "tsx", resolve("eval/dogfood.ts"), `--${option}=${value}`], { env: { PATH: process.env.PATH }, timeout: 5000 }), (error: unknown) => error instanceof Error && "stderr" in error && String(error.stderr).includes(`Invalid ${field} budget.`));
  }
});

test("provenance distinguishes tracked, untracked, and built code without scanning private artifacts", async (t) => {
  const cwd = await mkdtemp(join(tmpdir(), "pij-provenance-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(join(cwd, "src"));
  await mkdir(join(cwd, "dist"));
  await writeFile(join(cwd, ".gitignore"), "dist/\n.env\n.pij/\n");
  await writeFile(join(cwd, "src/a.ts"), "export const a = 1;\n");
  await exec("git", ["init", "-q"], { cwd });
  await exec("git", ["add", ".gitignore", "src/a.ts"], { cwd });
  // Commit only in this disposable synthetic repository; never the working project.
  await exec("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "core.hooksPath=/dev/null", "commit", "--no-gpg-sign", "-qm", "fixture"], { cwd });
  const original = await captureSourceProvenance(cwd);
  assert.match(original.head, /^[0-9a-f]{40}$/);
  await writeFile(join(cwd, "src/a.ts"), "export const a = 2;\n");
  const changed = await captureSourceProvenance(cwd);
  assert.equal(changed.head, original.head);
  assert.equal(changed.dirty, true);
  assert.notEqual(changed.trackedSourceDigest, original.trackedSourceDigest);
  await writeFile(join(cwd, "src/new.ts"), "export const b = 3;\n");
  const untracked = await captureSourceProvenance(cwd);
  assert.notEqual(untracked.untrackedSourceDigest, changed.untrackedSourceDigest);
  assert.equal(untracked.untrackedSourceFiles, 1);
  await writeFile(join(cwd, "dist/a.js"), "export const a = 2;\n");
  const built = await captureSourceProvenance(cwd);
  assert.notEqual(built.builtRuntimeDigest, untracked.builtRuntimeDigest);
  assert.equal(built.sourceDigest, untracked.sourceDigest);
  await writeFile(join(cwd, ".env"), "SYNTHETIC_PRIVATE_MARKER=not-a-key\n");
  assert.deepEqual(await captureSourceProvenance(cwd), built);
  assert.ok(!JSON.stringify(built).includes("SYNTHETIC_PRIVATE_MARKER"));
});
