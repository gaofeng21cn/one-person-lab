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

## 跨仓退役审计结论

本轮只读审计没有发现可立即物理删除且低风险的 active legacy / compat / retired 实现。候选面当前分为三类：

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
