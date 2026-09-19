# PiJ

**A coding agent with Jev in the loop.**

[![CI](https://github.com/tonyzdev/PiJ/actions/workflows/ci.yml/badge.svg)](https://github.com/tonyzdev/PiJ/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

English | [简体中文](README.zh-CN.md)

PiJ is a terminal coding agent built on [Pi](https://github.com/earendil-works/pi), with [Jev](https://typesafe.ai/) helping select skills, rank code excerpts, and diagnose tool failures. Your coding model handles reasoning, edits, and tool use. Jev evaluates small, typed questions along the way.

**Jev for decisions. Your coding model for code.**

```text
  PiJ  v0.1.0   Fast judgment. Deliberate code.
  Jev decisions · Pi execution · your coding model

  /pij status & modes    /model coding model    /login connect
```

Early alpha. The integration is runnable, and real Jev access through Vercel Gateway has been verified. On SWE-bench django tasks and on repositories the model has never seen, PiJ makes fewer tool calls and reaches the right file sooner than plain Pi, at the same resolve rate; see [Evidence](#evidence) for the figure and the caveats, including cost.

## What Jev does

| In the coding workflow | Jev's role | What PiJ preserves |
| --- | --- | --- |
| Starting a task | Shortlist skills, then check their instructions for relevance | The full skill roster and explicit user selections |
| Finding code | Rank actual file excerpts retrieved by `pij_search` | Exact paths, line numbers, source text, and retrieval limits |
| Investigating a failed tool | Classify the failure and suggest what to check next | Original output and error status; no automatic retry or permission escalation |

Suggestions stay advisory. Missing credentials, service failures, malformed answers, or timeouts leave normal coding and lexical search available. Jev scores never stand in for compilation, tests, or task acceptance.

```mermaid
flowchart LR
    User[Your task] --> PiJ
    PiJ <--> Jev["Jev: skills, ranking, failure triage"]
    PiJ <--> Model["Coding model: reasoning and code"]
    PiJ --> Pi["Pi runtime: files, shell, sessions"]
```

## Evidence

![Every tool call of Pi and PiJ + Jev on 13 tasks in unfamiliar repositories](docs/figures/execution-strips-unfamiliar-pro.png)

Thirteen SWE-bench-style tasks built from pull requests in repositories created after mid-2025 — outside the main model's training data — each run once by plain Pi and once by PiJ + Jev with deepseek-v4-pro. One block per tool call. The PiJ strip is shorter on 12 of 13 tasks (−25% calls, −22% prompt tokens) and opens on a file the reference patch edits, because Jev ranks the repository's files before the first call and the briefing hands the top one to the model; plain Pi reaches that file at a median of the third call. The resolve rate is unchanged, 4 vs 4: Jev shortens the path, not the outcome, and at DeepSeek prices its ranking costs more per task than the main-model tokens it saves.

The same picture on 20 SWE-bench Verified django tasks (shorter on 15 of 20, −16%) and with deepseek-v4-flash, the retrieval measurements behind it, and the cost ledger: [unfamiliar repositories](docs/unfamiliar-repo-experiment.md) · [django](docs/swebench-agent-experiment.md) · [retrieval recall](docs/swebench-retrieval-experiment.md).

## Quick start

Requires **Node.js 22.19+**, npm, and [ripgrep](https://github.com/BurntSushi/ripgrep) (`rg`).

```sh
git clone https://github.com/tonyzdev/PiJ.git
cd PiJ
npm ci --ignore-scripts
npm run build
npm start
```

Use `/login` to connect a coding-model provider, then `/model` to select a model. PiJ keeps its authentication, settings, and sessions in `~/.pij/agent`, separate from Pi's default home.

### Connect Jev

Copy `.env.example` to `.env` and configure **one** of these routes:

**Vercel AI Gateway**

```dotenv
PIJ_JEV_PROVIDER=vercel
AI_GATEWAY_API_KEY=your_gateway_key
```

**TypeSafe directly**

```dotenv
PIJ_JEV_PROVIDER=typesafe
TYPESAFE_API_KEY=your_typesafe_key
```

Start with the environment file explicitly loaded:

```sh
node --env-file=.env bin/pij.mjs
```

`npm start` does **not** automatically load `.env`. Run `/pij` to inspect the selected provider and decision status. `/login` configures the coding model; Jev credentials currently come from the process environment.

Gateway uses the experimental AI SDK evaluation API with `typesafe-ai/jev`. It does not require deploying PiJ to Vercel. To use Gateway credits for your coding model as well, choose a model under **`vercel-ai-gateway`** in `/model`. Selecting an `anthropic` model uses that provider's credentials and access rules.

With only a Gateway key set, PiJ selects Vercel automatically. With both keys set, TypeSafe is the default; `PIJ_JEV_PROVIDER` overrides this choice. Credentials are never reused across the two routes.

### Run in another project

Install the built checkout as a local command:

```sh
npm link --ignore-scripts
cd /path/to/your/project
pij
```

Set credentials in the launch environment, or load your environment file explicitly with Node. The npm package has not been published; install from this repository.

## Modes and commands

| Mode | Behavior |
| --- | --- |
| `assist` | Evaluate and apply skill advice, search ranking, and failure hints |
| `observe` | Evaluate and record metadata without applying results; still sends requests and incurs provider usage |
| `off` | Make no Jev requests |

Switch with `/pij assist`, `/pij observe`, or `/pij off`. Session switches are temporary; set `PIJ_MODE` or pass `--jev-mode` to choose the launch mode.

| Command | Purpose |
| --- | --- |
| `pij` or `pij "your task"` | Interactive coding session |
| `pij -p "your task"` | Run once and print the result |
| `pij doctor` | Local setup checks; no network request or credential validation |
| `pij decisions` | Inspect recent decision metadata |
| `pij --pi-help` | All inherited Pi CLI options |
| `/pij`, `/pij decisions` | In-session status and recent decisions |
| `/login`, `/model`, `/resume` | Coding-model login, selection, and session resume |

## Configuration

| Variable | Default / purpose |
| --- | --- |
| `PIJ_HOME` | `~/.pij/agent` |
| `PIJ_MODE` | `assist` |
| `PIJ_JEV_PROVIDER` | `typesafe` or `vercel`, selected from available keys |
| `TYPESAFE_API_KEY` | TypeSafe route credential |
| `AI_GATEWAY_API_KEY` | Vercel route credential |
| `PIJ_JEV_MODEL` | `jev-latest` for TypeSafe; `typesafe-ai/jev` for Vercel |
| `PIJ_JEV_TIMEOUT_MS` | Per-call deadline: `1800`; allowed range 50–30000 |
| `PIJ_SOURCE_BRIEFING` | Experimental initial source evidence: `0` (default) or `1` |
| `PIJ_JEV_ENDPOINT` | TypeSafe API URL, or Vercel SDK base URL; normally leave unset |

Pi project resources in `.pi/` and `AGENTS.md` remain supported. PiJ retains Pi's project-extension trust flow. It uses Pi's public SDK, pinned to 0.85.1.

## Data and reliability

In `assist` and `observe`, task text, candidate skill instructions, retrieved source excerpts, and failed tool output may be sent to TypeSafe, through Vercel when selected. Gateway evaluation requests set `zeroDataRetention: true`. Normal coding-model context follows that provider's configuration separately.

- Jev requests have a total deadline, cancellation, strict response validation, size limits, and no client retries. Successful answers are cached in memory for five minutes; repeated service failures trigger a short cooldown.
- Local decision logs contain mode, stage, latency, token use, fallback reason, and the actual Pi session/user-message entry IDs. These IDs link a decision to its user prompt across model/tool rounds; old records without IDs remain readable. They exclude prompts, answers, source, and tool output. **Pi session transcripts separately retain normal conversation and tool content.**
- `pij_search` respects ignore files and excludes hidden files, common credential files, dependencies, and build output. It retrieves a bounded shortlist and reports truncation. These filters do not detect secrets embedded in source code.
- Omit `patterns` in `pij_search` to discover source windows from a natural-language question. Discovery reads at most 1,000 eligible files, 256 KiB per file and 4 MiB total, then offers at most 32 excerpts for ranking. Files beyond the enumeration budget are not searched.
- `PIJ_SOURCE_BRIEFING=1` optionally provides up to three files' exact excerpts before the coding model starts — the top file whole when Jev's relevance is at least 0.8 and it fits Pi's 50 KB read bound. Assist uses Jev ranking; off and observe use BM25. Each new prompt refreshes the snapshot; edits can make it stale. This may add latency and source disclosure to the configured Jev provider. It is disabled by default; in the [evidence](#evidence) above it is what shortens the strips, and it has not changed the resolve rate.
- Jev is advisory. Model confidence and relevance scores are not probabilities that a code change is correct.

## Development and evidence

```sh
npm run check
npm test
npm run build
```

Tests exercise the actual Pi runtime with local HTTP model fixtures and real ripgrep, including both Jev transports and all three modes. They require no provider credentials. CI also checks a packed installation.

See the [verification record](docs/verification.md), [architecture](docs/design.md), and [contribution guide](CONTRIBUTING.md). Baseline comparisons should measure task success, incorrect skill loads, relevant-code misses, wall time, token use, and cost per successful task.

## Acknowledgments

PiJ builds on [Pi](https://github.com/earendil-works/pi) and integrates [TypeSafe's Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev), directly or through [Vercel AI Gateway](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway). PiJ is an independent project.

MIT licensed. Dependencies retain their own licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).
