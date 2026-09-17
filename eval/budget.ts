import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export interface EvalBudgets { turns: number; seconds: number; tokens: number; maxOutputTokens: number }
export type BudgetReason = "requests" | "tokens";
export interface EvalUsage { input: number; output: number; cacheRead: number; cacheWrite: number; estimatedUsd: number }
export interface EvalBudgetSnapshot {
  budgets: EvalBudgets;
  requests: number;
  tokens: number;
  termination: "completed" | "budget";
  budgetReason?: BudgetReason;
  calls: Record<string, number>;
  usage: EvalUsage;
}

export function validateBudgets(budgets: EvalBudgets): EvalBudgets {
  for (const [name, value] of Object.entries(budgets)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${name} budget.`);
  }
  return { ...budgets };
}

/** Limit actual provider admission; throwing in Pi extension hooks does not stop a run. */
export function installEvalBudget(pi: ExtensionAPI, options: EvalBudgets) {
  const budgets = validateBudgets(options);
  let requests = 0;
  let tokens = 0;
  let budgetReason: BudgetReason | undefined;
  const calls: Record<string, number> = {};
  const usage: EvalUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estimatedUsd: 0 };
  const stopIfExhausted = (ctx: ExtensionContext): boolean => {
    const reason = requests >= budgets.turns ? "requests" : tokens >= budgets.tokens ? "tokens" : undefined;
    if (!reason) return false;
    budgetReason ??= reason;
    ctx.abort();
    return true;
  };

  // Runs before other context extensions, so an exhausted run does not spend on Jev either.
  pi.on("context", (_event, ctx) => { stopIfExhausted(ctx); });
  pi.on("before_provider_request", (event, ctx) => {
    if (stopIfExhausted(ctx) || ctx.signal?.aborted) return;
    const modelLimit = ctx.model?.maxTokens ?? budgets.maxOutputTokens;
    // Input usage is known only after a response. This is an admission/output bound,
    // not a promise that unknown future input tokens cannot exceed the total budget.
    const outputLimit = Math.min(budgets.maxOutputTokens, modelLimit, budgets.tokens - tokens);
    const payload = { ...(event.payload as Record<string, unknown>), temperature: 0 };
    const field = "max_completion_tokens" in payload ? "max_completion_tokens"
      : "max_output_tokens" in payload || ctx.model?.api === "openai-responses" ? "max_output_tokens" : "max_tokens";
    requests++;
    return { ...payload, [field]: outputLimit };
  });
  pi.on("tool_call", (event) => { calls[event.toolName] = (calls[event.toolName] ?? 0) + 1; });
  pi.on("turn_end", (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const reported = event.message.usage;
    tokens += reported.totalTokens;
    usage.input += reported.input;
    usage.output += reported.output;
    usage.cacheRead += reported.cacheRead;
    usage.cacheWrite += reported.cacheWrite;
    usage.estimatedUsd += reported.cost.total;
    // A final answer at the boundary still completes normally. A tool loop must
    // stop now, before Pi prepares another provider request or decision context.
    if (event.message.stopReason === "toolUse" || event.toolResults.length > 0) stopIfExhausted(ctx);
  });
  return {
    snapshot(): EvalBudgetSnapshot {
      return { budgets: { ...budgets }, requests, tokens, termination: budgetReason ? "budget" : "completed", ...(budgetReason ? { budgetReason } : {}), calls: { ...calls }, usage: { ...usage } };
    },
  };
}
