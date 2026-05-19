# OPL 托管运行时三层合同

Purpose: `references_runtime_substrate_opl_managed_runtime_three_layer_contract`
State: `support_reference`

Status: `support_reference_updated`
Owner: `One Person Lab`
Machine boundary: 本文是人读边界参考；机器可读事实必须使用 `contracts/`、source code、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 或 App/workbench projection。

当前状态说明（2026-05-14）：本文保留“三层 owner split”作为有效内容，但旧版 `runtime_owner = upstream_hermes_agent` 映射已经过时。当前 OPL production online runtime 是 provider-backed runtime；Temporal-backed provider 是必需 substrate。`hermes_agent` 属于当前 canonical executor backend set，并且只能作为显式非默认 executor adapter/backend 使用；Hermes provider / Gateway / readiness / compat 面只作为历史 provenance、诊断语料或负向 guard。最新落地顺序见 [OPL stage-led agent framework roadmap](./opl-stage-led-agent-framework-roadmap.md) 与 [Temporal Family Runtime Provider 落地计划](./temporal-family-runtime-provider-plan.md)。

这份参考文档冻结 `OPL` 已准入 domain 现在必须共用的最小 machine-readable contract。

它不宣称“共享 runtime 代码包已经完成”，只冻结不该再漂移的 owner 与 surface 形状：

- `runtime_owner`
- `domain_owner`
- `executor_owner`
- `supervision_status_surface`
- `attention_queue_surface`
- `recovery_contract_surface`
- 以及 canonical fail-closed 规则

## 为什么需要这层合同

如果 hosted runtime owner 和 domain supervision owner 混在一起，就会反复出现两类错误：

- domain 层不知道 live run 是 paused、stale 还是已经掉线
- domain 层会绕过 runtime，自己去抢后半段 execution

这份合同把边界直接写死：

- `runtime_owner`
  - hosted runtime 生命周期 owner
- `domain_owner`
  - 领域 supervision / gate / progress truth owner
- `executor_owner`
  - 具体干活的执行 owner

## 当前已准入 domain 的统一落点

- `med-autoscience`
  - `runtime_owner = opl_family_runtime_provider`
  - `provider_target = temporal`
  - `legacy_provider = none`
  - `domain_owner = med-autoscience`
  - `executor_owner = codex_cli_via_mas_domain_entry`
- `redcube-ai`
  - `runtime_owner = opl_family_runtime_provider`
  - `provider_target = temporal`
  - `legacy_provider = none`
  - `domain_owner = redcube_ai`
  - `executor_owner = codex_cli`
- `med-autogrant`
  - `runtime_owner = opl_family_runtime_provider`
  - `provider_target = temporal`
  - `legacy_provider = none`
  - `domain_owner = med-autogrant`
  - `executor_owner = codex_cli_or_domain_declared_executor`

这里的 `runtime_owner` 表示 OPL family provider / attempt ledger / readiness / projection owner，不表示 OPL 接管 domain truth。这里的 `executor_owner` 表示 stage 内具体执行承载；默认仍是 `Codex CLI`，domain 可以在自己的合同内声明更具体的 executor。

## 非目标

- 不是 runtime control plane
- 不是共享 truth store
- 也不等于三个 domain 已经共用同一套 executor 实现
- 不把 `Hermes-Agent` 恢复为默认目标 runtime substrate
