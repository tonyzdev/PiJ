import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DecisionMode } from "./config.js";
import type { DecisionKind, DecisionObservation } from "./decisions.js";

export interface DecisionRecord {
  at: string;
  mode: DecisionMode;
  kind: DecisionKind;
  status: "ok" | "fallback";
  latencyMs: number;
  questionCount: number;
  reason?: string;
  model?: string;
  cached?: boolean;
  inputTokens?: number;
  outputTokens?: number;
}

export class DecisionJournal {
  private readonly file: string;
  private pending: Promise<void> = Promise.resolve();
  private bytes = 0;
  private readonly records: DecisionRecord[] = [];
  private totals = { calls: 0, fallbacks: 0, cacheHits: 0, inputTokens: 0, latencyMs: 0 };
  writeFailed = false;

  constructor(home: string) { this.file = join(home, "decisions", `${Date.now()}-${randomUUID()}.jsonl`); }

  async record(mode: DecisionMode, observation: DecisionObservation): Promise<void> {
    const { result, kind, questionCount } = observation;
    // Deliberate allowlist: never serialize answers, source, prompts or raw errors.
    const entry: DecisionRecord = {
      at: new Date().toISOString(), mode, kind, status: result.status, latencyMs: result.latencyMs, questionCount,
      ...(result.status === "fallback" ? { reason: result.reason } : {
        model: result.model.slice(0, 100), cached: result.cached, inputTokens: result.cached ? 0 : result.inputTokens, outputTokens: result.cached ? 0 : result.outputTokens,
      }),
    };
    this.records.push(entry);
    if (this.records.length > 50) this.records.shift();
    this.totals.calls++;
    this.totals.fallbacks += Number(entry.status === "fallback");
    this.totals.cacheHits += Number(entry.cached === true);
    this.totals.inputTokens += entry.inputTokens ?? 0;
    this.totals.latencyMs += entry.latencyMs;
    const line = `${JSON.stringify(entry)}\n`;
    this.bytes += Buffer.byteLength(line);
    if (this.bytes > 2_000_000) return;
    this.pending = this.pending.then(async () => {
      await mkdir(join(this.file, ".."), { recursive: true, mode: 0o700 });
      await appendFile(this.file, line, { mode: 0o600 });
    }).catch(() => { this.writeFailed = true; });
    await this.pending;
  }

  summary() { return { ...this.totals }; }
  recent() { return [...this.records]; }
  async flush() { await this.pending; }
}

export async function readRecentDecisions(home: string, limit = 20): Promise<DecisionRecord[]> {
  const directory = join(home, "decisions");
  const files = (await readdir(directory).catch(() => [] as string[])).filter((name) => /^\d+-[a-f0-9-]+\.jsonl$/.test(name)).sort().slice(-10);
  const records: DecisionRecord[] = [];
  for (const file of files) {
    const path = join(directory, file);
    const size = (await stat(path)).size;
    const handle = await open(path, "r");
    try {
      const start = Math.max(0, size - 64_000);
      const buffer = Buffer.alloc(size - start);
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
      if (start > 0) lines.shift();
      for (const line of lines) {
        try {
          const record = JSON.parse(line) as DecisionRecord;
          if (typeof record.at === "string" && ["ok", "fallback"].includes(record.status) && typeof record.kind === "string" && typeof record.latencyMs === "number") records.push(record);
        } catch { /* Partial last lines from active sessions are ignored. */ }
      }
    } finally { await handle.close(); }
  }
  return records.sort((a, b) => a.at.localeCompare(b.at)).slice(-limit);
}
