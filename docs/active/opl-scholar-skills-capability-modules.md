# OPL ScholarSkills Capability Modules

Owner: `One Person Lab`
Purpose: 说明 `OPL ScholarSkills` 能力模块库的机器入口、十大品牌模块关系、runtime environment bridge 和 domain-agent 消费边界。
State: `active_structural_baseline`
Machine boundary: 本文是人读导航。机器真相以 `contracts/opl-framework/scholar-skills-capability-modules.json`、`src/scholar-skills.ts` 与 `opl scholar-skills * --json` readback 为准。

## 基本定位

`OPL ScholarSkills` 是 OPL family 的学术能力模块库，不是第十一个 OPL 品牌模块。它给 MAS、MAG、RCA、OMA 或后续 Foundry Agent 提供一组可发现、可校验、可接入 OPL runtime env 的 `capability module` descriptor。

十大 OPL 品牌模块仍保持原职责：

- `Atlas` 发现与索引能力模块。
- `Pack` 承载 descriptor、schema、artifact/ref lifecycle 与 packaging。
- `Stagecraft` 把能力模块挂到 stage / current-owner-delta 所需的 ref family。
- `Runway` 承载 runtime invocation / attempt / queue 的通用执行骨架。
- `Vault` 记录 evidence、receipt、lineage 与 refs。
- `Console` 投影 operator readback 和安全动作。
- `Connect` 分发、安装、skill/plugin 同步。
- `Charter`、`Workspace`、`Foundry Lab` 分别承载治理、workspace 和 agent factory 边界。

ScholarSkills 不改 `BrandModuleId` 枚举；它作为这些品牌模块共同管理的能力库存在。

## 当前模块目录

当前 canonical contract 固定十个 module id：

- `opl.scholarskills.display` / `Scholar Display`
- `opl.scholarskills.tables` / `Scholar Tables`
- `opl.scholarskills.stats` / `Scholar Stats`
- `opl.scholarskills.omics` / `Scholar Omics`
- `opl.scholarskills.lit` / `Scholar Lit`
- `opl.scholarskills.write` / `Scholar Write`
- `opl.scholarskills.review` / `Scholar Review`
- `opl.scholarskills.submit` / `Scholar Submit`
- `opl.scholarskills.data` / `Scholar Data`
- `opl.scholarskills.intake` / `Scholar Intake`

每个 module 都声明 input / output schema refs、dependency profile refs、run-context refs、invocation entries、artifact refs、receipt policy、quality evidence 和 authority boundary。`opl scholar-skills inspect/invoke/receipt` 现在会为每个 module 返回 module-specific `module_profile`、artifact candidate ref families 和 unsigned execution receipt ref families，而不是把所有模块都折叠成 Display 的 receipt 形状。

## Runtime Env 关系

ScholarSkills 只声明 dependency intent 与 run-context refs。实际依赖准备、缓存、run-context 生成和 fail-closed doctor 由 OPL runtime environment substrate 处理：

```bash
opl runtime env prepare --domain scholarskills --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json
opl runtime env run-context --domain scholarskills --profile <profile> --json
```

ScholarSkills 自身提供的 bridge 命令只构建 deterministic refs-only envelope，不调用 renderer，不安装依赖，不写 runtime state，不写 artifact body，不签 owner receipt，也不声明 cache hit：

```bash
opl scholar-skills prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> --json
opl scholar-skills run-context --module <module_id> --profile <profile> --json
opl scholar-skills invoke --module <module_id> --input-ref <ref> --artifact-root <ref> --json
opl scholar-skills receipt --module <module_id> --input-ref <ref> --artifact-root <ref> --json
opl scholar-skills materialize --module <module_id> --input-ref <ref> --artifact-root <ref-or-path> --output-root <path> --json
```

`receipt` / `invoke` 返回的 `scholar_skills_receipt_candidate` / `execution_receipt_candidate` 会提供 deterministic `execution_receipt_ref`。所有模块共享 `input_fingerprint_ref`、`dependency_profile_ref`、`prepared_run_context_ref`，并按模块追加专业 ref family：Display 使用 `render_cache_ref`、`artifact_manifest_ref`、`visual_audit_or_gallery_preview_ref`；Tables 使用 `table_manifest_ref`、`table_qc_ref`；Stats 使用 `analysis_manifest_ref`、`reproducibility_check_ref`；Omics 使用 `omics_pipeline_manifest_ref`、`feature_matrix_qc_ref`；Lit 使用 `evidence_map_ref`、`citation_manifest_ref`；Write 使用 `draft_section_manifest_ref`、`source_trace_ref`；Review 使用 `reviewer_report_ref`、`route_back_ref`；Submit 使用 `package_manifest_ref`、`submission_checklist_ref`；Data 使用 `data_manifest_ref`、`lineage_readiness_ref`；Intake 使用 `source_snapshot_ref`、`adoption_contract_ref`。这些字段只计为 unsigned candidate artifact refs，显式保持 `counts_as_paper_truth=false`、`counts_as_owner_receipt=false`、`can_authorize_publication_readiness=false`。

`materialize` 是 `receipt` candidate 的确定性文件化 surface。它只在显式 `--output-root` 下写出 `manifest.json`、`execution_receipt_candidate.json`、`module_candidate.json`、`refs_manifest.json`，并返回 `surface_kind/status/module_id/input_ref/artifact_root_ref/output_root/output_root_ref/execution_receipt_ref/execution_receipt_candidate_path/module_candidate_path/artifact_manifest_path/written_files/sha256/authority_flags` 等 JSON 字段。`module_candidate.json` 是模块专属的 refs-only candidate payload，包含 module profile、artifact candidate refs、required receipt ref families、quality checklist 和 owner-consumption requirement；十个模块都会写出自己的 payload 形状，不再只有通用 refs manifest。该 package 是 refs-only unsigned candidate handoff，不写 runtime DB、domain truth、MAS 文件、owner receipt、typed blocker、paper body 或 artifact body authority；`authority_flags.counts_as_paper_truth`、`authority_flags.counts_as_owner_receipt`、`authority_flags.can_authorize_publication_readiness` 以及相关写权限标志保持 false。

`module_candidate.json` 仍不是 domain authority 的最终结果体：Display 不在这里直接声明可发表图，Stats 不在这里直接声明临床分析结论，Lit 不在这里直接声明文献证据裁决，Submit 不在这里直接声明投稿包 ready。它提供的是 OPL-owned standard handoff payload，使 MAS 等 domain agent 可以用同一消费入口读取候选 refs、质量检查需求和 owner gate 要求；真实图表、分析、文稿、审阅、投稿或数据结果体仍归 domain artifact surface，并必须由 domain owner gate 接收或拒绝。

当 `materialize --emit-candidate-artifacts` 显式启用时，ScholarSkills 会调用十个 OPL-owned deterministic candidate artifact engine，为每个模块写出专业候选体、`input_requirements`、`validation_checks`、`engine_receipt_ref` 和 sha256 refs。Display 输出 SVG visual-plan candidate；Write/Review/Submit 输出 Markdown candidate；Tables/Stats/Omics/Lit/Data/Intake 输出 JSON structured candidate。该 engine 输出比 refs-only body 更接近可消费 artifact，但仍保持 `counts_as_paper_truth=false`、`counts_as_owner_receipt=false`、`can_authorize_publication_readiness=false`、`can_claim_quality_verdict=false`、`can_claim_artifact_authority=false`，不能替代 domain owner consumption。

仓内还提供 repo-tracked Codex plugin surface：`plugins/opl-scholarskills/.codex-plugin/plugin.json` 与 `plugins/opl-scholarskills/skills/opl-scholarskills/SKILL.md`。该 skill pack 只是把 canonical contract、CLI readback 和 no-authority guard 暴露给 Codex discovery / sync layer；它不是第二真相源，也不能替代 `contracts/opl-framework/scholar-skills-capability-modules.json`、`src/scholar-skills.ts`、domain owner receipt、typed blocker、runtime evidence 或 paper artifact authority。

## Connect 同步与安装落点

普通 OPL App 用户路径分两层：

1. `opl system startup-maintenance --json` 由 App-managed runtime / startup-maintenance 通过 GHCR `one-person-lab-manifest` agent package channel 自动安装或更新 `OPL ScholarSkills` package 到 OPL managed modules root（默认 `<OPL_STATE_DIR>/modules/opl-scholarskills`，或显式 `OPL_MODULES_ROOT/opl-scholarskills`）。这个 target 是 `framework_capability_package`，不是 `DOMAIN_MODULE_SPECS` 里的 domain module，也不会把 ScholarSkills 计入 OPL 品牌 agent module。普通 App / non-development 路径不维护 ScholarSkills 专属 git clone / pull source manager。
2. 具体论文 workspace / quest 需要调用 App action 或 CLI，把当前 managed package 里的 filtered skill pack 同步到该论文工作目录。App action 是 `scholarskills_workspace_sync` / `scholarskills_quest_sync`；CLI surface 是下面的 `opl connect sync-skills ... --target-*`。

只有显式 `OPL_SCHOLARSKILLS_REPO_ROOT`、`OPL_MODULE_PATH_SCHOLARSKILLS` 或 Developer Mode local checkout 时，startup-maintenance 才把本地 checkout 作为开发者 source 观察，不自动覆盖。普通 App 用户默认走 GHCR package channel 自动安装 / 更新，并把 package marker 里的 `source_git.head_sha` 作为 workspace / quest sync receipt 的 source head。

ScholarSkills 的论文执行默认落点是 workspace / quest-local Codex discovery skill，而不是用户系统级 Codex skill registry，也不是 MAS project mirror。面向具体论文 workspace 或 quest 时，使用：

```bash
opl connect sync-skills --domain scholarskills --scope workspace --target-workspace <workspace-root> --json
opl connect sync-skills --domain scholarskills --scope quest --target-quest <quest-root> --json
```

这会把 filtered skill pack 写入 `<target>/.codex/skills/opl-scholarskills/`，并生成 `.opl-install-receipt.json`，记录 source repo path、source HEAD、target scope/root、copy policy、copied/excluded roots 与 authority false flags。复制内容只包括 `SKILL.md` 以及必要 contracts/docs/gallery review refs；`.git`、`outputs`、`build`、`dist`、`node_modules`、`render-cache` 和 heavy gallery assets/intermediate files 不进入目标 workspace / quest。Gallery 的人审文档与 lightweight manifest 应随 `opl-scholarskills` package 分发；重型生成中间结果、render cache 和批量图片资产不得进入 git/package 默认同步面。

兼容的 project mirror 仍保留给开发和 review，但必须显式请求：

```text
<med-autoscience-repo>/plugins/opl-scholarskills/
```

该目录是 OPL-managed project-local mirror，只承载 `opl-scholarskills` plugin manifest 与 `SKILL.md`，用于开发、review 和 MAS project-local 能力面审阅；它是 deprecated / non-default paper execution path。它不是 MAS domain truth、不是 MAS owner receipt、不是 typed blocker、不是 runtime queue，也不是 publication/package authority。MAS 仓内 `.codex/` 已退役，project scope 不得写入 MAS `.codex/skills`。裸 `opl connect sync-skills --domain scholarskills --json` / `opl connect sync-skills --json` 不会再隐式写 MAS 程序仓 mirror；没有 workspace/quest target 时只返回 skipped/readback。

系统级 Codex 注册仍保留为显式开发者路径：

```bash
opl connect sync-skills --domain scholarskills --scope codex --json
```

只有显式 `--scope codex` 才写用户 Codex plugin registry / config；默认 workspace/quest sync 返回 `codex_plugin_registry=null`。App 的普通用户同步入口是 `scholarskills_workspace_sync` / `scholarskills_quest_sync`，支持 dry-run readback；project-local mirror 只保留为显式 CLI/developer route，不作为 App 普通论文执行路径。

需要把 module id 绑定到真实 OPL runtime environment substrate 时，使用 runtime bridge 命令。它们复用 `opl runtime env prepare/run-context` 的实现，可在明确 `--apply` 时写入 OPL 管理依赖库和 `paper/build/dependency_environment_lock.json`、`dependency_environment_receipt.json`、`dependency_run_context.json`，但仍不写 domain truth、artifact body、owner receipt、typed blocker 或 runtime queue：

```bash
opl scholar-skills runtime-prepare --module <module_id> --profile <profile> --platform <platform> --requirement-profile <path> --paper-root <path> [--apply] --json
opl scholar-skills runtime-run-context --module <module_id> --profile <profile> --platform <platform> --paper-root <path> --json
```

`prepared_ref_envelope`、`run_context_ref_envelope`、`invocation_ref_envelope`、`receipt_candidate_unsigned`、runtime dependency lock、runtime dependency receipt、bound run-context、`cache hit`、`descriptor exists` 或 `doctor pass` 只能证明 OPL substrate 的结构/读面成立，不能声明 domain ready、runtime ready、quality verdict、artifact authority、owner receipt、typed blocker 或 production ready。

## MAS 消费边界

MAS 可以把全部 `opl.scholarskills.*` 模块作为 `current_owner_delta` 的 refs-only capability request，桥接到 MAS Scientific Capability Registry 的 candidate artifact refs。Display 仍可复用 MAS Display Pack 的 candidate artifact refs；Tables、Stats、Omics、Lit、Write、Review、Submit、Data 和 Intake 则通过同一 OPL module descriptor / execution receipt 形状暴露专业候选 refs。但 MAS 仍持有 study truth、publication truth、quality verdict、artifact authority、owner receipt、typed blocker、human gate 和当前 package authority。

目标调用链：

```text
MAS current_owner_delta
  -> OPL Atlas capability discovery
  -> OPL Pack descriptor / contract validation
  -> OPL runtime env prepare / run-context
  -> OPL Runway invocation envelope
  -> candidate artifact refs + execution receipt
  -> MAS owner gate consume / reject
```

当前 OPL 侧落地范围是 10 模块 capability catalog、descriptor validation、CLI readback、module-specific refs-only invoke/receipt candidate 与 runtime env bridge refs。真实 domain owner consumption 要回到 MAS 等 domain repo 的 owner surface；OPL 的 unsigned candidate receipt 不会签 owner receipt，也不会把候选图、表、分析、文本、review、submission package、data manifest 或 intake contract 晋级为论文 truth。

## Display Gallery 人审入口

`opl.scholarskills.display` 的人审 gallery 入口仍由 MAS Display Pack 持有。OPL 侧入口文档是 [OPL ScholarSkills Display Gallery](./opl-scholar-skills-display-gallery.md)，它只引用这些 MAS-owned review refs，不复制或改写 gallery truth：

- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery.pdf`
- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery_reference.md`
- `med-autoscience/docs/delivery/medical-display/examples/display_pack_gallery_status.md`
- `med-autoscience/docs/delivery/medical-display/examples/display_pack_gallery_quality_audit.md`
- `med-autoscience/docs/delivery/medical-display/examples/gallery_manifest.json`
- `med-autoscience/docs/delivery/medical-display/examples/medical_display_gallery_assets/gallery_manifest.json`

这些 refs 证明有人可审的 Display gallery surface 存在；它们不证明 visual parity 完成、publication-ready、owner accepted 或 MAS paper artifact ready。当前 MAS gallery status 仍需按 MAS Display Pack owner gate 与 fresh artifact inspection 判定，OPL ScholarSkills 只能把它作为 `visual_audit_or_gallery_preview_ref` 的下游人审入口。

## CLI Readback

```bash
opl scholar-skills list --json
opl scholar-skills inspect --module opl.scholarskills.display --json
opl scholar-skills prepare --module opl.scholarskills.display --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --paper-root paper --json
opl scholar-skills run-context --module opl.scholarskills.display --profile display --json
opl scholar-skills runtime-prepare --module opl.scholarskills.display --profile display --platform macos-arm64 --requirement-profile renderer_dependency_profile.json --paper-root paper --apply --json
opl scholar-skills runtime-run-context --module opl.scholarskills.display --profile display --platform macos-arm64 --paper-root paper --json
opl scholar-skills invoke --module opl.scholarskills.display --input-ref mas:current_owner_delta/display-intent --artifact-root artifact-root:display-pack-candidates --json
opl scholar-skills receipt --module opl.scholarskills.display --input-ref mas:current_owner_delta/display-intent --artifact-root artifact-root:display-pack-candidates --json
opl scholar-skills materialize --module opl.scholarskills.display --input-ref mas:current_owner_delta/display-intent --artifact-root artifact-root:display-pack-candidates --output-root /tmp/scholarskills-display-candidate --json
opl scholar-skills interfaces --json
opl scholar-skills validate --json
opl scholar-skills doctor --json
```

这些命令是 OPL-owned readback，保持无 domain write、无 runtime state write、无 artifact body mutation、无 owner receipt signing。
