# 标准智能体 domain-owned extension 合同

- Owner: OPL Framework / 各标准智能体仓
- Purpose: 固定 OPL 通用 engine 与 domain-owned profile、suite、adapter 之间的 machine boundary。
- State: current reference
- Machine boundary: `contracts/opl-framework/standard-agent-conformance-profile.schema.json`、`contracts/opl-framework/source-derived-agent-design-abi.json` 与各 domain repo 的 canonical contracts。

## Conformance profile

每个标准智能体仓必须提供 `contracts/standard_agent_conformance_profile.json`，至少声明：

- `profile_id`、`target_domain_id`；
- `golden_path.required_stage_ids`、`allowed_stage_ids`、`default_stage_id`、`forbidden_owner_tokens`；
- `physical_morphology.scan_roots`、`allowed_residue_prefixes`、`required_surface_ids`、`surface_classifications`、`forbidden_name_tokens`、`required_parity_gates`。

OPL Foundry Lab 只解释和验证这些字段。文件缺失、结构无效或 required surface 未分类时必须返回 typed blockers，不从 MAS/MAG/RCA/OMA 常量或旧 private policy 回退。

## Agent Lab suite

领域 scenario、stage refs、oracle refs、scorer refs、scorecard、recovery observation 与 promotion gate 由 domain/eval pack 的 suite manifest 持有。OPL Agent Lab 只负责读取 manifest、验证 authority boundary、运行 suite engine 和投影结果。

仓内 `example-domain-longline-suite.json` 是 blocked framework fixture，只验证 engine shape，不是 MAS/MAG/RCA 的 live、quality 或 acceptance evidence。

Developer Mode route/drill 由 domain/eval pack 的
`opl_standard_agent_evaluation_manifest` 提供，Framework schema 位于
`contracts/opl-framework/standard-agent-evaluation-manifest.schema.json`。调用方必须显式传入
domain-owned manifest 路径；未声明 manifest 时通用 read-model 返回空 routes/drills，不注入默认 domain
样例；路径不可读或结构无效时以 `contract_shape_invalid` fail closed。OPL 只持 loader、shape
validation、通用 route classifier 与 renderer，不持 MAS/RCA/OMA 的 scenario、oracle、scorecard 或静态
passed 结果。

## AI route context

OPL 不定义或执行 transition oracle、matrix runner 或 fixed-point semantic reconciler。Domain repo 可以提供非权威 route context、阴性结果、review finding 与 route-back hint；Codex CLI 独占语义路线选择，可启动任意 declared stage。OPL 只运输 StageRun、artifact refs、attempt ledger 与 currentness identity，不得用 route context 拒绝下一 stage。

## Source-derived design ABI

Agent Profile Spine 只接受 `source-derived-agent-design-abi.json` 中的 `opl_foundry_*` typed objects。OMA 保留 reference design、transfer、agent plan 与 admission 判断，但必须通过 repo-owned adapter contract 输出通用 identity；`opl_meta_agent_*` 不再定义 OPL selector ABI。

## Operator projections

- candidate portfolio：只使用 `stage_candidate_portfolio`；旧 `research_frontier_board`、`frontier_board` 与 `opl_research_frontier_projection` 不再解码。
- owner payload summary：Console 只消费 `operator_evidence_readiness_projection` 中标准化的 `owner_payload_item_summary` 和 `stage_expected_receipt_payload_summary`；不识别 MAS paper-line 或 MAG response 私有 shape。

这些 projection 均为 refs-only，不读取领域 body，不生成 owner receipt、typed blocker、quality verdict 或 readiness claim。
