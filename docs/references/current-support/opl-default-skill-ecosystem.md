# OPL 默认 Skill 生态参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_default_skill_ecosystem`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

这份文档说明 OPL App 和 `opl install` 默认维护哪些 skill，以及这些 skill 应该放在哪一层。目标是让 One Person Lab App、原版 Codex App 和命令行 Codex 看到一致的能力生态，同时避免把项目专用 skill 装到系统级。

## Currentness policy

本文冻结默认 skill 生态的 owner boundary 和读法，不冻结本机 skill 安装状态、symlink target、tool version、Codex bundled plugin cache version、Full runtime payload、远端 companion 仓库 head、用户 `CODEX_HOME` / `HOME` / `PATH`、`~/.codex/config.toml` 内容或 App 首启结果。当前推荐 companion 清单、source candidate、tool readiness、apply mode、plugin registry、generated plugin surface 和 recommended skill status 必须从 fresh `opl system initialize --json`、`opl skill companion status --json`、`opl skill companion apply --mode <ask_to_apply|managed> --json`、`opl connect skills --json`、`opl connect sync-skills --json`、`src/install-companions.ts`、`src/install-companions/catalog.ts`、`src/install-companions-parts/tools.ts`、`src/modules/connect/opl-skills.ts`、`src/modules/connect/system-installation/codex-plugin-registry.ts` 与相关测试读取。

稳定读法是：MAS/MAG/RCA/OMA 是 family domain plugin/generated surface，不是默认 companion skill mirror；OPL companion skills 是用户级或 managed profile 可同步的辅助能力；Codex bundled skills 只读可用性。`status` / `observe` 不修改用户环境，`managed` 或 App/Full managed profile 才可以 materialize symlink、tool binary 或 plugin registry。任何 package payload 存在都不等于已经写入用户级 `~/.codex/skills` 或 `.agents/skills`。

MAS professional skill dependency 只从 MAS agent package manifest 的 package core 读取。`mas-scholar-skills` 是 MAS required capability package，但 repo 仍独立维护；Codex Plugin 只是 carrier adapter。OPL Packages 把 manifest dependency graph 解析为 managed install/update/rollback、Developer Mode source checkout、Codex carrier readback 和 workspace / quest activation transaction，不在 OPL 侧写死 MAS 私有依赖，也不把 Agent Package 等同 Codex Plugin。

OPL 自身的 base / support Skill 只用于 Framework 运维、agent authoring、contract-light 调试、work-order 写法和 capability 审查。它们不是 MAS/MAG/RCA/BookForge 的专业领域 Skill，也不是 `src/modules/**` 的实现替身。推荐 source-only 位置是 `plugins/opl-foundation-skills/skills/<skill-id>/SKILL.md`；默认 `exposure_scope` 是 `source_only`。只有经过 Connect / Pack / managed profile 按场景投影后，才进入 Codex-visible plugin surface、package payload、workspace / quest `.codex/skills/` 或用户级 discovery path。生成物、缓存和安装目标都不是 canonical source。

Codex metadata 本身也算暴露面。OPL 不应把 foundation support pack 的全部 Skill metadata 默认注册进普通用户系统级 Codex；support Skill 数量增长时，默认策略是 source-only 保存、developer/profile-local 激活、workspace / quest 子集同步，必要时只暴露一个极薄 router / search / inspect 入口，再按明确 selector 激活具体 Skill。不要为每个小模块、窄场景或 compatibility alias 新增物理 support Skill；先复用现有 router / reviewer。`plugins/opl-foundation-skills/exposure.json` 是这条规则的 machine-readable guard；`opl connect foundation-skills inspect` 读取 manifest，`opl connect foundation-skills sync --skill <skill-id> --scope project|workspace|quest --target-root <path>` 只显式同步单个允许 scope 的 Skill，global / codex scope fail-closed。

MAS / MDS 相关用户级全局 Skill 的当前审计见 [MAS 全局 Skill 暴露审计](./mas-global-skill-exposure-audit.md)。该审计只记录本机全局 metadata 污染风险和预期暴露层级，不把用户级安装状态当作 OPL 默认生态，也不替代 workspace / quest-local lifecycle receipt。

当前 `plugins/opl-foundation-skills/.codex-plugin/plugin.json` 暴露的是 source-only support pack。降噪合并后，物理 source 只保留二十六个 active Skill，另有二十一个 `no_regression_redirects` 只作为 redirect-only 合同项，不计入 active Skill；其中 `developer_codex` 只保留六个高频运维入口，其余按 `project_local` / `workspace_local` 场景显式同步。

`K-Dense-AI/scientific-agent-skills` / `kdense-scientific-agent-skills` 是 OPL Connect approved external source registry 的示例读法：approved 只表示可以通过 `opl connect external-skills search -> inspect -> sync` 选择单个 Skill。它不是 OPL 默认安装上下文，不是默认 companion，不把全库 metadata 暴露给普通 Codex 任务，也不要求为 scanpy、Nextflow、RDKit、single-cell 等小类新增 OPL foundation Skill。

`developer_codex` 保留入口：

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
- `opl-foundry-agent-improver`：Foundry Lab work-order、conformance/eval、Skill rewrite、promotion/hold/rollback 和 operational confidence briefing。
- `opl-eval-harness-designer`：Foundry Lab eval harness、task cases、scorecard、failure taxonomy 和 promotion/hold evidence 设计。
- `opl-pack-admission-reviewer`：Pack admission、capability/authority ABI、tool affordance、registry fit、contract evidence、allowed/forbidden writes 和 owner route 审查。
- `opl-atlas-capability-router`：Atlas owner/source/skill/connector/tool-card/capability refs 路由和 catalog ambiguity diagnosis。
- `opl-charter-authority-reviewer`：Charter authority boundary、owner split、no-second-truth、forbidden claim 和 readiness/closeout claim 审查。
- `opl-completion-audit-writer`：Plan Completion Audit、证据等级匹配、完成度、gap、next owner、Brand L5/release evidence overclaim 和 forbidden claim 编排。
- `opl-domain-progress-transition-reviewer`：DomainProgressTransitionRuntime refs、current owner delta、transition candidate 和 route-back 的 no-authority 审查。
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
| OPL family domain skills | MAS、MAG、RCA、OPL Meta Agent、OPL Book Forge | 标准 agent 先走 Agent Package package core，再通过统一 Codex Plugin carrier adapter 使用 repo-owned `agent/primary_skill/SKILL.md` + action-contract readback + OPL-owned Codex marketplace wrapper / family plugin registry | 各 active domain-agent 仓维护 package/domain source 和 rich primary skill，OPL 只负责读取 package core、刷新 carrier adapter、Codex plugin registry 和 `OPL_STATE_DIR/codex-plugin-marketplaces/*` wrapper，不复制到 `~/.codex/skills`，也不在 domain repo 写 `.agents/plugins/marketplace.json`；旧 repo plugin 目录只作为 compat/provenance mirror |
| OPL base/support skills | 标准 Agent 建模、capability 分类、owner-route 诊断、contract-light 调试、workspace handoff、Foundry Lab work-order、package / descriptor review | 默认 `source_only`，source 放在 `plugins/opl-foundation-skills/skills/<skill-id>/`；developer/profile-local 才 materialize Codex-visible 面；workspace / quest 只同步需要的 refs-only 子集 | 只提供 AI executor 的运维 playbook 和审阅提示；不全包污染系统级 Codex metadata；不进入 `src/modules/**`，不放到 MAS/MAG/RCA 仓做 source truth，不签 owner receipt、typed blocker、quality verdict、artifact authority 或 readiness |
| OPL Flow 推荐能力 | ui-ux-pro-max、officecli skills/CLI、MinerU skill/CLI | OPL Flow manifest 声明，Framework materialize 到用户级 Codex discovery 与受管工具 PATH | `opl packages install|update opl-flow` 解析 online closure；App Full 按 `offline_bundle=full` 打包；App 不维护第二份清单 |
| Codex bundled skills | Documents、Presentations、Spreadsheets | Codex plugin cache | 只检测可用性，不复制到 `~/.codex/skills` |

OPL family domain agent 默认不写入顶层 `[mcp_servers.*]` standalone server。MAS、MAG、RCA 的 Codex App 可见面统一来自 Codex plugin / family plugin registry / OPL-generated interface；OPL Meta Agent 的 Codex App 可见面来自 OPL-generated Codex surface。repo-local MCP server 只能作为 domain handler target、direct protocol adapter 或 proof lane 保留。`opl install` 和 `opl connect sync-skills` 在刷新 MAS/MAG/RCA plugin registry 时，会移除旧的 family standalone MCP server 段，并退役旧的 `~/.codex/skills/{mas,mag,rca}` 裸 mirror，保留 Sentrux、Playwright 等非 OPL MCP server 配置。

这里的 generated surface 是 Codex 可见暴露面，不是默认 companion skill sync 清单。Full runtime 可以携带 OPL Meta Agent 或其他 skill/module payload，但随包存在不等于已经写入用户级 `~/.codex/skills` 或全局 Codex plugin metadata；是否写入或注册由 `opl connect sync-skills`、startup maintenance 或显式 managed companion sync 决定，并且必须遵守能力管理 policy 的 `exposure_scope` / `activation_gate`。

MAS Scholar Skills 的 canonical source 是外部 `mas-scholar-skills` package；其 `.codex-plugin/plugin.json`、`skills/*/SKILL.md` 和 package-owned contracts 决定当前可用能力。OPL 不再保留 thin plugin mirror、医学 Skill ID catalog 或 required/default profile，只通过统一 `opl packages` channel 安装/更新/回滚，并由 Packages activation transaction 校验实际目录、按 workspace / quest target 物化、记录 provider lock、digest、11 个 materialized core Skill ids 和 lifecycle receipt。MAS 的 stage prompt 与 domain truth 留在 MAS，专业 Skill 内容与清单留在 package owner；OPL receipt 只证明分发和 provenance，不声明 owner gate、quality/domain truth、clinical data readiness、typed blocker、runtime queue 或 publication/export readiness。

MDS 内部的 `scout`、`review`、`baseline`、`experiment`、`write` 等项目专用 skill 不属于 OPL 默认系统级生态。它们应该留在 MAS 控制下的项目目录或 domain runtime 内部，不升级为 OPL 默认 family skill；若本机存在用户级全局安装，只能读作显式个人/历史安装，治理口径见 [MAS 全局 Skill 暴露审计](./mas-global-skill-exposure-audit.md)。

## OPL base/support Skill 管理规则

OPL base/support Skill 的职责是把运维层模块的边界翻译成 AI 可执行的简短 playbook。例如：读 `Charter` 的 forbidden claims、按 `Pack` 审查 declarative pack、按 `Stagecraft` 判断 stage prompt 是否越界、按 `Workspace` 写 handoff、按 `Atlas` 查 owner / capability、按 `Connect` 做 selective sync、按 `Runway` 定位 attempt / queue、按 `Ledger` 绑定 refs-only evidence、按 `Console` 解释 operator next action、按 `Foundry Lab` 生成 work-order。它们不持有这些模块的机器真相，只引用模块合同、CLI/readback、receipt 和 owner refs。

开放式评估、策略、调试和执行方法应留在 Skill 层：

- 评估：rubric、review checklist、quality-floor 提示和独立 reviewer playbook。
- 策略：任务拆解、路线选择、candidate 比较、revision / route-back 方法。
- 调试：root-cause 分类、evidence binding、owner-route 诊断、contract-light repair playbook。
- 执行：workspace handoff、stage closeout 包、descriptor/package review、Foundry Lab work-order materialization。

不进入 Skill 层的内容是机器边界：schema、validator、contract enum、package manifest、CLI handler、provider queue、receipt ledger、App state builder 和 release/update truth。这些继续归 OPL Framework source、contracts、runtime 或 release owner。

推荐管理方式：

- 新增 OPL base/support Skill 前先检查是否只是一次性 lane 提示；未复用时保持在当前 work-order 或 docs reference，不创建 Skill。
- 确认跨 agent / workspace 复用后，source-only 放入 `plugins/opl-foundation-skills/skills/<skill-id>/`，并在本文件或能力管理 policy 中补最小链接。
- 每个 Skill 都必须评估默认 `exposure_scope` 和 `activation_gate`：普通默认是 `source_only`；OPL repo 开发或 operator 诊断可用 `project_local` / `developer_codex`；论文或任务执行只同步 `workspace_local` / `quest_local` 子集；`global_user` 只允许用户显式选择的少数 companion 能力。
- `plugins/opl-foundation-skills/exposure.json` 承载 per-skill `exposure_scope` / `activation_gate`；新增或调整 Skill 时必须同步更新 manifest，并让 CLI / test guard 继续 fail-closed。
- 需要安装或分发时，走 Pack / Connect / package / managed profile；不要让 `src/modules/**` 直接承载 Skill 正文，也不要把完整 support pack 注册成普通 Codex 全局候选。
- domain 仓只能声明采用、映射或专业扩展；不能把 OPL support Skill copy 成自己的长期 source truth。
- 完成声明只能说文档 / source / sync 边界已落地；安装成功、runtime ready、domain ready、App release ready 和 production ready 必须由对应 fresh readback 或 owner evidence 证明。

## 机器入口读法

| 机器入口 | 当前职责 | 不从本文读取的动态事实 |
| --- | --- | --- |
| OPL Flow `contracts/workflow-policy.json` | 唯一定义 requires、recommends、Full closure、conflicts、retires 与模型推荐。 | 本机安装结果、路径、版本和 readback。 |
| `src/modules/connect/workflow-package-lifecycle.ts` / `opl packages install|update opl-flow` | 解析 policy，安装依赖，归档冲突，注册 plugin，处理 profile/model，写 receipt/rollback。 | 每次执行的具体结果与 fresh discovery。 |
| `src/install-companions.ts` | 作为 Framework 内部 materializer 安装 manifest 选中的 skill/tool，不再持有 Superpowers profile 或推荐清单。 | package policy 与 App Full selection。 |
| `src/install-companions-parts/tools.ts` | 检测或安装 `officecli` 与 `mineru-open-api` binary，并要求对应 skill payload + binary 同时可用才算相关 companion ready。 | `officecli --version`、`mineru-open-api version`、本机 PATH、`OPL_FULL_RUNTIME_HOME/bin`、remote install 输出。 |
| `src/modules/connect/opl-skills.ts` | 作为 Packages 内部兼容 projection primitive，检查标准 agent repo-owned primary skill source并生成 Codex plugin carrier；不拥有 package lifecycle 或 MAS scope activation。 | 当前 sibling/managed repo 是否存在、primary skill source path、required capability package 是否 materialized、generated plugin cache path、sync count。 |
| `src/system-installation/codex-plugin-registry.ts` | 作为 Codex Plugin carrier adapter，在 `OPL_STATE_DIR/codex-plugin-marketplaces/*` 复制 repo-local plugin carrier，注册 `med-autoscience@med-autoscience-local`、`med-autogrant@med-autogrant-local`、`redcube-ai@redcube-ai-local`、`opl-meta-agent@opl-meta-agent-local` 和 `opl-bookforge@opl-bookforge-local`，并移除旧 family standalone MCP server blocks。它不持有 Agent Package package core。 | 用户 config 当前内容、marketplace path 是否存在、plugin carrier copy 是否存在、实际移除数量。 |
| `opl system initialize` | 投影 `recommended_skills`、GUI shell、runtime/tool readiness 等初始化读面。 | 当前 recommended skill status、tool readiness、App first-run result。 |

MAS ScholarSkills 不再暴露独立安装或 scope sync 入口。`opl packages install mas` 安装 required closure，并在已有 active workspace 时完成默认 activation；workspace bind/activate 与 hosted launch 复用同一事务。MAS quest owner 使用通用 `opl packages activate mas --scope quest --target-quest <path>`，不调用 ScholarSkills 专属命令。`opl packages status --package-id mas --scope ...` 读取依赖与当前 scope readiness，`opl packages repair mas --scope ...` 只用于缺失、漂移或不兼容恢复；App state 对 active workspace 投影 scope-aware readiness，Console/App/Shell 不维护第二套 gate。

Developer Mode 命中 source checkout 时，MAS plugin source 与 `mas-scholar-skills` capability source 可以分别来自本地 checkout / repo URL。这个 override 只改变开发者显式选择的 source channel；普通 managed profile 仍按 MAS agent package manifest 和 OPL package channel 读取 dependency graph。

## 历史工作流迁移

Superpowers、Superpowers Lite/local method profile、Ponytail、CodexCont 和旧 planner/executor/debugger/verifier prompt 都不再是推荐能力。用户显式安装或更新 OPL Flow 时，Framework 按 manifest 先备份，再从 Codex discovery、plugin/hook、service/provider route 中移除，并写 migration receipt。`--keep <migration-id>` 可保留指定项，`opl packages rollback opl-flow --receipt <path>` 可还原归档内容。

## officecli 和 Office 类 skill

OPL 把 officecli 作为“双组件” companion 能力，因为 MAS/MAG/RCA 都可能需要 Word、PowerPoint、Excel 或 dashboard 能力。skill payload 说明怎么用，`officecli` CLI binary 执行真实文档操作。Office 类 skill 只有 skill payload 和 `officecli --version` 同时可用时才算 ready。

当前推荐 companion 由 `buildOplRecommendedSkillSpecs()` 定义；长期文档只保留类别，不冻结某次状态：

- `officecli` skill payload + `officecli` CLI binary
- `officecli-docx` + `officecli` CLI binary
- `officecli-pptx` + `officecli` CLI binary
- `officecli-xlsx` + `officecli` CLI binary
- `mineru-document-extractor` + `mineru-open-api` binary
- `ui-ux-pro-max` skill payload
- Codex bundled Documents / Presentations / Spreadsheets availability

这些 skill 可以来自 Skills Manager 的 `~/.skills-manager/skills/*`、OfficeCLI / ui-ux-pro-max / MinerU source、或通过 `OPL_PACKAGED_SKILLS_ROOT` / `OPL_FULL_RUNTIME_HOME/skills` 暴露的 App Full first-install package、显式挂载 runtime 或其他 managed payload。`opl install`、`system configure-codex` 和 OPL App 首启会走 managed profile，安装或复用 `officecli` / `mineru-open-api` binary，并把 companion skill payload symlink 到 Codex 可见目录；MAS/MAG/RCA 仍走 plugin registry，不作为 companion skill 写入 `~/.codex/skills`。Full DMG 中 binary 可由 `runtime/current/bin/*` 提供；当前 WebUI Docker 镜像不能被假定为内置 OfficeCLI、MinerU 或 `/opt/opl/skills` companion payload，除非 release workflow / Dockerfile / image manifest 明确提供该 payload。

## OPL App 应该怎么用这套生态

OPL App 默认应该优先复用 Codex 的用户级 skill discovery 路径；是否修改这些路径由 profile 决定。

维护规则：

- `observe` 只读检测，不修改用户 skill 或工具生态。
- `ask_to_apply` 只生成可执行计划/按钮，等用户确认。
- `managed` 用于 `opl install`、OPL App 首启、OPL 专用 `CODEX_HOME`、`system configure-codex` 或显式挂载 packaged payload 的环境。
- 存在 `OPL_PACKAGED_SKILLS_ROOT` / `OPL_FULL_RUNTIME_HOME/skills` 时，managed profile 可把它们作为首装 skill source；是否已经 symlink 到用户级 discovery path 仍以 fresh CLI 输出和文件系统为准。
- 原版 Codex App 独立安装 MAS 时，MAS 使用 repo-local full-copy plugin carrier；ScholarSkills required capability payload 仍通过 MAS agent package manifest 的 dependency graph、managed package receipt 与 workspace / quest activation transaction 分发，不塞回 MAS plugin carrier 作为第二真相源。
- 对 Codex bundled skills 只显示可用性，不复制。
- 对 MDS 以及其他 MAS-internal 项目专用 skill 不做系统级展示。
- 对 MAS/MAG/RCA/OMA/OBF domain app skill，只注册 repo-local plugin carrier；不恢复旧 `~/.codex/skills/{mas,mag,rca,oma,obf}` 裸 mirror、standalone family MCP server block、compat alias 或 wrapper。

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
