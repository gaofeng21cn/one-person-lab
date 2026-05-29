# OPL Series Directory Governance Ledger

Owner: `One Person Lab`
Purpose: `process_ledger`
State: `historical_archive`
Machine boundary: 本文只记录 automation-2 本轮目录治理参考文档覆盖和 live evidence 摘要。当前 truth 继续归 active owner docs、contracts/source/tests、CLI/read-model、runtime ledger 和 domain-owned manifests。

## Run Scope

- `RUN_SNAPSHOT_TS`: `2026-05-29T17:36:09Z`
- 本轮 tranche: `one-person-lab` operating-governance directory reference currentness cleanup。
- 覆盖文档: `docs/references/operating-governance/opl-family-directory-governance.md`、`docs/references/runtime-substrate/opl-family-agent-ideal-state.md`、`docs/active/current-state-vs-ideal-gap.md`、`docs/status.md`、核心 docs index/architecture/invariants/decisions、history process index。
- 覆盖机器面: `.gitignore`、`scripts/repo-hygiene.sh`、`package.json` hygiene scripts、`tests/src/verification-command-surfaces.test.ts`、`tests/src/verification-test-governance.test.ts`、live OPL CLI/read-model commands。

## Live Evidence

Fresh read-model at this tranche showed:

- `opl agents conformance --family-defaults --json`: structural conformance passed for 4 repos, blocked count 0, production evidence tail reported separately.
- `opl agents default-callers --family-defaults --json`: 32 generated/default caller surfaces, 0 blocked, 0 missing owner/typed-blocker, no-forbidden-write, or tombstone/provenance refs.
- `opl domain-memory list --json`: 3 resolved memory descriptors, 0 missing, runtime receipt evidence remained refs-only and `opl_writes_memory_body=false`.
- `opl runtime app-operator-drilldown --json`: App/operator remained refs-only, with memory writeback refs and running provider attempt liveness projection; no domain ready, artifact ready, publication ready, or production ready authority.
- `opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json`: open worklist 0, closed refs-only item 384, blocked refs-only envelope 951, `domain_ready_authorized=false`, `production_ready_authorized=false`, and zero-open worklist explicitly not a completion/domain-ready/production-ready claim.
- OPL doc doctor returned `finding_count=0` and `active_truth_health=pass`.

## Change

`docs/references/operating-governance/opl-family-directory-governance.md` no longer freezes the old `2026-05-28` conformance/memory/worklist counters as current status. It now keeps the stable directory owner boundary, lists live read-model inputs, and routes dynamic counters to CLI/read-model or this history ledger.

No source, contracts, tests, workflow, module, interface, or CLI entrypoint was retired in this tranche.

## Retained Boundaries

- Physical domain repo directory deletion still requires replacement parity, active-caller cutover, no-forbidden-write proof, owner receipt or typed blocker, focused repo-native tests, and tombstone/provenance refs.
- Standard conformance, generated/default caller readiness, memory descriptor resolution, zero-open worklist, hygiene pass, doctor pass, or App/operator projection cannot authorize domain ready, production ready, App release ready, artifact authority, memory body apply, quality verdict, or physical delete.

## Carry Forward

- Continue auditing OPL support references for dated counters, branch/SHA state, receipt ids, provider proof snapshots, and local proof paths.
- Snapshot-retained lanes remain for MAS ahead-main work, RCA dirty/native-PPT worktrees and post-snapshot activity, and App dirty root/full-first-run worktree.
