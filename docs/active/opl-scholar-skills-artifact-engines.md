# OPL ScholarSkills Candidate Artifact Engines

Owner: `One Person Lab`
Purpose: 说明 `OPL ScholarSkills` 十模块非权威 candidate artifact body 生成器的 CLI 入口、输出边界和 authority guard。
State: `active_candidate_artifact_engine_surface`
Machine boundary: 本文是人读导航。机器真相以 `src/scholar-skills.ts`、`src/cli/cases/public-command-specs-parts/scholar-skills.ts`、`tests/src/cli/cases/scholar-skills-artifact-engines.test.ts` 与 `opl scholar-skills materialize --json` readback 为准。

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

## Candidate Body 形状

十个模块都会在 `output-root/candidate_artifacts/<profile>/` 下写出 deterministic lightweight body：

- Display: SVG body。
- Write / Review / Submit: Markdown body。
- Tables / Stats / Omics / Lit / Data / Intake: JSON body。

每个 body 都携带 `payload_sha256`、`body_policy=opl_generated_non_authoritative_candidate_body_requires_domain_owner_consumption` 和全 false `authority_flags`。`manifest.json`、`module_candidate.json`、`execution_receipt_candidate.json`、`refs_manifest.json` 和顶层 readback 会记录 `candidate_artifact_bodies[].body_path`、`body_ref`、`body_sha256`、`body_format`、`body_policy` 与 authority flags。

## Authority Guard

这些 body 是 OPL-generated candidate artifacts，只能作为 domain owner gate 的输入或 handoff refs。它们不能声明：

- paper truth / domain truth；
- owner receipt / typed blocker；
- quality verdict / artifact authority；
- publication readiness / runtime ready / production ready；
- runtime DB、runtime queue、MAS/Yang 或 domain repo 写入。

`artifact_body_written=true` 只表示当前 `output-root` 内写了非权威 candidate body 文件；它不改变 `can_mutate_artifact_body=false`，也不授权任何 domain-owned artifact mutation。
