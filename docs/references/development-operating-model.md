# 四仓统一开发运行合同（历史墓碑）

状态锚点：`2026-05-02`

## 历史说明

本文件只保留 `Codex Host / OMX` 时代开发控制面讨论的历史位置。

OMX 已退出当前 OPL 开发环境。旧的长跑提示词、stage gate、owner worktree、`.omx/**` control-plane state 与执行手册语义都不得再作为当前入口、当前规则或下一棒模板使用。

## 当前结论

- 当前 OPL 工作入口以 Codex-only / repo-tracked truth 为准。
- 项目级 `.codex/` 与 `.omx/` 已退役，不再作为当前仓库本地状态入口。
- OPL 仍是顶层 gateway / federation / shared contract 层，不接管 domain-owned runtime truth。
- MAS、MAG、RCA 等 domain 仓通过各自 repo-tracked product-entry、contract、CLI/MCP/controller surface 暴露能力；OPL 不通过旧 OMX control plane 代替这些正式入口。

## 保留原因

这份历史墓碑只用于解释早期文档中为什么会出现 `Codex Host / OMX`、owner worktree、control-plane state migration 等语料。

如果审计旧文档时看到这些语料，应按历史迁移背景理解，并回到当前入口核对：

- `../README.zh-CN.md`
- `../project.md`
- `../status.md`
- `../architecture.md`
- `../invariants.md`
- `../../AGENTS.md`
- `../../contracts/opl-gateway/README.zh-CN.md`

## 禁止复用

- 不重新创建 OMX prompt playbook。
- 不把历史 owner worktree 规则恢复成当前执行纪律。
- 不把 `.omx/**` 写成 repo-tracked truth 或当前控制面。
- 不用本文件覆盖当前 `README*`、核心五件套、domain 仓 contract 或 machine-readable surface。
