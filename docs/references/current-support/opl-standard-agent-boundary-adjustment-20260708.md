# OPL 标准智能体边界调整 2026-07-08

Owner: One Person Lab
Purpose: 记录本轮对 OPL 标准智能体与 OPL 基座的边界排查、已执行调整、保留项和后续 owner-gated 迁移口径。
State: active_reference
Machine boundary: 本文是人读排查与调整说明。机器真相继续归 source、contracts、CLI/API 行为、runtime ledger、domain-owned contracts、owner receipt、typed blocker、真实 workspace / App / release evidence。

## Fresh Evidence

本轮排查使用以下当前读面：

- `src/kernel/standard-agent-registry.ts`
- `contracts/opl-framework/foundry-agent-series-contract.json`
- `contracts/opl-framework/target-operating-architecture-contract.json`
- `contracts/opl-framework/domain-private-platform-tail-matrix.json`
- `opl agents conformance --family-defaults --json`
- `opl agents default-callers --family-defaults --json`
- 五个标准 domain repo 的 `contracts/domain_descriptor.json`、`contracts/pack_compiler_input.json`、`agent/stages/manifest.json`、`contracts/capability_map.json`、`agent/primary_skill/SKILL.md`；`family_stage_control_plane` 由 OPL Pack 从该 manifest 生成，不是 domain repo tracked contract

当前标准 domain agent 是 `mas`、`mag`、`rca`、`oma`、`obf`。`opl-meta-agent` 与 `opl-bookforge` 只保留为 OMA / BookForge 的 repo、package、plugin、alias 或 carrier 名，不再作为 standard-agent canonical id。`mas-scholar-skills` 是 `framework_capability_package`，不是 standard domain agent，不进入 default-caller deletion gate 或 domain physical-delete 判断。

## 已执行调整

| 调整 | 类型 | 原问题 | 当前落点 |
| --- | --- | --- | --- |
| Standard Agent Registry pointer 修正 | OPL 基座上收 / hygiene | contract、readback 和测试仍指向已不存在的旧 root-level registry path，容易误导维护者把标准智能体 registry 当成缺失或第二套 truth。 | canonical ref 改为 `src/kernel/standard-agent-registry.ts`；同步 `foundry-agent-series`、target architecture、Foundry CLI / skill boundary / brand-module tests 与 active support doc。 |
| Derived projection paths 修正 | OPL 基座上收 / hygiene | `foundry-agent-series-contract` 仍把 derived surfaces 写成旧 root-level 文件。 | 改为 `src/modules/foundry-lab/foundry-agent-cli-spine.ts`、`src/modules/connect/opl-skills.ts`、`src/modules/foundry-lab/standard-domain-agent-conformance-foundry-agent-os.ts`。 |
| 默认 Skill 生态 source pointer 修正 | OPL Connect hygiene | `opl-default-skill-ecosystem` 仍引用旧 root-level Skill catalog 和旧 plugin registry 路径。 | 改为 `src/modules/connect/opl-skills.ts` 与 `src/modules/connect/system-installation/codex-plugin-registry.ts`。 |
| Primary Skill carrier projection 固化 | OPL Connect / Codex install carrier | 五个标准 agent 的 `agent/primary_skill/SKILL.md` 是 repo-owned canonical source，但 Codex plugin install 仍需要 plugin 目录下真实 `SKILL.md`；如果只把 plugin skill 当重复文件删除，会破坏 standalone plugin 安装。 | `foundry-agent-series-contract` 增加 `primary_skill_carrier_projection_policy`；`opl connect sync-skills` materialize 完整 skill copy，并在 generated plugin 写入 `opl-carrier.json` provenance。Carrier 不是 membership/status/authority 轴。 |
| `mas-scholar-skills` fixture 分类修正 | OPL 基座 / capability package boundary | 正式 target architecture 已把它列为 `framework_capability_package`，但 minimal fixture 和 domain pack map 仍容易让它看起来像 standard domain agent。 | `applies_to_domain_agents` 只保留 `mas`、`mag`、`rca`、`oma`、`obf`；Scholar Skills 只通过 `framework_capability_packages` 暴露 refs-only package 能力。 |

这些调整只修正 OPL 基座 canonical source / projection pointer，不迁移 domain truth，不签 owner receipt，不创建 typed blocker，也不声明 runtime/domain/App/release ready。

## 标准智能体排查矩阵

| Agent / package | 当前预期能力 | 应上收 OPL 的通用功能 | 应留在 agent / skill 的能力 | 本轮结论 |
| --- | --- | --- | --- | --- |
| MAS (`mas`) | 医学研究 stage、paper mission、source/evidence refs、论文 package、医学质量 gate。 | scheduler、queue、attempt ledger、StageRun、runtime env、workspace/source/artifact locator、App/operator projection、owner-evidence transport、Connect scientific connector receipt。 | study truth、publication quality verdict、artifact/package authority、medical memory accept/reject、owner receipt、typed blocker、human gate、MAS paper stage prompt、MAS Scholar Skills professional Skill truth。 | OPL 侧通用 primitive 已存在；MAS repo 当前有大量未吸收本地写集，本轮不写 MAS。OPL 内 `paper_mission` / `paper-autonomy` 仅作为 active compatibility carrier 暂留，canonical readback 已有 `domain_route` / `autonomy-supervisor`。 |
| RCA (`rca`) | visual deliverable stage、PPT / image-first route、review/export、visual memory。 | generated domain action/status/workbench surfaces、Runway StageRun owner route、artifact locator、operator projection、refs-only evidence. | visual truth、layout/review/export verdict、canonical artifact authority、visual memory accept/reject、native helper implementation、owner receipt、typed blocker。 | OPL 内 RCA / visual 词只应出现在 compatibility profile、fixture 或 public routing catalog；canonical transition / owner-answer surface 走 generic domain profile。 |
| OMA (`oma`) | target-agent design、eval takeover、mechanism proposal、developer work order。 | OPL Agent Lab、Runway StageRun、promotion gate read model、work-order execution refs、generated interfaces。 | agent-building semantics、candidate package refs、proposal materialization refs、target-agent typed blocker refs。 | OMA 是 standard domain agent；`opl-meta-agent` 只作为 repo / package / plugin carrier 名保留。OMA scripts 只能作为 authority implementation、smoke helper、fixture/proof helper 或 work-order materializer；不得变成 OPL runner / queue / promotion gate owner。 |
| OPL BookForge (`obf`) | book manuscript stage、chapter authoring、source/reference review、publication memory、export handoff。 | hosted/generated package/workbench surface、Pack / Workspace / Ledger locator and lifecycle primitives、StageRun. | book manuscript truth、manuscript quality/export verdict、book artifact authority、style/reference memory accept/reject、owner receipt、typed blocker。 | BookForge 是 standard domain agent；`opl-bookforge` 只作为 repo/alias/package carrier 名保留。BookForge helper/materializer 是否删除仍需 domain owner delete/keep/typed-blocker decision，OPL default-caller readback 不能授权物理删除。 |
| MAS Scholar Skills (`mas-scholar-skills`) | 外部 professional capability package 与 package-owned capability refs。 | OPL generic package spec/channel、plugin/Skill validation、target-bound sync 和 provenance receipt。 | plugin manifest、Skill 清单、内容合同、正文和专业判断。 | 不是 standard domain agent；OPL-local catalog/profile/plugin mirror 已退役，当前能力只从 canonical package source 读取。 |

## OPL 内非基座能力排查

| OPL surface | 分类 | 当前处理 | 是否迁出 |
| --- | --- | --- | --- |
| `paper_mission/*` route handoff | MAS compatibility carrier | `domain_route` canonical fields 已存在；legacy task / surface kind 只服务 active MAS caller。 | 暂不迁出 / 不删除；等 active caller cutover 与 domain owner decision。 |
| `paper-autonomy supervisor` CLI alias | MAS compatibility CLI | `autonomy-supervisor` generic parser 已存在；旧命令只作 compatibility。 | 暂不删；禁止新增 canonical docs/tests 继续围绕旧名扩展。 |
| PubMed / Crossref / OpenAlex connector | Connect scientific connector profile | Connect 只输出 provider receipt / normalized refs / no citation truth；literature judgment 归 MAS Scholar Skills。 | 不迁出 OPL；这是通用 connector ABI 的 provider profile。 |
| `workstreams.json` / `domains.json` 中的 grant/research/presentation 词汇 | public task routing catalog | 用于当前 active public workstream / admitted domain catalog，不是 standard agent membership source。 | 不迁出；后续若扩 OMA/BookForge public workstream，必须走 admission，不从此文件推断标准 agent 集合。 |
| family-orchestration 中 publication/fundability/visual forbidden-claim wording | no-authority boundary / compatibility example | 明确说明 OPL 不持有这些 verdict。 | 不迁出；保留为防误用 guard。 |
| MAS / RCA profile-specific source refs | domain profile / fixture | 仅在 profile 或 fixture 中出现。 | 不迁出；不得升格为 OPL canonical ontology。 |

## 后续 Owner-Gated 动作

- 物理删除 `paper_mission`、`paper-autonomy`、MAG manifest alias、RCA visual profile、OMA / BookForge helper-materializer 等 compatibility carrier，需要 fresh `opl agents default-callers --family-defaults --json`、no-active-caller proof、no-forbidden-write proof、tombstone/provenance ref，以及 domain owner 的 `physical_delete_authorization_ref` / `keep_as_authority_adapter_ref` / `typed_blocker_ref`。空 deletion worklist 或 closed retirement gate 只表示没有 OPL 侧可执行删除项，不授权 physical delete。
- MAS 当前根 checkout 有大量未吸收同写集改动，本轮不得写 MAS，也不能把 OPL 侧 readback 变成 MAS physical delete 或 paper progress claim。
- 新增 OPL base surface 必须用 `domain_*`、`stage_*`、`owner_evidence_*`、`artifact_*` 词汇；domain-specific route detail 只进 profile、fixture、domain repo 或 professional Skill。

## Forbidden Claims

本轮调整不能声明：

- domain ready、paper progress、grant ready、visual/export ready、book export ready；
- OPL 生成 owner receipt、typed blocker、human gate、quality/export verdict；
- App release ready、runtime ready、Brand L5 或 production ready；
- default-caller worklist 为零等于物理删除授权；
- `mas-scholar-skills` mirror 薄等于专业 Skill 缺失。
