# 合同目录说明

这个目录只保留 `OPL` 的 machine-readable contract surface 与其目录说明。

- narrative 协作规则看仓库根 `AGENTS.md`
- 默认人类/AI 入口看 `README*` 与 `docs/README*`
- 顶层 gateway 合同入口看 `contracts/opl-gateway/README.md`
- 当前 `S1 / shared runtime substrate v1` 冻结在公开文档与 reference-grade 文档层，不直接进入这里的 JSON，除非后续证明它属于 gateway-owned machine-readable surface

当前保留的 repo-tracked machine-readable contract surface：

- `contracts/opl-gateway/*.json`：冻结的 gateway、admission、acceptance 与 supporting-surface contract
- `contracts/opl-gateway/README.md`：这些 JSON contract 的人类可读说明

这里不再保留旧的 narrative truth hub 层。
