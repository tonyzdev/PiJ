# Session-mode dependency-evidence results

Two lexical/Jev pairs ran actual `bin/pij.mjs` against a new feature task at
frozen harness revision `d672736a71d48339c429b141f6436e4019c69b68`.
[Protocol and interpretation](../../docs/session-mode-evidence-experiment.md).

**Only lexical-1 completed the stated task.** Jev-1 passes runtime acceptance
but fails the required typecheck; lexical-2 omits live tree restoration; jev-2
restores the oldest selection and adds no regression tests. Shorter Jev runs
do not establish faster delivery of equivalent work.

[results.json](results.json) contains source/runtime fingerprints, budgets,
usage, preprocessing decisions, independent check counts, review findings and
candidate file hashes. `*-ordinary.txt`, `*-visible.txt`, `*-holdout.txt`,
`*-check.txt` and `*-build.txt` contain sanitized evaluator output. Raw model
traces, credentials and disposable workspaces are not published.

| Candidate | New tests | Public / holdout | Typecheck | Task accepted |
| --- | ---: | --- | --- | --- |
| [lexical-1.patch](lexical-1.patch) | 14 | 1/1 · 8/8 | pass | yes |
| [jev-1.patch](jev-1.patch) | 6 | 1/1 · 8/8 | fail | no |
| [lexical-2.patch](lexical-2.patch) | 3 | 1/1 · 7/8 | pass | no |
| [jev-2.patch](jev-2.patch) | 0 | 1/1 · 4/8 | pass | no |

The patches are original candidate changes against public baseline
`4e1cdefd9144beb6bb43d3f0ed7189b0609c4254`. They include newly generated test
files. The supplied visible reproduction is unchanged and excluded from each
patch; fixture preparation installs it. The known defects are intentionally
preserved. These patches are experiment artifacts, not product changes.

All four patches were applied to fresh base-only checkouts and the resulting
changed-file SHA-256 values matched the original candidates. The `replay`
field records this byte-level check; independent test results above come from
the original finished candidates, not another model generation.

To reproduce behavioral acceptance locally on macOS after installing the main
repository's pinned dependencies, run from the repository root:

```sh
candidate_root="$(mktemp -d /tmp/pij-mode-replay.XXXXXX)"
node --import tsx eval/session-mode-fixture/verify.ts prepare "$candidate_root/project"
git -C "$candidate_root/project" apply "$PWD/eval/session-mode-results/jev-2.patch"
node --import tsx eval/session-mode-fixture/verify.ts accept "$candidate_root/project"
```

The final command is expected to fail for jev-2 and lexical-2. It runs the eight
behavioral holdouts only; a passing behavioral check does not establish a
passing typecheck or a complete deliverable. The fixture's exported
`runLocalChecks(workspace, kind)` also accepts `ordinary`, `visible`, `check`,
and `build` for those separate checks. No API key or paid request is needed.

No repository documentation was changed by the candidates, but all supplied
final-answer change summaries. The task did not mandate a README edit, so that
absence is reported without adding a new rejection rule. Only one new task and
two repeats are represented; there is no statistical generalization or executed
head-to-head against pi-jev.
