import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DecisionJournal, readRecentDecisions } from "../src/telemetry.js";

test("journals only decision metadata, including cache and fallback state", async (t) => {
  const home = await mkdtemp(join(tmpdir(), "pij-journal-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const journal = new DecisionJournal(home);
  await journal.record("assist", { kind: "skill_shortlist", questionCount: 2, result: {
    status: "ok", model: "jev-test", answers: { secret_source: { type: "noul", noul: 0.9 } }, latencyMs: 42, cached: false, inputTokens: 200, outputTokens: 0,
  } });
  await journal.record("observe", { kind: "code_rank", questionCount: 3, result: { status: "fallback", reason: "timeout", latencyMs: 100 } });
  const entries = await readRecentDecisions(home);
  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.kind, "skill_shortlist");
  assert.equal(entries[1]?.reason, "timeout");
  const paths = await readdir(join(home, "decisions"));
  const content = await readFile(join(home, "decisions", paths[0]!), "utf8");
  assert.ok(!content.includes("secret_source"));
  assert.equal(journal.summary().inputTokens, 200);
  assert.equal(journal.summary().fallbacks, 1);
});
