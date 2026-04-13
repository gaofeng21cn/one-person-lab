# 合同目录说明

这个目录只保留 `OPL` 的 machine-readable contract surface 与其目录说明。

- narrative 协作规则看仓库根 `AGENTS.md`
- 默认人类/AI 入口看 `README*` 与 `docs/README*`
- 顶层 gateway 合同入口看 `contracts/opl-gateway/README.md`

当前保留的 repo-tracked machine-readable truth：

- `contracts/opl-gateway/*.json`：冻结的 gateway、admission、acceptance 与 supporting-surface contract
- `contracts/opl-gateway/paperclip-control-plane.schema.json`：`OPL -> Paperclip` 可选下游 control-plane bridge 的 machine-readable schema；未配置 `Paperclip` 时 `OPL` 主入口仍然正常运行
- `contracts/opl-gateway/README.md`：这些 JSON contract 的人类可读说明
- `contracts/family-orchestration/*.schema.json`：跨四仓统一的 family orchestration companion schemas
- `contracts/family-orchestration/README*.md`：这些 family orchestration schema 的人类可读说明

围绕这些 machine-readable contract 的上位共享合同，当前统一在 `docs/` 层维护：

- `docs/shared-runtime-contract*.md`：跨 domain 共享的长期在线运行合同
- `docs/shared-domain-contract*.md`：跨 domain 共享的正式行为合同

其中：

- `family event envelope`
- `family checkpoint lineage`

属于 runtime-oriented 的 companion contract；

- `family action graph`
- `family human gate`
- `family product-entry manifest v2`

属于 domain-oriented 的 companion contract。

这些 schema 只冻结跨仓 orchestration 语义，不引入某个特定 orchestration framework 作为 family runtime dependency，也不改写 `Hermes-Agent` / `Codex CLI` / `domain-owned truth` 的 owner 边界。

这里不再保留 narrative 的 `project-truth/AGENTS.md` 层。
