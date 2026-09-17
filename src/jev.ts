import { createHash } from "node:crypto";
import type { JevProvider } from "./config.js";
import { evaluateGateway } from "./gateway.js";

export type Question =
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }
  | { type: "choice"; instructions: string; criteria: Record<string, string | null> };
export type Questions = Record<string, Question>;
export type Answer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number };
export type FallbackReason = "missing_key" | "timeout" | "cancelled" | "invalid_response" | "input_limit" | "network_error" | "cooldown" | `http_${number}`;
export type JevResult =
  | { status: "ok"; answers: Record<string, Answer>; model: string; latencyMs: number; inputTokens: number; outputTokens: number; cached: boolean }
  | { status: "fallback"; reason: FallbackReason; latencyMs: number };
export interface JevOptions {
  provider?: JevProvider;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  timeoutMs?: number;
  maxRequestBytes?: number;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function probability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validateResponse(value: unknown, questions: Questions, gateway = false): { answers: Record<string, Answer>; model: string; inputTokens: number; outputTokens: number } | undefined {
  if (!object(value) || !object(value.answers) || typeof value.model !== "string" || !object(value.usage)) return;
  const decimals = gateway && object(value.rounding) ? value.rounding.probabilityDecimals : undefined;
  if (decimals !== undefined && (typeof decimals !== "number" || !Number.isInteger(decimals) || decimals < 0 || decimals > 15)) return;
  const { input_tokens: inputTokens, output_tokens: outputTokens } = value.usage;
  if (typeof inputTokens !== "number" || !Number.isSafeInteger(inputTokens) || inputTokens < 0 || typeof outputTokens !== "number" || !Number.isSafeInteger(outputTokens) || outputTokens < 0) return;
  const answers: Record<string, Answer> = {};
  for (const [key, question] of Object.entries(questions)) {
    const answer = value.answers[key];
    if (!object(answer) || answer.type !== question.type) return;
    if (question.type === "noul") {
      if (!probability(answer.noul)) return;
      answers[key] = { type: "noul", noul: answer.noul };
    } else {
      if (typeof answer.choice !== "string" || !Object.hasOwn(question.criteria, answer.choice) || !probability(answer.confidence) || !object(answer.probabilities)) return;
      const options = Object.keys(question.criteria);
      if (Object.keys(answer.probabilities).length !== options.length) return;
      const probabilities: Record<string, number> = {};
      for (const option of options) {
        const p = answer.probabilities[option];
        if (!probability(p)) return;
        probabilities[option] = p;
      }
      const sum = Object.values(probabilities).reduce((a, b) => a + b, 0);
      // Match AI SDK's declared rounding allowance without renormalizing values.
      const tolerance = gateway ? 1e-6 + options.length * (typeof decimals === "number" ? 0.5 * 10 ** -decimals : 0) : 0.01 + 1e-6;
      if (Math.abs(sum - 1) > tolerance) return;
      const highest = Math.max(...Object.values(probabilities));
      if (highest - (probabilities[answer.choice] ?? 0) > 0.000001) return;
      answers[key] = { type: "choice", choice: answer.choice, confidence: answer.confidence, probabilities };
    }
  }
  return { answers, model: value.model, inputTokens, outputTokens };
}

/** Bounded decision transport. It never retries on the agent's critical path. */
export class JevClient {
  private readonly options: JevOptions;
  private readonly cache = new Map<string, { expires: number; result: Extract<JevResult, { status: "ok" }> }>();
  private failures = 0;
  private cooldownUntil = 0;

  constructor(options: JevOptions) { this.options = options; }

  async evaluate(state: unknown, questions: Questions, signal?: AbortSignal): Promise<JevResult> {
    const start = performance.now();
    const fallback = (reason: FallbackReason): JevResult => ({ status: "fallback", reason, latencyMs: Math.round(performance.now() - start) });
    if (signal?.aborted) return fallback("cancelled");
    if (!this.options.apiKey) return fallback("missing_key");
    const body = JSON.stringify({ model: this.options.model ?? (this.options.provider === "vercel" ? "typesafe-ai/jev" : "jev-latest"), state, questions });
    if (Buffer.byteLength(body) > (this.options.maxRequestBytes ?? 90_000)) return fallback("input_limit");
    const key = createHash("sha256").update(body).digest("hex");
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return { ...structuredClone(cached.result), cached: true, latencyMs: Math.round(performance.now() - start) };
    this.cache.delete(key);
    if (this.cooldownUntil > Date.now()) return fallback("cooldown");
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), this.options.timeoutMs ?? 1800);
    const combined = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
    let outcome: JevResult;
    let transportFailure: FallbackReason | undefined;
    let responseReceived = false;
    const boundedFetch: typeof fetch = async (input, init) => {
      if (typeof init?.body !== "string" || Buffer.byteLength(init.body) > (this.options.maxRequestBytes ?? 90_000)) {
        transportFailure = "input_limit";
        throw new Error("Request limit exceeded.");
      }
      const response = await fetch(input, { ...init, redirect: "error", signal: combined });
      responseReceived = true;
      if (!response.ok) {
        transportFailure = `http_${response.status}`;
        await response.body?.cancel();
        throw new Error("Decision service request failed.");
      }
      const reader = response.body?.getReader();
      if (!reader) { transportFailure = "invalid_response"; throw new Error("Missing response."); }
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        if (bytes > 1_000_000) {
          transportFailure = "invalid_response";
          await reader.cancel();
          throw new Error("Response limit exceeded.");
        }
        chunks.push(chunk.value);
      }
      return new Response(Buffer.concat(chunks), { status: response.status, headers: response.headers });
    };
    try {
      const parsed: unknown = this.options.provider === "vercel"
        ? await evaluateGateway(this.options, state, questions, combined, boundedFetch)
        : await (await boundedFetch(this.options.endpoint ?? "https://api.typesafe.ai/v1/systemone", {
            method: "POST", headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" }, body,
          })).json();
      const valid = validateResponse(parsed, questions, this.options.provider === "vercel");
      if (combined.aborted) outcome = fallback(signal?.aborted ? "cancelled" : "timeout");
      else if (!valid) outcome = fallback("invalid_response");
      else {
        outcome = { status: "ok", ...valid, latencyMs: Math.round(performance.now() - start), cached: false };
        if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { expires: Date.now() + 300_000, result: structuredClone(outcome) });
      }
    } catch {
      outcome = fallback(signal?.aborted ? "cancelled" : timeout.signal.aborted ? "timeout" : transportFailure ?? (responseReceived ? "invalid_response" : "network_error"));
    } finally { clearTimeout(timer); }
    if (outcome.status === "ok") this.failures = 0;
    else if (outcome.reason !== "cancelled" && outcome.reason !== "input_limit") {
      this.failures++;
      if (this.failures >= 3) { this.cooldownUntil = Date.now() + 30_000; this.failures = 0; }
    }
    return outcome;
  }
}
