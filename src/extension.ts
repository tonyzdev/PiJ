import { readFile, stat } from "node:fs/promises";
import type { ExtensionContext, ExtensionFactory } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import type { DecisionMode, PijConfig } from "./config.js";
import { DecisionEngine, type SkillCandidate } from "./decisions.js";
import { JevClient } from "./jev.js";
import { retrieveCode, type CodeCandidate } from "./search.js";
import { DecisionJournal } from "./telemetry.js";
import { cleanText, cleanDisplayText, formatDecisions, header, statusText } from "./ui.js";

export function createPijExtension(config: PijConfig): ExtensionFactory {
  return (pi) => {
    let mode: DecisionMode = config.mode;
    let request = "";
    let skills: SkillCandidate[] = [];
    let skillPending = false;
    let skillAdvice: string | undefined;
    let failuresThisRun = 0;
    let run = new AbortController();
    let context: ExtensionContext | undefined;
    let unsubscribeInput: (() => void) | undefined;
    const journal = new DecisionJournal(config.home);
    const client = new JevClient(config);
    const update = () => context?.ui.setStatus("pij", cleanText(statusText(config, mode, journal, journal.recent().at(-1))));
    const engineFor = (decisionMode: DecisionMode) => new DecisionEngine(client, async (observation) => { await journal.record(decisionMode, observation); update(); });
    const signalFor = (signal?: AbortSignal) => signal ? AbortSignal.any([signal, run.signal]) : run.signal;

    pi.on("session_start", (_event, ctx) => {
      run.abort(); run = new AbortController(); request = ""; failuresThisRun = 0;
      skillPending = false; skillAdvice = undefined; skills = [];
      context = ctx;
      unsubscribeInput?.();
      if (ctx.mode === "tui") {
        ctx.ui.setTitle("PiJ");
        ctx.ui.setHeader((_tui, theme) => ({ render: (width) => header(theme, width, config), invalidate() {} }));
        unsubscribeInput = ctx.ui.onTerminalInput((data) => { if (data === "\x1b" || data === "\x03") run.abort(); return undefined; });
      }
      update();
    });
    pi.on("session_shutdown", async () => { run.abort(); unsubscribeInput?.(); unsubscribeInput = undefined; context = undefined; await journal.flush(); });

    pi.registerCommand("pij", {
      description: "PiJ status, decisions, and Jev modes: assist | observe | off",
      getArgumentCompletions: (prefix) => ["status", "decisions", "assist", "observe", "off"].filter((item) => item.startsWith(prefix)).map((value) => ({ value, label: value })),
      handler: async (args, ctx) => {
        const command = args.trim() || "status";
        if (command === "assist" || command === "observe" || command === "off") {
          run.abort(); run = new AbortController(); skillAdvice = undefined; skillPending = false; mode = command; update();
          ctx.ui.notify(`PiJ mode: ${mode}. ${mode === "assist" ? "Jev suggestions can assist this session." : mode === "observe" ? "Decisions are recorded without changing recommendations or ranking." : "No Jev requests will be made."}`, "info");
        } else if (command === "decisions") ctx.ui.notify(formatDecisions(journal.recent().slice(-8)), "info");
        else if (command === "status") {
          const stats = journal.summary();
          ctx.ui.notify([
            "PiJ · Jev decisions + Pi execution",
            `Mode: ${mode} · Provider: ${config.provider} · Jev: ${config.apiKey ? cleanText(config.model) : "not connected"}`,
            "Capabilities: skill suggestions · pij_search ranking · failure triage",
            `Decisions: ${stats.calls} · cache hits: ${stats.cacheHits} · fallbacks: ${stats.fallbacks}`,
            `Jev input tokens: ${stats.inputTokens} · total decision wait: ${stats.latencyMs}ms`,
            `Local decision metadata: ${cleanText(config.home)}/decisions${journal.writeFailed ? " (write failed)" : ""}`,
            "Use /pij assist, /pij observe, /pij off, or /pij decisions.",
          ].join("\n"), "info");
        } else ctx.ui.notify("Usage: /pij [status|decisions|assist|observe|off]", "warning");
      },
    });

    pi.on("before_agent_start", (event, ctx) => {
      context = ctx;
      run.abort(); run = new AbortController(); failuresThisRun = 0; request = event.prompt;
      skills = event.systemPromptOptions.skills ?? [];
      skillAdvice = undefined;
      skillPending = mode !== "off" && !/^\/skill:|<skill(?:\s|>)/.test(event.prompt);
      update();
    });

    // Pi does not create its run signal until after before_agent_start. Await
    // decisions only in context, where TUI, SDK and RPC abort all reach fetch.
    pi.on("context", async (event, ctx) => {
      const signal = signalFor(ctx.signal);
      if (skillPending && ctx.signal && !signal.aborted) {
        skillPending = false;
        const currentMode = mode;
        const suggestions = await engineFor(currentMode).recommendSkills(request, skills, async (path) => {
          if ((await stat(path)).size > 200_000) throw new Error("Skill too large for advisory inspection.");
          return readFile(path, "utf8");
        }, signal);
        if (currentMode === "assist" && mode === currentMode && !signal.aborted && suggestions.length) {
          skillAdvice = `PiJ skill suggestion (advisory): consider loading ${suggestions.map((skill) => `${JSON.stringify(skill.name)} at ${JSON.stringify(skill.filePath)}`).join("; ")}. Verify that each skill matches the user's request. The full skill roster remains available. User-selected skills take precedence.`;
        }
      }
      if (mode !== "assist" || signal.aborted || !skillAdvice) return;
      return { messages: [...event.messages, { role: "custom", customType: "pij-skills", display: false, content: skillAdvice, timestamp: Date.now() }] };
    });

    pi.on("tool_result", async (event, ctx) => {
      if (!event.isError || mode === "off" || failuresThisRun >= 2 || event.toolName === "pij_search") return;
      context = ctx; failuresThisRun++;
      const signal = signalFor(ctx.signal);
      const currentMode = mode;
      const output = event.content.filter((part) => part.type === "text").map((part) => part.text).join("\n");
      const suggestion = await engineFor(currentMode).triage(event.toolName, output, request, signal);
      if (currentMode !== "assist" || mode !== currentMode || signal.aborted || !suggestion) return;
      return { content: [...event.content, { type: "text" as const, text: `\n${suggestion}` }] };
    });

    pi.registerTool({
      name: "pij_search", label: "PiJ Search",
      description: "Search source code using literal patterns, then use Jev to rank exact excerpts for a natural-language question. Searches a bounded candidate set; excluded/unreturned files may still matter. Read the full code before editing. Falls back to lexical order when Jev is unavailable.",
      promptSnippet: "Find and rank source excerpts relevant to a coding question",
      promptGuidelines: ["Use pij_search for an initial code shortlist when useful; use read/bash to expand the search and verify full context. Relevance scores are suggestions, not correctness evidence."],
      parameters: Type.Object({
        query: Type.String({ description: "What you need to locate or understand", minLength: 1, maxLength: 2000 }),
        patterns: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { description: "1–8 literal identifiers or phrases to retrieve (OR)", minItems: 1, maxItems: 8 }),
        path: Type.Optional(Type.String({ description: "Source directory inside the current project" })),
        glob: Type.Optional(Type.String({ description: "Optional file glob such as *.ts" })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "Excerpts returned; default 8" })),
      }),
      async execute(_id, params, signal, onUpdate, ctx) {
        context = ctx;
        onUpdate?.({ content: [{ type: "text", text: "Searching source files…" }], details: {} });
        const found = await retrieveCode({ cwd: ctx.cwd, patterns: params.patterns, path: params.path, glob: params.glob, signal });
        const currentMode = mode;
        let ranked: CodeCandidate[] = found.candidates;
        if (mode !== "off") {
          const decisionSignal = signalFor(signal);
          const evaluated = await engineFor(currentMode).rankCode(params.query, found.candidates, decisionSignal);
          if (currentMode === "assist" && mode === currentMode && !decisionSignal.aborted) ranked = evaluated;
        }
        signal?.throwIfAborted();
        const shown = ranked.slice(0, params.limit ?? 8);
        const reranked = shown.some((candidate) => candidate.relevance !== undefined);
        const title = `${shown.length} of ${found.candidates.length} retrieved excerpts · ${reranked ? "Jev ranked" : "lexical order"}${found.truncated ? " · candidate limit reached" : ""}`;
        const blocks = shown.map((candidate) => `${candidate.path}:${candidate.line}${candidate.relevance === undefined ? "" : ` · relevance ${candidate.relevance.toFixed(2)}`}\n${candidate.excerpt.split("\n").map((line, index) => `${candidate.startLine + index}: ${line}`).join("\n")}`);
        const note = shown.length < found.candidates.length || found.truncated ? "\nMore matches may exist. Narrow the patterns/path or use bash/rg to expand the search." : "";
        return { content: [{ type: "text", text: [title, ...blocks].join("\n\n") + note }], details: { count: shown.length, retrieved: found.candidates.length, truncated: found.truncated, reranked } };
      },
      renderCall: (args, theme) => new Text(`${theme.fg("accent", theme.bold("PiJ Search"))} ${cleanText(args.query ?? "")}`, 0, 0),
      renderResult: (result, options, theme) => {
        const text = cleanDisplayText(result.content.filter((part) => part.type === "text").map((part) => part.text).join("\n"));
        return new Text(options.expanded ? text : theme.fg("muted", text.split("\n")[0] ?? ""), 0, 0);
      },
    });
  };
}
