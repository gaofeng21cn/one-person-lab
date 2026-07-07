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

## 剩余收口清单

| 优先级 | 条目 | 需要做什么 | 已经不是问题 |
| --- | --- | --- | --- |
| P0 | 新 OPL surface 的 canonical vocabulary | 新增 Framework API、contract、readback、docs 和 tests 继续使用 `domain_*`、`stage_*`、`owner_evidence_*`；domain-named carrier 只当 compatibility。 | `domain_route`、`stage-candidate-portfolio`、`owner_evidence_sustained_consumption_*` 已提供 generic vocabulary；MAS paper mission、hypothesis、MAG manifest 名字不是缺 OPL primitive。 |
| P0 | Scientific connector boundary | PubMed、Crossref、OpenAlex、Semantic Scholar、Crossmark、Publisher 留在 `OPL Connect`，作为 provider receipt / normalized ref connector，不持有 citation-truth authority。 | PubMed / Crossref / OpenAlex 不是 domain truth gap，不迁出 Connect，也不复制成第二套 literature Skill。 |
| P0 | ScholarSkills source truth | `one-person-lab/plugins/mas-scholar-skills` 保持 thin pointer / packaging mirror；professional Skill body 留在外部 MAS Scholar Skills source，经 OPL package / Connect surface 同步。 | OPL mirror 缺目录不代表 MAS Scholar Skills capability 缺失。 |
| P0 | Stage candidate portfolio | `stage-candidate-portfolio` 保持 refs-only stage candidate / assumption / provenance / negative-path / advisory-metric / human-review projection。 | 它不是 hypothesis store、scientific truth reducer、quality gate、artifact authority 或 owner receipt signer。 |
| P0 | Owner-evidence sustained consumption | sustained consumption 保持 generic owner-evidence receipt transport 和 readback。 | 它只证明 owner-evidence intake 结构，不代表 MAS paper progress、grant acceptance、visual readiness 或 owner acceptance。 |
| P1 | Compatibility carrier retirement | 只有 active caller 迁到 generic surface 后，才退役 `paper_mission/*`、`paper-autonomy`、`mag-manifest-sustained-consumption`、MAS publication handoff 和 RCA visual-transition default profile。 | active caller 存在时 compatibility 可以暂留；不能围绕这些名字新增 canonical docs 或 contracts。 |
| P1 | Domain profile placement | 不属于 generic substrate 的 profile-specific example 和 route detail，迁回 profile docs、domain repo 或 specialist Skill docs。 | Domain example 可以作为示例存在，前提是所在 surface 明确不持有 domain truth 或 readiness authority。 |
| P2 | History / tombstone cleanup | caller 退役后，把旧名字移入 history、tombstone 或 provenance docs，并删除把它们写成当前 OPL ontology 的 prose。 | 无 active caller 后，历史名字不需要 compatibility alias 或测试保护。 |

## 保留的有意兼容

以下名字可在 active caller 退役前作为 compatibility carrier 暂留：

- `paper_mission/*` route input 和 `paper-autonomy` CLI alias。
- Runtime env / ScholarSkills runtime bridge 的 `--paper-root` input alias；canonical 命令、contract 和 readback 使用 `--artifact-root` / `artifact_root`。
- `mag-manifest-sustained-consumption` CLI alias。
- MAS publication handoff owner-answer profile。
- RCA visual transition default adapter profile。

这些 compatibility carrier 不能用于新增 canonical OPL ontology。

## 禁止声明

不能仅凭本次收口声明：

- domain ready、paper progress、publication ready、grant ready、visual/export ready；
- OPL 创建 owner receipt、typed blocker、human gate 或 quality verdict；
- runtime ready、App release ready、Brand L5 或 production ready；
- 从 PubMed / Crossref / OpenAlex provider metadata 推导 citation truth；
- 从 OPL plugin mirror 内容推导 MAS Scholar Skills source completeness；
- 把 stage-candidate portfolio completeness 当作 scientific novelty、evidence strength、candidate ranking、quality verdict 或 owner acceptance；
- 把 owner-evidence sustained-consumption receipt 当作 live owner consumption、paper/grant/visual progress 或 domain readiness。
