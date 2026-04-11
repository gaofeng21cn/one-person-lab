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
