# 标准 Domain Agent 实现规范

Owner: `One Person Lab / OPL Framework`
Purpose: `standard_domain_agent_implementation_spec`
State: `active_spec_support`
Machine boundary: 本文解释标准形态；机器真相归 `standard-agent-pack-abi.json`、`standard-agent-implementation-profile.schema.json`、`source-derived-agent-design-abi.json`、scaffold / pack compiler / conformance source 与 CLI readback。

## 结论

OPL 标准智能体只有一种实现模型：

`Declarative Standard Agent Pack (Markdown/JSON) + OPL generated/hosted surfaces + optional minimal helpers`

Agent 的身份、stage、prompt、skill、knowledge、tool affordance、quality gate 与 authority declaration 来自声明式 Pack。Python、TypeScript 或其他允许的语言只实现受限 helper，不参与 Agent 分类；替换 helper 语言不得要求修改 Agent identity、stage topology、golden path、generated surfaces 或 authority owner。

## 规范形态

每个标准 Agent 仓必须：

1. 以 `agent/` 和 machine-readable contracts 声明 Agent Pack，并通过 Standard Agent Pack ABI。
2. 在 `contracts/pack_compiler_input.json#/implementation_profile` 声明 `opl.standard_domain_agent.v1`。
3. 保持 `agent_identity=declarative_standard_agent_pack`、`pack_formats=[markdown,json]`、`generated_surfaces_owner=one-person-lab`。
4. 只为真实存在、具有 active caller 且通过仓内审计的 helper root 声明 helper entry。
5. 只使用 `authority_function`、`domain_helper`、`native_helper` 三种 helper role；role 描述 owner 关系，不描述具体业务名称。
6. 保持 `language_is_identity=false`。新 baseline 可以是 pack-only；尚未实现的 helper 需求进入 AgentPackPlan、capability requirement 或 developer work order，不能伪装成已落地实现。
7. 不以 helper profile 合法化私有 scheduler、runner、session store、generic CLI/MCP、workbench、status sidecar 或 product wrapper。这些通用 surface 应由 OPL 生成或托管。
8. 不在 domain profile 中声明 Rust。Rust 只用于 OPL Framework 明确的系统 hot path / native boundary，不持有 domain truth、quality verdict、typed blocker、owner receipt 或 Agent identity。

## 当前五个参考实现

| Agent | 统一身份 | 允许的领域 helper | 当前参考角色 |
| --- | --- | --- | --- |
| MAS | Standard Agent Pack | Python medical/science `domain_helper` | 医学与科研 helper 参考 |
| MAG | Standard Agent Pack | Python grant `domain_helper` | 基金申请 helper 参考 |
| RCA | Standard Agent Pack | TypeScript visual `domain_helper` + Python Office `native_helper` | 多语言 helper 组合参考 |
| OMA | Standard Agent Pack | TypeScript agent-design/materialization `domain_helper` | 新 Agent 设计与生成规则的消费方和执行方 |
| OBF | Standard Agent Pack | Python publishing `native_helper` | pack + publishing helper 的 golden reference，不是标准 owner |

这五个仓完全同级消费 Framework 标准。表中的业务标签用于说明 helper 工作负载，不创建 `Python Agent`、`TypeScript Agent`、`medical Agent kind` 或 `publishing Agent kind`。

## OMA 生成规则

OMA 设计或接管新的 Agent 时必须先生成语言中立 Pack：

- 新建 baseline 默认 `helpers.entries=[]`。
- 只有目标仓已存在并通过审计的 helper root 才进入 implementation profile。
- helper 建议必须包含 role、language、source root、active caller、不可上收原因和验证方式；未实现时只生成 plan / work order。
- OMA 持有设计判断、TransferMap、AgentPackPlan 和 candidate semantics；OPL Foundry Lab 持有物理 scaffold、文件 digest、最终 `AgentBuildReceipt`、generated interfaces 与 conformance。
- OMA 生成的 `ReferenceDesignPacket`、`TransferMap`、`AgentPackPlan`、`DesignAdmissionReceipt` 必须使用 Framework 的 source-derived Agent design ABI；不得维护 producer 私有 identity alias。

## 验证与完成边界

结构验收至少包括：

```text
opl agents scaffold --validate <repo> --json
opl agents interfaces --repo-dir <repo> --json
opl agents conformance --repo-dir <repo> --json
```

还必须执行各仓 repo-native verification。以上证据只证明 Pack / interface / profile 结构一致，不证明 domain 质量、真实项目完成、production readiness、owner acceptance 或 live provider readiness。

## 新语言准入

新增 helper 语言必须同时证明：现有语言无法合理覆盖、性能或生态收益可测、owner 与 active caller 明确、部署和调试成本可接受、替换测试成立。语言不得成为 Agent membership 轴；跨语言边界优先使用稳定 JSON / file / process contract，避免把 domain body 和开放式创作内容塞进 helper 源码。
