import { access } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { readRecentDecisions } from "./telemetry.js";

const VERSION = "0.1.0";
const help = `PiJ ${VERSION} — a terminal coding agent with Jev decisions

Usage
  pij                         Start an interactive coding session
  pij "your task"             Start with a task
  pij -p "your task"          Run once and print the result
  pij --jev-mode observe      Evaluate Jev without applying suggestions
  pij --jev-mode off          Use the coding agent without Jev requests
  pij doctor [--json]         Check local setup (no network calls)
  pij decisions [--json]      Inspect recent local decision metadata
  pij --pi-help               Show all inherited Pi options

Inside a session
  /login                      Connect your coding-model provider
  /model                      Choose a coding model
  /pij                        Show Jev status, modes and statistics
  /pij assist|observe|off      Change mode for this session
  /pij decisions              Show recent decisions
  /resume                     Resume a previous PiJ session

Setup
  TYPESAFE_API_KEY             Jev API key; optional for normal coding
  AI_GATEWAY_API_KEY           Or use Jev through Vercel AI Gateway
  PIJ_JEV_PROVIDER             typesafe | vercel (auto-detected from keys)
  PIJ_HOME                    Config/session directory (~/.pij/agent)
  PIJ_MODE                    assist (default), observe, or off
  PIJ_JEV_MODEL               jev-latest or typesafe-ai/jev by provider
  PIJ_JEV_TIMEOUT_MS          Per-call deadline: 1800ms (default)

Jev assists skill selection, code search ranking, and failure triage.
Your coding model remains responsible for reasoning and writing code.
Prompts, selected skill text, source excerpts, and failed tool output may
be sent to TypeSafe (via Vercel when selected) in assist/observe mode.
Local decision logs contain metadata only. Off mode sends no Jev requests.
`;

async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }

export async function runCli(args: string[]): Promise<void> {
  const env = { ...process.env };
  const forwarded: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") { forwarded.push(...args.slice(i)); break; }
    if (arg === "--jev-mode") {
      const next = args[++i];
      if (!next) throw new Error("--jev-mode requires assist, observe, or off.");
      env.PIJ_MODE = next;
    } else forwarded.push(arg);
  }
  if (forwarded[0] === "--help" || forwarded[0] === "-h") { console.log(help); return; }
  if (forwarded[0] === "--version" || forwarded[0] === "-v") { console.log(`PiJ ${VERSION} (Pi 0.85.1)`); return; }
  const config = loadConfig(env);
  if (forwarded[0] === "doctor") {
    let rg = false;
    try { await promisify(execFile)("rg", ["--version"], { timeout: 2000 }); rg = true; } catch { /* Report missing dependency below. */ }
    const authFile = await exists(join(config.home, "auth.json"));
    const providerKeysPresent = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENROUTER_API_KEY", "GROQ_API_KEY", "AI_GATEWAY_API_KEY"].filter((key) => !!env[key]?.trim());
    const data = { version: VERSION, piVersion: "0.85.1", node: process.version, home: config.home, mode: config.mode, ripgrep: rg, jev: { provider: config.provider, keyPresent: !!config.apiKey, model: config.model, timeoutMs: config.timeoutMs }, codingModel: { authFilePresent: authFile, providerKeyNamesPresent: providerKeysPresent }, networkChecked: false };
    if (forwarded.includes("--json")) console.log(JSON.stringify(data, null, 2));
    else console.log([
      `PiJ ${VERSION} · local setup`, "",
      `Node        ${process.version}`,
      `ripgrep     ${rg ? "ready" : "missing — install rg for pij_search"}`,
      `Home        ${config.home}`,
      `Jev         ${config.provider} · ${config.apiKey ? "key present (not validated)" : `not connected — set ${config.provider === "vercel" ? "AI_GATEWAY_API_KEY" : "TYPESAFE_API_KEY"}`}`,
      `Mode        ${config.mode}`,
      `Model auth  ${authFile || providerKeysPresent.length ? "configuration present (not validated)" : "not connected — start pij, then /login"}`,
      "", "No network calls were made. Missing Jev credentials leave normal coding available.",
    ].join("\n"));
    return;
  }
  if (forwarded[0] === "decisions") {
    const records = await readRecentDecisions(config.home);
    if (forwarded.includes("--json")) console.log(JSON.stringify(records, null, 2));
    else {
      const { formatDecisions } = await import("./ui.js");
      console.log(formatDecisions(records));
    }
    return;
  }
  if (forwarded[0] === "update" && forwarded.includes("--self")) throw new Error("Update PiJ from its source checkout and rebuild. Pi's self-updater does not update PiJ.");

  // Pi's public entry point retains its project-trust, login, cancellation and session flows.
  // Set the isolated home before loading the SDK and any of its configuration consumers.
  process.env.PI_CODING_AGENT_DIR = config.home;
  if (env.PIJ_HOME) process.env.PIJ_HOME = config.home;
  process.env.PI_SKIP_VERSION_CHECK ??= "1";
  const [{ main }, { createPijExtension }] = await Promise.all([
    import("@earendil-works/pi-coding-agent"), import("./extension.js"),
  ]);
  await main(forwarded[0] === "--pi-help" ? ["--help"] : forwarded, {
    extensionFactories: [{ name: "pij", factory: createPijExtension(config), hidden: true }],
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).catch((error: unknown) => { console.error(`PiJ: ${error instanceof Error ? error.message : "Unable to start."}`); process.exitCode = 1; });
}
