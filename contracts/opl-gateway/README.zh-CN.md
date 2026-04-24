# OPL Gateway 合同

这个目录保留的是 `One Person Lab` 早期 gateway-first 阶段留下来的 gateway / federation 合同语料。

它继续被仓库跟踪，是因为其中一部分内容仍然对下面几类工作有用：

- 审计与历史追溯
- 兼容性检查
- schema 考古
- 少量仍被 repo-tracked 测试或 manifest 引用的共享兼容工件

但它已经不再是今天 `OPL` 的默认公开集成合同。
当前主线已经收口为 `Codex-default session/runtime + explicit activation layer + family skill sync/discovery`。

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
- `managed-runtime-three-layer-contract.json` 和 `family-executor-adapter-defaults.json` 仍然可以作为共享兼容工件继续使用。
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

- 除非新的核心文档明确重新提升，否则默认把这个目录理解成旧兼容语料
- 不把这里当成今天 `OPL` 的默认实现依据
- domain truth 继续归对应 domain 仓所有，而不是归这个目录所有
