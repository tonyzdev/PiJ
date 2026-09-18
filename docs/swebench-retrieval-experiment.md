# SWE-bench Verified: Jev as a retrieval reranker

## Why this experiment exists

Every prior experiment in this repository ranked files inside PiJ itself (35 TypeScript
files, 3,678 lines) or the eval fixtures (17–21 files, ~120 KB). At that size there is no
retrieval problem to solve: `rg` returns the whole project and the main model can read it
all. Those experiments could not have detected a ranking benefit even if one existed, which
is the most likely reason they kept returning inconclusive results.

This experiment moves to a corpus where retrieval is the actual bottleneck, and where
relevance has ground truth.

## Setup

- **Dataset**: SWE-bench Verified (500 human-validated real GitHub issues). Sample of 20
  instances: 10 `django/django` + 10 `sympy/sympy`, spread across the difficulty buckets.
- **Corpus**: every `.py` file in the repository at each instance's `base_commit`.
  Median **1,545 files** per instance (django ≈ 2,000 files / 325k lines).
- **Ground truth**: the files edited by the instance's reference patch. Tests are left in
  the candidate pool; nothing is filtered by path.
- **Baseline**: Okapi BM25 (k1=1.2, b=0.75) over file contents, query = the issue text.
- **Candidate stage**: BM25 top-100.
- **Rerank stage**: Jev scores each candidate with one `noul` question — "does this file
  need to be read or edited to resolve the task?" Files are sent as compact outlines
  (path, imports, top-level defs/classes, query-matching lines; ≤1,800 bytes each), because
  at this scale whole files do not fit the 90 KB request bound. ~3 requests per instance.

Harness: `eval/swebench-retrieval.ts`. Raw results: `eval/swebench-retrieval-results/`.

## Results (20 instances)

| metric | BM25 | Jev rerank |
|---|---:|---:|
| recall@1 | 0.250 | **0.740** |
| recall@5 | 0.575 | **0.905** |
| recall@10 | 0.740 | **0.957** |
| recall@20 | 0.742 | **0.960** |
| recall@100 (shortlist ceiling) | 0.967 | — |

| | BM25 | Jev |
|---|---:|---:|
| median rank of first gold file | 4 | **1** |
| mean rank of first gold file | 9.8 | **1.4** |
| gold file at rank 1 | 5/20 | **17/20** |
| gold file missed by top-10 | 4/20 | **0/20** |

Rank of the first gold file improved on 15 instances, was unchanged on 5, and **worsened on
none**.

## Control: the gain is not "down-rank the tests"

A cheap local rule — penalise anything under `tests/` — would explain a result like this if
BM25's failures were all test files crowding out implementation. It does not apply here:
Jev's top-10 contains **more** test files (34%) than BM25's (25%). Jev promotes the right
implementation file while keeping the matching test alongside it.

`django__django-10973` (issue about `dbshell` for PostgreSQL) is the clearest case. BM25's
top-5 is `setup.py`, `core/cache/backends/base.py`, `utils/autoreload.py`,
`db/backends/oracle/base.py`, `core/management/base.py` — the gold file sits at rank 53.
Jev's top-5 is the gold `db/backends/postgresql/client.py`, then
`tests/dbshell/test_postgresql.py`, `postgresql/operations.py`, `postgresql/base.py`,
`oracle/client.py`: a coherent neighbourhood rather than a keyword match.

## Cost

60 Jev requests, 1.12M input tokens, 35.6k output tokens, zero fallbacks. ~3 requests and
4.6 s per instance. Gateway balance moved $10.00 → $9.65, so the whole sweep cost roughly
**$0.35** — against $18 of main-model spend for the earlier inconclusive rounds. No main
model was called at any point.

## What this does and does not establish

Established: on a repository-scale corpus, Jev's relevance judgement is substantially
better than the standard lexical baseline at putting the file that must be edited in front
of the agent, and the advantage does not come from a path heuristic.

Not established: that this converts into a higher task resolve rate. Ranking quality and
end-to-end benefit are separate claims. The next stage is to run the full agent on a subset
with and without the reranker, which is the only part that needs main-model budget — and it
is now worth spending, because stage 1 says there is something to convert.

## Limitations

- 20 instances, two repositories, Python only. Wide confidence intervals.
- Jev cannot rank above the BM25 shortlist: recall@100 (0.967) is a hard ceiling, and
  `sympy__sympy-13091` (21 gold files, 7 in the shortlist) dominates the residual loss.
- The outline representation is one design among several; whole-file, chunk-level and
  hybrid inputs are untested.
