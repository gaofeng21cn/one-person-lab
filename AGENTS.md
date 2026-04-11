# One Person Lab 仓库协作规范

## 适用范围

本文件适用于仓库根目录及其所有子目录；若更深层目录存在 `AGENTS.md`，以更近者为准。

## 定位

- `AGENTS.md` 只约束工作方式，不承载项目知识细节。
- 项目知识默认从 `README*`、`docs/README*`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md` 读取。
- `OPL` 是 one-person research lab 的顶层 gateway 与 federation 模型；它不是任何单一 domain 仓库的别名、独占 runtime owner，或第四个 `Domain Harness OS`。

## 开发原则

- 第一优先级：保持 `Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS` 这条分层链路。
- 第二优先级：把 `Unified Harness Engineering Substrate` 的共享边界放在所有单仓之上。
- 第三优先级：保证 public docs、gateway contracts、reference docs 与 admitted domain 状态同步，不制造第二真相源。
- 不做降级处理、兜底补丁、启发式修补或“先糊住再说”式实现。

## 文档体系

- `README*` 与 `docs/README*` 是默认公开入口。
- `docs/project.md`：项目概览与当前公开角色。
- `docs/architecture.md`：顶层分层链路、gateway / contract / domain 边界。
- `docs/invariants.md`：硬约束与不能破坏的边界。
- `docs/decisions.md`：仍有效的关键决策与取舍。
- `docs/status.md`：当前 admitted domains、活跃主线、下一步和验证口径。
- `docs/README*` 继续维护 `OPL` 的四层公开文档体系，但 AI/维护者应先读核心五件套。
- `contracts/` 只保留 machine-readable contract surface；不再承载 narrative 规则。
- `docs/references/`：参考级配套文档。
- `docs/specs/` 与 `docs/plans/`：历史设计与计划记录。
- `docs/history/omx/`：OMX 历史资料入口，不再承担活跃 workflow。

## 文档规则

- 第一层和第二层公开文档保持双语；内部参考、历史、维护与技术文档默认中文。
- 新文档先判断角色，再决定落点；不要把公开主线、合同配套、参考材料和历史记录混在同一层。
- 如果某条规则需要长期冻结，应写入 `docs/invariants.md` 或相关 contract/doc surface，而不是继续堆在 `AGENTS.md`。

## 变更与验证

- 保持 diff 小、可审查、可回退。
- 能删就别加；能复用现有模式就别新起抽象。
- 没有明确必要不要新增依赖。
- 修改 gateway contracts、公开边界、默认 docs 入口、文档骨架或 admission wording 时，必须同步更新文档、contracts 与相关测试。
- 默认最小验证入口是 `scripts/verify.sh`。
- 默认 smoke 是 `npm test` / `npm run test:fast`。
- `npm run test:meta` 与 `npm run test:artifact` 是显式 lane。
- `npm run test:full` 是 clean-clone 基线。
- 上述验证入口必须与 `package.json` 和已跟踪测试保持一致。

## 并行开发与工作树

- 大改动、长链路工作、并行多 AI 开发，默认先从最新 `main` 开独立 worktree，再在 worktree 内实现和验证。
- 共享根 checkout 只用于轻量阅读、评审、吸收验证后提交、push 和清理，不应长期承担重型实现。
- 需要多条 lane 时创建多个 worktree，不要把多条长线塞进同一工作目录。

## 本地状态

- `.codex/` 与 `.omx/` 都是本地工具状态，必须保持未跟踪。
- `.omx/` 仅允许作为历史残留存在，不得再作为当前 workflow 入口。
