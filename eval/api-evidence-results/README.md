# API-evidence diagnostic results

Two lexical/Jev pairs used actual `bin/pij.mjs` at frozen harness revision
`b7916d1975936f12d93c99d37a6e64cf582c70a6`, reusing the session-mode development
task. [Protocol, limitations and interpretation](../../docs/api-evidence-experiment.md).

All four pass the same independent behavioral checks, typecheck and build.
Jev is slower and more expensive for the main model in both repetitions.
This task-informed diagnostic does not establish a general quality or
efficiency advantage.

| Candidate | Added tests | Public / holdout | Typecheck / build | Deliverable review |
| --- | ---: | --- | --- | --- |
| [lexical-1.patch](lexical-1.patch) | 0 | 1/1, 8/8 | pass / pass | Missing required added tests |
| [jev-1.patch](jev-1.patch) | 4 | 1/1, 8/8 | pass / pass | Meaningful persistence regressions; no new tree test |
| [lexical-2.patch](lexical-2.patch) | 5 | 1/1, 8/8 | pass / pass | Required artifacts present; malformed-record test is vacuous |
| [jev-2.patch](jev-2.patch) | 15 | 1/1, 8/8 | pass / pass | Production-helper and navigation tests; one weak exclusion case |

[results.json](results.json) records budgets, source/build fingerprints, pool
digests, selection metadata, usage, check counts, test-review qualifications,
original patch hashes and byte-level replays. `completeDeliverable` means the
required artifacts and all automated checks are present after review; it does
not erase the separately recorded test-coverage findings. No post-hoc rule
requires each candidate to reproduce every evaluator check.

The five `*-ordinary.txt`, `*-visible.txt`, `*-holdout.txt`, `*-check.txt` and
`*-build.txt` logs per candidate are sanitized independent results. Raw model
traces, credentials and disposable workspaces are not published. Original
candidate patches retain the missing/weak tests without evaluator repairs.

All patches apply to public baseline
`4e1cdefd9144beb6bb43d3f0ed7189b0609c4254`. Newly authored files are included;
the unchanged supplied reproduction is excluded and installed by the fixture.
Each patch was applied to a fresh base-only checkout and changed-file SHA-256
values matched the original candidate. Those checks establish byte-exact
replay, not a second model generation.

To reproduce runtime acceptance locally on macOS with pinned dependencies:

```sh
candidate_root="$(mktemp -d /tmp/pij-api-replay.XXXXXX)"
node --import tsx eval/session-mode-fixture/verify.ts prepare "$candidate_root/project"
git -C "$candidate_root/project" apply "$PWD/eval/api-evidence-results/jev-2.patch"
node --import tsx eval/session-mode-fixture/verify.ts accept "$candidate_root/project"
```

The last command runs the eight behavioral holdouts. The fixture's exported
`runLocalChecks(workspace, kind)` accepts `ordinary`, `visible`, `check` and
`build` for the other checks. No credential or paid request is needed. Passing
runtime checks alone does not establish delivery of requested new tests.
