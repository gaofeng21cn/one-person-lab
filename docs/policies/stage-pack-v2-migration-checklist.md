# Stage Pack v2 迁移清单

Owner: `One Person Lab`
Purpose: `stage_pack_v2_migration_checklist`
State: `active_policy`
Machine boundary: 本文是人读迁移清单。机器判断继续归 `opl agents conformance --json`、`agent/stages/manifest.json`、OPL generated `family_stage_control_plane`、`contracts/pack_compiler_input.json`、domain-owned contracts/source/tests 和 owner evidence。

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
| `source_refs.stage_graph_source_ref` | `agent/stages/manifest.json` |
| `source_refs.quality_gate_source_ref` | 指向真实 `agent/quality_gates/*` |
| `source_refs.executor_policy_source_ref` | `opl-generated:family_stage_control_plane#/stages/*/selected_executor`；domain repo 不提交第二份 generated plane |
| `source_refs.owner_receipt_schema_source_ref` | `contracts/owner_receipt_contract.json` |
| `source_refs.authority_functions_source_ref` | `runtime/authority_functions/README.md` 或等价 source |
| `source_refs.functional_privatization_audit_source_ref` | `contracts/functional_privatization_audit.json` |
| `source_refs.generated_surface_handoff_source_ref` | `contracts/generated_surface_handoff.json` |
| `source_refs.capability_map_source_ref` | `contracts/capability_map.json` |
| `required_domain_pack_paths` | 必须包含 `agent/stages/manifest.json` 与所有真实非 README pack files，含 `agent/tools/domain_affordances.md`；每个声明路径必须物理存在且位于 repo 内 |

## Declarative Stage Manifest

`agent/stages/manifest.json` 顶层必须声明 domain identity、owner、authority boundary 与非空 `stages[]`。OPL Pack 只从该 source 生成 `family_stage_control_plane`，不读取 tracked legacy fallback。

每个 `stages[]` 条目至少声明：

| 字段 | 要求 |
| --- | --- |
| `stage_id` / `stage_kind` / `title` / `goal` | 非空，且 `stage_id` 全局唯一 |
| `display_names` | 可为旧 source 缺省；缺省时 compiler 以 `title` 生成 `en-US`。显式声明时 map 不得为空，locale key 不得为空或含空白，value 必须为含非空白字符的字符串，必须包含 `en-US`，且 `display_names.en-US` 必须与兼容字段 `title` 完全一致；其他 locale 原样投影，不自动翻译。 |
| `policy_ref` / `prompt_ref` | 指向 repo 内真实 `agent/stages/*` / `agent/prompts/*` |
| `knowledge_refs[]` / `quality_gate_refs[]` | 指向 repo 内真实 source；quality gate 至少一个 |
| `allowed_action_refs[]` | 非空，且全部存在于 `contracts/action_catalog.json` |
| `requires[]` / `ensures[]` | 非空 domain stage contract 输入与输出语义 |
| `next_stage_refs[]` | 全部解析到同一 manifest 内的 stage id |
| `trust_lane` | 显式声明 domain / executor / human / external trust lane |
| source-derived provenance | `stage_origin=source_pattern_ref` 时必须精确绑定 `pattern_id`、`step_id`、primary `source_pattern_ref` 与 source anchors；target-only stage 只能绑定 `target_only_requirement_ref` |

生成 plane 无条件注入 Stagecraft 的 executor binding、completion policy、user-stage-log、progress-delta、typed-blocker lineage、receipt schema、authority-function refs 与 false-authority boundary；domain manifest 不能覆盖这些 Framework 下限。

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
