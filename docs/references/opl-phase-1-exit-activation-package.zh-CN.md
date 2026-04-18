[English](./opl-phase-1-exit-activation-package.md) | **中文**

# OPL Phase 1 Exit Activation Package

## 目的

这份 reference-grade package 用来冻结：`OPL` 在当前 `Phase 1` closeout 结束时，究竟还能诚实地说到哪一步。

它**不会**激活 runtime。
它**不会**收录新 domain。
它**不会**把 `OPL` 提升成 runtime owner。

它负责记录：

- 当前 `Phase 1` 已经完成了什么
- 哪些内容仍然被显式 deferred
- `OPL` 要离开当前 `Phase 1` 必须满足哪些门槛
- 哪些门槛依赖外部 domain readiness，而不是继续在本仓做 wording 微调
- `OPL` 自己还能继续完成什么
- 一旦门槛真实满足，最小的更强 federation follow-on 会是什么

对应的 machine-readable companion 是 [`../../contracts/opl-gateway/phase-1-exit-activation-package.json`](../../contracts/opl-gateway/phase-1-exit-activation-package.json)。

## 已冻结的 `Phase 1` 完成面

当前 `Phase 1` closeout 已冻结为下列已完成 tranche：

1. `Phase 1 / G2 release-closeout`
2. `Phase 1 / G3 thin handoff planning freeze hardening`
3. `Phase 1 / Grant Ops candidate-domain backlog and onboarding-package hardening`
4. `Phase 1 / Review Ops candidate-domain backlog and onboarding-package hardening`
5. `Phase 1 / Thesis Ops candidate-domain backlog and onboarding-package hardening`

由此得到的 formal entry 仍然是当前本地 `TypeScript CLI`-first / gateway contract surface。
这也继续意味着：

- 不进入 mutation entry
- 不启动 run launch
- 不进行 workspace write
- 不激活 routed-action runtime
- 不实现 shared execution core
- 不实现 managed web runtime
- 不把 `OPL` 提升成 runtime owner

## 显式 deferred 的内容

即使当前 `Phase 1` closeout 完成后，下面这些内容仍然明确保持 deferred：

- `Grant Ops`、`Review Ops`、`Thesis Ops` 的任何 formal admission
- 这些 candidate domain 的任何 `G2` discovery readiness
- 这些 candidate domain 的任何 `G3` routed-action readiness
- 这些 candidate domain 的任何 handoff-ready surface
- 任何 `G3` mutation / routed-action runtime
- 任何 mutation entry、run launch、workspace write、shared execution core 或 managed web runtime
- 任何把 `OPL` 提升成 truth store 或 runtime owner 的说法

## 离开 `Phase 1` 的门槛

`OPL` 只有在下面全部成立时，才允许离开当前 `Phase 1`：

1. **本仓 public truth / contracts / tests 继续稳定**
   顶层 docs、machine-readable contracts 与 regression tests 持续对齐。
2. **candidate-domain path 已在当前定义层完成收口**
   `Grant Ops`、`Review Ops`、`Thesis Ops` 都继续保持 blocked / under definition / non-admitted / non-ready。
3. **最小下一阶段 tranche 先被诚实冻结**
   该 tranche 必须先有明确名称、scope、non-goals 与 verification requirements。
4. **至少两个 admitted domain surface 真实稳定到足以支撑更强 federation 表达**
   这条门槛依赖外部 domain readiness，而不是继续在 `OPL` 内部做 wording 微调。
5. **任何 wording 都不能漂到 runtime-owner 或 shared-runtime 叙述**
   `OPL` 必须继续保持为顶层 gateway/federation surface。

## 当前冻结点的门槛判断

在当前冻结点：

- `OPL` 内部 truth/contract/test 门槛：**已满足**
- candidate-domain closeout 门槛：**已满足**
- 下一阶段 tranche 定义门槛：**已满足**
- anti-runtime-drift 门槛：**已满足**
- “至少两个 admitted domain surface 足够稳定”这条门槛：**尚未满足**

当前 repo-tracked 的 blocker 是外部 readiness：

- 四仓同步面仍把 `redcube-ai` 记录在 `P0 credible green baseline repair`，其 active-mainline truth 与 formal-entry closeout 仍在推进中
- 因此 `OPL` 现在还不能诚实声称：至少两个 admitted domain surface 已经稳定到足以激活更强 federation activation package

## `OPL` 仍可自行继续完成的内容

在这条外部门槛变化前，`OPL` 仍可继续：

- 维护当前 admitted-domain gateway baseline 的 docs/contracts/tests 对齐
- 继续把 candidate-domain path 显式保持为 blocked，而不伪造 admission 或 readiness
- 维护 reference-grade sync surfaces，但不把它们抬升成 public-mainline truth
- 仅在外部 admitted-domain readiness 真实变绿之后，再推进更强 federation wording/contracts

## 最小下一阶段 tranche

最小 follow-on 已冻结为：

- **名称：** `Minimal admitted-domain federation activation package`
- **范围：** 只面向已经 admitted 的 domain，使用 docs+contracts+tests first 的方式加强顶层 gateway/federation 表达
- **非目标：** 不激活 runtime，不新增 mutation entry，不实现 shared execution core，不实现 managed web runtime，也不推进任何 candidate-domain admission 或 readiness promotion
- **验证：** 保持 canonical verification pack 通过，并补 focused wording/contract audit

这个 follow-on **当前不会被激活**。
它已经被冻结，但仍然 blocked on external readiness。

## 当前诚实终态

在当前 repo-tracked freeze 上，诚实的 program state 是：

`EXTERNAL_READINESS_BLOCKED_AFTER_ABSORB`

这意味着：

- `Phase 1` closeout truth 已 absorb
- 最小下一阶段定义已冻结
- 不会为了“自动推进”而伪造一个下一阶段
- 当前 blocker 是外部 domain readiness，而不是本仓还差一次 wording pass
