# OPL 关键决策

## 2026-04-11

### 决策：`Hermes-Agent` 只指上游外部 runtime substrate

原因：之前已经出现把“参考 Hermes-Agent”误写成“仓内已经接入 Hermes-Agent”的漂移。后续凡是使用 `Hermes-Agent` 这个名字，都必须指向上游外部项目 / 服务本体，而不是仓内自写 shim、pilot、helper 或 scaffold。

### 决策：四仓当前都未落地真实的上游 Hermes-Agent 集成

原因：截至当前时点，四个仓都还没有把 session、run、event、memory、scheduler、gateway 等 runtime substrate 能力真正交给上游 `Hermes-Agent` 持有。继续沿用“已接入 Hermes-Agent”的说法，只会误导下一轮实现。

### 决策：先做真实上游集成，再做共享 runtime 回抽

原因：之前“先在仓内做出一层 Hermes，再往 shared substrate 回抽”的路线已经证明容易偏离目标。后续应先在合适 domain 仓里完成至少一个真实的上游 `Hermes-Agent` pilot，再决定哪些实现值得回抽到共享层。

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

### 决策：项目级 `.codex/` 与 `.omx/` 退役

原因：这两类目录在项目仓内主要承载历史执行面、本机 hook、session 与 prompt 状态，已经不再构成当前 repo-tracked truth。继续保留在仓库根目录，会放大历史路线对当前工作的干扰。

影响：如需保留历史 session、prompt、log 或 hook 状态，统一迁入用户级 `~/.codex/` 归档；仓库根目录不再保留项目级 `.codex/` / `.omx/`。

### 决策：目标形态优先于历史路线

原因：历史规划、过渡方案和旧执行口径可以保留为背景材料，但不能继续主导当前投入方向。对 `OPL` 系列来说，一旦新的 target topology 已经明确，新增工作就应默认服务目标形态，把旧路线降级为迁移桥、兼容层或回归对照。
