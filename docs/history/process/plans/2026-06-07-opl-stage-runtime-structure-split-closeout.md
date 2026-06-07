# OPL stage runtime structure split closeout 2026-06-07

Owner: `One Person Lab`
Purpose: `opl_stage_runtime_structure_split_closeout`
State: `history_closeout`
Machine boundary: 本文只记录本轮 framework stage-runtime 结构治理过程与证据边界。当前 truth 继续归 `contracts/`、source、tests、CLI/read-model、runtime ledger、provider receipt、domain-owned owner receipt / typed blocker、App/operator read model 和 fresh verification output。

## Scope

本轮处理 OPL Framework stage-runtime 源码结构 tail：两个入口文件已经承载过多 helper、normalizer、receipt builder、Temporal terminal observation 和 provider recovery 逻辑，违反 thin-entry / semantic parts 目标。

实际写入范围：

| Surface | Action |
| --- | --- |
| `src/family-runtime-codex-stage-runner.ts` | 收薄为 stage runner orchestration entry，把 closeout normalization、receipt builder、input/prompt、session recovery、default-executor recovery 和 shared JSON helper 移到 `src/family-runtime-codex-stage-runner-parts/`。 |
| `src/family-runtime-stage-attempts.ts` | 收薄为 public export entry，把 create / inspect / closeout ingest / signals heartbeat / fixture activity / task sync summary / Temporal terminal observation 移到 `src/family-runtime-stage-attempts-parts/`。 |
| `contracts/opl-framework/source-structure-budget.json` | 删除 `src/family-runtime-stage-attempts.ts` reviewed line-budget baseline；该文件已回到默认 1000 行预算内。 |
| `scripts/test-lanes.mjs` | 把 scaffold split 后新增的 three focused scaffold case files 加回 `read-model-gates` lane，避免结构拆分让新测试游离于 repo-native lane 外。 |

## Retired structure surface

Retired:

- `src/family-runtime-stage-attempts.ts` 作为 reviewed oversized file 的 baseline exception。
- stage-attempt create / inspect / closeout / Temporal terminal observation 等稳定子职责继续堆在单个 public entry 文件中的结构形态。

Current owner surface:

- Public imports continue through `src/family-runtime-stage-attempts.ts` and `src/family-runtime-codex-stage-runner.ts`.
- Implementation responsibility moves to focused `*-parts/` modules whose file sizes are independently below the default source budget.
- The source-structure budget contract remains the machine owner for line-budget baselines and retired-baseline detection.

This is a framework structure split, not a domain owner receipt, not a provider readiness claim, and not a production readiness claim.

## Verification

Observed in the split worktree before absorption:

```bash
rtk npm run build
rtk npm run line-budget
rtk npm run line-budget:strict
rtk npm run lint
rtk git diff --check
rtk rg -n -I -e '^(<<<<<<< |=======|>>>>>>> |\|\|\|\|\|\|\| )' src contracts docs
rtk env OPL_TEST_LANE_STEP_TIMEOUT_MS=1200000 node --experimental-strip-types --test tests/src/family-runtime-codex-stage-runner.test.ts tests/src/family-runtime-codex-stage-runner-mas-recovery.test.ts tests/src/family-runtime-codex-stage-runner-process-lifecycle.test.ts tests/src/family-runtime-codex-stage-runner-protocol.test.ts tests/src/family-runtime-codex-stage-runner-session-recovery.test.ts
rtk env OPL_TEST_LANE_STEP_TIMEOUT_MS=1200000 node --experimental-strip-types --test tests/src/family-runtime-stage-attempt-closeout-ledger.test.ts tests/src/family-runtime-temporal-terminal-sync.test.ts tests/src/cli/cases/family-runtime-stage-attempts.test.ts tests/src/cli/cases/family-runtime-stage-attempt-query-closeout.test.ts tests/src/cli/cases/family-runtime-stage-attempts-temporal-terminal.test.ts tests/src/cli/cases/family-runtime-stage-attempts-temporal-terminal-query.test.ts
rtk node --experimental-strip-types --test tests/src/cli/cases/agents-scaffold.test.ts tests/src/cli/cases/agents-scaffold-consumption-evidence.test.ts tests/src/cli/cases/agents-scaffold-generation.test.ts tests/src/cli/cases/agents-scaffold-validation-failures.test.ts
```

Result:

- TypeScript build passed.
- Lint passed.
- Diff whitespace and conflict-marker scans were clean.
- Codex stage runner focused batch passed `37/37`.
- Stage-attempt / Temporal terminal focused batch passed `36/36`.
- Scaffold split focused batch passed `11/11`.
- Default line-budget advisory reports only existing unrelated oversized tests; it no longer reports `src/family-runtime-stage-attempts.ts` as a retired baseline entry.
- Strict line-budget remains blocked by existing unrelated oversized tests: `family-runtime-evidence-worklist`, `family-runtime-provider-hosted-attempts-cases/mas-default-executor`, `family-runtime-queue-guards`, `runtime-app-operator-drilldown-domain-dispatch-compaction`, and `runtime-app-operator-drilldown-provider-worker-actions`.

Attempted broad read-model gate:

```bash
rtk npm run test:read-model-gates
```

Result: the broad lane did not produce a test assertion failure in captured output; the tool session ended with code `-1` after no final output. This closeout therefore does not use the broad lane as pass evidence. The focused runner and stage-attempt batches above are the verification evidence for this structure split.

Post-absorption line-count readout:

| File | Lines |
| --- | ---: |
| `src/family-runtime-codex-stage-runner.ts` | 409 |
| `src/family-runtime-stage-attempts.ts` | 29 |
| `src/family-runtime-codex-stage-runner-parts/closeout-normalization.ts` | 123 |
| `src/family-runtime-codex-stage-runner-parts/default-executor-recovery.ts` | 218 |
| `src/family-runtime-codex-stage-runner-parts/input-prompt.ts` | 117 |
| `src/family-runtime-codex-stage-runner-parts/receipt-builders.ts` | 208 |
| `src/family-runtime-codex-stage-runner-parts/session-closeout-recovery.ts` | 79 |
| `src/family-runtime-codex-stage-runner-parts/shared.ts` | 34 |
| `src/family-runtime-stage-attempts-parts/closeout-ingest.ts` | 147 |
| `src/family-runtime-stage-attempts-parts/create.ts` | 217 |
| `src/family-runtime-stage-attempts-parts/fixture-activity.ts` | 80 |
| `src/family-runtime-stage-attempts-parts/inspect.ts` | 82 |
| `src/family-runtime-stage-attempts-parts/shared.ts` | 36 |
| `src/family-runtime-stage-attempts-parts/signals-heartbeat.ts` | 138 |
| `src/family-runtime-stage-attempts-parts/task-sync-summary.ts` | 95 |
| `src/family-runtime-stage-attempts-parts/temporal-terminal-observation.ts` | 330 |

## Remaining scope

This tranche does not close the global OPL series cleanup goal.

Carry-forward:

- Split or baseline-review the five unrelated oversized test files before claiming strict structure gate pass.
- Re-run the broad read-model gate after absorption if needed for a wider release/CI claim.
- Continue the broader six-repo stale module/interface/test/doc audit with per-surface owner evidence, preserving negative guards and tombstones that are active no-resurrection boundaries.
