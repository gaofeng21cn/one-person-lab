# OPL ScholarSkills Candidate Artifact Engines

Owner: `One Person Lab`
Purpose: 说明 `OPL ScholarSkills` 十模块非权威 candidate artifact body 生成器的 CLI 入口、输出边界和 authority guard。
State: `active_executable_candidate_artifact_engine_surface`
Machine boundary: 本文是人读导航。机器真相以 `src/scholar-skills.ts`、`src/scholar-skills-parts/artifact-engines.ts`、`src/cli/cases/public-command-specs-parts/scholar-skills.ts`、`tests/src/cli/cases/scholar-skills-artifact-engines.test.ts` 与 `opl scholar-skills materialize --json` readback 为准。

## 品牌模块边界

本能力属于 OPL-owned ScholarSkills capability library，不新增第十一个 OPL 品牌模块。

- 主模块：`Pack` 承载 candidate package、manifest、body paths 和 sha256。
- 协同模块：`Atlas` 发现 module descriptor，`Runway` 承载 invocation / execution receipt candidate 形状，`Vault` 承载 refs、lineage 和 evidence refs，`Console` 读取 CLI JSON readback。
- 不触碰范围：`Connect` / system install surfaces、MAS/Yang/domain authority、runtime DB、runtime queues、owner receipts、typed blockers、publication readiness、domain truth 和 paper truth。

## CLI 入口

默认 `materialize` 仍保持 refs-only package：

```bash
opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --json
```

只有显式 opt-in 时才写非权威 candidate artifact bodies：

```bash
opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --emit-candidate-artifacts --payload-file <path> --json
opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --emit-candidate-artifacts --payload-json <json> --json
```

`--payload-json` 与 `--payload-file` 二选一。提供 payload 但没有 `--emit-candidate-artifacts` 会 fail closed；请求 `--emit-candidate-artifacts` 但没有 payload 也会 fail closed。这样可以保证既有 smoke 和 refs-only consumers 不被隐式 artifact body 写入影响。

## Candidate Engine 形状

十个模块都会在 `output-root/candidate_artifacts/<profile>/` 下写出 deterministic executable candidate artifact body：

- Display: SVG visual-plan candidate。
- Write / Review / Submit: Markdown draft/report/package candidate。
- Tables / Stats / Omics / Lit / Data / Intake: JSON structured candidate。

每个 body 都携带模块专属 `engine_id`、`engine_version`、`input_requirements`、`validation_checks`、`engine_receipt_ref`、`payload_sha256`、`body_sha256`、`body_policy=opl_generated_non_authoritative_candidate_body_requires_domain_owner_consumption` 和全 false `authority_flags`。JSON body 的根对象是 `opl_scholarskills_executable_candidate_artifact`；Markdown/SVG body 也会嵌入 engine id、payload hash、owner-gate requirement 和 no-authority boundary。`manifest.json`、`module_candidate.json`、`execution_receipt_candidate.json`、`refs_manifest.json` 和顶层 readback 会记录 `candidate_artifact_bodies[].body_path`、`body_ref`、`body_sha256`、`body_format`、`engine_id`、`engine_receipt_ref`、`validation_status`、`input_requirements`、`body_policy` 与 authority flags。

当前十个 engine 是 OPL-owned deterministic candidate builder：

- Display: `scholar_display_candidate_visual_plan_engine`
- Tables: `scholar_tables_candidate_table_manifest_engine`
- Stats: `scholar_stats_candidate_analysis_engine`
- Omics: `scholar_omics_candidate_pipeline_engine`
- Lit: `scholar_lit_candidate_evidence_map_engine`
- Write: `scholar_write_candidate_section_engine`
- Review: `scholar_review_candidate_report_engine`
- Submit: `scholar_submit_candidate_package_engine`
- Data: `scholar_data_candidate_lineage_engine`
- Intake: `scholar_intake_candidate_source_engine`

这些 engine 可以生成更专业的可消费候选体、输入要求、质量检查清单和 receipt metadata；它们不运行 MAS/MAG/RCA domain workflow，不做医学分析裁决，不签 owner receipt，也不把候选体晋级为论文 truth。

## Authority Guard

这些 body 是 OPL-generated candidate artifacts，只能作为 domain owner gate 的输入或 handoff refs。它们不能声明：

- paper truth / domain truth；
- owner receipt / typed blocker；
- quality verdict / artifact authority；
- publication readiness / runtime ready / production ready；
- runtime DB、runtime queue、MAS/Yang 或 domain repo 写入。

`artifact_body_written=true` 只表示当前 `output-root` 内写了非权威 candidate body 文件；它不改变 `can_mutate_artifact_body=false`，也不授权任何 domain-owned artifact mutation。
