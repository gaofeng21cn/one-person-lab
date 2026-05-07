# OPL 托管运行时三层合同

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
  - `runtime_owner = upstream_hermes_agent`
  - `domain_owner = med-autoscience`
  - `executor_owner = med_deepscientist`
- `redcube-ai`
  - `runtime_owner = upstream_hermes_agent`
  - `domain_owner = redcube_ai`
  - `executor_owner = codex_cli`
- `med-autogrant`
  - `runtime_owner = upstream_hermes_agent`
  - `domain_owner = med-autogrant`
  - `executor_owner = med-autogrant`

## 非目标

- 不是 runtime control plane
- 不是共享 truth store
- 也不等于三个 domain 已经共用同一套 executor 实现
