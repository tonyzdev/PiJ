# Dependency evidence before the first model request

This is an evaluator-only placement experiment. The previous post-edit
checkpoint experiment could not help an agent that spent its entire budget
investigating installed SDK behavior without editing. This experiment moves a
bounded evidence-selection decision before that investigation begins.

## Frozen comparison

Two actual `bin/pij.mjs` runs use the unchanged attribution task and seed in
`eval/checkpoint-fixture`. Both use Sonnet 4.6, medium thinking, at most 48
provider requests, 1.6 million reported tokens, 16,384 output tokens per request,
and a 480-second agent deadline. Each gets a fresh shallow base-only checkout
and its own installed dependencies. All ordinary PiJ decisions, source briefing,
and automatic checkpoints are off. The manual checkpoint extension remains
loaded for its established readiness handshake, without scheduling tests.

The only planned difference is the dependency-selection policy:

- **Lexical:** bounded term-based file selection, then excerpt selection.
- **Jev:** the same file candidates, ranked with atomic usefulness questions;
  then excerpt candidates from the selected files, ranked in a second batch.

Both deliver six original excerpts, with package versions, paths and line
numbers, in the same JSON format appended to the initial task. They do not
generate advice or a solution. This compares the entire two-stage policy;
second-stage window pools can differ because first-stage file selections do.
There is no additional LLM planning turn. Jev failures preserve the lexical
order of the affected stage. Parent-side evidence time and usage are recorded
separately and included in evidence-plus-agent elapsed time; dependency
installation is outside that measure. The 480-second deadline starts with the
agent, so Jev's preprocessing time is not hidden inside an equal total-time
claim.

The inventory is limited to two lexically relevant declared runtime packages,
their main-entry directories and docs. It excludes symlinks, bundled/minified
code, hidden files and nested dependencies. Limits: 32 manifests, 1,200 directory
entries, 320 source files, 4 MB read, 256 KB per file, 24 candidate files, four
expanded files, 24 candidate windows, six delivered windows. Each window is at
most 40 lines and 2,400 bytes. A digest identifies the inventory before policy
selection. The query tokenizer is English-oriented. Missing exports-only,
transitive or bundled packages and incomplete symbol cards are known limits.

## Outcome and interpretation

Primary outcome: after generation stops, the candidate must pass ordinary
tests, the visible reproduction, the original seven holdouts, type check,
build, and the two additional entry-ownership tests. Trace/diff review also
checks regression coverage and documentation requested by the task. A timed-out
or incomplete run is not an accepted completed task merely because some tests
pass.

Record provider requests, reported/cache tokens, reported model cost, Jev
status/input/latency, tool calls, time to first edit, SDK navigation calls,
actual edits, and whether supplied evidence was used. Faster progress with a
wrong fix is not a win. No model-generated patch is merged automatically.

This task and its failure modes already informed development. One live Jev
preflight on the development checkout selected queue-handling code while the
lexical probe selected mostly tool/auth documentation; neither selected the
exact persistence boundary. These probes are development diagnostics, not
blind outcomes. The additional oracle is likewise diagnostic-derived and
reported separately from the unchanged seven-test holdout. A single pair on
this task cannot establish general coding gains, superiority to pi-jev, or
robustness across model samples.

## Reproduction

Load a Gateway credential in the harness environment; it is kept out of task
shells. Run each condition from a fixed, built revision:

```sh
node --env-file=.env --import tsx eval/checkpoint-run.ts --dependency-evidence lexical
node --env-file=.env --import tsx eval/checkpoint-run.ts --dependency-evidence jev
```

Private raw traces, candidate directories, exact evidence and provenance go to
`.pij/evals`. After the model and all its processes stop, apply the established
five checkpoint acceptance checks and `runEntryOracle(workspace)`. The oracle
is evaluator-only and never available during candidate generation. Commit
sanitized outcomes and limitations here after both runs; normal product
defaults remain unchanged pending task-level evidence.
