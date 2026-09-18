# Forced placement matrix: interrupted by provider credit exhaustion

This batch **does not establish a placement winner**. All fourteen planned cells
were attempted once at frozen `d08fc39`; only one finished normally. The Gateway
returned HTTP 402 `insufficient_funds` during two investigations/repairs, then
rejected the first request in each of the remaining eleven cells. Those eleven
have zero reported model tokens and zero interventions. They are infrastructure
failures, not negative Jev performance observations. No selective retry occurred.

The [protocol](../../docs/placement-experiment.md) and
[launch manifest](../placement-manifest.json) were committed before generation.
The implementation, built runtime and Git HEAD match across all fourteen starts
and ends. Each actual CLI used Sonnet 4.6, medium thinking, 600 seconds, 64 admitted
requests and 3 million reported tokens. All ordinary PiJ Jev features were off.
The three treatment positions are tool output, post-edit test selection, and
attempted completion; each has a deterministic same-position control.

| Policy | Session-mode task | Attribution task |
| --- | --- | --- |
| baseline | Interrupted by 402 after edits; incomplete | First request rejected |
| output-local | First request rejected | First request rejected |
| output-jev | First request rejected | 8 filtering events; interrupted before edits |
| checkpoint-local | Completed and independently accepted | First request rejected |
| checkpoint-jev | First request rejected | First request rejected |
| finish-local | First request rejected | First request rejected |
| finish-jev | First request rejected | First request rejected |

## What was actually exercised

The attribution output-Jev run delivered eight transformed tool outputs. Each
emitted tool-result content hash matches the selected output's recorded hash.
There were six successful network judgments and two cache hits, with no fallback:
16,591 network input tokens, 759 output tokens, and 3,891 ms of recorded decision
latency. Total output bytes changed from 50,110 to 27,888 (including labels), but
this is not evidence of lower total model use or better coding. The smallest
output grew from 177 to 407 bytes due to explanatory labels. Repeated reads also
repeated filtering, including cached decisions. These observations motivate a
future minimum-net-saving rule and an explicit recovery path for repeated reads;
neither improvement was silently introduced into this frozen batch.

The session-mode local checkpoint run executed four checkpoints (4,599 ms total),
all passing. The first three selected cancellation and integration tests; the
fourth selected its new persistence tests plus cancellation tests. It finished
in 353.2 seconds with 34 admitted requests and passed ordinary tests (56/56),
public reproduction (1/1), behavioral holdouts (8/8), typecheck and build. Its 16
added tests include 13 production-helper cases and three real SDK cases. An
independent review found no copied test implementation or concrete defect.
This is a successful **local control**, not evidence that Jev improves selection
or that checkpoint feedback caused the successful delivery.

The interrupted session-mode baseline retained ten production-connected tests
but passed only 48/50 ordinary cases and 4/8 holdouts. Its branch scan chooses
oldest-first and it omits tree restoration; two new reopen fixtures do not first
trigger SDK disk persistence. These describe an unfinished artifact at the
provider cutoff, not its counterfactual result with a working provider.

The attribution output-Jev run made **no authored changes**. Its Git diff is
exactly the supplied attribution seed. The initial seed passes 5/7 holdouts;
that score is not a repair or a Jev result. Public artifact metadata separates
`candidate.authoredFiles` from the diff against the older public Git baseline.

Completion-local and completion-Jev were validated through actual local CLI
runs with a fake model and local Jev transport: readiness blocks early provider
calls and the first final response can cause exactly one continuation before
CLI return. **Neither completion intervention reached a paid live decision in
this matrix.** Local wiring tests do not establish completion judgment quality.

## Evidence and reproduction

[results.json](results.json) retains all fourteen outcomes, infrastructure error
classification, model usage, intervention records, independent checks, review
findings and patch replay hashes. Each cell has its original patch plus five
sanitized acceptance logs. All checks ran only after every generator terminated.
Unchanged-fixture failures are retained for completeness and excluded from
comparative performance interpretation (`comparisonEligible: false`).

Every patch was replayed against a fresh base-only checkout and all changed-file
hashes matched. Empty session-mode patches denote no authored changes. Attribution
patches include the original seed, so apply them directly to public `4e1cdef`,
not on top of `seed.patch`; the provided reproduction must be copied separately
by the fixture. No candidate repair was adopted into product code.

Reproduce a cell with a funded Gateway account, after building the frozen revision:

```sh
node --env-file=.env --import tsx eval/checkpoint-run.ts \
  --task session-mode --placement finish-jev --sample 1 \
  --seconds 600 --turns 64 --tokens 3000000
```

Use the manifest's task/policy combinations. A future rerun must be a separately
recorded batch with its own frozen protocol; this credit-interrupted batch must
remain visible. Check funding before dispatch and stop queued work on a known
credit failure. The original launcher did not stop dispatch, so all eleven
remaining first-request rejections are retained here.

Local implementation validation: 150 offline tests, typecheck and build passed;
independent review fixes have observed failing/passing regression evidence.
Total recorded main-model catalog cost is $3.2880, excluding Jev charges; it is
not a billing receipt. No full-task cost/quality comparison is valid here.
