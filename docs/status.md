# OPL 当前状态

## 当前角色

- 仓库角色：顶层 gateway 与 federation surface
- 当前执行口径：`Codex-default host-agent runtime`
- 当前开发口径：Codex-only
- OMX 状态：已退场，仅保留历史入口

## 当前 admitted domains

- `Research Foundry -> Med Auto Science`：活跃 `Research Ops`
- `RedCube AI`：活跃 visual-deliverable / `Presentation Ops`
- `Grant Foundry -> Med Auto Grant`：future-facing public signal

## 当前文档骨架

- AI / 维护者核心工作集：`project / architecture / invariants / decisions / status`
- 对外公开 docs：继续沿用 `docs/README*` 定义的四层结构
- 机器合同：`contracts/opl-gateway/*.json`

## 当前优先事项

1. 保持公开 docs、gateway contracts 与 admitted domain 状态一致。
2. 避免 reference-grade 文档继续挤占公开主线。
3. 在不制造第二真相源的前提下，继续推进跨仓边界收敛。

## 默认验证

- 默认最小验证：`scripts/verify.sh`
- meta 验证：`scripts/verify.sh meta`
- full 验证：`scripts/verify.sh full`
