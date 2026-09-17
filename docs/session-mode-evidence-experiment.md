# Transfer check: session-native Jev mode

This experiment checks whether the frozen dependency-evidence policy transfers
beyond the attribution task used during its development. It does not add a new
ranking algorithm. `eval/dependency-evidence.ts` remains byte-for-byte the file
published at `f0c4d47`.

## Task and independence

The real PiJ feature task starts from public revision `4e1cdef`: persist the
user's selected Jev mode in Pi session/branch metadata; restore the appropriate
mode on resume and branch navigation without contaminating model context or
leaking mode between unrelated sessions. Existing mode cancellation and off
behavior must remain intact. The precise public contract is in
`eval/session-mode-fixture/task.md`.

An independent fixture author prepares the task, basic public reproduction,
reference patch and deterministic runtime acceptance using the actual installed
Pi SDK. No paid model or Jev request is involved in fixture calibration. The
generating agent receives only the task, public reproduction, source at the
base revision and its own installed dependencies. Reference/holdout files and
later repository history are excluded from its sandboxed checkout. The
retrieval policy is already frozen and is not tuned using this task's reference
or acceptance results. This is a new development task, not an independently
curated benchmark or a claim of generalization across repositories.

## Frozen comparison

Run two pairs, each with a fresh lexical condition and a fresh Jev condition.
Both use actual `bin/pij.mjs`, Sonnet 4.6, medium thinking, 64 admitted requests,
2.5 million reported tokens, 16,384 output tokens per request, and a 600-second
agent limit. These limits are selected before generation and applied equally;
they are larger than the prior attribution pair and should not be used for a
direct timing comparison with that task. A response may overshoot the token
admission threshold. Preprocessing time and usage are recorded separately and
included in evidence-plus-agent elapsed time; dependency installation is not.

Ordinary PiJ decisions, initial source briefing and automatic checkpoints are
off. The only intervention is the existing parent-side dependency preprocessor.
Both policies receive the same bounded installed-source inventory and initial
file pool, deliver original excerpts in the same format, and leave coding and
validation to the main model. Two Jev stages may produce different window
pools after selecting files. Record stage failures rather than treating
fallback runs as full Jev treatment. No extra LLM planning turn is introduced.

Run the two conditions of each pair concurrently and reverse launch order for
the second pair. Start pair two only after both pair-one agents stop. Keep
source, build and policy unchanged across all four. Do not run candidate
acceptance checks while other generation is active. Shared provider load,
model sampling, task paths and cache state remain possible confounds; two
pairs are descriptive repeats, not statistical evidence of a general effect.

Before generation, independent review reproduced a sandbox gap: a shell could
read another candidate under a shared temporary root. The shared profile now
denies those roots, allows its own workspace, and permits only literal ancestor
metadata needed by Node path resolution. Direct and actual-CLI regressions
cover peer contents, symlink and `/tmp` aliases, local reads and Node execution.
Calibration reference trees are removed before generation. Review also
strengthened runtime acceptance with two deliberate bad variants: lazy
restoration only in `/pij status`, and search ranking disconnected from mode
cancellation. Each now fails its intended check (7/8), without timeout or
missing tests. These control repairs do not change retrieval policy.

## Acceptance and traces

After all generating processes stop, independently run ordinary tests, the
public reproduction, frozen runtime acceptance, type check and build. Review
the actual changes against the task, including new regression coverage and
documentation. Missing requirements, budget-stopped partial patches and wrong
fixes are not completed tasks even when selected tests pass. Keep each run's
outcome; do not rerun only failed conditions or tune evidence after seeing it.

Inspect persisted CLI traces for actual initial evidence delivery, navigation
calls, first successful edit, main requests and usage, test execution, and
evidence adoption where observable. A tool argument containing `node_modules/`
is only a navigation proxy. Do not equate fewer calls, earlier editing, or
relevant snippets with accepted completion. Main-model catalog costs exclude
Jev fees and are not billing receipts.

```sh
node --env-file=.env --import tsx eval/checkpoint-run.ts \
  --task session-mode --sample 1 --dependency-evidence lexical \
  --seconds 600 --turns 64 --tokens 2500000
node --env-file=.env --import tsx eval/checkpoint-run.ts \
  --task session-mode --sample 1 --dependency-evidence jev \
  --seconds 600 --turns 64 --tokens 2500000
# Repeat with --sample 2, launching Jev before lexical.
```

Publish sanitized outcomes and reproducible candidate patches, including
failures. Keep raw traces private. The normal product retains its existing
defaults; moving the preprocessor into production requires stronger accepted
task evidence than a single promising trajectory.
