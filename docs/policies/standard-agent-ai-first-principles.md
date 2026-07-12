# OPL Standard Agent AI-first Principle Pack

Owner: `one-person-lab`
Purpose: `standard_agent_ai_first_principle_policy`
State: `active`
Machine boundary: human-readable policy. Machine-readable ids, required adoption refs, module organization, and false-authority flags are in `contracts/opl-framework/standard-agent-principles.json`.

## 结论

OPL 标准智能体采用 AI-first 原则包：AI 负责阶段内的开放式理解、比较、创作、诊断、评审和修订；合同、schema、测试、readback 和 checklist 只负责托底身份、权限、输入输出、证据、恢复和审计边界。

`intake` 不独立成为 Skill。OPL 的 `domain_intake` 是标准 starter stage / owner handoff 模式；各 domain agent 必须把它映射到本仓已有或新增的领域 intake stage、source refs、owner receipt、typed blocker、human gate 或 route-back surface。

## 单一来源

- 机器合同：`contracts/opl-framework/standard-agent-principles.json`
- 标准智能体 adoption：`contracts/standard-agent-principles-adoption.json`
- OPL 投影文档：`agent/principles/opl-standard-agent-principles.md`
- 领域特化文档：`agent/principles/domain-specialization.md`
- Repo 结构规范：`docs/policies/standard-agent-repo-structure.md`

这些路径只定义原则、映射和 false-authority 边界；它们不能宣称 domain ready、production ready、owner accepted、quality accepted 或 artifact ready。

## 原则

1. `ai_first_execution`：AI 在阶段边界内自主完成理解、比较、创作、诊断、评审和修订。
2. `contract_backed_boundary`：合同和验证保护身份、权限、输入输出、证据和恢复，不把认知过程硬编码成流程脚本。
3. `domain_truth_authority`：domain agent 持有 domain truth、质量/导出裁决、artifact body、memory body、owner receipt 和 typed blocker。
4. `stage_prompt_skill_tool_separation`：stage prompt 定义目标和答案形状；professional skill 承载领域方法；tool catalog 只声明 affordance、权限、写范围、side effect 和 forbidden authority。
5. `domain_intake_mapping`：`domain_intake` 是 owner-handoff 模式，不是独立 Skill；领域仓负责映射到真实 intake stage。
6. `workspace_source_intake_shell`：OPL 持有通用 workspace/source intake transport 和 locator shell；领域 source semantics、readiness、provenance 和 task truth 留在 domain 仓。
7. `owner_delta_progress`：有效推进必须是 deliverable delta、owner receipt、typed blocker、human gate、route-back 或 handoff packet。
8. `quality_budget_progress_first`：stage 已有可读、可消费 artifact 时，retry、review、repair 和普通质量门只是质量预算；预算耗尽记录 `completed_with_quality_debt` 并推进，债务只阻止 quality/export/publication/submission/production-ready 声明。零 artifact、artifact 损坏、permission/credential、显式 human decision、authority violation、identity/currentness mismatch 才硬停。
9. `parallel_executor_autonomy`：executor 可在边界内选择顺序、工具、替代和并行；遇到 authority、permission、human、safety 或 irreversible write gate 必须停止。
10. `module_organization`：OPL brand modules 持有 framework primitives；标准智能体是 Declarative Domain Pack + minimal authority functions；capability pack 不承担 domain intake。

## 模块定位

- `charter`：语言、边界、治理决策和原则合同入口。
- `atlas`：domain/agent/capability registry、owner、状态和生命周期索引。
- `workspace`：workspace/source intake shell、项目材料、stage output、handoff 与可检查目录结构。
- `pack`：Declarative Domain Pack、capability ABI、authority ABI、pack compiler、generated/hosted surface。
- `stagecraft`：stage 设计、cognitive computation、prompt/skill/tool 分层、quality gate 和 StageRun contract。
- `runway`：provider-backed runtime、attempt admission、progress reconciliation、handoff gate 和 recovery repair。
- `ledger`：refs-only evidence、receipt、typed blocker、artifact lineage、restore/provenance 和 read-model ledger。
- `console`：operator cockpit，默认读 `current_owner_delta`、next action、blocker、workspace action 和 evidence drilldown。
- `foundry-lab`：标准智能体 scaffold、conformance、canary、testing takeover、promotion 和 rollback。
- `connect`：CLI/MCP/OpenAI/AI SDK/Skill/plugin 等 generated/distributed interface 与 drift detection。

## Domain Adoption

每个标准 domain agent 必须保留自己的领域特化：

- MAS：把 OPL `domain_intake` 映射到 `01-study_intake` 和 `study_task_intake` surfaces；MAS 继续持有 study truth、source readiness、publication/artifact authority。
- MAG：映射到 grant/request intake 与 grant authority surface；OPL 只消费 refs 和 generated entry。
- RCA：映射到 RCA visual/work-order intake 与 visual-deliverable authority surface。
- OMA：映射到 meta-agent work-order intake 与 foundry/test-takeover authority surface。
- BookForge：映射到 book/project intake 与 manuscript/export authority surface。

MAS ScholarSkills 是 capability pack，不是 domain intake owner。active professional modules 只由能力合同声明，不能通过 `intake` 或 `omics` 文案扩大成 active domain stage。
