# OPL / Domain 边界收口 2026-07-07

Owner: One Person Lab
Purpose: 固定 OPL 作为智能体开发、运行和测试基座的结构边界，并把领域弹性放回 domain pack、professional Skill、profile 或 connector receipt。
State: active_reference
Machine boundary: 机器真相仍归 source、contracts、CLI/API 行为、tests、runtime ledger 和 domain-owned manifest。本文是人读导航面，不声明 runtime readiness、domain readiness、publication readiness、grant readiness、visual export readiness、App release readiness、Brand L5 或 production readiness。

## 边界

OPL 持有基座面：stage route intake、autonomy supervision、owner-evidence receipt transport、connector ABI、package descriptor、runtime environment bridge、owner-answer projection lookup 和 profile / adapter registry。

Domain agent 和 specialist pack 持有领域真相：paper progress、grant truth、visual/export verdict、citation judgment、professional Skill source、artifact body、owner receipt、typed blocker、human gate 和 readiness decision。

物理组织遵循同一边界。OPL core 只放 generic substrate；domain-specific profile 可以在 active caller 仍需要时暂留为 compatibility carrier，但新增 canonical API、contract、readback 和 docs 必须使用 `domain_*`、`stage_*`、`owner_evidence_*` 词汇。`paper_*`、`publication_*`、`grant_*`、`visual_quality_*`、`medical_*`、`hypothesis_*` 这类名字只应出现在 domain profile、professional Skill、connector 示例或 history，除非明确标记为 compatibility。

Skill 弹性保留在 Skill 层。OPL foundation support Skill 和 source-only helper 只把 Framework 边界翻译成 operator playbook；domain professional Skill 保留自己的 source truth、rubric、citation judgment 和专业写作 / 审稿方法。OPL 可以 package、sync、inspect 和 expose Skill refs，但不把 MAS Scholar Skills professional truth 复制进 OPL core。

## 已落地收口

| 区域 | 旧问题 | 落地形态 |
| --- | --- | --- |
| Runway route intake | MAS paper mission carrier 看起来像 canonical route surface。 | `domain_route` canonical fields 和 readback ids 已是一等面；MAS paper mission 只保留为 compatibility profile。 |
| Runway autonomy supervisor | paper autonomy 命名主导 supervisor readback。 | Domain autonomy supervisor canonical surface ids 已暴露；paper autonomy 只保留为 legacy command / profile。 |
| Ledger sustained consumption | MAG manifest sustained-consumption 文件和命令持有实现主体。 | Owner-evidence sustained-consumption 是 canonical ledger / action / CLI implementation；MAG command 是 legacy re-export / alias。 |
| Stagecraft owner-answer projection | MAS publication handoff path 曾硬编码在 lookup。 | Generic owner-answer projection profile 驱动 lookup；MAS publication handoff 只是一个 profile。 |
| Stagecraft transition ingestion | Visual transition refs 曾是 RCA-only。 | Visual transition adapter profile 控制 ref prefix；RCA 只是默认 compatibility profile。 |
| Kernel managed shell | Domain clean-runner roots 和 readonly commands 曾是固定内部数组。 | Domain clean-runner profiles 可注入 / 可扩展，同时保留当前 defaults。 |
| Runway runtime env root | dependency runtime bridge 曾把 `paper_root` / `--paper-root` 写成 substrate 主词汇。 | `artifact_root` / `--artifact-root` 是 canonical root；`paper_root` / `--paper-root` 只作为 compatibility alias 暂留，并由 `root_vocabulary` 明确标注。 |
| Connect scientific connectors | Provider receipt 容易被误读成 citation truth。 | Scientific / PubMed readback 暴露 ownership boundary 和 no citation / domain truth flags。 |
| ScholarSkills Pack bridge | OPL contract 容易被误读成 professional Skill source truth。 | Contract、pack readback 和 docs 区分 OPL descriptor / sync / env bridge 与 MAS Scholar Skills professional truth。 |
| Family orchestration schema examples | 通用 schema 的 `examples[0]` 曾把 MAS / RCA sample 暴露成默认示例，容易被误读为 OPL canonical ontology。 | Stage admission / replay / graph / proof / registry / source-spec / cohort-loop / runtime-budget / event / checkpoint / conflict examples 已改成 `example-domain` 与 generic stage vocabulary，并由 focused guard 阻止回归。 |
| Stage selection vocabulary | Stage selection contract 曾把 grant / publication / redcube 等 domain words 放进 canonical vocabulary。 | Canonical vocabulary 只保留 generic / profile-driven stage words；旧 domain values 只作为 compatibility alias 或 profile example。 |
| Managed shell clean-runner profile | MAS/MAG/RCA clean-runner profile 曾被读作 kernel 固定 domain surface。 | Clean-runner engine 保持 generic；domain defaults 必须从 package / descriptor / profile data 读取，不再作为 OPL core ontology。 |

## 2026-07-07 追加收口：schema example hygiene

本轮追加收口只处理 machine-readable example hygiene，不改变 domain truth、runtime behavior 或 active compatibility carrier。目标是消除“OPL 通用 schema 示例 = MAS/RCA ontology”的误读：

- generic family-orchestration schema 的 first example 使用 `example-domain`、`example_stage_control_plane`、`draft_authoring`、`owner_review`、`domain_delivery`、`artifact_stage_profile_refs` 等通用词汇；
- `family-stage-runtime-budget` 新增 canonical `artifact_stage_profile_refs`，旧 `visual_stage_profile_refs` 只作为 RCA compatibility alias 标记 `deprecated`；
- `tests/src/family-orchestration-cases/schema-boundaries.ts` 增加 selected generic schema example residue guard，禁止 MAS / paper / publication / medical / RCA / visual-profile 名字重新进入 generic example；
- product-entry、human-gate、domain-memory、runtime-supervision 等明确与 first-party domain fixture 对齐的示例继续保留为 fixture-aligned / compatibility surface，不作为 generic ontology。

## 2026-07-08 追加收口：active caller readback hygiene

本轮追加收口处理 active compatibility caller 的实现级读法，不删除真实消费面，也不把 docs/test pass 写成 readiness。目标是让仍需保留的 MAS/RCA carrier 在机器读回中先呈现 OPL generic substrate，再把 domain 名字放入 profile / compatibility 字段：

- `connect external-skills` 读作 generic external specialist source registry；`kdense-scientific-agent-skills` 是 registered compatibility source，不是 scientific-only OPL ontology，sync policy 是 single selected external specialist Skill。
- Runway MAS domain route / paper autonomy 保留兼容入口，但新增 `domain_route_readback`、`domain_progress_policy_adapter`、`domain_progress_delta=false`、`provider_completion_is_domain_ready=false` 等字段；`paper_progress_*` 字段只作为 legacy compatibility。
- Stagecraft owner-answer projection lookup 读作 `opl_domain_owner_answer_projection_profile_registry`；MAS publication handoff 是 compatibility projection，不是 OPL owner answer truth。
- Stagecraft visual transition ingestion 读作 `opl_domain_transition_adapter_profile`；RCA visual transition 是 compatibility projection / profile extension，不是 core visual ontology。
- Console MAS current-work-unit / runtime workbench 投影 normalize 到 `opl_domain_current_work_unit_profile_projection` / `opl_domain_runtime_workbench_profile_projection`；旧 `mas_*` surface 只作为 `compatibility_surface_kind`。
- Foundation support Skills 吸收跨 domain 失败模式，但只作为 AI review heuristics 和 no-authority route-back，不新增默认暴露。

## 2026-07-08 追加收口：standard agent registry pointer hygiene

本轮继续排查标准智能体边界，确认 `mas`、`mag`、`rca`、`oma`、`obf` 是 standard domain agents，`mas-scholar-skills` 是 `framework_capability_package`。`opl-meta-agent` 与 `opl-bookforge` 只作为 OMA / BookForge repo、alias、plugin 或 package carrier 名保留，不再作为 standard-agent canonical id。已把 Standard Agent Registry 的 canonical pointer 从旧 root-level 路径修正为 `src/kernel/standard-agent-registry.ts`，并同步 foundry series contract、target architecture、Foundry CLI / skill boundary tests 与默认 Skill 生态文档。详细矩阵见 [OPL 标准智能体边界调整 2026-07-08](./opl-standard-agent-boundary-adjustment-20260708.md)。

## 2026-07-09 追加收口：vocabulary / profile data hygiene

本轮追加收口处理残留的 contract vocabulary 和 kernel profile data 误读风险。它不删除 active compatibility carrier，不迁移 domain truth，也不把 focused tests 写成 live readiness。

- `stage-selection-vocabulary` 的 canonical arrays 只保存 `domain_route`、`domain_workstream`、`domain_artifact`、`profile_extension` 等 generic / profile-driven values；`grant_direction_assessment`、`grant_ops`、`medautogrant`、`redcube`、`publication` 等旧值只能保留在 compatibility aliases 或 profile examples。
- Kernel managed shell 只保留 clean-runner env assembly、receipt 和 fail-closed behavior；MAS/MAG/RCA clean-runner defaults 必须按 package / descriptor / profile data 读取，不能重新作为 OPL core 固定 domain list。
- `canonicalOwnerId` / owner-id normalization 只读作 repo / package owner locator normalization，例如把 `oma` 映射到 `opl-meta-agent` carrier；它不改变 standard domain agent canonical ids。标准智能体 canonical ids 仍是 `mas`、`mag`、`rca`、`oma`、`obf`。
- 后续新增 vocabulary、profile default 或 package descriptor 字段时，默认先问它是 generic substrate、compatibility profile、domain fixture 还是 domain-owned Skill truth；只有 generic substrate 才能进入 OPL canonical contract。

## 剩余收口清单

| 优先级 | 条目 | 需要做什么 | 已经不是问题 |
| --- | --- | --- | --- |
| P0 | 新 OPL surface 的 canonical vocabulary | 新增 Framework API、contract、readback、docs、tests 和 generic schema examples 继续使用 `domain_*`、`stage_*`、`owner_evidence_*`、`artifact_*`；domain-named carrier 只当 compatibility 或 fixture。 | `domain_route`、`stage-candidate-portfolio`、`owner_evidence_sustained_consumption_*`、generic family-orchestration examples 已提供 generic vocabulary；MAS paper mission、hypothesis、MAG manifest 名字不是缺 OPL primitive。 |
| P0 | Scientific connector boundary | PubMed、Crossref、OpenAlex、Semantic Scholar、Crossmark、Publisher 留在 `OPL Connect`，作为 provider receipt / normalized ref connector，不持有 citation-truth authority。 | PubMed / Crossref / OpenAlex 不是 domain truth gap，不迁出 Connect，也不复制成第二套 literature Skill。 |
| P0 | ScholarSkills source truth | 外部 `mas-scholar-skills` package 持有 plugin manifest、Skill 清单、内容合同与正文；OPL 只保留 generic package spec、validation、install/update/rollback、target-bound activation 与 provenance receipt。 | OPL-local plugin mirror、医学 catalog/validator/profile/engine 均不再需要。 |
| P0 | Stage candidate portfolio | `stage-candidate-portfolio` 保持 refs-only stage candidate / assumption / provenance / negative-path / advisory-metric / human-review projection。 | 它不是 hypothesis store、scientific truth reducer、quality gate、artifact authority 或 owner receipt signer。 |
| P0 | Owner-evidence sustained consumption | sustained consumption 保持 generic owner-evidence receipt transport 和 readback。 | 它只证明 owner-evidence intake 结构，不代表 MAS paper progress、grant acceptance、visual readiness 或 owner acceptance。 |
| P1 | Compatibility carrier retirement | 只有 active caller 迁到 generic surface 后，才退役 `paper_mission/*`、`paper-autonomy`、`mag-manifest-sustained-consumption`、MAS publication handoff、MAS current-work-unit 和 RCA visual-transition default profile。 | active caller 存在时 compatibility 可以暂留；当前 readback 已先暴露 generic profile / substrate 字段，不能围绕旧名字新增 canonical docs 或 contracts。 |
| P1 | Domain profile placement | 不属于 generic substrate 的 profile-specific example 和 route detail，迁回 profile docs、domain repo 或 specialist Skill docs。 | Domain example 可以作为示例存在，前提是所在 surface 明确不持有 domain truth 或 readiness authority。 |
| P1 | Profile data physical placement | Clean-runner defaults、dependency doctor profile、specialist skill sync profile 等 domain-specific defaults 留在 package / descriptor / profile data。 | OPL core 可以加载 profile 并输出 receipt，但不能把 profile default 写成 kernel-owned domain capability。 |
| P2 | History / tombstone cleanup | caller 退役后，把旧名字移入 history、tombstone 或 provenance docs，并删除把它们写成当前 OPL ontology 的 prose。 | 无 active caller 后，历史名字不需要 compatibility alias 或测试保护。 |

## 保留的有意兼容

以下名字可在 active caller 退役前作为 compatibility carrier 暂留：

- `paper_mission/*` route input 和 `paper-autonomy` CLI alias。
- Runtime env / ScholarSkills runtime bridge 的 `--paper-root` input alias；canonical 命令、contract 和 readback 使用 `--artifact-root` / `artifact_root`。
- `mag-manifest-sustained-consumption` CLI alias。
- MAS publication handoff owner-answer profile。
- RCA visual transition default adapter profile。

这些 compatibility carrier 不能用于新增 canonical OPL ontology。`opl-meta-agent`、`opl-bookforge`、`paper_mission`、`paper-autonomy`、`mag-manifest-sustained-consumption`、MAS publication handoff 和 RCA visual transition 这类名字即使仍出现在 repo/package/profile/readback 中，也只能证明 carrier、profile 或 refs-only evidence 仍需被 OPL 消费；不能证明 OPL 持有对应 domain authority。

`opl agents default-callers --family-defaults --json` 的空 worklist、zero missing gate 或 closed retirement gate 不等于 delete-ready。物理删除仍由 domain owner gate 决定；没有 `physical_delete_authorization_ref` / `keep_as_authority_adapter_ref` / `typed_blocker_ref` 时，OPL 文档和 readback 都不能把 compatibility carrier 写成可删。

## Residue 分类

| 分类 | 当前处理 | 读法 |
| --- | --- | --- |
| `allowed_profile_or_compatibility_carrier` | `paper_mission/*`、`paper-autonomy`、`mag-manifest-sustained-consumption`、MAS publication handoff profile、RCA visual-transition default profile、`--paper-root` alias 暂留。 | active caller 退役前可存在；只能作为 compatibility，不得成为新增 canonical API / docs / test 名字。 |
| `domain_fixture_or_first_party_example` | product-entry、human-gate、domain-memory、runtime-supervision 等 schema example 可继续对齐 MAS / MAG / RCA fixture。 | 这些示例证明 domain manifest / route projection 可被 OPL 读取；不代表 OPL 持有 domain truth、quality verdict 或 readiness authority。 |
| `generic_schema_example` | 通用 stage / replay / graph / proof / registry / event / checkpoint / conflict / runtime-budget schema 使用 generic example vocabulary。 | 该类不允许 MAS / paper / publication / medical / RCA / visual-profile residue；由 focused guard 保护。 |
| `generic_stage_vocabulary` | Stage selection canonical vocabulary 使用 generic / profile-driven terms；domain words 只能进 compatibility alias 或 profile example。 | 该类不允许 grant / publication / redcube / medical / repo-owner words 作为 canonical values。 |
| `profile_data` | Clean-runner defaults、dependency profile、skill sync defaults 等按 package / descriptor / profile 加载。 | OPL core 只拥有 loader / receipt / fail-closed behavior，不拥有 profile 对应 domain semantics。 |
| `history_or_provenance` | 历史计划、tombstone、旧路线和 closeout 流水进入 history / ledger / owner repo provenance。 | 可保留旧名字解释来龙去脉，但不能作为当前 OPL ontology 或 active work order。 |
| `problematic_canonical_ontology` | 当前目标为 0。 | 一旦新 generic surface 把 domain-specific 名字写成 canonical 字段、默认示例或默认 route，必须收回到 generic vocabulary 或 profile / fixture。 |

## Plan Completion Audit 口径

| 条目 | 状态 | 完成度 | fresh evidence 类型 | 剩余动作 |
| --- | --- | ---: | --- | --- |
| 识别并保留 OPL 基座边界 | done | 100% | `docs/status.md`、本文件、brand module / source-module contracts 的当前读面。 | 后续新模块仍需按同一 owner / machine boundary 规则审查。 |
| Runway / Stagecraft / Ledger / Kernel domain residue profile 化 | done | 100% | source + focused tests + root verify；canonical route / artifact root / owner-answer projection / owner-evidence 命名已落地；2026-07-08 追加把 active MAS/RCA caller 的 readback 也 profile 化。 | active compatibility carrier 只等 caller 退役后做 tombstone / delete。 |
| Connect scientific connector authority boundary | done | 100% | scientific connector schemas / readback tests；provider receipt 明确 no citation truth / no domain truth。 | Live provider coverage、rate-limit、release acceptance 仍是后置 evidence lane。 |
| Connect external specialist registry 泛化 | done | 100% | `connect external-skills` source/readback/tests；K-Dense/scientific 只作为 registered compatibility source，默认专业包 gap 后 single-skill sync。 | 不 bulk sync 外部库；不把 external source 写成 global Codex context 或 domain authority。 |
| BookForge dependency profile 下沉 | done | 100% | `dependency_profiles[].dependencies` 写入 BookForge package / descriptor，OPL `system dependency-doctor` 从 profile 数据生成 generic check / repair readback。 | 新 profile 继续只声明 executable / package dependency 与 no-authority boundary；OPL 不写 proof helper、manuscript、export verdict 或 owner receipt。 |
| ScholarSkills source truth 与 OPL packaging 分离 | done | 100% | OPL package closure / activation / status readback；MAS Scholar Skills 正文留在 external source repo。 | 不新增第二套 literature Skill truth；只维护 carrier projection hygiene。 |
| Family orchestration generic schema examples | done | 100% | selected schema examples + focused residue guard + focused tests。 | 后续新增 generic schema 必须加入同类 guard 或明确标注 fixture / compatibility。 |
| Stage selection vocabulary generic 化 | done | 100% | `stage-selection-vocabulary` contract + focused contract tests。 | 后续新增 canonical values 必须保持 generic / profile-driven；domain values 只能进 compatibility/profile data。 |
| Managed clean-runner profile data 下沉 | done | 100% | managed shell source + package/profile data + focused system-module tests。 | OPL core 继续只声明 env assembly / receipt / fail-closed，不声明 MAS/MAG/RCA domain execution truth。 |
| Live evidence / owner acceptance / domain readiness | partial | 0% | 本轮没有声称也没有执行 long-soak、真实 owner chain、release cohort 或 domain owner verdict。 | 继续作为 release / production / Brand L5 / domain-ready 后置 lane。 |

## 禁止声明

不能仅凭本次收口声明：

- domain ready、paper progress、publication ready、grant ready、visual/export ready；
- OPL 创建 owner receipt、typed blocker、human gate 或 quality verdict；
- runtime ready、App release ready、Brand L5 或 production ready；
- 从 PubMed / Crossref / OpenAlex provider metadata 推导 citation truth；
- 从 OPL plugin mirror 内容推导 MAS Scholar Skills source completeness；
- 把 stage-candidate portfolio completeness 当作 scientific novelty、evidence strength、candidate ranking、quality verdict 或 owner acceptance；
- 把 owner-evidence sustained-consumption receipt 当作 live owner consumption、paper/grant/visual progress 或 domain readiness。
