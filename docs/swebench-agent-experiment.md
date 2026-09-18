# End to end: Pi vs PiJ on SWE-bench Verified with one main model

Stage 1 (`docs/swebench-retrieval-experiment.md`) established that Jev reranking puts the file
that must be edited in front of the agent far more reliably than BM25. This experiment asks
the only question that matters after that: does it change what a coding agent actually does
and achieves on a real task?

![comparison](figures/swebench-agent-comparison.png)

## Setup

- **Instances**: 20 `django/django` instances from SWE-bench Verified. Candidates were
  pre-screened (`eval/swebench-agent-results/oracle-screen.txt`): in this environment the
  unfixed tree must fail at least one FAIL_TO_PASS test and the gold patch must pass all of
  them. 20 of 22 candidates passed; `django__django-10097` (broad FAIL_TO_PASS list that
  already passes here) and `django__django-11276` (needs docutils) were excluded.
- **Main model**: `deepseek-v4-flash` via Pi's built-in DeepSeek provider, thinking off,
  identical for every arm. Budget per run: 40 turns, 600k tokens, 9 minutes.
- **Arms**, all on the same prompt, workspace and sandbox:
  - **Pi** — plain `pi`, no extension. Searching means bash `grep`/`rg`/`find`.
  - **PiJ, no Jev** — `pij --jev-mode off` with `PIJ_SOURCE_BRIEFING=1`: the BM25
    shortlist from `discoverCode` is injected as an initial briefing and `pij_search`
    returns BM25 order. No Jev requests.
  - **PiJ + Jev** — `pij --jev-mode assist` with the briefing: the same shortlist, reranked
    by Jev before injection; `pij_search` also reranked.
- **Oracle**: the reference test patch is applied on top of the agent's change and the
  modules named by FAIL_TO_PASS and PASS_TO_PASS are run (Python 3.8, editable install).
  *Resolved* = every FAIL_TO_PASS test passes and no PASS_TO_PASS test regresses.
- **Effort**: every tool call is classified by what it does (`classify()` in
  `eval/swebench-agent.ts`): `pij_search` and bash `grep|rg|find|ls…` are *search*; `read`
  and bash `cat|head|sed -n…` are *read*; `runtests.py|pytest` is *test*.

Harness: `eval/swebench-agent.ts`. Raw per-run records, patches and summary:
`eval/swebench-agent-results/` (first pass) and `eval/swebench-agent-results/v2/` (corrected
prompt). 100 runs, 0 harness errors, $0.32 of main-model spend in total.

## A confound, caught and corrected

The first pass of this experiment showed `pij_search` being called twice in forty PiJ runs,
and this report initially attributed that to the model's habits. That attribution was wrong.
Capturing the system prompt from the actual provider request showed what the model was told:

```
Available tools:
- bash: Execute bash commands (ls, grep, find, etc.)        ← listed second
- pij_search: Find and rank source excerpts ...              ← listed last
Guidelines:
- Use bash for file operations like ls, rg, find             ← the first guideline
- ...
- When locating unfamiliar behavior, ask pij_search ...      ← ninth, conditional, hedged
```

Pi's default prompt instructs the model to search with `rg` through bash before it ever
reaches the PiJ guideline. PiJ had not overridden that. The extension now rewrites exactly
those two lines so that locating code goes through `pij_search` first (`preferPijSearch` in
`src/ui.ts`, verified in the real request), and both PiJ arms were rerun with the corrected
prompt. The plain-Pi arm is unaffected and is not rerun. Numbers below are from the rerun;
the first pass is kept in `eval/swebench-agent-results/results.json` for comparison.

## Results (corrected prompt)

| | Pi | PiJ, no Jev | PiJ + Jev |
|---|---:|---:|---:|
| **resolved** | **15/20** | 14/20 | 14/20 |
| **first tool call reads a gold file** | 5/20 | 7/20 | **11/20** |
| `pij_search` calls / runs using it | — | 9 / 8 | 7 / 5 |
| search calls, mean / median | 4.6 / 3.0 | 5.2 / 2.0 | 4.3 / **1.5** |
| tool calls, mean / median | 17.1 / 11.0 | 16.4 / 9.0 | 16.1 / 10.0 |
| prompt tokens per task, mean / median | **192k / 47k** | 216k / 55k | 202k / 61k |
| wall time per task, mean / median | **42 s / 20 s** | 50 s / 21 s | 58 s / 29 s |
| Jev requests per task | — | — | 4.1 (+3.9 s) |

Paired against plain Pi on the same instance, PiJ + Jev used **fewer search calls on 11,
the same on 4, more on 5**; fewer tool calls on 12 of 20; more prompt tokens on 12 of 20;
more wall time on 16 of 20. First pass, for reference: PiJ + Jev resolved 15/20 with
`pij_search` used in 1 run, 4.7 / 1.5 searches, 195k tokens, 60 s.

## What happened

**Fixing the prompt raised adoption, not outcomes.** With the guideline corrected, the model
reached for `pij_search` in 5–8 of 20 runs instead of 1, and still one or two calls per run
with bash grep for the rest. Resolve rate did not move (15 → 14 → 14), and neither did the
means of any effort metric. What did move is the same thing that moved in the first pass:
with the Jev-ranked briefing, the first action reads the file the reference patch edits in
11 of 20 runs against 5 of 20 for plain Pi. The Stage 1 retrieval advantage reaches the
agent. It does not carry through to the result.

**Variance after localization dominates.** On 9 of 20 instances plain Pi needed fewer than
three searches: the issue text names the file. Where retrieval mattered, arms diverge both
ways. `django__django-11206`: Pi spent 37 tool calls and 414k tokens, PiJ + Jev 33 calls
and 425k after the fix (9 calls and 65k in the first pass), all resolved.
`django__django-11239`: 5 searches became 0, and then the fix was wrong. `django__django-11087`
is reproducible in the other direction: plain Pi resolved it with 5 searches in 55 s; PiJ +
Jev read the gold file *first* in both passes, then went on to 18 and 24 searches, exhausted
the budget and did not resolve it. The traces show the model second-guessing its fix — trying
to download Django 3.0, searching for other copies of `deletion.py` — rather than failing to
find the file. Medians move in PiJ's favour (searches 3 → 1.5); a few runaway runs erase the
difference in the means, and with one run per configuration a single runaway run moves a
mean by 10%.

**Jev is not free at this model's speed.** deepseek-v4-flash answers in about a second.
Four Jev requests per task plus a 6,000-file discovery pass add 16 s to a 42 s task on
average. Against Sonnet-class response times in the earlier experiments the same latency was
negligible; here it is the largest measured cost of the design.

## What this changes

The position — rerank a lexical shortlist and keep the ranker out of the context window — is
still the right one: it is the only configuration whose first move lands on the right file
more often than not. Delivery is where the evidence points. An opt-in tool, even when the
prompt says to use it first, is picked up in a quarter of runs; the model's searching still
goes through bash grep. If the reranker is to matter after turn one, it has to sit inside
that path — intercept the `grep`/`rg` output the model already asked for and rerank it —
rather than beside it. That is also where the latency has to earn its keep: a ranked grep
result is worth 2 s only where it removes more than 2 s of subsequent searching, which on
this task set is roughly half the instances.

## Limitations

- 20 instances, one repository, one main model, one run per configuration. A single
  runaway run moves a mean by 10%.
- The task set is easy for localization: 9 of 20 instances needed fewer than three searches
  for plain Pi. A set chosen for retrieval difficulty (Stage 1 knows which instances rank
  poorly under BM25) would test the hypothesis more sharply.
- `pij_search` adoption may differ across main models; this result is specific to
  deepseek-v4-flash, and the first pass shows how sensitive adoption is to the prompt.
- One run per arm hit a transient DeepSeek "Connection error" that Pi retried; the run
  completed normally and is counted as such.
