# Experiment ledger

These are development observations, not performance claims. The main model is `alibaba/qwen3-coder-next` through Vercel AI Gateway. Reported dollar values use the pinned Pi catalog, not billing receipts; Jev fees are not included. Raw traces and disposable workspaces stay local.

## 2026-09-18: optional question-driven search

Both constructed document-lifecycle repair runs had the same 240-second wall-clock limit and requested 28 model requests / 150,000 tokens. Neither called `pij_search`; both read 13 files. A fresh independent sandboxed acceptance run found 4 of 11 invariants passing in each workspace, including different subsets. Neither completed the task.

| Configuration | Read calls | Search calls | Main input/output tokens | Estimated main cost | Acceptance |
| --- | ---: | ---: | --- | ---: | --- |
| Plain Pi | 13 | 0 | 117,248 / 18,713 | $0.0811 | 4/11; failed |
| PiJ assist, optional search | 13 | 0 | 156,915 / 5,646 | $0.0852 | 4/11; failed |

Assist recorded two failure-triage evaluations (one network call and one cache hit), 763 ms recorded wait, and no source ranking. This does not demonstrate a quality or efficiency benefit. There is one run per condition, and no corresponding off run; do not interpret the numerical difference as a causal Jev effect.

### Invalid controls discovered from traces

- The 4,096-token per-response cap repeatedly truncated a long `write` tool call in the plain run, leaving required arguments absent. The harness now exposes a larger output allowance; this failed pilot is retained, not silently replaced.
- Throwing inside Pi's `before_provider_request` hook reports an extension error but does not stop the request. The intended request/token budget was not an effective boundary. The wall-clock limit did terminate each run. The revised control uses runtime abort; a local real-Pi loop test verifies there is no third provider request after a two-request budget.
- Original acceptance summaries were incomplete. Rechecking the preserved workspaces with the corrected, sandboxed oracle produced the complete 4/11 results above. A temporarily cached check inventory is a possible historical cause, not a proven one.

## Real CLI task: associate decisions with Pi sessions and user turns

The actual `pij` executable was run against a disposable clone of public PiJ revision `4e1cdef`, with a task to add real session and per-user-turn identity, backward-compatible journals, presentation, documentation, and multi-turn runtime tests. Personal context and skills were disabled. The agent could execute file and shell tools inside the task workspace.

It reached 70 assistant messages before the 360-second deadline, with 27 bash calls, 29 reads and 14 edits; the first edit was tool call 36. It never called `pij_search`. Main-model usage was 2,491,376 input and 12,430 output tokens, approximately $1.2606 at pinned catalog rates. The failed budget hook makes this unsuitable for a bounded paired comparison.

The generated patch creates a random identifier instead of reading Pi's actual session ID, and uses per-model-loop `turn_start` indices instead of stable per-user-prompt identity. It also changes the journal filename regex incorrectly. Independent telemetry/runtime checks failed 5 of 7 tests, consistent with the broken filename matching. The task was not accepted and the patch was not merged. A real CLI run is evidence of exercising the product, not proof that the resulting changes are correct.

The first real CLI sandbox also exposed two test-environment problems: a long temporary path exceeded the Unix socket path limit used by the `tsx` launcher, and local HTTP fixture servers were denied. Later runs use shorter temporary paths and explicitly allow loopback for the real repository task while continuing to deny external network access. These harness failures are not evidence against Jev.

## Next controlled comparison

Repair and verify the harness, then compare initial deterministic source evidence against the same evidence candidates ranked by Jev. Include repeat runs and a held-out second repair task. Keep the real CLI task, inspect its trace and validate its patch independently. Until then, do not advertise faster, cheaper or more accurate coding.

### Initial shortlist probe

One direct live Jev ranking per task, over 19 and 18 source windows respectively, produced the following coverage among the first six distinct files. The reference patch's touched files are used only afterward as a rough coverage proxy; a valid alternative repair need not touch exactly those files. No acceptance answers or reference code were provided to retrieval.

| Task | Deterministic shortlist | Jev shortlist | Recorded wait | Jev input/output tokens |
| --- | --- | --- | --- | --- |
| Document lifecycle | 2/4 reference files | 4/4 | 1,018 ms | 4,471 / 336 |
| Queue pagination | 1/5 reference files | 3/5 | 530 ms | 4,578 / 318 |

The queue shortlist still omits the cursor scope and boundary implementations. Better overlap is a useful intermediate observation, not proof of a better repair. Whole-task comparisons are required, including the extra context and request costs.

### Follow-up batch stopped: invalid real-CLI isolation

The first fixed-budget briefing batch was stopped after its actual CLI trace showed bash reading the development checkout outside the task clone. The CLI child intentionally receives a temporary `HOME`; deriving the protected home from that child's environment consequently protected the wrong directory. Direct sandbox-unit checks had missed the integration error. No credential read was observed, but the affected runs are excluded from performance comparisons. The simultaneous SDK pair was also stopped conservatively; its trace was not yet persisted and it is not scored.

The correction passes the parent's actual protected home explicitly, separately protects the development repository, and keeps a blocking control active if configuration is invalid. Runtime integration tests must load the extension with rewritten `HOME` and attempt real bash reads/writes. The SDK runner also needs incremental trace persistence and graceful interruption so a stopped run remains inspectable.

Trace inspection also found repeated identical searches. The initial evidence had been appended as a new user-like message after every tool response. It now remains beside the request that generated it, before newer observations, with a runtime ordering regression test. Whether this placement caused the observed repetition is unproven; the next controlled run must assess behavior.
