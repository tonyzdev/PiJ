# Independent repair fixtures

These are constructed integration tasks, not evidence of general coding ability. Each public project has 14 small ESM modules, ordinary smoke tests, no dependencies, and plausible neighboring consumers. The benchmark must not make retrieval decisions using the locations or labels of the reference repairs.

| Task | Public smoke on original | Original acceptance | Reference acceptance |
| --- | --- | --- | --- |
| document-request-lifecycle | 3/3 | 2/11 | 11/11 |
| queue-cursor-pagination | 2/2 | 3/12 | 12/12 |

`eval/tasks.ts` exports `TASKS`. Each entry exposes `id`, `prompt`, `setup(cwd)`, `verify(cwd)` and `reference(cwd)`. Setup copies **only** the task's `project/` subtree into a disposable workspace. The runner supplies `prompt`; `holdout.mjs`, `checks.json` and `reference/` remain outside. Reference applies a separate multi-file patch for oracle validation, never for agent scoring. Verification returns `{ passed, checks, details? }`.

Run the independent validation from the repository root:

```sh
./node_modules/.bin/tsx --test test/eval-tasks.test.ts
npm run check
```

The tests execute public smoke and private acceptance against both untouched and reference-repaired workspaces. They also reject a forged result inventory, check that a synthetic harness secret is absent from the acceptance child, and verify that a stalled candidate is terminated.

The document oracle uses controlled deferred transport operations, not elapsed sleeps. It covers full request identity, multiple consumers, cancellation ownership, pre-cancelled reads, last-subscriber abandonment, stale-success and stale-failure races, retry after both rejection and synchronous throw, deep-copy boundaries, completion-based TTL, and listener cleanup. Search and HTTP adapters are also exercised. Four cooperating modules require repair.

The queue oracle checks microseconds, all three sort fields, same-time boundaries, forward coverage, nearest preceding pages, truthful navigation flags, filter-set normalization and binding, deleted anchors, malformed tokens, and a 36-row traversal in both directions with changing page sizes. Expectations are independently constructed; the oracle never imports the project's comparison, cache, cursor or scheduling helpers. Five cooperating modules require repair. Activity, summaries, tenant filtering and copies remain covered.

Acceptance imports only the project's public `src/index.js` in a separate Node process with a minimal explicit environment, a 4-second hard timeout, SIGKILL on expiry, and a 128-KiB output limit. Individual behavior checks have a 180-ms settlement bound. Per-run random identifiers discourage literal answer tables while retaining reproducible scenario structure. The external check inventory must match exactly; changing npm scripts or visible tests cannot satisfy it.

On macOS, verification uses Seatbelt to prohibit network access and writes outside the workspace, protect the user's home and repository, and allow only the current holdout/helper files. The live runners require macOS and also isolate tool commands. Other platforms can run trusted fixture unit tests, but do not silently receive an unsandboxed live runner. A candidate executes in the same child as its acceptance probes; arbitrary malicious instrumentation of that process is outside this oracle's trust model. Do not expose acceptance results as hints to the coding model or inherit credentials in candidate processes.
