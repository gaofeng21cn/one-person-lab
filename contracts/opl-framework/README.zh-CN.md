# OPL Framework 合同

这个目录保留 `One Person Lab` 当前活跃的 framework、runtime 与 family control-plane 合同语料。

它继续被仓库跟踪，是因为当前 framework 需要稳定的机器可读输入：

- stage-led 任务选择
- 已收录 domain-agent 目录投影
- provider-backed runtime attempt
- Runtime Manager readiness 与状态投影
- 可选 native helper 生命周期检查

当前主线是 `Codex-default executor + explicit OPL activation + configured family runtime provider + family skill sync/discovery`。

## 当前真相应去哪里看

当前 `OPL` 模型应优先回到：

- `README*`
- `docs/project.md`
- `docs/status.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `contracts/README.md`

如果要恢复当前 repo-owned capability surface，则继续阅读已收录 domain 仓及其被 `opl skill sync` 激活的 app skill。

## 这个目录应该怎么读

- `workstreams.json`、`domains.json`、`stage-selection-vocabulary.json`、`task-topology.json` 和 `public-surface-index.json` 定义当前活跃的 stage-led framework 选择面。
- `family-runtime-online-substrate-contract.json`、`family-runtime-attempt-contract.json`、`standard-domain-agent-skeleton-contract.json`、`managed-runtime-three-layer-contract.json` 和 `runtime-manager-contract.json` 是当前 provider-backed family runtime 主线的活跃机器合同。
- `family-executor-adapter-defaults.json` 继续作为共享 executor 合同使用。
- 已退役的 gateway、federation、routed-action、onboarding、acceptance、governance 与 example corpora 不再保留在这个活跃 contract root 中。

## 文件清单

- `workstreams.json`
- `domains.json`
- `stage-selection-vocabulary.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `family-runtime-attempt-contract.json`
- `standard-domain-agent-skeleton-contract.json`
- `public-surface-index.json`
- `task-topology.json`

## 阅读规则

- 本目录按活跃 OPL framework contract set 读取
- Runtime Manager、family runtime attempt 与 standard domain-agent skeleton 合同按 provider-backed family runtime 主线活跃依据读取
- domain truth 继续归对应 domain 仓所有，而不是归这个目录所有
