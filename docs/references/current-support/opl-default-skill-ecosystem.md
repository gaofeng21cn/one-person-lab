# OPL 默认 Skill 生态参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_default_skill_ecosystem`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

## 2026-07-24 planned supersession

Package 是安装单元；Skill、Tool、Plugin 和 entrypoint 是 Package 或平台动态发现的
capability，不建立第二 lifecycle。OPL 不再通过自研 Package lock、payload、LKG、
materializer、activation transaction 或固定 family plugin registry 定义 Skill
currentness。MAS 只声明 ScholarSkills required presence；实际 carrier 平台 ensure 后，
运行边界验证所需 entrypoint 可调用。workspace/quest 暴露策略和 no-authority 规则继续
有效；Git history 与 retained compatibility 字段中的固定 Skill 数量、scope generation、
Package transaction 和 lock/receipt 只解释旧实现。完整迁移见
[`OPL Package 平台组合迁移计划`](../../active/opl-package-platform-composition-migration.md)。

这份文档说明 OPL App 和 `opl install` 如何从 Package owner descriptor 与 carrier fresh discovery 读取 Skill 能力，以及这些 Skill 应该放在哪一层。目标是让 One Person Lab App、原版 Codex App 和命令行 Codex 看到一致但可自由组合的能力生态，同时避免把项目专用 Skill 装到系统级。

## Currentness policy

本文冻结默认 skill 生态的 owner boundary 和读法，不冻结本机 Skill/Package 数量、安装状态、symlink target、tool version、Codex bundled plugin cache version、Full seed bytes、远端 companion 仓库 head、用户 `CODEX_HOME` / `HOME` / `PATH`、`~/.codex/config.toml` 内容或 App 首启结果。当前 capabilities、source candidate、tool readiness、apply mode、carrier projection 和 Skill status 必须从 Package owner descriptor、配置的 carrier fresh discovery、实际 entrypoint callability 以及对应 CLI/readback 读取；`opl system initialize`、`opl skill companion status`、`opl connect skills` 等旧入口在迁移完成前只作兼容投影。

稳定读法是：任意 installed `kind=agent` Package 都可通过 owner descriptor 被 Framework 动态发现；MAS/MAG/RCA/OMA/OBF 是当前 Official Profile 的 starter roots，不是生态上限或固定 allowlist。OPL companion skills 是用户级或 profile 可同步的辅助能力；Codex bundled skills 只读可用性。`status` / `observe` 不修改用户环境，实际安装/同步由配置的 carrier 执行。OCI、Full seed 或其他 source 中有 bytes 不等于 Package installed，更不等于已写入用户级 `~/.codex/skills` 或 `.agents/skills`。

MAS owner descriptor 声明 `mas-scholar-skills` 为 required Package identity；ScholarSkills repo 独立维护自己的 descriptor 与 Skill/capability exports。Framework 不复制 MAS 私有依赖明细，不冻结 Skill id 或数量，也不比较 Package version/ABI/lock/digest；配置的 carrier 只 ensure `mas` 与缺失的 ScholarSkills，并以 fresh installed/callable readback 确认 MAS route。Codex Plugin Manager 只是首个 carrier adapter，Plugin-only 不能替代完整 Package runtime。未安装 MAS 时，ScholarSkills 不因此成为全局默认 Package。

OPL 自身的 base / support Skill 只用于 Framework 运维、agent authoring、contract-light 调试、FoundryRun/EvidenceBundle 解读和 capability 审查。它们不是 domain Package 的专业领域 Skill，也不是 `src/modules/**` 的实现替身。推荐 source-only 位置是 `plugins/opl-foundation-skills/skills/<skill-id>/SKILL.md`；默认 `exposure_scope` 是 `source_only`。只有经过 Connect / Pack / 配置的 carrier 按场景投影后，才进入 executor-visible plugin surface、workspace / quest `.codex/skills/` 或用户级 discovery path。生成物、缓存和安装目标都不是 canonical source。

Codex metadata 本身也算暴露面。OPL 不应把 foundation support pack 的全部 Skill metadata 默认注册进普通用户系统级 Codex；support Skill 数量增长时，默认策略是 source-only 保存、developer/profile-local 激活、workspace / quest 子集同步，必要时只暴露一个极薄 router / search / inspect 入口，再按明确 selector 激活具体 Skill。不要为每个小模块、窄场景或 compatibility alias 新增物理 support Skill；先复用现有 router / reviewer。`plugins/opl-foundation-skills/exposure.json` 是这条规则的 machine-readable guard；`opl connect foundation-skills inspect` 读取 manifest，`opl connect foundation-skills sync --skill <skill-id> --scope project|workspace|quest --target-root <path>` 只显式同步单个允许 scope 的 Skill，global / codex scope fail-closed。

MAS / MDS 相关用户级全局 Skill 的当前审计见 [MAS 全局 Skill 暴露审计](./mas-global-skill-exposure-audit.md)。该审计只记录本机全局 metadata 污染风险和预期暴露层级，不把用户级安装状态当作 OPL 默认生态，也不替代 carrier fresh discovery。

`plugins/opl-foundation-skills/.codex-plugin/plugin.json` 只描述 source-only support pack；active Skill 和 redirect 数量必须从其 owner manifest 与目录 fresh discovery 读取，本文不冻结计数。`developer_codex` 只暴露 manifest 当前声明的高频运维入口，其余按 `project_local` / `workspace_local` 场景显式同步。

`K-Dense-AI/scientific-agent-skills` / `kdense-scientific-agent-skills` 是 OPL Connect approved external source registry 的示例读法：approved 只表示可以通过 `opl connect external-skills search -> inspect -> sync` 选择单个 Skill。它不是 OPL 默认安装上下文，不是默认 companion，不把全库 metadata 暴露给普通 Codex 任务，也不要求为 scanpy、Nextflow、RDKit、single-cell 等小类新增 OPL foundation Skill。

`developer_codex` 当前示例入口（非固定清单）：

- `opl-runway-compute-operator`：Runway compute / provider route 诊断和 handoff briefing。
- `opl-runtime-soak-and-recovery-auditor`：runtime/provider/environment/native-helper/soak/recovery evidence 审查。
- `opl-incident-root-cause-triager`：stall、currentness drift、conflict/blocker、stop-loss、nonprogress、heartbeat 和 false progress 的 L0-L4 root-cause brief。
- `opl-console-operator-copilot`：Console/App/Settings/Runtime page/workbench operator projection、next action 和 forbidden claim 解读。
- `opl-agent-package-lifecycle-reviewer`：agent package trust、manifest digest、dependency/provenance refs、install/update/repair/rollback、Codex reload proof 和 owner route 审查。
- `opl-code-quality-remediation-reviewer`：`opl quality details --json` / Sentrux / line-budget sidecar 的 must-fix/advisory 判断、最小修复建议和 no-quality-verdict 路由审查。

`project_local` 入口：

- `opl-stagecraft-stage-designer`：Stagecraft stage prompt、rubric、capability use 和 handoff lower-bound 设计。
- `opl-stage-quality-gate-critic`：Stagecraft quality gate、stage admission projection、evidence lower bound、trust lane、composition obligation、human-review burden 和 no-authority gate delta 审查。
- `opl-stage-assumption-lifecycle-reviewer`：stage assumption lifecycle projection 的 stale/missing/owner/monitor gap、stage impact 和 route-back 审查。
- `opl-stage-candidate-portfolio-reviewer`：stage candidate portfolio refs-only projection 的 candidate/assumption/provenance/negative-path/advisory-metric/human-review ref gap、domain authority overclaim 和 owner-route 审查。
- `opl-stage-pack-source-replay-reviewer`：stage-pack source spec / replay certification 的 body-free diff、replay blocker、missing receipt 和 owner-route workorder 审查。
- `opl-connect-source-and-skill-router`：Connect external source / Skill search-inspect-sync、single-skill sync 和 connector receipt debug。
- `opl-connect-connector-receipt-auditor`：Connect connector receipt candidate、normalized refs、failed provider 和 no-authority handoff 审查。
- `opl-foundry-agent-improver`：FoundryRun/EvidenceBundle、qualification、risk/Owner gate、canary/activation/rollback 和 operational confidence briefing。
- `opl-eval-harness-designer`：Foundry Kernel eval harness、task cases、scorecard、failure taxonomy 和 promotion/hold evidence 设计。
- `opl-pack-admission-reviewer`：Pack admission、capability/authority ABI、tool affordance、registry fit、contract evidence、allowed/forbidden writes 和 owner route 审查。
- `opl-atlas-capability-router`：Atlas owner/source/skill/connector/tool-card/capability refs 路由和 catalog ambiguity diagnosis。
- `opl-charter-authority-reviewer`：Charter authority boundary、owner split、no-second-truth、forbidden claim 和 readiness/closeout claim 审查。
- `opl-completion-audit-writer`：Plan Completion Audit、证据等级匹配、完成度、gap、next owner、Brand L5/release evidence overclaim 和 forbidden claim 编排。
- `opl-source-module-boundary-reviewer`：source-module owner、public entrypoint、dependency direction、upstream shell intake、private-tail retirement route 和 forbidden import 审查。

`workspace_local` 入口：

- `opl-external-specialist-skill-router`：默认 OPL / domain professional pack 覆盖不到专业或罕见科研工具、source、workflow 或 method 时，薄路由到 OPL Connect external-skills search/inspect/sync；只允许 workspace / quest-local 按需同步，不进入全局 Codex metadata，也不为每个 scientific 小类新增 compatibility Skill。
- `opl-workspace-handoff-writer`：Workspace source/artifact refs、source-readiness audit section、handoff packet、missing-input route-back 和 owner-route packet 写法。
- `opl-ledger-evidence-curator`：Ledger refs-only evidence、claim support、closeout proof、provenance chain 和 evidence gap 分类。
- `opl-owner-evidence-intake-reviewer`：owner_evidence_intake、observed refs、owner-chain evidence 和 acceptance overclaim 的证据类型审查。
- `opl-memory-artifact-lifecycle-curator`：memory/artifact/local-data lifecycle refs、artifact unit、archive/restore、retention/cleanup、provenance 和 owner-route brief 编排。

本轮合并删除的窄入口不再单独暴露 metadata：package trust 合入 `opl-agent-package-lifecycle-reviewer`；App first-run / release evidence / Settings IA / Runtime task awareness / user workbench action 合入 `opl-console-operator-copilot`；runtime provider fit / environment bundle / native helper diagnostics / recovery playbook 合入 `opl-runtime-soak-and-recovery-auditor`；stop-loss / nonprogress / conflict-blocker resolution 合入 `opl-incident-root-cause-triager`；stage admission 合入 `opl-stage-quality-gate-critic`；workspace source-readiness audit 合入 `opl-workspace-handoff-writer`；Brand L5 / release evidence overclaim 由 `opl-completion-audit-writer` 和 Console/soak reviewer 分担；pack capability 合入 `opl-pack-admission-reviewer`；Foundry promotion 合入 `opl-foundry-agent-improver`；shell upstream intake 与 private-tail retirement 合入 `opl-source-module-boundary-reviewer`；local-data lifecycle 合入 `opl-memory-artifact-lifecycle-curator`；scientific external routing 合入 `opl-external-specialist-skill-router`，不再保留单独 compatibility alias。

这些 Skill 只把开放式判断、诊断、审查、路由和改写方法留在 AI 层；credential、queue、submit/wait/harvest、registry/sync、receipt、schema、runtime truth、owner receipt、typed blocker、domain verdict、App release verdict 和 production readiness 仍由对应模块或 domain owner surface 持有。

首批需要更强确定性辅助、但仍应保持 AI-first 弹性的 foundation Skill 已随目录携带 `kernel.py`：`opl-connect-source-and-skill-router`、`opl-connect-connector-receipt-auditor`、`opl-runway-compute-operator`、`opl-runtime-soak-and-recovery-auditor`、`opl-stagecraft-stage-designer`、`opl-pack-admission-reviewer`、`opl-workspace-handoff-writer`、`opl-incident-root-cause-triager`。这些 helper 只做 refs 归一化、checklist / skeleton 生成、gap 分类和 forbidden-claim lint；不读取或写入 runtime state，不调用 provider，不管理 endpoint，不签 owner receipt / typed blocker，也不声明 release、domain、runtime 或 production readiness。

`opl-runway-compute-operator` 与 `opl-runtime-soak-and-recovery-auditor` 可以审阅 Claude Science / AcademicForge 风格的 remote-compute Modal env spec、using-model-endpoint provider 经验、runtime environment bundle 和 native-helper diagnostic refs，但 OPL 的机器 truth 只来自 `contracts/opl-framework/runtime-environment-substrate-contract.json` 与 `opl runtime env * --json` readback。Skill helper 只生成 no-authority handoff / reviewer notes；E2B、Daytona、Modal、model endpoint 的 endpoint/ref、credential ref、provider receipt ref、Modal-like env ID catalog、endpoint invoke/readback contract 和 lifecycle 禁止项由 Runway / Connect contract surface 持有，不由 Skill 正文、docs、provider SDK 或 cached receipts 持有。

## 三层模型

| 层级 | 例子 | 默认安装/同步位置 | 维护原则 |
| --- | --- | --- | --- |
| OPL family domain skills | 当前 starter 包括 MAS、MAG、RCA、OPL Meta Agent、OPL Book Forge；其他 `kind=agent` Package 同级 | Package owner descriptor 声明 rich primary skill/capabilities；配置的 carrier 安装完整 runtime 并投影到 Codex 或其他 executor | 各 domain-agent 仓维护 Package/domain source 和 rich primary skill；Framework 动态聚合 installed/callable 状态，不维护固定 Agent/Skill id 列表，Codex marketplace/cache 只归 Codex carrier |
| OPL base/support skills | 标准 Agent 建模、capability 分类、owner-route 诊断、contract-light 调试、workspace handoff、FoundryRun/evidence/risk review、package / descriptor review | 默认 `source_only`，source 放在 `plugins/opl-foundation-skills/skills/<skill-id>/`；developer/profile-local 才 materialize Codex-visible 面；workspace / quest 只同步需要的 refs-only 子集 | 只提供 AI executor 的运维 playbook 和审阅提示；不全包污染系统级 Codex metadata；不进入 `src/modules/**`，不放到 MAS/MAG/RCA 仓做 source truth，不签 owner receipt、typed blocker、quality verdict、artifact authority 或 readiness |
| OPL Flow 推荐能力 | agent-reach、ui-ux-pro-max、officecli skills/CLI、MinerU skill/CLI | OPL Flow owner descriptor 声明 required/optional identity 或 capability，配置的 carrier 检查实际存在与可调用性 | `opl packages install|update opl-flow` 只处理所选 root 和缺失 required identity；App Full 可携带 seed bytes，但 App 不维护第二份清单 |
| Codex bundled skills | Documents、Presentations、Spreadsheets | Codex plugin cache | 只检测可用性，不复制到 `~/.codex/skills` |

OfficeCLI、MinerU 和其他 tool capability 的 installed/current 状态归其真实 carrier；Framework 只从 binary realpath、native list/status 和入口 probe 聚合。无法证明 owner 时只显示原渠道 guidance，不猜测或覆盖 Homebrew、global npm、普通 PATH、远端服务。

OPL family domain agent 默认不写入各自的顶层 `[mcp_servers.*]` standalone server。当前 Codex 路径由 Codex carrier 按 owner descriptor 投影 Package 的 Plugin/Skill/MCP 入口；repo-local MCP server 只能作为 domain handler target、direct protocol adapter 或 proof lane 保留。`opl install` 和 `opl connect sync-skills` 在迁移期可移除旧 family standalone MCP server 段并注册 Framework-owned `[mcp_servers.opl-connect]`，其当前精选工具只覆盖只读 scientific search 和 reference verification；这类 cleanup 不构成固定 Agent/Plugin 清单，其他非 OPL MCP server 配置必须保留。

这里的 generated surface 是 executor 可见暴露面，不是默认 companion Skill 清单。Full runtime 可以携带任意 Package/Skill seed bytes，但 seed 存在不等于 installed 或已经写入用户级 discovery metadata；是否安装或注册由配置的 carrier 决定，并且必须遵守能力管理 policy 的 `exposure_scope` / `activation_gate`。

MAS Scholar Skills 的 canonical source 是 `mas-scholar-skills` Package；其 owner descriptor、`.codex-plugin/plugin.json`、实际 `skills/*/SKILL.md` 和 Package contracts 动态决定当前 capabilities。OPL 不保留 thin plugin mirror、医学 Skill ID catalog、固定数量或 required/default profile。配置的 carrier 负责 install/update 与 workspace/quest discovery；Framework 只检查 required Package presence 和 MAS 所需入口 callability。MAS 的 stage prompt 与 domain truth 留在 MAS，专业 Skill 内容与清单留在 Package owner；OPL projection 不声明 owner gate、quality/domain truth、clinical data readiness、typed blocker、runtime queue 或 publication/export readiness。

MDS 内部的 `scout`、`review`、`baseline`、`experiment`、`write` 等项目专用 skill 不属于 OPL 默认系统级生态。它们应该留在 MAS 控制下的项目目录或 domain runtime 内部，不升级为 OPL 默认 family skill；若本机存在用户级全局安装，只能读作显式个人/历史安装，治理口径见 [MAS 全局 Skill 暴露审计](./mas-global-skill-exposure-audit.md)。

## OPL base/support Skill 管理规则

OPL base/support Skill 的职责是把运维层模块的边界翻译成 AI 可执行的简短 playbook。例如：读 `Charter` 的 forbidden claims、按 `Pack` 审查 declarative pack、按 `Stagecraft` 判断 stage prompt 是否越界、按 `Workspace` 写 handoff、按 `Atlas` 查 owner / capability、按 `Connect` 做 selective sync、按 `Runway` 定位 attempt / queue、按 `Ledger` 绑定 refs-only evidence、按 `Console` 解释 operator next action、按 `Foundry Kernel` 解读 Run/evidence/risk/Owner gate。它们不持有这些模块的机器真相，只引用模块合同、CLI/readback、receipt 和 owner refs。

开放式评估、策略、调试和执行方法应留在 Skill 层：

- 评估：rubric、review checklist、quality-floor 提示和独立 reviewer playbook。
- 策略：任务拆解、路线选择、candidate 比较、revision / route-back 方法。
- 调试：root-cause 分类、evidence binding、owner-route 诊断、contract-light repair playbook。
- 执行：workspace handoff、stage closeout 包、descriptor/package review、FoundryRun/EvidenceBundle/risk-gate review。

不进入 Skill 层的内容是机器边界：schema、validator、contract enum、owner descriptor、CLI handler、provider queue、domain/release evidence、App state builder 和 carrier readback。这些继续归对应 Package、Framework、runtime、carrier 或 release owner。

推荐管理方式：

- 新增 OPL base/support Skill 前先检查是否只是一次性 lane 提示；未复用时保持在当前 task/run context 或 docs reference，不创建 Skill。
- 确认跨 agent / workspace 复用后，source-only 放入 `plugins/opl-foundation-skills/skills/<skill-id>/`，并在本文件或能力管理 policy 中补最小链接。
- 每个 Skill 都必须评估默认 `exposure_scope` 和 `activation_gate`：普通默认是 `source_only`；OPL repo 开发或 operator 诊断可用 `project_local` / `developer_codex`；论文或任务执行只同步 `workspace_local` / `quest_local` 子集；`global_user` 只允许用户显式选择的少数 companion 能力。
- `plugins/opl-foundation-skills/exposure.json` 承载 per-skill `exposure_scope` / `activation_gate`；新增或调整 Skill 时必须同步更新 manifest，并让 CLI / test guard 继续 fail-closed。
- 需要安装或分发时，走 Pack / Connect / package / managed profile；不要让 `src/modules/**` 直接承载 Skill 正文，也不要把完整 support pack 注册成普通 Codex 全局候选。
- domain 仓只能声明采用、映射或专业扩展；不能把 OPL support Skill copy 成自己的长期 source truth。
- 完成声明只能说文档 / source / sync 边界已落地；安装成功、runtime ready、domain ready、App release ready 和 production ready 必须由对应 fresh readback 或 owner evidence 证明。

## 机器入口读法

| 机器入口 | 当前职责 | 不从本文读取的动态事实 |
| --- | --- | --- |
| OPL Flow owner descriptor / `contracts/workflow-policy.json` | 声明自身 required/optional Package 或 capability identity、conflicts/retires 与模型推荐；不冻结普通用户的全局 Skill 清单。 | 本机安装结果、路径、版本和 readback。 |
| `opl packages install|update opl-flow` | 作为公共 façade，把所选 root 与缺失 required identity 委托给配置的 carrier，并返回 fresh installed/callable readback。 | carrier 的实际 mutation 和 currentness。 |
| `src/install-companions.ts` | 迁移期兼容 adapter；目标由配置的 native carrier 安装 descriptor 选择的 skill/tool。 | owner descriptor、carrier readback 与 App Official Profile。 |
| `src/install-companions-parts/tools.ts` | 检测或安装 `officecli` 与 `mineru-open-api` binary，并要求对应 skill payload + binary 同时可用才算相关 companion ready。 | `officecli --version`、`mineru-open-api version`、本机 PATH、`OPL_FULL_RUNTIME_HOME/bin`、remote install 输出。 |
| `src/modules/connect/opl-skills.ts` | 迁移期 Codex projection primitive；目标从动态 installed Package descriptor 读取 primary skill/capability，不拥有 Package lifecycle。 | carrier installed/callable 状态、primary skill source、generated plugin cache path、sync count。 |
| `src/system-installation/codex-plugin-registry.ts` | Codex carrier adapter，负责 plugin/config/cache 的 native projection 和旧 surface cleanup；目标必须消费动态 owner descriptor，不能固化 Agent id allowlist。 | 用户 config 当前内容、marketplace path、Plugin Manager readback 和实际 cleanup 数量。 |
| `opl system initialize` | 投影 `recommended_skills`、GUI shell、runtime/tool readiness 等初始化读面。 | 当前 recommended skill status、tool readiness、App first-run result。 |

MAS ScholarSkills 不暴露 OPL 私有 activate/scope transaction。`opl packages install|update mas` 只 ensure `mas` 与缺失的 `mas-scholar-skills`，并从实际 carrier fresh readback 聚合 installed/callable 状态；其他 roots 不进入 selection。更新失败只影响对应 Package/route，不要求 Framework 用 LKG、closure receipt 或人工 repair gate 接管 carrier。Console/App/Shell 不维护第二套 truth。

Developer Mode 命中 source checkout 时，MAS runtime source 与 `mas-scholar-skills` source 可以分别来自本地 checkout / repo URL。这个 override 只改变开发者显式选择的 carrier/source；Package identity、required presence 和 owner descriptor 不变。

## 历史工作流迁移

Superpowers、Superpowers Lite/local method profile、Ponytail、CodexCont 和旧 planner/executor/debugger/verifier prompt 都不再是推荐能力。用户显式安装或更新 OPL Flow 时，配置的 carrier 按 owner policy 与自身原生保护机制处理旧 surface；对用户拥有的配置必须先备份或做单文件原子写，并尊重 explicit keep。Framework 不建立跨 Package rollback/LKG 状态机。

## officecli 和 Office 类 skill

OPL 把 officecli 作为“双组件” companion 能力，因为 MAS/MAG/RCA 都可能需要 Word、PowerPoint、Excel 或 dashboard 能力。skill payload 说明怎么用，`officecli` CLI binary 执行真实文档操作。Office 类 skill 只有 skill payload 和 `officecli --version` 同时可用时才算 ready。

当前 companion 示例由兼容投影和 installed discovery 给出；长期文档只保留类别，不冻结清单或某次状态：

- `officecli` skill payload + `officecli` CLI binary
- `officecli-docx` + `officecli` CLI binary
- `officecli-pptx` + `officecli` CLI binary
- `officecli-xlsx` + `officecli` CLI binary
- `mineru-document-extractor` + `mineru-open-api` binary
- `ui-ux-pro-max` skill payload
- Codex bundled Documents / Presentations / Spreadsheets availability

这些 Skill 可以来自 Skills Manager、OfficeCLI / ui-ux-pro-max / MinerU source、App Full seed、显式挂载 runtime 或其他 carrier。配置的 carrier 可以安装或复用 binary 并投影 Skill 到 executor discovery；是否 installed/callable 必须以 fresh readback 为准。Full DMG 或 WebUI 镜像不能被假定内置某个 capability，除非其 release artifact 明确携带并由 carrier 成功安装。

## OPL App 应该怎么用这套生态

OPL App 默认应该优先复用 Codex 的用户级 skill discovery 路径；是否修改这些路径由 profile 决定。

维护规则：

- `observe` 只读检测，不修改用户 skill 或工具生态。
- `ask_to_apply` 只生成可执行计划/按钮，等用户确认。
- `managed` 用于 `opl install`、OPL App 首启、OPL 专用 `CODEX_HOME`、`system configure-codex` 或显式挂载 packaged payload 的环境。
- 存在 `OPL_PACKAGED_SKILLS_ROOT` / `OPL_FULL_RUNTIME_HOME/skills` 时，managed profile 可把它们作为首装 skill source；是否已经 symlink 到用户级 discovery path 仍以 fresh CLI 输出和文件系统为准。
- 原版 Codex App 独立安装 MAS 时，Codex Plugin Manager 只承载 Plugin/config/cache 投影；完整 MAS runtime 与 required ScholarSkills Package 仍由 owner descriptor 指向的 carrier/runtime adapter 安装和 fresh readback，不塞回 MAS plugin carrier 作为第二真相源。
- 对 Codex bundled skills 只显示可用性，不复制。
- 对 MDS 以及其他 MAS-internal 项目专用 skill 不做系统级展示。
- 对任意 `kind=agent` Package，Codex carrier 只按 owner descriptor 注册对应 Plugin/Skill/MCP 投影；不恢复旧裸 mirror、standalone family MCP server block、compat alias 或 wrapper。

## 验证

```bash
opl install --headless
opl connect sync-skills
opl skill companion status
opl packages install opl-flow
opl packages update opl-flow
opl system initialize
```

`opl system initialize` 中 `recommended_skills` 应显示当前状态；`opl skill companion status` 不应修改用户环境，`apply --mode managed` 才能改。
