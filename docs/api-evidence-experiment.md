# Diagnostic: API-anchored dependency evidence

This evaluator-only experiment follows the failed completed-task comparison in
[session-mode evidence](session-mode-evidence-experiment.md). That selector
excluded declaration files and supplied doc windows whose traversal wording
did not establish the runtime order of `getBranch()`. The new hypothesis is
that linked declarations and implementations are a better unit for replacing
some of the main model's dependency navigation. Jev ranks relevance; it does
not resolve symbols, certify correctness, decide completion, or implement the
feature.

## Frozen protocol

Run two fresh lexical/Jev pairs on the unchanged session-mode task, public
reproduction and eight runtime acceptance checks. This is a task-informed
diagnostic, **not an unseen-task transfer test**: the new evidence design was
motivated by the previous traces. The task baseline remains public revision
`4e1cdefd9144beb6bb43d3f0ed7189b0609c4254`, with Pi SDK 0.85.1. Neither the
reference implementation nor holdout files are supplied to generation.

Both conditions use actual `bin/pij.mjs`, Sonnet 4.6, medium thinking, 64 admitted
requests, 2.5 million reported tokens, 16,384 output tokens per request, and a
600-second agent limit. A response can overshoot the token admission limit.
Ordinary PiJ decisions, source briefing and automatic checkpoints are off.
The only treatment difference is ranking a common, deterministic API pool:
BM25 plus symbol overlap for lexical; one Jev batched relevance evaluation for
Jev. Both deliver six API units in the same format, with identical inventory,
pool bounds and task text. Record pool and inventory digests, actual selected
units, Jev success/fallback, usage and preprocessing duration. Main-model catalog
cost excludes Jev fees and is not a billing receipt. Evidence-plus-agent elapsed
time excludes installation and CLI startup before the parent timer.

Launch lexical then Jev in pair one; Jev then lexical in pair two. Preparation
may reorder actual agent start times, which must be reported. Conditions within
a pair run concurrently; wait for both before launching the next pair. Freeze
source, build and HEAD across all four. Do not inspect candidate acceptance
until all four generators are terminal; do not repair, resume or selectively
replace a failed run. Sampling, shared provider load, caching, workspace paths
and evidence token length remain confounds. Two repeats cannot establish
general superiority or a population success rate.

After generation, run ordinary tests, the unchanged public reproduction,
frozen runtime acceptance, typecheck and build independently. Review the actual
patch, added regression coverage and final explanation against the task. A
shorter run that misses required work is not faster accepted delivery. Inspect
traces for delivered evidence, actual dependency navigation, API body reads,
first successful edit and final validation. Tool calls mentioning
`node_modules/` are a proxy, not a count of unique facts or proof of causation.

```sh
node --env-file=.env --import tsx eval/checkpoint-run.ts \
  --task session-mode --sample 1 --dependency-policy api \
  --dependency-evidence lexical --seconds 600 --turns 64 --tokens 2500000
node --env-file=.env --import tsx eval/checkpoint-run.ts \
  --task session-mode --sample 1 --dependency-policy api \
  --dependency-evidence jev --seconds 600 --turns 64 --tokens 2500000
# Repeat with --sample 2, launching Jev before lexical.
```

## Bounds and interpretation

The extractor inspects up to two direct installed dependencies, chosen by task
and package metadata overlap. It reads owned source/declaration files with
fixed file, byte and traversal budgets. TypeScript ASTs associate class members
and top-level functions/types with same-module implementations, preserving
static/instance and ESM/CJS identities. Up to four overload declarations and
bounded head/tail implementation lines are retained, with omitted/truncated
metadata. BM25 length normalization and symbol overlap form a maximum 32-unit
pool. Both conditions apply the same 85 KB request bound, including the pinned
Gateway boolean-question serialization. Jev cannot recover an API excluded
from this pool.

This is a partial extractor, not TypeScript's full module resolver. It supports
root export strings and flat `types`/`import`/`default` conditions (all strings,
`types` first when present, runtime conditions in insertion order), direct named
exports and relative star reexports. Unsupported conditional maps, missing
wildcard targets, cycles and bounded-resolution exhaustion are disclosed as
unresolved. Import-then-export aliases, CommonJS assignment exports, namespace
exports, package subpaths, inherited members, bundled sources and variable-based
APIs can be absent. `exportedAs` identifies resolved root exports of the owning
symbol; it does not prove that a member is a public or usable API. An empty list
means unresolved, not private. Linked excerpts do not establish complete runtime
behavior. The main model must inspect missing or truncated code as necessary.

Public artifacts will retain every outcome, original patches and replay hashes.
Raw traces stay private. The product defaults remain unchanged until stronger
accepted-task evidence justifies adoption.
