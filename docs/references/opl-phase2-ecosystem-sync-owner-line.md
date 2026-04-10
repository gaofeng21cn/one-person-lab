# OPL Phase 2 生态同步 Owner Line Brief

状态锚点：`2026-04-10`

## 文档目的

这份文档冻结 `one-person-lab` 当前最适合交给 `OMX` 新开的 owner line。

它解决的是：

- 在 `Phase 2 / Minimal admitted-domain federation activation package` 已吸收到 `main` 之后，`OPL` 还能诚实推进什么；
- 哪些动作适合由 `OMX` 在独立 owner `worktree` 中长跑执行；
- 什么时候应该继续同步，什么时候应该诚实停车。

它不是：

- 新的 public truth owner；
- 新的 runtime activation package；
- 把 `OPL` 升格成 runtime owner 的授权。

当前配套的 repo-tracked follow-on truth 固定为：

- `contracts/opl-gateway/phase-2-central-reference-sync-board.json`
- `contracts/opl-gateway/phase-2-admitted-domain-delta-intake-refresh.json`
- `docs/references/opl-phase-2-central-reference-sync-board.md`
- `docs/references/opl-phase-2-admitted-domain-delta-intake-refresh.md`

## 当前结论

`OPL` 当前最适合由 `OMX` 承接的新线，不是继续虚构更大的平台故事，而是：

- 作为四仓中央 sync owner，
- 在已有 admitted-domain 证据边界内，
- 持续吸收 `MedAutoScience` 与 `RedCube AI` 等 admitted domain 新落地的 repo-tracked truth，
- 并把顶层 federation wording、中央状态表、执行板、任务板、提示词模板与 acceptance/reference surfaces 同步到最新一致状态。

当前这条线要同步的 admitted-domain delta，已经包括：

- `RedCube AI` 当前 latest absorbed delta 已推进到 `9cfe58b` 的 `runtime watch locator integrity hardening`，不能再只停留在 quickstart/operator-surface wording；
- `RedCube AI` 之前已吸收的 operator route truth 仍必须保留：`workspace doctor` 继续只做诊断，而 bootstrap writer 仍是 `source intake / source research`；
- `MedAutoScience` 当前 latest absorbed repo-side hardening 已推进到 `5366d18`，不能再只停留在 `7444000`；
- `MedAutoScience` 已冻结的 `manual stabilization checklist` 仍属于中央 sync 时必须保留的 repo-side truth；
- `Med Auto Grant` 仍允许作为中央状态矩阵里的 signal-only / non-admitted status reference，但不参与 admitted-domain activation；若中央说明引用其本地 runtime baseline，也必须保留 `CURRENT_PROGRAM.program_id` 这类已冻结 fail-closed guard 只是 signal-only direction evidence，而不是 admission 事实。

换句话说，`OPL` 现在适合开的不是“更大平台实现线”，而是：

- `Phase 2 ecosystem reference-sync and admitted-domain federation upkeep`
- 而且这条 owner line 不再只是一句 owner note，而是有一块已预冻结的 tranche board：
  1. `phase_2_admitted_domain_delta_intake_refresh`
  2. `phase_2_gateway_surface_wording_sync`
  3. `phase_2_omx_prompt_and_worktree_handbook_sync`
  4. `phase_2_reference_regression_refresh`

## 什么时候值得开这条线

只有满足下面任一条件时，这条线才值得由 `OMX` 打开：

1. 已 admitted 的业务仓出现新的 absorbed repo-tracked truth，导致：
   - `docs/references/ecosystem-status-matrix.md`
   - `docs/references/contract-convergence-v1-execution-board.md`
   - `docs/references/runtime-alignment-taskboard.md`
   - `docs/references/omx-longrun-prompt-playbook.md`
   需要同步更新；
2. 当前顶层 `README*`、`docs/roadmap*`、`contracts/opl-gateway/README*`、acceptance/reference surfaces 与 admitted-domain 最新真相出现漂移；
3. 当前 `OPL` 顶层关于 formal entry、no-bypass、candidate-domain blocked truth、federation wording 的 repo-tracked surfaces 之间出现不一致。

如果上述条件都不满足，`OPL` 不应为了“保持在跑”而硬开一条 story-first 线。

## 当前 owner line 目标

这条线的目标固定为：

1. 保持 `OPL` 作为顶层 `Gateway / Federation / control language / public system surface` 的诚实表述；
2. 把 admitted-domain 最新已吸收证据同步回中央参考面；
3. 把四仓统一 program 的阶段、完成标准、下一棒与 OMX 提示词模板保持最新；
4. 每个 same-mainline slice 先更新 machine-readable / repo-tracked truth，再更新 README / docs / tests；
5. 继续守住：
   - `CLI-first / read-only` formal entry
   - `domain_gateway` 才是唯一允许的 successful handoff target
   - no-bypass
   - candidate domains 继续 blocked below onboarding / non-admitted / non-G2 / non-G3 / non-handoff-ready

当前第一条 activation package 只允许先做：

- `phase_2_admitted_domain_delta_intake_refresh`

也就是先把 latest absorbed admitted-domain delta 收进中央执行板、状态矩阵、任务板与 OMX 提示词模板，再决定是否继续下一条 wording / handbook / regression sync tranche。

## In Scope

- `docs/references/ecosystem-status-matrix.md`
- `docs/references/contract-convergence-v1-execution-board.md`
- `docs/references/runtime-alignment-taskboard.md`
- `docs/references/omx-longrun-prompt-playbook.md`
- `docs/references/opl-phase-2-central-reference-sync-board.md`
- `docs/references/opl-phase-2-admitted-domain-delta-intake-refresh.md`
- admitted-domain 最新真相落地后，必要的：
  - `README*`
  - `docs/roadmap*`
  - `contracts/opl-gateway/README*`
  - `docs/references/opl-gateway-acceptance-test-spec*`
  - `contracts/opl-gateway/*` supporting surfaces
  的同步收紧

## Hard Boundaries

这条线不得越过下面边界：

- 不把 `OPL` 写成 runtime owner
- 不把 `OPL` 写成 mutation gateway
- 不把 `OPL` 写成 shared execution core
- 不 admission `Grant Ops`、`Review Ops`、`Thesis Ops`
- 不创造新的 `G2` discovery readiness、`G3` routed-action readiness、handoff readiness
- 不把 `Grant Foundry -> Med Auto Grant` 从 signal-only / domain-direction evidence 擅自提升成 admitted domain
- 不实现 routed-action runtime
- 不把 `Unified Harness Engineering Substrate` 写成已经抽出的共享代码框架

## Recommended Verification Pack

每轮 closeout 至少重跑：

- `git diff --check`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`
- `NODE_NO_WARNINGS=1 node --test tests/built/cli.test.mjs`
- `NODE_NO_WARNINGS=1 node --experimental-strip-types --test tests/src/opl-activation-package-derived-surface-sync.test.ts tests/src/opl-minimal-admitted-domain-federation-activation-package.test.ts tests/src/opl-public-truth-docs.test.ts`
- focused `rg` audit：
  - `runtime owner`
  - `no-bypass`
  - `candidate-domain`
  - `signal-only`
  - `G2`
  - `G3`
  - `handoff-ready`

## Honest Stop Conditions

出现任一情况就应停车：

1. 当前 admitted-domain repo-tracked evidence 没有新增 delta；
2. 继续推进需要新的仓外 domain evidence；
3. 继续推进需要 admission 新 domain、打开 `G3` runtime、或改写 formal entry；
4. 继续推进会把 reference sync 写成 runtime-owner story。

## 推荐的停车结论

这条线的理想停车结论不是“永远不停”，而是：

- `CENTRAL_REFERENCE_CONVERGENCE_CLOSED_AND_ABSORBED`
  或
- `NO_NEW_ADMITTED_DOMAIN_DELTA_HONEST_STOP`

前者表示本轮中央 reference convergence sync 已完成并吸收；
后者表示当前没有新的 admitted-domain truth 可以诚实同步。
