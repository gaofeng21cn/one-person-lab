# Connect / Pack / ScholarSkills 边界读回

Owner: One Person Lab
Purpose: 固定 OPL Connect、OPL Pack、MAS Scholar Skills 与科学 connector 的 owner/readback 边界，避免把外置 skill、capability package 或 provider connector 误判为 domain truth。
State: active_reference
Machine boundary: 机器读回以 `contracts/opl-framework/scholar-skills-capability-modules.json`、`contracts/opl-framework/runtime-environment-profiles/mas-display.json`、`opl scholar-skills * --json` 和 `opl connect scientific|pubmed * --json` 为准；本文只解释这些 readback 字段。

## 结论

OPL 只拥有连接、包描述、同步投影、provider receipt candidate 与 runtime env bridge。MAS / MAS Scholar Skills / domain owner 仍持有专业 skill truth、citation judgment、domain truth、quality verdict、owner receipt、typed blocker 与 publication readiness。

这次边界收口后的默认判断是：PubMed / Crossref / OpenAlex 留在 `OPL Connect` 不是缺能力；`one-person-lab/plugins/mas-scholar-skills` 作为 thin mirror 缺正文不是缺专业 Skill truth；`stage-candidate-portfolio` 是 refs-only 投影不是 domain hypothesis truth；`owner_evidence_sustained_consumption_*` 是 owner-evidence receipt transport 不是 owner acceptance 或 domain progress。

## OPL Connect

- `opl connect scientific search --provider pubmed|crossref|openalex --json` 是 optional scientific connector profile。
- `opl connect pubmed search --json` 是 PubMed 兼容入口。
- Connect readback 可以输出 normalized source refs、provider metadata、connector invocation ref、provider receipt candidate ref 和 no-authority boundary。
- Connect readback 不能声明 citation truth、domain truth、publication readiness、quality verdict、owner receipt、typed blocker 或 production readiness。

## OPL Pack / ScholarSkills

- `scholar-skills-capability-modules.json` 描述 package descriptor、sync projection、runtime env bridge 与 unsigned receipt candidate descriptor。
- `mas-scholar-skills` 的专业 skill truth 和 citation judgment 不在 OPL Framework 合同中复制维护。
- `opl scholar-skills list|inspect|interfaces --json` 必须带 `ownership_boundary`，让消费者直接看到 OPL-owned surface 与 MAS/domain-owned truth 的分界。
- `mas-display.json` 只描述 MAS display pack 的 runtime dependency profile，不代表 visual quality verdict、artifact body authority 或 publication readiness。

## Skill 层弹性

- OPL foundation support skills / source-only helpers 只解释 Framework module、owner route、forbidden claim、handoff 和 refs-only evidence。
- Domain professional skills 承载专业 playbook、rubric、citation judgment、写作/审稿/图表/统计方法和 route-back 经验。
- OPL 可以管理 package、sync、workspace / quest materialization 和 Codex discovery；不能把 professional Skill source、正文 completeness 或专业判断复制成 OPL core truth。

## 禁止误判

- 不把 PubMed、Crossref、OpenAlex 从 Connect 移出。
- 不新增第二套 literature skill 或复制 MAS Scholar Skills 正文。
- 不把 provider receipt、package descriptor、sync envelope、runtime env bridge 或 candidate package 当作 MAS paper truth。
- 不把 stage-candidate portfolio 当作 domain truth、quality gate、artifact authority 或 owner receipt。
- 不把 owner-evidence sustained-consumption readback 当作 owner acceptance、domain progress 或 readiness。
