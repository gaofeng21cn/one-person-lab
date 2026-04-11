# OPL 关键决策

## 2026-04-11

### 决策：固定 AI / 维护者核心五件套

- `docs/project.md`
- `docs/architecture.md`
- `docs/invariants.md`
- `docs/decisions.md`
- `docs/status.md`

原因：让项目目标、边界、当前状态与关键决策有固定入口，避免继续分散在 README、参考文档和历史计划中。

### 决策：保留四层公开文档体系，但把核心工作集前置

原因：`OPL` 既有公开叙事，也有大量 reference-grade 材料。完全打平会让公开面失控，完全只保留四层又不利于 AI 快速定位当前知识，因此采用“双层视图”：AI/维护者核心五件套 + 公开四层体系。

### 决策：`contracts/` 不再承载 narrative 规则

原因：机器合同和协作规范应当分层维护，防止重复真相源。

### 决策：OMX 只保留历史入口

原因：OMX 已退场，后续若仍需要追溯，只能从 `docs/history/omx/` 进入。

### 决策：当前 repo-tracked follow-on 固定为 `S1 / shared runtime substrate v1 contract freeze`

原因：当前最需要冻结的不是新的 phase / sync 叙事，而是 shared runtime substrate v1 的统一对象语言、推广顺序与 activation package。

### 决策：`S1` 先冻结在公开文档与 reference-grade 文档层

原因：shared runtime substrate v1 目前还没有被严格证明为 gateway-owned machine-readable surface，直接写进 `contracts/opl-gateway/*.json` 会制造 truth drift。

### 决策：shared runtime substrate 是 cross-domain contract layer，不是 routed hop

原因：`OPL` 的主控制链必须继续保持 `Gateway -> Domain Gateway -> Domain Harness OS`，substrate 负责约束共享 contract，不负责替代域间路由。
