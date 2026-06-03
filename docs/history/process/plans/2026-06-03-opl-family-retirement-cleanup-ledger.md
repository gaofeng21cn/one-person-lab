# OPL Family 退役清理 Ledger 2026-06-03

Owner: `One Person Lab`
Purpose: `execution_ledger`
State: `closed_snapshot`
Machine boundary: 本文记录本轮跨仓退役清理的 frozen audit、落地变更和阻塞边界。当前机器真相继续归各仓 source、contracts、CLI/test 输出、git status/worktree 和 runtime evidence。

## 范围

本轮目标是按当前理想态清理仍 active 的过时模块、接口和测试，并避免把仍有 active caller、迁移窗口、负向 guard 或 domain-owned authority 的 surface 误删成“兼容面”。

审计仓库：

- `one-person-lab`
- `med-autoscience`
- `med-autogrant`
- `redcube-ai`
- `opl-meta-agent`
- `one-person-lab-app`
- `opl-aion-shell`
- `opl-agui-codex-shell`

## 落地变更

`one-person-lab` 本轮创建独立 worktree `codex/opl-retirement-framework-20260603` 做结构收薄验证，随后吸收回 `main`。起始失败点是 `src/opl-meta-agent-consumption.ts` 接近 line-budget 上限，patch-loop / self-evolution cockpit 逻辑堆在 registry consumption 主入口。

已落地：

- `src/opl-meta-agent-consumption.ts` 保留 `buildOplMetaAgentRegistryExtension`、`defaultOmaRepoDir` 和 `refsOnlyAuthorityBoundary` 公开入口。
- OMA patch-loop closeout 与 self-evolution cockpit helper 迁入 `src/opl-meta-agent-consumption-parts/patch-loop.ts`。
- OMA refs-only JSON/shared helper 迁入 `src/opl-meta-agent-consumption-parts/shared.ts`，并复用既有 `src/opl-meta-agent-consumption-boundary.ts`。
- `src/opl-meta-agent-consumption.ts` 回到 line-budget 以下，恢复结构门余量。

该变更只是 OPL framework 自身结构收薄，不生成 OMA owner receipt、target-owner receipt、domain truth、quality verdict、default promotion 或 production-ready claim。

## 2026-06-03 二阶段物理退役吸收

本轮第二阶段在独立 worktree 中完成两个高置信物理删除，并已吸收到各自 `main` checkout。两个删除都满足 no-active-caller / replacement parity / repo-native verification；删除后不保留 compatibility wrapper、alias 或占位测试。

- `med-autoscience`: 删除 `src/med_autoscience/runtime_protocol/legacy_restore_import_diagnostics.py`。该文件只是测试层导入的 legacy restore diagnostic wrapper；canonical 行为继续由 `paper_artifacts.resolve_paper_bundle_manifest(..., legacy_restore_import_diagnostic=True)` 与 `quest_state.find_latest_legacy_restore_import_diagnostic_main_result_path` 持有。同步更新 `tests/test_runtime_protocol_paper_artifacts.py` 与 `docs/status.md`。Fresh verification: `scripts/run-pytest-clean.sh tests/test_runtime_protocol_paper_artifacts.py tests/test_runtime_protocol_quest_state.py` 为 `31 passed`；`scripts/verify.sh smoke` 为 `4 passed`；`git diff --check` 通过。
- `opl-aion-shell`: 删除 no-op placeholder `packages/web-host/tests/equivalence.test.ts` 及其专用 fixture `packages/web-host/tests/fixtures/mock-backend.ts`。active WebUI host coverage 继续由 `packages/web-host/src/*.test.ts` 与 `packages/web-host/tests/start-web-host.test.ts` 持有。同步更新 `docs/guides/opl-app-shell-boundary.md`。Fresh verification: `bun run --cwd packages/web-host test` 为 `4 passed` test files、`36 passed | 3 todo` tests；输出保留既有 `MaxListenersExceededWarning`，退出码为 0；`git diff --check` 通过。

## 剩余跨仓退役审计结论

除上述两个删除项外，候选面当前仍分为三类：

- `active_caller_or_migration_window`: MAS workspace legacy entries / restore diagnostics、AionUI database and assistant migrations、App Settings legacy redirects。
- `refs_only_guard_or_negative_test`: MAG retired command guards、RCA tombstone/no-resurrection guards、OPL/App release-boundary guards。
- `candidate_or_proof_lane`: AGUI Codex shell candidate、RCA Hermes opt-in bridge、OMA materializer/helper scripts、AionUI Team and E2E bridge helper。

这些 surface 名称里带 legacy / compat / retired 不等于可以删除。删除门必须先满足 no-active-caller、replacement parity、owner receipt 或 typed blocker、no-forbidden-write、migration window closure 和 repo-native verification。

## 当前阻塞

- `one-person-lab-app` dirty，且 legacy Settings redirect、retired model / morph-ppt 和 shell candidate gates 仍由 release-boundary / active-shell validator 锁定。
- `opl-aion-shell` root 和多个 worktree dirty；Team、bridge helper、legacy migrations 仍被 active router、E2E 或 migration path 调用。
- `redcube-ai` ahead/behind 且存在 dirty/status inconsistency；Hermes-named bridge 当前是 explicit proof lane，不是默认 runtime 复活。
- MAS/MAG/OMA 的候选面仍有 active caller 或 source-purity materializer role；需要先完成 owner replacement / OPL hosted generated surface 证据。

## 验证入口

本轮 OPL framework lane 的最小验证：

- `npm run typecheck`
- OMA production-consumption focused tests
- `./scripts/verify.sh line-budget`
- `./scripts/verify.sh structure`
- `./scripts/verify.sh smoke`
- `npm run test:meta`

跨仓后续若进入 physical delete，应按对应仓 repo-native gate 重新跑 fresh verification；不能复用本 ledger 的只读审计当作删除授权。
