import assert from "node:assert/strict";
import test from "node:test";
import { DecisionEngine } from "../src/decisions.js";
import type { JevResult, Questions } from "../src/jev.js";

const ok = (answers: Extract<JevResult, { status: "ok" }>["answers"]): JevResult => ({ status: "ok", answers, model: "fixture", inputTokens: 10, outputTokens: 0, cached: false, latencyMs: 1 });

test("skill advice is drawn from eligible candidates and only after body verification", async () => {
  let phase = 0;
  const engine = new DecisionEngine({ evaluate: async (_state: unknown, questions: Questions) => {
    phase++;
    if (phase === 1) {
      const q = questions.selection;
      assert.equal(q?.type, "choice");
      if (q?.type === "choice") assert.equal(Object.keys(q.criteria).length, 2);
      return ok({ needed: { type: "noul", noul: 0.95 }, selection: { type: "choice", choice: "s1", probabilities: { s0: 0.1, s1: 0.9 }, confidence: 0.8 } });
    }
    return ok({ s1: { type: "noul", noul: 0.9 }, s0: { type: "noul", noul: 0.1 } });
  } });
  const result = await engine.recommendSkills("Review animation", [
    { name: "slides", description: "Create slide decks", filePath: "/skills/slides.md", disableModelInvocation: false },
    { name: "motion", description: "Review animations", filePath: "/skills/motion.md", disableModelInvocation: false },
    { name: "hidden", description: "manual only", filePath: "/skills/hidden.md", disableModelInvocation: true },
  ], async () => "Review motion using the code and user requirements.");
  assert.deepEqual(result.map((skill) => skill.name), ["motion"]);
  assert.equal(phase, 2);
});

test("uncertain or unavailable decisions produce no skill recommendation", async () => {
  const engine = new DecisionEngine({ evaluate: async () => ({ status: "fallback", reason: "timeout", latencyMs: 20 }) });
  const result = await engine.recommendSkills("test", [{ name: "a", description: "a", filePath: "/a" }], async () => "a");
  assert.deepEqual(result, []);
});

test("ranking preserves all candidate identities and falls back to original order", async () => {
  const candidates = [
    { id: "c0", path: "a.ts", line: 1, startLine: 1, excerpt: "unrelated" },
    { id: "c1", path: "b.ts", line: 3, startLine: 2, excerpt: "refresh token" },
  ];
  const engine = new DecisionEngine({ evaluate: async () => ok({ c0: { type: "noul", noul: 0.1 }, c1: { type: "noul", noul: 0.9 } }) });
  assert.deepEqual((await engine.rankCode("refresh token", candidates)).map((x) => x.id), ["c1", "c0"]);
  const unavailable = new DecisionEngine({ evaluate: async () => ({ status: "fallback", reason: "timeout", latencyMs: 10 }) });
  assert.deepEqual(await unavailable.rankCode("refresh token", candidates), candidates);
});

test("uncertain failure classification does not invent a root cause", async () => {
  const engine = new DecisionEngine({ evaluate: async () => ok({ category: { type: "choice", choice: "unknown", probabilities: { unknown: 0.55, network: 0.45 }, confidence: 0.1 } }) });
  assert.equal(await engine.triage("bash", "failed", "fix tests"), undefined);
});
