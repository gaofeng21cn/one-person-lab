# One Person Lab 仓库协作规范

## 适用范围

本文件适用于仓库根目录及其所有子目录；若更深层目录存在 `AGENTS.md`，以更近者为准。

## 项目定位

- `OPL` 是 one-person research lab 的顶层 gateway 与 federation 模型。
- `OPL` 不是任何单一 domain 仓库的别名，不是独占 runtime owner，也不是第四个 `Domain Harness OS`。
- 当前默认执行口径是 `Codex-default host-agent runtime`，活跃开发路径是 Codex-only。

## 非目标

- 不把 `OPL` 误写成某个 domain runtime 的同义词。
- 不把公共叙事、gateway 合同、参考材料和历史计划混成一个入口层。
- 不把历史 `Codex Host / OMX` 分工重新写回当前活跃开发口径。

## 开发优先级

- 第一优先级：保持 `Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS` 这条分层链路。
- 第二优先级：把 `Unified Harness Engineering Substrate` 的共享边界放在所有单仓之上。
- 第三优先级：保证 public docs、gateway contracts、reference docs 与 admitted domain 状态同步，不制造第二真相源。

## 主要入口与真相面

- 默认人类/AI 入口：`README.md`、`README.zh-CN.md`、`docs/README.md`、`docs/README.zh-CN.md`
- 合同入口与 machine-readable surface：`contracts/README.md`、`contracts/opl-gateway/README.md`、`contracts/opl-gateway/*.json`
- 公开叙事与边界：`docs/roadmap*`、`docs/task-map*`、`docs/gateway-federation*`、`docs/operating-model*`
- 历史设计与参考材料不应反向抬升为当前主线真相。

## 文档规则

- `README*` 与 `docs/README*` 是默认公开入口。
- `docs/` 按四层结构组织：默认公开主线、公开合同配套、参考级材料、历史 specs/plans。
- OMX 历史资料统一从 `docs/history/omx/README.md` 与 `docs/history/omx/README.zh-CN.md` 进入，不再直接作为活跃入口。
- 第一层和第二层公开文档保持双语；内部参考和历史规划默认中文。

## 变更与验证

- 保持 diff 小、可审查、可回退。
- 能删就别加；能复用现有模式就别新起抽象。
- 没有明确必要不要新增依赖。
- 修改 gateway contracts、公开边界、默认 docs 入口或 admission wording 时，必须同步更新文档、contracts 与相关测试。
- `npm test` and `npm run test:fast` are the default developer smoke slice.
- `npm run test:full` is the clean-clone verification entrypoint.
- keep those command surfaces aligned with `package.json` and the checked-in tests.
- 默认 smoke 是 `npm test` / `npm run test:fast`；`npm run test:meta` 和 `npm run test:artifact` 是显式 lane；`npm run test:full` 是 clean-clone 基线。

## 并行开发与工作树

- 大改动、长链路工作、并行多 AI 开发，默认先从当前 `main` 开独立 worktree，再在 worktree 内实现和验证。
- 共享根 checkout 只用于轻量阅读、评审、吸收验证后提交、push 和清理，不应长期承担重型实现。
- 需要多条 lane 时创建多个 worktree，不要把多条长线塞进同一工作目录。

## 本地状态

- `.codex/` 与 `.omx/` 都是本地工具状态，必须保持未跟踪。
- `.omx/` 仅允许作为历史残留存在，不得再作为当前 workflow 入口。
