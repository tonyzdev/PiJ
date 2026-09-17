import { realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createBashToolDefinition, type ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { checkWorkspacePath, sandboxProfile, shellEnvironment, shellQuote } from "./sandbox.js";
import { installEvalBudget, validateBudgets } from "./budget.js";

/** Explicitly loaded only by the real-CLI dogfood runner, never shipped as a product extension. */
const control: ExtensionFactory = async (pi) => {
  const workspace = process.env.PIJ_EVAL_WORKSPACE;
  const statsPath = process.env.PIJ_EVAL_STATS;
  if (!workspace || !statsPath || process.platform !== "darwin") throw new Error("CLI evaluation requires a configured macOS task workspace.");
  const cwd = await realpath(workspace);
  // The repository's HTTP fixtures need loopback. External network remains denied.
  const profile = sandboxProfile(cwd, [await realpath(homedir())], { allowLoopback: true });
  const budget = installEvalBudget(pi, validateBudgets({
    turns: Number(process.env.PIJ_EVAL_TURNS ?? 36), seconds: Number(process.env.PIJ_EVAL_SECONDS ?? 360),
    tokens: Number(process.env.PIJ_EVAL_TOKENS ?? 180000), maxOutputTokens: Number(process.env.PIJ_EVAL_MAX_OUTPUT_TOKENS ?? 16384),
  }));
  pi.registerTool(createBashToolDefinition(cwd, {
    exposeSessionEnvironment: false,
    spawnHook: ({ command }) => ({ cwd, env: shellEnvironment(cwd), command: `/usr/bin/sandbox-exec -p ${shellQuote(profile)} /bin/bash --noprofile --norc -c ${shellQuote(command)}` }),
  }));
  pi.on("tool_call", async (event) => {
    if (["read", "write", "edit"].includes(event.toolName)) {
      const path = (event.input as { path?: unknown }).path;
      if (typeof path !== "string") return { block: true, reason: "A task workspace path is required." };
      try { await checkWorkspacePath(cwd, path); }
      catch { return { block: true, reason: "Evaluation file tools are restricted to the task workspace." }; }
    }
    if (event.toolName === "bash") {
      const input = event.input as { timeout?: number };
      input.timeout = Math.min(input.timeout ?? 45, 45);
    }
  });
  pi.on("session_shutdown", async () => {
    await writeFile(statsPath, JSON.stringify(budget.snapshot()), { mode: 0o600 });
  });
};
export default control;
