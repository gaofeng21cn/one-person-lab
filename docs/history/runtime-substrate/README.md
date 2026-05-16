# Runtime Substrate 历史归档

Status: `historical_archive`
Owner: `One Person Lab`
Machine boundary: 仅人读历史归档；机器可读行为必须使用 `contracts/`、源码、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 或 `human_doc:*` 语义标识。

本目录收纳已经被 2026-05-11 framework-first 定位吸收或取代的 runtime / product-entry / migration 整文档。它们仍保留来源追溯价值，但不再作为当前 backlog、roadmap、runtime contract 或 product-entry 计划执行。
旧文档中的双语方案、旧路径和旧命令只保留为 provenance；`docs/**` 当前只维护中文 canonical 内容。

当前入口：

- [OPL 当前开发线路](../../active/current-development-lines.md)
- [OPL 开发文档组合整理](../../active/development-document-portfolio.md)
- [OPL Runtime 命名与边界合同](../../runtime/opl-runtime-naming-and-boundary-contract.md)
- [OPL Domain-Agent Admission Contract](../../specs/opl-domain-onboarding-contract.md)
- [OPL stage-led agent framework roadmap](../../references/runtime-substrate/opl-stage-led-agent-framework-roadmap.md)
- [Temporal family runtime provider 落地计划](../../references/runtime-substrate/temporal-family-runtime-provider-plan.md)

## 已吸收内容

| 历史文档 | 已吸收的内容 | 当前 owner |
| --- | --- | --- |
| `host-agent-runtime-contract.md` | Codex-default host-agent runtime、formal-entry matrix、execution handle、durable truth、fail-closed 规则 | Runtime 命名与边界合同、Domain-Agent Admission Contract、family executor defaults |
| `managed-runtime-migration-readiness-checklist.md` | host-agent -> managed runtime 迁移对象、R1-R8 readiness 维度、不得把 future managed runtime 写成现实 | Runtime 命名与边界合同 |
| `family-product-entry-and-domain-handoff-architecture.md` | operator / agent / product entry taxonomy、handoff envelope、domain authority boundary | Domain-Agent Admission Contract、public docs、current development lines |
| `family-lightweight-direct-entry-rollout-board.md` | `frontdoor_surface` / `operator_loop_surface` 区分、direct path 与 OPL handoff 对齐、不允许四仓入口语义漂移 | Domain-Agent Admission Contract、current development lines |
| `opl-product-entry-and-hermes-kernel-integration.md` | 不 fork/vendor 外部 runtime、不要把用户暴露给底层 runtime 拼装、Hermes-first 误写禁止项 | Runtime 命名与边界合同、Temporal provider 计划、stage-led roadmap |
| `hermes-agent-runtime-substrate-benchmark.md` | Hermes runtime substrate 对标中仍有价值的对比点；其中 gateway-first / Domain Harness OS 结论已被当前口径取代 | Runtime 命名与边界合同、Temporal provider 计划、Hermes executor evaluation |
| `opl-vertical-online-agent-platform-roadmap.md` | 垂类产品族、shared runtime/domain contract、future managed runtime 与当前 reality 的区分 | Runtime 命名与边界合同、public roadmap、stage-led roadmap |
| `mas-top-level-cutover-board.md` | OPL -> MAS handoff 字段、MAS display/research 分线、不能把 transition seam 写成 backend 替换完成 | OPL 当前开发线路、MAS active portfolio/current development lines |

## Tombstone 规则

- 这些文档中的 Hermes-first、Gateway/frontdoor、direct-entry、host-agent-only、online-agent-platform 计划不再按整份执行。
- 有效内容已经按内容块吸收到当前 owner；复用时先回当前 owner，不直接复制历史正文。
- 历史路径中的旧文件名、旧命令、旧状态只用于 provenance、migration review 和审计。
- 如果未来发现某段历史内容仍有当前价值，先把它提升到 active owner 或 machine-readable contract，再引用历史来源。
