# One Person Lab 仓库协作规范

## 适用范围

本文件适用于仓库根目录及其所有子目录；若更深层目录存在 `AGENTS.md`，以更近者为准。

## 定位

- `AGENTS.md` 只约束工作方式，不承载项目知识细节。
- 项目知识默认从 `README*`、`docs/README*`、`docs/project.md`、`docs/status.md`、`docs/architecture.md`、`docs/invariants.md`、`docs/decisions.md` 读取。
- `OPL` 是 one-person lab 的 `Codex-default session/runtime`、显式 activation 层，以及跨仓 shared modules / contracts / indexes 的归属层；它不是任何单一 domain 仓的别名，也不接管 domain truth。
- 当前 active domain agent 仓是 `MAS`、`MAG`、`RCA`。`MDS` 是 `MAS` 之下的受控 runtime/backend companion，不作为 OPL 默认 active domain agent 或默认 OPL-managed domain module。

## 开发原则

- 第一优先级：保持 `Codex-default session/runtime -> explicit OPL activation -> selected domain agent entry` 这条当前主链路。
- 第二优先级：把 shared modules / contracts / indexes 的共享边界放在 domain 仓之上，同时保留 domain-owned truth。
- 第三优先级：保证 public docs、machine-readable contracts、reference docs 与 active domain agent 状态同步，不制造第二真相源。
- repo-tracked 源码与测试默认都应保持文件边界清晰，优先控制在 `1000` 行以内；超过 `1500` 行应视为明确的拆分信号，而不是继续堆叠实现。
- 新增能力或继续重构时，优先采用稳定薄入口加 `parts/`、`cases/`、`modules/` 等子模块拆分；不要把新逻辑继续堆回单个超长文件。
- 若文档提到 `Hermes-Agent`，必须明确它指的是上游外部 runtime 项目 / 服务；仓内自写的 shim、pilot、helper 或过渡 scaffold，不得写成“已接入 Hermes-Agent”。
- 一旦 target topology 已明确，新增投入默认服务目标形态；旧路线只允许作为迁移桥、兼容层或回归对照存在，不继续深磨。
- 不做降级处理、兜底补丁、启发式修补或“先糊住再说”式实现。

## 文档体系

- `README*` 与 `docs/README*` 是默认公开入口。
- `docs/project.md`：项目概览与当前公开角色。
- `docs/architecture.md`：顶层 session/runtime、activation、contract 与 domain-agent 边界。
- `docs/invariants.md`：硬约束与不能破坏的边界。
- `docs/decisions.md`：仍有效的关键决策与取舍。
- `docs/status.md`：当前 admitted domains、活跃主线、下一步和验证口径。
- `docs/README*` 继续维护 `OPL` 的四层公开文档体系，但 AI/维护者应先读核心五件套。
- `contracts/` 只保留 machine-readable contract surface；不再承载 narrative 规则。
- `docs/references/`：参考级配套文档。
- `docs/specs/`：当前仍生效的 runtime / product-boundary 规格。
- `docs/history/`：历史归档入口，包含已完成 plans、退役 specs 与 repo-tracked process drafts，不再承担活跃 workflow。

## 文档规则

- 第一层和第二层公开文档保持双语；内部参考、历史、维护与技术文档默认中文。
- 新文档先判断角色，再决定落点；不要把公开主线、合同配套、参考材料和历史记录混在同一层。
- 如果某条规则需要长期冻结，应写入 `docs/invariants.md` 或相关 contract/doc surface，而不是继续堆在 `AGENTS.md`。

## 变更与验证

- 保持 diff 小、可审查、可回退。
- 能删就别加；能复用现有模式就别新起抽象。
- 没有明确必要不要新增依赖。
- 修改 machine-readable contracts、公开边界、默认 docs 入口、文档骨架或 active domain-agent wording 时，必须同步更新文档、contracts 与相关测试。
- 叙述性 `README*`、`docs/**` 和参考文档不作为脚本/测试的断言对象；可以测试 machine-readable contract、schema、CLI/API 行为、生成产物结构与路径，但不要用测试固定文档措辞、章节或状态文案。
- 默认最小验证入口是 `scripts/verify.sh`。
- 默认 smoke 是 `npm test` / `npm run test:fast`。
- `npm run test:meta` 与 `npm run test:artifact` 是显式 lane。
- `npm run test:full` 是 clean-clone 基线。
- 上述验证入口必须与 `package.json` 和已跟踪测试保持一致。

## 并行开发与工作树

- 大改动、长链路工作、并行多 AI 开发，默认先从最新 `main` 开独立 worktree，再在 worktree 内实现和验证。
- 共享根 checkout 只用于轻量阅读、评审、吸收验证后提交、push 和清理，不应长期承担重型实现。
- 需要多条 lane 时创建多个 worktree，不要把多条长线塞进同一工作目录。
- worktree 内实现和验证完成后，应尽快吸收回 `main`，并清理对应 worktree、分支与临时状态。

## 本地状态

- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为仓库本地状态入口。
- 如需保留历史 session、prompt、log 或 hook 状态，应迁入用户级 `~/.codex/` 归档，而不是继续留在仓库根目录。
