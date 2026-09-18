# Diagnostic: complete project source ranking

The hypothesis is that Jev can inspect the whole eligible project before the
main model needs to guess search patterns. This replaces candidate selection
by keyword with complete-source relevance scoring. It does not give Jev an
execution tool, code generation role, or correctness/completion authority.

## Frozen protocol

Run two fresh lexical/Jev pairs on the existing session-mode persistence task
at public baseline `4e1cdefd9144beb6bb43d3f0ed7189b0609c4254`, with Pi SDK 0.85.1.
This is a previously examined diagnostic task, not an unseen-task benchmark.
Reference patches, holdouts and previous traces are never model input.

Both policies enumerate **all owned, nonignored TS/JS source and tests** in the
candidate checkout, including the added public reproduction. No task keywords
filter the inventory. Other file types, dependencies, generated/private paths,
symlinks and deleted files are excluded and reported. This is complete coverage
of that declared scope, not a claim to read dependencies, documentation or every
byte in a repository. The lexical baseline ranks the same complete bodies by
inverse-document-frequency-weighted task-term overlap, with double path weight.
Jev sees complete files in deterministic alphabetical batches and one atomic
relevance question per file. Every file is scored, including zero-overlap files.
No hand-selected symbols, patterns, snippets or top-K candidates are supplied.

Each batch has a 75,000-byte serialized-request budget, below the existing
90,000-byte transport guard. This operational byte limit is **not** an exact
provider-token estimate. The provider's shared state/questions token limit
still applies. Files are never split or truncated: an individually oversized
file or project above 256 files / 2 MB fails before any paid request. Source is
untrusted data. Jev gets 10 seconds per call, zero retries, and preprocessing a
45-second outer deadline. Record every batch, its answer coverage and usage.
A failed or malformed batch falls back to the entire lexical ordering; never
mix lexical numbers and Jev probabilities. Cancellation terminates the run.
Batch probabilities may not be calibrated across different surrounding files;
this is an explicit limitation of merging per-batch relevance scores.

Both conditions deliver only the complete ordered file manifest (paths and line
counts), in identical wording. There is no fixed top-8 or hidden output cutoff.
The main model reads and edits files using ordinary tools. Thus the intervention
is a reading-order suggestion, not preloaded source excerpts; it may fail to
remove work or be ignored. Compare actual navigation and completed delivery,
not just whether expected files sort to the top.

Use actual `bin/pij.mjs`, Sonnet 4.6, medium thinking, 64 admitted requests,
2.5 million reported tokens, 16,384 output tokens/request and 600 seconds/run.
Product Jev decisions, source briefing, dependency evidence and automatic
checkpoints remain off. Launch lexical then Jev in pair one; Jev then lexical
in pair two. Conditions within a pair run concurrently; wait for both before
launching the next pair. Record actual start order. Freeze code, build and HEAD
for all four. No candidate acceptance, fixes, continuation or replacement until
all four generators are terminal. An interrupted or failed run remains a result.

After all runs, independently execute ordinary tests, public reproduction,
eight frozen runtime holdouts, typecheck and build. Review actual patches,
new tests and final explanations for the task's requested deliverables. Retain
original patches and all outcomes. A passing holdout does not excuse omitted
regression tests. Timing includes preprocessing plus the parent agent timer,
but excludes dependency installation and early CLI startup. Report main-model
usage separately from Jev input/output and latency. Catalog costs are estimates,
not billing receipts. Provider caching/load and sampling remain confounds;
two repeats of one task cannot establish general superiority.

```sh
node --env-file=.env --import tsx eval/checkpoint-run.ts \
  --task session-mode --sample 1 --project-evidence lexical \
  --seconds 600 --turns 64 --tokens 2500000
node --env-file=.env --import tsx eval/checkpoint-run.ts \
  --task session-mode --sample 1 --project-evidence jev \
  --seconds 600 --turns 64 --tokens 2500000
# Repeat with sample 2, launching Jev before lexical.
```

This remains evaluator-only. Product adoption requires evidence beyond a working
transport and plausible rankings. No comparison against pi-jev is performed.

## Offline preflight

The pinned task checkout contains 21 eligible files / 90,524 source bytes.
The deterministic batches contain 14 and 7 complete files; intercepted pinned
Gateway request bodies are 71,786 and 35,775 bytes. This check makes no network
request. The whole-project inventory includes the public reproduction but
contains neither holdout nor reference code. Completed batch diagnostics are
persisted before observing cancellation; preprocessing errors get a separate
terminal record even when no main-model process starts.
