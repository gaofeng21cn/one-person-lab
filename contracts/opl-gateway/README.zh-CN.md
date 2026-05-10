# OPL Gateway 合同

这个目录保留 `One Person Lab` 的 gateway、runtime 与 family control-plane 合同语料。

它继续被仓库跟踪，是因为其中一部分内容仍然对下面几类工作有用：

- 审计与历史追溯
- 兼容性检查
- schema 考古
- 少量仍被 repo-tracked 测试或 manifest 引用的共享兼容工件

其中一部分 gateway-first 文件仍按兼容材料读取，但 Runtime Manager 与 family runtime 合同是 provider-backed family runtime 主线的活跃机器合同。
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

- `workstreams.json`、`domains.json`、`routing-vocabulary.json`、`handoff.schema.json`、`routed-actions.schema.json` 和 `public-surface-index.json` 都按旧的 gateway-first 语料理解。
- `family-runtime-online-substrate-contract.json`、`managed-runtime-three-layer-contract.json` 和 `runtime-manager-contract.json` 是当前 provider-backed family runtime 主线的活跃机器合同。
- `family-executor-adapter-defaults.json` 继续作为共享 executor 兼容工件使用。
- onboarding、backlog、acceptance、example 和 operating-record 相关文件继续作为 reference-grade 审计材料存在。

除非新的核心文档显式把某个文件重新提升回活跃主线，否则这里的内容都应按 compatibility 或 historical support 理解。

## 文件清单

- `workstreams.json`
- `domains.json`
- `routing-vocabulary.json`
- `handoff.schema.json`
- `routed-actions.schema.json`
- `domain-onboarding-readiness.schema.json`
- `family-executor-adapter-defaults.json`
- `managed-runtime-three-layer-contract.json`
- `runtime-manager-contract.json`
- `family-runtime-online-substrate-contract.json`
- `governance-audit.schema.json`
- `publish-promotion.schema.json`
- `acceptance-matrix.json`
- `public-surface-index.json`
- `task-topology.json`
- `candidate-domain-backlog.json`
- `phase-1-exit-activation-package.json`
- `minimal-admitted-domain-federation-activation-package.json`
- `operating-record-catalog.json`
- `surface-lifecycle-map.json`
- `surface-authority-matrix.json`
- `surface-review-matrix.json`

## 阅读规则

- gateway-first 文件除非新的核心文档明确重新提升，否则按旧兼容语料理解
- Runtime Manager 与 family runtime 合同按 provider-backed family runtime 主线活跃依据读取
- domain truth 继续归对应 domain 仓所有，而不是归这个目录所有
