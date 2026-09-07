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
8. `quality_budget_progress_first`：stage 已有可读、可消费 artifact 时，retry、review、repair 和普通质量门只是质量预算；预算耗尽记录 `completed_with_quality_debt` 并推进，债务只阻止 quality/export/publication/submission/production-ready 声明。原始零输出或损坏先物化可消费 diagnostic；连 diagnostic 也无法形成、permission/credential、显式 human decision、authority violation、identity/currentness mismatch 才硬停。完整路由规则见 [Stage graph](../runtime/stage-graph-route-transition-runtime.md)。
9. `parallel_executor_autonomy`：domain stage 与 professional skill 可以固定专业语义、证据、authority、安全和不可逆动作的前后依赖；executor 在依赖图内自主选择工具、迭代、替代和安全并行，Framework tool catalog 不替领域编排专业流程。
10. `module_organization`：OPL brand modules 持有 framework primitives；标准智能体是 Declarative Domain Pack + minimal authority functions；capability pack 不承担 domain intake。

能力域的名称与职责见 [Family capability portfolio](../references/family-capability-portfolio.md)，本政策只定义原则采用，不维护第二份模块清单。

## Domain Adoption

每个标准 domain agent 都必须把 `domain_intake` 映射到本仓真实 Stage、source refs、owner receipt、typed blocker、human gate 和 route-back surface。具体映射只由该 Agent 的当前 descriptor、Stage manifest 和 capability map 持有，Framework policy 不复制成员清单或 stage 名称。

capability pack 不是 domain intake owner。active professional modules 只由能力合同声明，不能通过 README、Skill 文案或目录名称扩大成 active domain stage。
