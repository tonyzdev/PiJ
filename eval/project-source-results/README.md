# Complete project source ranking: diagnostic results

Two lexical/Jev pairs use actual `pij`, Sonnet 4.6 and the existing session-mode
persistence task, at frozen harness revision `66a8ad1`.
[Protocol, results and limitations](../../docs/project-source-experiment.md).

Jev receives all 21 eligible TS/JS source and test files (90,524 bytes), in two
complete-file batches. Both conditions give the main model the entire ordered
file manifest. There is no keyword candidate filter or top-K output cutoff.
Dependencies, generated/private paths and non-source files are outside scope.

| Original patch | Ordinary / public / holdout | Typecheck / build | Delivery review |
| --- | --- | --- | --- |
| [lexical-1.patch](lexical-1.patch) | 40/40, 1/1, 8/8 | pass / pass | Required new tests omitted |
| [jev-1.patch](jev-1.patch) | 55/55, 1/1, 7/8 | pass / pass | Tree restoration missing; token-budget termination |
| [lexical-2.patch](lexical-2.patch) | 59/59, 1/1, 8/8 | pass / pass | All 19 added tests call test-local copied logic |
| [jev-2.patch](jev-2.patch) | 60/60, 1/1, 8/8 | pass / pass | Meaningful production-helper and SDK tests; task accepted |

Complete-source scoring works, but these two descriptive repetitions do not
establish reliable speed, cost or quality gains. Jev-1 is slower and fails a
required behavior; Jev-2 is faster and is the only complete delivery after test
review. One task-informed diagnostic is not a general success-rate estimate or
a comparison with pi-jev. Product defaults remain unchanged.

[results.json](results.json) retains every outcome, inventories, individual Jev
scores/usage, actual initial message timestamps, check counts, review findings,
patch hashes and byte-exact replay evidence. Twenty `*-ordinary.txt`,
`*-visible.txt`, `*-holdout.txt`, `*-check.txt` and `*-build.txt` files contain
independent sanitized check output. [The isolated test log](lexical-2-isolated-tests.txt)
shows lexical-2's 19 tests passing with no product source present.

All patches apply to public baseline
`4e1cdefd9144beb6bb43d3f0ed7189b0609c4254`. Each was replayed in a fresh base-only
checkout and all changed-file hashes matched the original candidate. The
unchanged public reproduction is supplied by the fixture rather than included
in each patch. Raw model traces, credentials and candidate workspace paths stay
private. Generated fixes are evidence artifacts, not product changes.

To replay a patch and run the eight behavioral holdouts locally on macOS:

```sh
candidate_root="$(mktemp -d /tmp/pij-project-replay.XXXXXX)"
node --import tsx eval/session-mode-fixture/verify.ts prepare "$candidate_root/project"
git -C "$candidate_root/project" apply "$PWD/eval/project-source-results/jev-2.patch"
node --import tsx eval/session-mode-fixture/verify.ts accept "$candidate_root/project"
```

This uses local fixtures and no paid requests. The exported `runLocalChecks`
function supports `ordinary`, `visible`, `check` and `build` for other checks.
Passing these checks alone does not establish appropriate authored tests.
