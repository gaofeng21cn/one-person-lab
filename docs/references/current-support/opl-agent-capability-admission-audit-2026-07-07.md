# OPL Agent 能力准入与 Skill 暴露审计

Owner: `One Person Lab`
Purpose: `agent_capability_admission_and_skill_exposure_audit`
State: `current_support_audit`
Machine boundary: 本文是人读审计与治理建议；机器真相仍归各 repo 的 `contracts/capability_map.json`、`agent/stages/manifest.json`、OPL generated `family_stage_control_plane`、Skill source、exposure manifest、App install exposure policy、CLI/readback、runtime artifact 和 owner receipt。

## 审计口径

本次审计按“先能力模块、再实现层、最后暴露面”的顺序读取，不以目录名直接判定能力成熟度。

三层实现读法：

| 层 | 语义 | 典型位置 | 不能做什么 |
| --- | --- | --- | --- |
| `professional_skill` / `domain_skill_declaration` | AI-first 专业方法、stage 内 playbook、review lens、route-back 写法。 | `agent/professional_skills/**/SKILL.md`、外置 `skills/**/SKILL.md`、`agent/skills/*.md`。 | 不写 truth、receipt、typed blocker、artifact authority 或 readiness。 |
| `skill_local_deterministic_helper` | 随 Skill 分发的小脚本、模板、lint、归一化、manifest / receipt shaping。 | Skill 同目录 `scripts/`、`kernel.py`、`templates/`。 | 不升级成独立 OPL module、runtime worker 或 authority owner。 |
| `programmatic_substrate` / `authority_surface` | connector、runtime、queue、ledger、App projection、owner gate、release/currentness evidence。 | OPL/domain `src/**`、`contracts/**`、CLI/readback、runtime artifacts、owner surfaces。 | 不替代专业判断；测试绿或投影存在不等于 domain ready。 |

新增能力必须先过 `docs/policies/standard-agent-capability-management-policy.md#新能力准入门`：能复用现有 stage/router/reviewer/connector 的，不新建 Skill；稳定脚本放 helper/connector；authority 留 owner surface；罕见外部专科走 OPL Connect `search -> inspect -> single-skill sync`。

## 总体结论

| 范围 | 发现 | 合理性 | 优化空间 |
| --- | --- | --- | --- |
| OPL foundation support skills | 27 个 source skill，全部由 `plugins/opl-foundation-skills/exposure.json` 管理；当前分布为 `developer_codex=6`、`project_local=15`、`workspace_local=6`。 | 基本合理。它们是 framework support / reviewer / router，不是 domain professional pack，也没有默认 global user 暴露。 | 后续新增必须先填 admission record；优先复用 router/reviewer，避免为每个小任务新增 support Skill。 |
| MAS | MAS 本仓无 repo-local `agent/professional_skills`；`contracts/capability_map.json` 声明 13 个能力，其中 8 个 professional skill 指向外置 `mas-scholar-skills`。 | 合理。MAS 保持 stage / runtime / owner authority，专业方法由外置包承接。 | 继续避免 MAS 仓内复制 MAS Scholar Skills 正文或 optional specialist catalog。 |
| MAS Scholar Skills | 外部 package owner 持有当前 plugin manifest、Skill 目录与内容合同；OPL 不冻结数量或 core/optional 分类。 | 合理。它是 external professional capability package，不是 MAS truth owner。 | 新增或分类调整在 package owner 仓完成；OPL 只验证、同步并保留 no-authority receipt。 |
| MAG | 8 个 repo-local professional skills，全部进入 `contracts/capability_map.json`；另有 stage prompt、tool connector、reference pack、contract module。 | 合理。Grant 方法留 repo-local，authority 留 MAG。 | `agent/stages/manifest.json` 引用 `agent/skills/grant_authoring.md`，OPL Pack 将其编译进 generated stage plane；如未来需要 executor 直接按 specialist 注入，可从 capability map 投影，不另建新目录。 |
| RCA | 7 个 repo-local professional skills，全部进入 capability map；stage prompts / control plane 对主要 PPT specialist 有直接 refs。 | 合理。视觉方法、template profiling、native PPT design 与 memory curation 分层清楚。 | `agent/skills/*.md` 作为 legacy policy ref 的边界要继续保持，不能退回成“又一套 professional skill”。 |
| OMA | 9 个 repo-local professional skills，全部进入 capability map；`agent/skills/*.md` 明确是 domain skill declarations。 | 合理。OMA 的 target-agent improvement / work-order / suite design 等是元智能体专业方法。 | 继续防止把 action flow、target truth 或 takeover authority 写进 professional Skill。 |
| BookForge | 9 个 repo-local professional skills，全部进入 capability map；book stage prompt 只做目标和 handoff，方法下沉到 professional skills。 | 合理。长文写作、style、reference absorption、publication design 与 source claim review 是专业方法。 | PDF/export 后端属于 helper/connector/authority 边界，不应放进 professional Skill 正文。 |
| OPL App companion skills | App Full 从 OPL Flow 的 `requires + recommends` 闭包打包 OfficeCLI、MinerU、UI/UX 等通用能力。 | 合理。它们是 workflow dependency，不是 domain agent professional skills，也不由 App 维护第二份清单。 | 新增 companion skill 要先进入 OPL Flow policy，再由 Framework package lifecycle 执行；`tmp/**`、VM evidence 和 generated cache 不能当 current skill source。 |

## 详细审计表

### OPL foundation support skills

| 能力模块 | 物理位置 | 暴露方式 | 三层实现程度 | 评估 |
| --- | --- | --- | --- | --- |
| Framework support / reviewer / router pack | `plugins/opl-foundation-skills/skills/**/SKILL.md` | `plugins/opl-foundation-skills/exposure.json`；禁止默认 global / codex scope。 | `professional_skill` 风格的 support playbook + exposure manifest；authority 留 OPL/domain owner surface。 | 合理，但数量增长需要准入门控制。 |
| External specialist routing | `opl-external-specialist-skill-router`；scientific 只是 query / trigger specialization，不再保留单独 compatibility entry | workspace / quest 按 manifest 暴露；真实外部 skill 通过 Connect 单个 sync。 | router 是薄 Skill；下载、索引、sync receipt 属于 OPL Connect。 | 合理。避免把 K-Dense / scientific-agent-skills 全量注册成默认 Codex context，也避免 compatibility alias 污染 metadata。 |
| MAS Scholar Skills capability package | 外部 `mas-scholar-skills/.codex-plugin/plugin.json` 与 `skills/*/SKILL.md` | package owner 持有清单和正文；OPL 只保留 generic package dependency spec。 | package closure validation + target-bound activation + provenance receipt；不承接 MAS authority。 | OPL-local plugin pointer 已退役；`opl-scholarskills` 继续 tombstone-only。 |

### MAS / MAS Scholar Skills

| 能力模块 | 物理位置 | 暴露方式 | 合理性 |
| --- | --- | --- | --- |
| MAS stage prompt / runtime / owner authority | `med-autoscience/agent/**`、contracts 与 runtime/controller owner surfaces | MAS plugin entry + OPL Runway/Stagecraft projection | 合理；不在 OPL 或外部 capability package 签 MAS owner truth。 |
| MAS Scholar Skills professional capability package | 外部 `mas-scholar-skills/.codex-plugin/plugin.json`、`skills/*/SKILL.md` 与 package-owned contracts | generic package channel + workspace/quest Packages activation | OPL 不复制 Skill 清单、profile、validator 或正文；具体专业能力以 package owner 当前 source 为准。 |

### MAG

| 能力模块 | Skill / surface | 物理位置 | 暴露方式 | 合理性 |
| --- | --- | --- | --- | --- |
| Call fit | `mag-call-fit-analyst` | `agent/professional_skills/mag-call-fit-analyst/SKILL.md` | repo-local capability map | 合理。 |
| Fundability strategy | `mag-fundability-strategist` | repo-local professional skill | capability map | 合理。 |
| Strategy memory | `mag-grant-strategy-memory-curator` | repo-local professional skill | capability map | 合理；不写 memory authority。 |
| Specific aims | `mag-specific-aims-architect` | repo-local professional skill | capability map | 合理。 |
| Proposal section authoring | `mag-proposal-section-author` | repo-local professional skill | capability map | 合理。 |
| Grant review | `mag-grant-reviewer` | repo-local professional skill | capability map | 合理；不签 quality verdict。 |
| Rebuttal | `mag-rebuttal-planner` | repo-local professional skill | capability map | 合理。 |
| Submission package audit | `mag-submission-package-auditor` | repo-local professional skill | capability map | 合理；不声明 final submission ready。 |

### RCA

| 能力模块 | Skill / surface | 物理位置 | 暴露方式 | 合理性 |
| --- | --- | --- | --- | --- |
| Story architecture | `rca-ppt-story-architect` | `agent/professional_skills/rca-ppt-story-architect/SKILL.md` | capability map + stage refs | 合理。 |
| Visual direction | `rca-ppt-visual-director` | repo-local professional skill | capability map + stage refs | 合理。 |
| Page authoring | `rca-ppt-page-author` | repo-local professional skill | capability map + stage refs | 合理。 |
| PPT review | `rca-ppt-reviewer` | repo-local professional skill | capability map + stage refs | 合理；不签 export verdict。 |
| Visual memory curation | `rca-visual-memory-curator` | repo-local professional skill | capability map + policy refs | 合理；不写 memory body / owner receipt。 |
| Native PPT design | `rca-native-ppt-designer` | repo-local professional skill | capability map + stage refs | 合理；Office/PPTX mutation helper 仍是 programmatic/helper 边界。 |
| Template profiling | `rca-template-profiler` | repo-local professional skill | capability map + stage refs | 合理。 |

### OMA

| 能力模块 | Skill / surface | 物理位置 | 暴露方式 | 合理性 |
| --- | --- | --- | --- | --- |
| Agent evolution | `oma-agent-evolution` | `agent/professional_skills/oma-agent-evolution/SKILL.md` | capability map | 合理。 |
| Agent Lab suite design | `oma-agent-lab-suite-designer` | repo-local professional skill | capability map | 合理。 |
| External pattern research | `oma-external-pattern-researcher` | repo-local professional skill | capability map | 合理；external learning 只产 candidate refs。 |
| Intent architecture | `oma-intent-architect` | repo-local professional skill | capability map | 合理。 |
| Stage pack architecture | `oma-stage-pack-architect` | repo-local professional skill | capability map | 合理。 |
| Script-to-pack hygiene | `oma-script-to-pack-hygiene-reviewer` | repo-local professional skill | capability map | 合理；正好服务本次准入原则。 |
| Takeover review | `oma-takeover-reviewer` | repo-local professional skill | capability map | 合理；不签 takeover authority。 |
| Trajectory learning | `oma-trajectory-learning-analyst` | repo-local professional skill | capability map | 合理。 |
| Work-order authoring | `oma-work-order-author` | repo-local professional skill | capability map | 合理；work-order 不等于 patch authority。 |

### BookForge

| 能力模块 | Skill / surface | 物理位置 | 暴露方式 | 合理性 |
| --- | --- | --- | --- | --- |
| Story architecture | `bookforge-story-architect` | `agent/professional_skills/bookforge-story-architect/SKILL.md` | capability map | 合理。 |
| Chapter authoring | `bookforge-chapter-author` | repo-local professional skill | capability map | 合理。 |
| Reader style | `bookforge-reader-style-designer` | repo-local professional skill | capability map | 合理。 |
| Style editing | `bookforge-style-editor` | repo-local professional skill | capability map | 合理。 |
| Reference absorption | `bookforge-reference-absorber` | repo-local professional skill | capability map | 合理；不复制 protected prose。 |
| Source claim review | `bookforge-source-claim-reviewer` | repo-local professional skill | capability map | 合理；不写 source truth。 |
| Meta review | `bookforge-meta-reviewer` | repo-local professional skill | capability map | 合理。 |
| Publication design | `bookforge-publication-designer` | repo-local professional skill | capability map | 合理；final export authority 仍需 owner evidence。 |
| Book memory curation | `bookforge-book-memory-curator` | repo-local professional skill | capability map | 合理；不写 memory authority。 |

### OPL App companion skills

| 能力模块 | Skill / surface | 物理位置 | 暴露方式 | 合理性 |
| --- | --- | --- | --- | --- |
| Scheduled task companion | `cron` | `one-person-lab-app/assets/companion-skills/cron/SKILL.md` | App install exposure policy -> user skill discovery path | 合理；这是 companion tool，不是 domain professional skill。 |
| PDF companion | `pdf` | `assets/companion-skills/pdf/SKILL.md` | App install exposure policy | 合理；通用文件工具。 |
| MinerU extraction companion | `mineru-document-extractor` | `assets/companion-skills/mineru-document-extractor/SKILL.md` | App install exposure policy | 合理；通用 extraction connector/skill。 |
| Managed external companion payloads | OfficeCLI、MinerU、UI/UX 等 | OPL Flow workflow policy | Framework package lifecycle | 合理；App Full 只打包 policy 闭包，新增 companion 不应混入 domain plugin semantic mirror。 |

## 风险与处理

| 风险 | 状态 | 处理 |
| --- | --- | --- |
| 新需求默认沉淀为新 Skill，导致 Skill 数量膨胀。 | 已处理到 policy。 | `standard-agent-capability-management-policy.md#新能力准入门` 增加 admission record、判定顺序和拒绝条件。 |
| OPL foundation support Skill 数量增长，metadata 污染日常 Codex。 | 当前受控，需持续治理。 | `exposure.json` 已是 machine guard；新增 foundation Skill 必须登记 `exposure_scope` / `activation_gate` / no-authority。 |
| MAS Scholar Skills export catalog 与 OPL/MAS 本地清单漂移。 | 当前受控。 | provider manifest 是完整 export catalog 单源；OPL scope 从发布 payload 动态物化全部 exports，不复制 35 项清单。11 core + 10 modules 只定义 hard readiness floor。 |
| `agent/skills/*.md` 与 `agent/professional_skills/**` 混淆。 | 当前 RCA/OMA/BookForge/MAG 文档基本清楚。 | 新增能力必须先声明 `selected_layer`；`agent/skills/*.md` 默认按 domain skill declaration / policy ref 读取。 |
| App `tmp/**`、VM evidence、generated cache 被误扫成当前 Skill source。 | 审计发现并排除。 | 当前 App repo-native skill source 只按 `assets/companion-skills/**` 与 contracts 读取。 |

## 后续准入规则

- 新增 repo-local professional Skill：必须同时更新 owning repo `contracts/capability_map.json` 或等价 resolver，并说明为什么不能由现有 Skill 覆盖。
- 新增 OPL foundation support Skill：必须更新 `plugins/opl-foundation-skills/exposure.json`，默认从最窄 `source_only` / `project_local` / `workspace_local` 开始。
- 新增 MAS Scholar Skills specialty：必须由 provider owner manifest 声明正式 Skill export、进入发布 payload/content lock，并在下一次 scope use-boundary transaction 中随全部 exports 物化；只有明确提升为 MAS hard dependency floor 时才修改 11 core readiness 集合，module contract 继续单独声明而不物化为 Skill 目录。
- 新增 connector / helper：优先放 Connect / Fabric / Skill-local helper，不包装成专业 Skill。
- 新增 authority write：只能落 owner repo authority surface，禁止放进 Skill。

本审计没有声明任何 runtime ready、domain ready、App release ready、publication ready、owner accepted 或 production ready。
