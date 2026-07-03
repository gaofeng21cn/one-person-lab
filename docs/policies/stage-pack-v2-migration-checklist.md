# Stage Pack v2 迁移清单

Owner: `One Person Lab`
Purpose: `stage_pack_v2_migration_checklist`
State: `active_policy`
Machine boundary: 本文是人读迁移清单。机器判断继续归 `opl agents conformance --json`、`contracts/stage_control_plane.json`、`contracts/pack_compiler_input.json`、domain-owned contracts/source/tests 和 owner evidence。

## 结论

Stage Pack v2 迁移不需要新运行时。它只把标准智能体每个 Stage 内已经存在的 prompt、skill、tool、knowledge、quality gate、receipt、authority 和 entry gate 关系补成机器可读声明。

OBF 当前是样板；MAS、MAG、RCA、OMA 迁移时复用同一组字段，不复制 OBF 的领域语义。

## Pack Compiler Input

`contracts/pack_compiler_input.json` 必须声明：

| 字段 | 要求 |
| --- | --- |
| `standard_stage_pack_conformance.version` | `standard-stage-pack.v2` |
| `standard_stage_pack_conformance.required` | `true` |
| `standard_agent_pack_abi.version` | `standard-agent-pack-abi.v1` |
| `standard_agent_pack_abi.required_repo_layout` | 至少包含 `agent/`、`contracts/`、`runtime/authority_functions/` |
| `source_refs.stage_graph_source_ref` | `contracts/stage_control_plane.json` |
| `source_refs.quality_gate_source_ref` | 指向真实 `agent/quality_gates/*` |
| `source_refs.executor_policy_source_ref` | 指向 `contracts/stage_control_plane.json#/stages/*/selected_executor` |
| `source_refs.owner_receipt_schema_source_ref` | `contracts/owner_receipt_contract.json` |
| `source_refs.authority_functions_source_ref` | `runtime/authority_functions/README.md` 或等价 source |
| `source_refs.functional_privatization_audit_source_ref` | `contracts/functional_privatization_audit.json` |
| `source_refs.generated_surface_handoff_source_ref` | `contracts/generated_surface_handoff.json` |
| `source_refs.capability_map_source_ref` | `contracts/capability_map.json` |
| `required_domain_pack_paths` | 必须包含真实非 README pack files，含 `agent/tools/domain_affordances.md` |

## Stage Control Plane

`contracts/stage_control_plane.json` 顶层必须声明：

```json
{
  "stage_pack_conformance_version": "standard-stage-pack.v2"
}
```

每个 `stages[]` 条目必须声明：

| 字段 | 要求 |
| --- | --- |
| `stage_pack_conformance_version` | `standard-stage-pack.v2` |
| `selected_executor.executor_kind` | 默认 `codex_cli`；非默认 executor 必须带 binding ref |
| `selected_executor.default_executor` | Codex 默认 stage 为 `true` |
| `selected_executor.executor_binding_ref` | Codex 默认 stage 为 `default_codex_cli` |
| `tool_refs[]` | 至少一个 `agent/tools/domain_affordances.md` repo ref |
| `tool_affordance_boundary.catalog_role` | `available_affordance_catalog_not_workflow_script` |
| `tool_affordance_boundary.*_refs[]` | `capability_refs`、`permission_scope_refs`、`credential_boundary_refs`、`write_scope_refs`、`side_effect_risk_refs`、`forbidden_authority_refs` 全部非空 |
| `tool_affordance_boundary.executor_autonomy` | executor 可选工具、可跳过、可替代、可并行、可请求 human gate；tool catalog 不能规定顺序、认知策略、stage goal 或 forbidden write |
| `stage_contract.requires[]` | 非空，引用 stage、prompt、skill、knowledge、quality gate、tool boundary 等输入 |
| `stage_contract.ensures[]` | 非空，引用 stage attempt、owner handoff、receipt、typed blocker 或 stage folder refs |
| `stage_contract.expected_receipt_refs[]` | 非空 |
| `stage_contract.receipt_schema_refs[]` | 指向 `contracts/owner_receipt_contract.json` |
| `stage_contract.authority_function_refs[]` | 指向 `runtime/authority_functions/README.md` 或等价 source |
| `stage_contract.l4_entry_gate` | `entry_level=L4_structural_baseline`、`can_claim_l5=false`、`can_claim_domain_ready=false` |
| `stage_contract.l5_entry_gate` | `entry_level=L5_production_operating_maturity`，且 conformance / contract / provider / App projection 均不能计为 L5 |
| `stage_contract.stage_completion_policy` | domain stage 持有 completion judgment；provider completion、file presence、suite pass、conformance pass 都不能关闭 stage |
| `independent_gate_policy` | 指向真实 `agent/quality_gates/*`，并声明 execution / review separation |

## Tool Affordance Catalog

`agent/tools/domain_affordances.md` 是工具可用性目录，不是 workflow 脚本。它应该说明：

- 本领域常用资源、连接器、渲染器、数据源、导出器或外部服务。
- executor 可以选择、跳过、替代和并行使用工具。
- credential、write scope、side effect 和 forbidden authority。
- connector / tool 只返回 refs、receipt 或候选结果，不签 owner receipt、typed blocker、quality / export verdict 或 domain ready。

## Authority Functions

`runtime/authority_functions/` 必须存在。最小可接受形态是 `README.md`，说明：

- 本 repo 只保留领域最小 authority function 声明或 source。
- generic scheduler、queue、attempt ledger、status/workbench shell 归 OPL Framework。
- domain truth、artifact body、memory body、quality/export verdict、owner receipt、typed blocker 和 human gate 归 domain owner。

## 验收命令

单仓：

```bash
/Users/gaofeng/workspace/one-person-lab/bin/opl agents conformance \
  --agent <id>=<agent-worktree> \
  --json
```

全家族：

```bash
/Users/gaofeng/workspace/one-person-lab/bin/opl agents conformance \
  --agent mas=/Users/gaofeng/workspace/med-autoscience \
  --agent mag=/Users/gaofeng/workspace/med-autogrant \
  --agent rca=/Users/gaofeng/workspace/redcube-ai \
  --agent obf=/Users/gaofeng/workspace/opl-bookforge \
  --agent oma=/Users/gaofeng/workspace/opl-meta-agent \
  --json
```

完成口径：

- `status=passed`
- `scaffold_validation.stage_pack_v2_validation.status=passed`
- `stage_pack_v2_validation.advisory_findings=[]`
- `stage_pack_v2_validation.blockers=[]`

该完成口径只证明 Stage Pack v2 structural baseline；不声明 live domain progress、domain ready、production ready、quality/export ready、App release ready、owner accepted 或 Brand L5。
