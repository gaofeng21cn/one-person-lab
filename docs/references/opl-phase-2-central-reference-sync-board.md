# OPL Phase 2 中央 Reference Sync Tranche Board

状态锚点：`2026-05-02`

> 历史说明：这份 board 保留为 reference-sync 记录。OMX 已退出当前 OPL 开发环境；本文件不得再作为 OMX owner line、提示词模板或长跑 worktree 指引使用。

## 文档目的

这份文档记录 `one-person-lab` 在 Phase 2 后曾经冻结过的 follow-on reference-sync tranche board。

它解决的问题不是“继续发明更大的 OPL 平台故事”，而是：

- 当 `MedAutoScience` 或 `RedCube AI` 再次吸收新的 repo-tracked truth 后，
- `OPL` 如何在不升格成 runtime owner 的前提下，
- 连续完成中央 reference sync、gateway wording sync、历史迁移参考清理与 regression refresh，
- 而不是每做完一个小 slice 就回到“没有下一棒”的停车状态。

## 当前定位

这块 board 仍然只是：

- `Phase 2`
- `Minimal admitted-domain federation activation package` 之后的 follow-on board
- 中央 sync owner line

它不是：

- 新的 public mainline
- 新的 runtime activation package
- 新的 admitted-domain activation
- 把 `OPL` 提升成 runtime owner 的许可

## 当前预冻结的 tranche 顺序

1. `phase_2_admitted_domain_delta_intake_refresh`
   - 先把最新 absorbed admitted-domain delta 收进中央执行板、状态矩阵与任务板
   - 当前已知 delta：
     - `RedCube AI`：当前 latest absorbed delta 已推进到 upstream runtime-owner cutover 与 repo-verified `product frontdoor / federated product entry / session continuity / family-orchestration companion / product-entry readiness`，当前锚点为 `c124c5d`
     - `MedAutoScience`：`9b5cea8` `verification surfaces by test layer`、`7ee19a8` `runtime and workspace repair priorities`，以及 `6c64264` `workflow entry migration back to repo-tracked truth`
2. `phase_2_gateway_surface_wording_sync`
   - 只同步最小必要的 gateway wording / contract hub wording / acceptance wording
   - 不扩 OPL authority
3. `phase_2_historical_reference_cleanup`
   - 把已退役迁移参考收口为明确的非执行历史材料，避免重新生成当前提示词或长跑入口
4. `phase_2_reference_regression_refresh`
   - 把当前 tranche 的中央 sync 改动压回 tests，维持 machine-verified closeout

## 执行原则

- 每个 tranche 先更新 machine-readable / repo-tracked truth，再更新 doc / prompt / test
- 当前执行入口遵循 Codex-only / repo-tracked truth 口径；不再通过 OMX 或仓内 `.omx` 控制面启动长跑
- 只同步中央 reference surfaces 与最小必要 supporting surfaces
- 不允许把中央 sync 偷写成新的 authority promotion

## 当前明确允许同步的中央 surfaces

- `docs/references/contract-convergence-v1-execution-board.md`
- `docs/references/ecosystem-status-matrix.md`
- `docs/references/runtime-alignment-taskboard.md`
- `docs/references/opl-phase2-ecosystem-sync-owner-line.md`

如确有必要，可继续最小范围触达：

- `README*`
- `docs/roadmap*`
- `contracts/opl-gateway/README*`
- `docs/references/opl-gateway-acceptance-test-spec*`

前提是这些文件确实已经和 admitted-domain 最新 absorbed delta 发生 repo-tracked drift。

## Hard Boundaries

- 不把 `OPL` 写成 runtime owner
- 不把 `OPL` 写成 mutation gateway
- 不 admission `Grant Ops` / `Review Ops` / `Thesis Ops`
- 不新增 `G2` / `G3` readiness
- 不实现 routed-action runtime
- 不把 `Grant Foundry -> Med Auto Grant` 从 signal-only 提升成 admitted domain
- 不把 `Unified Harness Engineering Substrate` 写成已抽出的共享代码框架

## 推荐 closeout 顺序

1. 先跑 `phase_2_admitted_domain_delta_intake_refresh`
2. 若 intake refresh 后仍存在 wording drift，再继续 `phase_2_gateway_surface_wording_sync`
3. 若历史迁移参考仍会被误读成当前执行入口，再继续 `phase_2_historical_reference_cleanup`
4. 最后补 `phase_2_reference_regression_refresh`

如果在任一节点发现：

- 中央 surfaces 已经没有真实漂移
- 下一步需要新的外部 domain evidence
- 下一步会把 reference sync 写成 authority promotion

就应诚实停车。

## 推荐停车结论

- `CENTRAL_REFERENCE_CONVERGENCE_CLOSED_AND_ABSORBED`
- `NO_NEW_ADMITTED_DOMAIN_DELTA_HONEST_STOP`
