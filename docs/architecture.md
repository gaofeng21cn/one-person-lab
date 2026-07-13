# OPL 架构

Owner: `One Person Lab`
Purpose: `architecture`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 顶层分层

`OPL` 的目标不是只做入口聚合或工作台投影，而是完整的 stage-led family agent runtime framework。当前产品认知分成 `OPL Framework`、`One Person Lab App` 和 `Foundry Agents` 三层：Framework 负责开发与运行框架，App 负责普通用户工作台，Foundry Agents 负责领域智能体与交付权威。阶段内最小执行单位是 Agent executor；`Codex CLI` 是当前第一公民 executor。

标准 Agent 的实现 profile 只有一份机器真相：`contracts/pack_compiler_input.json#/implementation_profile`，由 OPL Pack compiler、scaffold validator 和 materialization path 消费。它把 identity 固定为 declarative Markdown/JSON pack，允许 helper 按 domain 需要增减但不让 helper 语言改变 Agent 身份；generated surfaces 与 Framework runtime 仍归 OPL，Rust 只保留在 Framework hot path。MAS、MAG、RCA、OMA、OBF 同级消费这一 profile；ScholarSkills 仍是 framework capability package，不得套用标准 domain-agent identity。人读规范与五仓参考矩阵见 `docs/specs/standard-domain-agent-implementation.md`。

标准 Agent 的 hosted interface 采用同一 owner split：domain repo 在 `contracts/domain_descriptor.json#/standard_agent_interface` 或 repo-contained JSON pointer 中声明 workspace defaults/locator、runtime domain/registration ref、progress aliases 和 routing signals；OPL 只持有 `standard-agent-interface.schema.json`、closed-object parser、generated scaffold 和通用 consumer。Connect 必须先通过 package dependency、scope materialization 和 managed runtime source tree/probe currentness，再把 descriptor 交给 Atlas、Workspace、Runway、Stagecraft、Ledger 和 Console；不能直接信任 lock 中的 `status=current`，也不能隐式扫描 sibling checkout。显式 `OPL_FAMILY_WORKSPACE_ROOT` 只作为开发/验证 fallback。descriptor 不可用时，Workspace 采用统一 `one_off + standard_agent_workspace + project` baseline；可执行 action/stage 必须通过 OPL hosted binding 进入，缺 binding 时 fail closed。progress 只识别 `deliverable_progress_delta` 与 `platform_repair_delta` 两个 canonical 字段，不推断 paper/grant/visual alias；不得回退到 OPL registry 中的 MAS/MAG/RCA/OMA/OBF 私有命令、workspace profile 或领域 stage-log 字段。

`src/kernel/standard-agent-registry.ts` 因此只持有 identity、公开 label、package/repo/plugin/module locator、aliases 与 series membership。领域 golden path、Pack 示例、authority kernel 示例、workspace profile、runtime registration、installer/source carrier 都不再由 registry 定义；capability package 集合与 standard-agent 集合按 membership 派生，具体 package lifecycle 归 `contracts/opl-framework/packages/*.json` 与 lock/receipt/currentness readback。主模块是 Atlas、Workspace、Runway、Connect 与 Pack，协同模块是 Stagecraft、Ledger、Console 与 Foundry Lab；这条结构不把 domain truth、artifact/memory body、质量/导出裁决、owner receipt、typed blocker、App release authority 或 AionUI body 上收到 OPL。

2026-06-10 以后，标准 Foundry Agent 的 family-level target shape 固定为 `OPL Agent OS + Domain Declarative Pack + Domain Minimal Authority Kernel + Domain Capability Registry`。`OPL Agent OS` 承载通用 runtime、StageRun、generated/hosted surfaces、Console、Ledger、Runway 和 cross-agent conformance；`Domain Declarative Pack` 声明 stage、prompt、skill、knowledge、tool affordance、artifact/memory/quality policy 和 authority ABI；`Domain Minimal Authority Kernel` 保留 domain truth、artifact / package / export authority、quality verdict、memory accept/reject、owner receipt、typed blocker 和 human gate；`Domain Capability Registry` 是 `Atlas + Pack + Stagecraft` 的 registry / ABI / use-policy，不新增品牌模块，不生成 owner answer 或 domain verdict。

Foundry Agent profile catalog 和 standard scaffold 是这条 target shape 的 lower-bound conformance guardrail、physical skeleton 与 refs-only shape 入口，不是智能体设计模板或设计上限。目标 agent 的设计来源继续是用户目标、domain owner pack，以及论文/PDF/repo/产品案例等 reference design。`opl profiles list|inspect|select|conformance --json` 由 OPL Framework 持有，返回 refs-only profile catalog、natural-language intent selection receipt、stage/capability/knowledge/tool/evaluation requirements 和 structural conformance result；它不写 target domain truth、不签 owner receipt、不声明 target agent ready。非英文或混合语言 intent 可以同时传入可重复的 `--intent-signal <canonical-signal>`；这些 signal 必须来自 catalog 已声明 trigger，只参与 lower-bound profile 匹配，不替代原始 intent 或 reference design。匹配到内置 profile 时，OMA / OPL Meta Agent 把 `selected_profile_refs`、`profile_selection_receipt_ref` 和 `profile_requirements` 写入 target descriptor、capability map、stage control plane 和 generated stage pack；这些 profile 只保下限 guardrail。没有内置匹配但用户提供论文/PDF/repo/产品案例等 reference design 时，`profiles select` 必须返回 `profile_selection_mode=source_derived_design` 的 refs-only route receipt，并声明 `ReferenceDesignPacket`、`TransferMap`、`AgentPackPlan` 三类设计消费对象或等价 machine fields。OMA 必须从 source refs / pattern packet refs 提炼可迁移 stage graph、grounding、tool orchestration、rubric、validation、handoff 和 failure taxonomy，通过 `DesignAdmissionReceipt` 后再生成目标 agent pack；`profiles conformance` 对 source-derived route 不只检查 refs，还必须读取实际 typed objects，逐 workflow step 核对 source anchors、TransferMap mapping、AgentPackPlan 独立 stage、`stage_control_plane.stages` 真实物化和 DesignAdmissionReceipt 准入关系，空心对象、缺 step mapping、collapsed/plan-only stage graph、未物化或未准入 stage 必须 fail closed。requirements 只说明对象形状，不能替代实际对象内容。`AgentBuildReceipt` / `build_receipt` 是物化后的构建证明，不是第四个设计对象。

物化闭环以完整 `AgentPackPlan` 为边界：论文迁移产生的 `source_pattern_ref` stage 与目标用途新增的 `target_only_requirement` stage 都必须成为真实独立 stage，并在 `DesignAdmissionReceipt` 中准入；stage control plane 不得出现未计划、重复、漏物化或 origin 漂移。预物化阶段只声明 `expected_build_receipt_ref`；写盘后才生成正式 `AgentBuildReceipt`，回填最终 stage control plane，并用完整 stage id 集合、planned-file presence 和 SHA-256 digest 证明计划与文件系统一致。

`opl-framework` 是 Framework 唯一 JavaScript package surface。它直接导出 `foundry-agent-series-policy`、`reference-design-pattern-packet`、`json-schema-registry`、`reference-build-proof` 和 `standard-agent-pack-abi`，同时承载 `opl` CLI、hosted Standard Agent action runtime、Temporal-backed provider runtime 与 E2B adapter；本仓不维护第二个静态 npm carrier。Framework 的 Python helper 直接位于 `python/opl_framework`，不是独立 package，也没有独立 manifest、lock 或发布 channel。Framework、Temporal-backed provider runtime、共享 toolchain 与系统级依赖都属于 OPL Base；标准 Foundry Agent 只消费 Base 提供的公开 runtime contract，不在自己的 manifest / lock 中声明、安装、更新或回滚 Framework/Temporal。OPL 的 module install/update/reinstall/startup-maintenance workflow 在 checkout 内维护所需的 `node_modules/opl-framework` 和 `src/opl_framework` 链接，显式诊断与修复入口是 `opl packages link-framework --agent-root <repo> [--check|--dry-run] --json`。Domain agent 必须通过公开 subpath 或 `opl_framework` namespace 消费 canonical helper，不得复制 OPL policy/ABI body。该链接不复制 package、不安装第二份 Temporal tree，也不把 domain truth、artifact、verdict、memory 或 owner receipt authority交给 OPL。

生命周期架构固定为三层 registry：`opl_base` 由 `opl update` 驱动，内部路由 runtime provider，并把 Codex、Temporal、OfficeCLI、MinerU 收入同一 dependency catalog；`opl_app` 只投影 App carrier 的 `host_update_route` 与 `host_executor_required`，实际更新归 App/host；`opl_packages` 由 `opl packages` 驱动，以已安装 root package-lock 为枚举入口，复用 package manifest/lock/materializer/lifecycle receipt 更新闭包，并把 Codex skill/plugin sync、标准 Agent managed runtime source 和 workflow profile semantic merge 纳入同一 package transaction。Package materializer 与 `opl connect sync-skills` 必须复用同一 family plugin registry 和 canonical marketplace id；Connect 只执行 package-owned carrier projection，不得维护第二套 marketplace identity、cache currentness 或 lifecycle receipt。每次 canonical carrier 成功物化时，同一事务退役该 Agent 的低层 alias 与旧 `opl-agent-<agent-id>-local` 配置/缓存，禁止新旧 carrier 并存。App Full 内置工具只提供 seed bytes，首次 reconcile 物化到 Base managed root；之后 OPL-managed、digest-valid 对象可静默更新，环境变量、Homebrew、global npm、PATH 和用户目录对象只检测不覆盖。Codex 与 Framework/Temporal 先下载、校验并写 pending generation及 staging process instance；相同 version/artifact identity 已 pending 时 reconcile 直接 no-op，不重复下载，也不覆盖原 staging marker。App 同一进程的 launch/daily 调用共享 `OPL_APP_PROCESS_INSTANCE_ID`，同值只保持 pending，App 重启后的新值才原子切换并保留 previous generation。Headless 未提供该值时使用 CLI 进程 instance，本次只 stage，下一次独立 CLI 调用切换。runtime source carrier 必须在 manifest 声明 module id，完成 bootstrap、health 和 handler probe 后才写入 lock/receipt；tree 或当前 executable/probe 漂移时 launch fail closed。物理 source 换代前必须写 durable transaction marker，package lock/receipt 是 commit point；下次 package read/action 按 commit state 幂等 rollback 或 finalize，post-commit cleanup failure 只能投影 `cleanup_pending`，不能把 durable success 报成失败。runtime preparation env 是 OPL state 下的 derived state，不得写入 source checkout。空白 Codex home 可由 package transaction 直接物化声明的 profile；已有用户 profile 必须保留原文件、生成单一 current merge packet，并通过 `opl packages profile apply` 显式写入 reviewed merge。内部 provider id 不进入公共 selector。

required capability package 也是 `opl_packages` dependency graph 的内部节点，不是第四层产品。以 MAS 为例，用户只安装 `mas`；Framework 同一 closure transaction 解析并锁定 `mas-scholar-skills` provider 的 version、manifest/content digest、ABI、11 个 core Skill exports 与 8 个 module contract ids。workspace/quest 每次 activation 或 hosted launch 都在 use boundary 对账 MAS latest-stable root 与兼容 provider，并从 provider manifest 动态把当前发布包的全部 35 个 exported Skills 物化到目标 `.codex/skills/`；11 core + 8 modules 只是 readiness floor，module ids 不物化。缺失或漂移的 managed projection 可由该事务自动恢复；package 未安装或 ABI/SemVer/trust/content-lock 不兼容时，Framework、App 与 Shell 都阻断普通 launch，只开放 status/doctor/repair 或 typed update route。每个 session 绑定本次实际使用的 package/use receipt，运行中不热切换。

first-party package identity 与 carrier locator 分层：canonical ids 是 `mas`、`mag`、`rca`、`oma`、`obf`、`mas-scholar-skills`、`opl-flow`，compact standard-agent list 固定写作 `MAS/MAG/RCA/OMA/OBF`，全称固定为 Med Auto Science、Med Auto Grant、RedCube AI、OPL Meta Agent、OPL Book Forge。每个 canonical id 只对应 `ghcr.io/<owner>/one-person-lab-packages/<canonical-id>`；repo、plugin、module 名只作 carrier locator。moving channel 只有 `candidate` 与 `latest-stable`，daily workflow 只构建发生变化的 package，并对 SemVer、manifest version 与 digest identity fail closed。

Release Set publication 是一条跨仓 fail-closed saga，不宣称跨 GitHub Release、GHCR 与 Homebrew 的 ACID transaction。Framework 在 candidate build 起点冻结七个 owner exact SHA 为 `owner-cohort-lock.json`，归档、manifest、catalog 与 receipt 全部消费同一 cohort；App 先发布不可变且非 latest 的 GUI/WebUI bytes，再用唯一 request id dispatch Framework candidate，验证 `opl_release_set_promotion_receipt.v1` 后才 dispatch `latest-stable`，再次验证同一 generation/carrier digest/App 三元组，最后才移动 App/WebUI/Homebrew/GitHub latest。Framework 的 Base payload 由 runtime allowlist 构建，普通安装从 `dist` 运行；Release Set 为 Base、App、七个 Packages 和 catalog 生成 SPDX/SLSA statements、GitHub exact-byte attestations、OCI referrers与匿名 digest readback。任一外部步骤超时、digest 漂移、receipt 缺失或 readback 失败都停止后续 writer，并保留已发布 immutable artifacts 供 roll-forward，不自动回写第二套 stable truth。

同一目标态在人读架构上按 multi-plane operating model 表达：`Console` 只投影 fresh progress；`Runway` 只管理 Codex-selected stage attempt、provider observation、retry budget、currentness 与 transport repair；`Workspace` / `Stage Artifact Unit` 保存 refs；domain kernel / human gate 持有 authority decision；`Ledger` 承接 passive evidence / telemetry；`Foundry Lab` / OMA 承接 improvement。只有 Codex CLI 解释 artifact 并选择下一 stage，其他 plane 不生成、批准或否决语义 route；只有 domain/App/brand owner 可以签 owner answer、typed blocker、quality/export/review verdict、release verdict、physical delete authorization或 ready declaration。

OPL 的设计取向是 AI-first、executor-first、AI 原生专家判断优先、contract-light：框架通过 stage、selected executor、清晰目标、上下文、authority boundary、available affordances、knowledge、rubric 与 quality gate 承接 AI 能力进步；合同只做 owner boundary、权限、安全、凭据、可写范围、审计、receipt、阻塞、恢复和 projection 这些下限，不把专家拆解、创作、评审、路线判断、工具编排或修订策略固化成脚本引擎，也不让机械检查替代专家 stage 判断。

### StageRun 内部质量循环

Stage 图和 Stage 内质量循环是两个层级。判断公式固定为：**同一目标的多次生成、审阅和修复是 Attempt；目标、owner、质量门或交付关系发生变化，就是新的 Stage。** Agent 持有完整领域产品和 Stage graph；Stage 承载一个主要开放语义判断；StageRun 是该 Stage 在具体项目上的一次工单；StageAttempt 只是同一工单下的一次独立 executor 调用。Codex subagent 只能作为单个 Attempt 内的临时助手，不进入 OPL Stage graph。

`OPL Runway` 的 Temporal `StageRunWorkflow` 是非模型、durable 父级 controller，不再是 `StageAttemptWorkflow` alias。它运行时动态创建 `producer -> reviewer -> (repairer -> re_reviewer) x 0..3` child workflows；Attempt role 是 Framework 有限枚举，domain 只提供专业 prompt、rubric、必要顺序和 route-back 语义。每个 child workflow 启动新的 `codex exec` 和独立 thread/session，只通过 exact artifact/source/rubric refs、finding、repair map 与 lineage 通信。same-thread 自检只能记为 `in_thread_refinement`；缺 typed closeout 时的 same-thread resume 只能记为 `protocol_closeout_resume`，两者都不是正式 Review、不产生 review receipt、不消耗质量修复轮次。

StageRun 的创建入口只有 pack-bound path：普通 `opl family-runtime attempt create` 从已安装或显式 domain pack 编译 `stage_quality_cycle_policy_ref`、四类 role prompt、rubric、source/goal/lineage refs 和 manifest SHA，生成 `opl_pack_bound_stage_quality_runtime_binding` 后才可启动 `StageRunWorkflow`。manifest SHA 参与 StageRun identity，避免用旧 pack 或任意 raw payload 启动质量循环。raw `family-runtime stage-run start` 已退役；`stage-run` CLI 只提供 query。producer / repairer 的可审阅输出必须带 domain-owned artifact identity receipt 与 SHA-256 metadata，review receipt 再绑定 exact artifact refs/hashes、fresh session、rubric 和 verdict。

Initial Review 不计 repair round；一轮严格等于一个 fresh Repair Attempt 加一个 fresh Re-review Attempt。Re-review 是 finding closure review：它关闭 initial findings，只允许未关闭 required finding、repair regression 或 critical new finding触发下一轮；普通新建议只进入 optional observation / quality debt。三轮后仍有可消费产物时 StageRun 终态是 `completed_with_quality_debt`，可以交给下一 Stage，但不得声明 quality/export/publication/submission/ready；无可消费产物或 authority/safety/human/currentness 硬门才进入 blocked / human gate。provider retry、Temporal activity retry、structured-output validation retry、StageRun runtime retry与该质量预算分账。

Meta Review 是独立顶层 StageRun，不继承被审查 Stage 的生成对话，也不递归套一层正式 Stage Review。MAS、MAG、RCA、OMA、OBF 统一采用该顶层 Meta Review；其他 OPL Agent 是否启用由 domain policy 决定。普通用户投影只显示当前 Stage、Stage artifact、completed / quality debt 和 next Stage；attempt role、round、thread/session、artifact identity receipt、review receipt、finding/repair lineage与 token/cost 只进入 developer/operator drilldown，不能显示为“小 Stage”。主模块是 `OPL Runway`；协同模块是 `Stagecraft`、`Pack`、`Ledger`、`Console` 与 `Foundry Lab`；不触碰 domain truth、专业 Review 结论、artifact body、owner receipt、typed blocker 或 Stage transition authority。

专业 Skill 的能力形态按三层读取：`professional Skill + skill-local deterministic helper + no-skill substrate`。第一层是专业 Skill，承载领域 playbook、prompt、rubric、review lens、route-back 写法和 AI-first 专家判断；第二层是 Skill-local deterministic helper，例如随 Skill 目录分发的 `kernel.py`，只承接低成本、可重复、局部确定的小工具；第三层是 no-skill substrate，由 OPL Framework 的 `Connect`、`Pack`、`Runway`、runtime environment、package channel、credential / cache / provider / queue / receipt 读面承接。模块化发生在运维层和 Framework owner boundary：安装、同步、runtime env、provider、ledger、App/operator projection 由 OPL 模块治理；弹性保留在 Skill 层：专业 Skill 可以随 domain profile 增减、细分或替换，不因此新增品牌模块、domain truth owner、runtime queue owner、artifact authority 或 readiness authority。OPL foundation support Skill 是 source-only / refs-only 的 operator playbook；MAS Scholar Skills、MAG/RCA/OBF 等 professional Skill truth 保留在对应 domain 或外置专业 Skill 仓，OPL 只同步、分发、投影和检查 no-authority boundary。这个读法固定为 `AI First, Contract Light`：合同只托底分发、权限、no-authority flags、receipt 和可恢复边界，不把专业判断下沉成脚本流程，也不把 helper 或 substrate 的结构误读成领域结论。

OKF context bundle 是这个 AI-native context 层的轻量交换格式。OPL 采用 Google OKF v0.1 的 Markdown 目录、YAML frontmatter、`index.md` / `log.md`、crosslinks 和宽容消费模型，用 `opl okf validate|inspect|project-pack|project-repo --json` 把 Foundry Agent declarative pack refs、memory locator refs 和阶段上下文投影成可直接喂给 AI executor 的 body-free bundle。`project-pack` 适合单个 `pack_compiler_input.json`；`project-repo` 是完整 domain checkout 入口，会读取 `contracts/pack_compiler_input.json` 与可选 `contracts/memory_descriptor.json`，把 MAS/MAG/RCA/OMA/OBF 的 pack refs 和 memory locator refs 统一物化为 OKF bundle。它的主责模块是 `Atlas` catalog、`Pack` domain pack projection、`Stagecraft` stage context / knowledge refs 和 `Connect` CLI/API/export surface；`Ledger` 保存 refs-only evidence，`Console` 展示 context readiness / warning，`Workspace` 给出物化目录，`Foundry Lab` 可把 bundle 作为 agent 改进输入。OKF 不进入 `Runway` 的 progress/readiness authority：broken crosslink、unknown frontmatter 或 missing optional metadata 只能是 advisory warning，不能阻断普通 executor 推进；domain truth、memory body、owner receipt、typed blocker、quality/export verdict、artifact authority、App release verdict 和 production readiness 仍由原 owner surface 决定。原生 OKF frontmatter 只作为 opt-in advisory migration lane 存在：稳定 domain-owned `agent/**/*.md` 可以声明 `type`、`body_owner` 和 `domain_authority`，并可通过 `opl okf native-frontmatter inspect --repo <domain_repo> --json` 做只读 advisory readiness readback；OPL 仍只消费 refs-only metadata，不能因此拥有正文、truth、artifact、receipt、typed blocker、runtime 或 readiness authority。

当前 active 叙事统一为 `Minimal Trust Kernel + Stage Strategy Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`。Minimal Trust Kernel 是最小合同核：stage pack 是启动单位，stage 内最小执行单位是 Agent executor，默认 selected executor 是 `Codex CLI`；非默认 executor adapter 只能显式绑定并返回 receipt / audit / fail-closed 证据。Stage Strategy Kernel 是 stage 内的认知计算内核：它组织 candidate generation、reflection / review、ranking / selection、evolution / revision、strategy retrospective 这类开放式策略循环，并把 prompt、skills、tool affordance boundary、knowledge、rubric、quality gate refs 作为 Foundry Agent stage pack 的可审计声明；它不成为 OPL 脚本引擎、工具流程编排器、Route Reconciler 或质量权威。Readiness 是 operator / App 默认聚合面，只读 admission、scope、receipt、replay、assumption、monitor 和 evidence gap，不产生 domain ready、artifact ready、quality verdict 或 production closure。Derived Diagnostic Lenses 只用于解释 blocker、stale assumption、replay gap、failure localization、runtime budget 或 route-back evidence；这些 lens 可以被 readiness 折叠消费，但不得升级为 runtime planner、proof assistant、workflow compiler、domain verdict 或质量权威。Surface Budget 是新增 surface 的治理预算：只有影响 launch safety、authority boundary、evidence / replay / audit / route-back，或已被 App / runtime 反复消费的 surface，才允许升级为默认入口；其他学习点先进入 refs、warning、diagnostic lens、reference 或 history。AI Capability Aperture 保留 stage 内开放式专家空间，使模型升级、domain pack 改进和独立 reviewer 能力能直接转化为系统能力，同时不把 AI strategy refs completeness 写成 OPL launch hard gate。

Purpose-first 审计后的 Readiness 默认读法是 owner-delta-first。默认 App/operator 和 CLI summary 应先暴露：当前是否有 OPL 可执行 safe action、等待哪个 owner、owner 需要交付什么 deliverable delta / quality gate receipt / human gate receipt / owner receipt / no-regression ref / typed blocker，以及这个等待是否阻断 domain ready、App release ready 或 production ready。`blocked_refs_only_attention`、stage replay packet、evidence envelope、private residue inventory、lifecycle detail 和历史 receipt 计数属于 audit drilldown；它们可以解释缺口，不能成为完成声明。

`Stage Transition Authority`、transition intent/event ledger、accept/reject decision 与 `DomainProgressTransitionRuntime` 已物理退役。当前链路只有 Codex-selected declared stage、StageRun identity、provider attempt、passive ledger 与 transport readback；OPL 不再接收或生成可批准、否决、覆盖 semantic route 的 authority event。MAS/MAG/RCA/OMA/OBF、Agent Lab、human gate 和 provider只提供 artifact、diagnostic、owner answer、typed blocker、human gate decision 与 route recommendation。

`OPL Runway` 只持有 StageRun identity、idempotency、provider lifecycle、raw/typed closeout capture、retry/dead-letter transport、projection metadata、replay和 human gate resume transport；`Pack` / `Stagecraft` 提供 declared stage context，`Console` / `Ledger` / `Workspace` 投影结果。Domain agent只声明 stage metadata、owner receipt / typed blocker / quality gate / artifact delta / forbidden-write boundary，并保留各自 domain truth 与 authority verdict；不存在额外的 domain progress policy adapter 来裁决 route。

Runway 会优先捕获 typed closeout，但不要求 typed JSON。Codex CLI 的普通文本、部分草稿、失败诊断、阴性结果和实际文件都会被持久化为 raw artifact 与最小 progress envelope；格式漂移、缺 receipt 或缺 review 只形成质量债。下一 stage、route-back、human gate 与 stop 由 Codex 根据 domain prompt 和 artifact 语义判断，OPL 不做第二次 closeout admission。

OPL Framework 允许使用 sandbox provider，但框架职责归 OPL：stage attempt lifecycle、stage-attempt request/projection、handoff、human gate、retry/dead-letter、observability、artifact/file lifecycle 与 operator projection。标准 OPL Agent 的默认长跑路径是 OPL/Temporal 托管自治执行：domain agent 不内置通用 daemon、scheduler、queue 或 attempt loop，任务启动后由 OPL/Temporal 负责持续唤醒、resume/re-query、retry/dead-letter 和 attempt ledger；Codex App 只是启动、观察、介入和展示入口。当前 runtime environment 默认路径是 `Fast Local Env`：由 `OPL Runway` 的 Runtime Environment Substrate 管理 env profile、doctor、prepare 和 run-context，服务 R / Python / MAS display 这类本机高频依赖。Local Docker / Devcontainer 只作为显式 local sandbox provider；E2B 是当前唯一已实现的显式 remote sandbox provider。其他外部 compute provider只能通过通用 external adapter / Connect discovery 作为候选能力出现，不能写成 Runway 已支持 executor，也不替换 OPL 基座。OPL 继续持有 stage、Runway、owner boundary、receipt、readback 和 false-ready guard。

`OPL` 的当前主链路是：

`Human / Codex / opl / One Person Lab App -> Codex-default Session Runtime -> OPL Activation Layer / Stage Control Plane / Temporal-backed Stage Attempt Runtime -> Domain Capability Surface -> Domain Repository`

## 品牌模块架构

OPL 的三层产品认知说明“面向谁”，当前十个品牌模块说明 Framework 内部能力如何高内聚、低耦合地演进。品牌模块不是新的 runtime，也不是第二 truth source；它们把已经存在的 contracts、source、CLI/App/Cloud 产品行为、read model、runtime ledger、provider receipt 和 docs support 归入稳定 owner boundary。App / Cloud 可以用这些模块命名用户可见能力，但 Framework 代码仍按模块 owner 物理落在 `src/modules/<module_id>/`。

产品语义和源码组织的对齐规则是：`OPL Cloud`、在线 `OPL Workspace`、Console 页面和 Gateway/API 体验属于用户可见产品包装；`src/modules/<module_id>/` 属于 Framework 物理 owner。产品可以组合多个模块，但不能把产品名反向写成源码模块 owner。`OPL Fabric` 是 Cloud / Product 层的通用资源底座语义，不新增当前十模块之外的第 11 个源码模块；它的实现由 `Connect` 的连接与分发、`Runway` 的 durable execution、`Pack` 的 ABI / descriptor、`Workspace` 的物理落点和 `Ledger` 的 refs-only evidence 协作承接。`OPL Connect` 是 Fabric 上可独立调用的连接能力，`OPL Console` 负责治理、投影和管理集成。

代码层的终局组织是 `src/modules/`。`src/modules/<module_id>/` 是当前十个 Framework 模块的真实物理边界，每个模块通过自己的 `index.ts` 暴露 public index；少量高频、低依赖、容易触发初始化循环的公共 API 可以放在 `src/modules/<module_id>/public/**/*.ts` 薄入口。`src/modules/index.ts` 只导出模块身份常量和命名空间聚合，避免不同模块的同名 API 混在同一个大 barrel 里。`contracts/opl-framework/source-module-map.json` 是归属校验面，不是第二套目录规划。`entrypoints/` 和 `kernel/` 属于非品牌技术层：前者承接 CLI / product / adapter 启动面，后者承接共享 runtime primitive；二者必须挂靠并服务十大模块，不获得独立 brand owner。新代码默认进入 owning module；跨模块调用只走 owning module public index 或薄 public entry；root-level `src/*.ts` 不再接受新扩展。维护者的 canonical 源码边界读法见 [OPL Framework 源码模块边界](./references/source-module-boundary.md)。

物理归位是模块化的起点，真正模块化还要求 public interface 清晰、模块内高聚合、模块间低耦合。模块 public interface 由该模块 `index.ts`、少量 `public/**` 薄入口和对应 contract ref 组成；跨模块 public entrypoint 是 owning module `index.ts`、owning module `public/**` 或 `src/modules/index.ts` 命名空间聚合出口，CLI / App / Cloud entrypoint 只把请求转入这些 public entry。模块内部优先使用相对 import 连接同一 owner 下的 parts / cases / helpers；跨模块直接 import 对方内部文件、parts 或 case 文件已经进入 strict source boundary：`npm run source:modules -- --strict-imports` 默认失败，维护者应先把确实要公开的符号加入目标模块 `index.ts` 或 `public/**` 薄入口，再从 public entry 调用。当前源码模块化完成度可表述为“物理归位 + public entrypoint 硬门 + deep import 清零”。第一批 owner-alignment 已把通用 helper 收进 `kernel`，把 App release / user-path evidence ledger 收进 `Ledger`，把 stage replay missing receipt workorder 收进 `Stagecraft`，把 stage attempt 通用投影收进 `Runway`；`module-dependency-policy.json` 也开始禁止 `ledger -> runway`、`stagecraft -> runway` 和 `workspace -> console` 这类方向穿透。public-level 依赖热点和 cycle 仍归后续依赖方向治理，不作为 runtime、release 或 production ready 证据。

| 模块 | 主聚合面 | 主要消费 | 明确不拥有 |
| --- | --- | --- | --- |
| `OPL Charter` | 顶层宪章、命名、ADR/RFC、术语生命周期和品牌组合治理。 | 核心五件套、决策、authority matrix、品牌模块 registry。 | runtime truth、domain truth、release verdict。 |
| `OPL Atlas` | Agent、capability、domain capability registry、tool-card、surface、owner、dependency 和 lifecycle catalog。 | domain descriptors、module registry、surface metadata、capability registry refs、ToolUseCard refs、conformance refs。 | 执行、receipt 签发、domain verdict、capability authority、tool invocation authority。 |
| `OPL Workspace` | Framework workspace protocol、Workspace Group、Project Unit、Stage Artifact Unit、用户检查面和文件生命周期投影。 | workspace contracts、domain workspace locator、stage artifact refs。 | 在线 OPL Workspace 产品 truth、domain artifact body、quality/export verdict、owner receipt authority。 |
| `OPL Pack` | Declarative Domain Pack、domain capability registry ABI、Agent Tool Arsenal / Capability Invocation ABI、authority ABI、pack compiler、generated/hosted surfaces、standard authority functions，以及 Pack OS 通用 descriptor / install / registry / cache / distribution / lock / lifecycle / review receipt refs transport。 | standard domain-agent skeleton、domain pack compiler、generated interface bundle、ToolArsenalIndex / ToolUseCard / CapabilityInvocationPlan / ToolResultEnvelope refs、Pack OS descriptor/install/registry/cache/distribution/lock refs、capability ABI refs、conformance refs。 | domain handler implementation、artifact body、owner receipt、typed blocker、quality verdict、publication/export readiness、current-owner authorization。 |
| `OPL Stagecraft` | Stage 设计、认知计算、capability use policy、tool affordance / invocation policy、prompt/skill/knowledge/rubric refs 和 independent quality gate 边界。 | Foundry Agent stage packs、prompt/skill/knowledge refs、capability use-policy refs、tool affordance refs、quality gate refs。 | durable provider、queue ownership、domain quality verdict、executor strategy hard-coding。 |
| `OPL Runway` | Durable attempt transport、Runtime Environment Substrate、sandbox provider selection、retry budget、wakeup、currentness、human/authority wait 与 recovery readback。 | Codex-selected stage id、workspace/context refs、artifact/progress refs、worker/provider refs。 | semantic stage route、domain truth、owner receipt、artifact readiness、quality verdict、production readiness。 |
| `OPL Ledger` | Evidence、receipt refs、typed blocker refs、artifact lineage、restore/provenance 和 refs-only ledger。 | domain-owned receipt/blocker refs、provider refs、no-regression refs。 | memory/artifact body、memory accept/reject、domain verdict、quality/export verdict。 |
| `OPL Console` | App/operator 工作台、`current_owner_delta` default read root、invocation-plan projection、current owner、next action、阻塞、产物投影、治理和 drilldown。 | framework readiness、App state、domain-owned projection、CapabilityInvocationPlan refs、Ledger refs、Connect policy projection。 | Connect 私有后端、runtime truth、domain truth、owner answer、App release verdict。 |
| `OPL Foundry Lab` | Agent 创建、测试接管、mechanism improvement、canary、promotion、rollback 和 work order。 | Agent descriptors、attempt evidence、domain-owned eval/proof refs。 | MAS/MAG/RCA/OMA/OBF 的 domain authority。 |
| `OPL Connect` | 可独立调用的 source connector、CLI、MCP、OpenAI/AI SDK tools、ToolResultEnvelope descriptors、Skill/plugin、module install、release/install 分发和 drift matrix。 | public surface index、module registry、skill/plugin metadata、tool descriptor refs、source refs、release/install contracts。 | Console-only backend、语义重新解释、domain-owned handler、tool result authority、release evidence 伪造。 |

`OPL Pack` 的 family action projection 显式区分 required、optional 与 workspace locator 字段。`module.path:Class.method#action_id` canonical target 只生成结构化 callable binding 和 dispatch request，不复制 domain handler implementation；repo-relative input schema 由 compiler 从目标 repo root 校验，外部 URI ref 则显式保留 external resolution 边界。

模块依赖的默认读法是：`Charter` 固定语言和边界，`Atlas` 提供目录、capability registry catalog 和 tool-card catalog，`Workspace` 提供可检查落点，`Pack` 固定 domain pack / capability registry ABI / Agent Tool Arsenal / authority ABI / generated-surface 输入，并通过 Pack OS 承载 capability pack descriptor、install registry、content-addressed cache、refs-only distribution、refs-only lock、artifact lifecycle refs 和 review receipt refs，`Stagecraft` 设计 stage 内专家工作、capability use policy 和 tool affordance boundary，`Runway` 承接 durable execution，`Ledger` 保存 refs-only evidence，`Console` 消费 `current_owner_delta` 与 invocation-plan projection，`Foundry Lab` 产生 agent 改进 work order，`Connect` 把同一合同派生到 MCP / OpenAI / AI SDK / Skill / CLI / App 调用和分发面。`Console` 面向 operator 组织 current owner、next action、governance 和 drilldown；需要连接、安装、同步或工具调用时进入 `Connect` public entry；需要 durable attempt、queue、retry/dead-letter 或 runtime blocker 时进入 `Runway` public entry；需要 evidence、receipt ref、typed blocker ref 或 lineage 时进入 `Ledger` public entry。Agent Tool Arsenal / Capability Invocation OS 保持在这十模块协同边界内，不新增第 11 模块。ordinary App/CLI/operator route 只有 `current_owner_delta` 一条；Runway、Ledger、Atlas、Pack、Foundry Lab、Connect 和 full drilldown 只能提供 safe action、refs、audit packet、work order 或 support evidence。任何模块的 structural readiness、conformance pass、capability registry hit、tool result envelope、pack lock written、review receipt refs observed、provider completion、ledger verified、Console projection 或 App projection 都不能单独升级成 domain ready、quality/export ready、App release ready 或 production ready。

`Evidence-Grounded Decision Agent Profile` 是标准 Foundry Agent 的横切 profile，而不是新品牌模块或领域 agent。它的通用 flow 是 `material/case intake -> structured extraction -> enrichment -> mode routing -> evidence/tool execution -> synthesis -> independent review/human gate -> decision-support artifact + evidence trace`。`Runway` 承接 stage attempt、mode dispatch、review/approval resume 和 progress-first closeout transport；`Ledger` 保存 evidence trace、tool receipt refs、conflict / low-confidence refs 和 lineage；其余模块继续按各自 owner boundary 提供 context。OPL 不签 domain verdict、final decision、quality verdict 或 owner answer；它只验证 claim refs、shape与 authority boundary，普通证据缺口形成质量债而不阻断 stage。

该 profile 的 canonical 机器入口是 `opl profiles list|inspect|select|capability-plan|conformance --json`；legacy module readback `opl foundry evidence-profile inspect --json` 只保留为底层 profile/module surface 诊断。canonical 读回应同时暴露 Pack ABI、Charter forbidden-claim boundary、Stagecraft / Runway policy、Ledger / Connect / Workspace substrate、Atlas catalog、Console drilldown ref 与 Foundry Lab eval / promotion gate，并给 OMA / Foundry Agent builder 提供 selection receipt、stage/capability/knowledge/tool/evaluation requirements、exact capability resolution 和 structural conformance result。若 selector 无内置 trigger 命中但存在 `--reference-source`、`--paper-ref` 或 `--pattern-packet`，canonical 读回的 source-derived route 只要求保留 source locator、source fingerprint / packet refs、transferable pattern requirements、capability plan requirements 和 no-import authority notes；它不把 source-derived route 写成 catalog profile，也不导入外部 runtime、私有数据、target truth 或 promotion authority。`profiles capability-plan` 只组合 selection receipt、显式 exact capability refs、显式 `--catalog-repo` owner contracts 和既有 current-owner-delta exact resolver；dependency / environment / descriptor / Pack lock 缺口只返回 action refs 与质量债，不阻止 Codex 启动 stage。这个入口只证明非-live 功能 / 结构 surface 可读；Live Evidence、owner acceptance、release / production readiness 和真实 domain verdict 仍回各 owner surface。

## 当前产品链路

当前仓库跟踪的产品链路是：

`User / Codex / opl / One Person Lab App / External Shell -> Codex-default session/runtime path -> explicit OPL activation when needed -> configured family runtime provider when durable orchestration is needed -> selected domain capability surface -> domain-owned stage pack / receipt / deliverables`

长跑托管任务与 online management 的默认目标链路在这个主链路下增加 provider-backed family runtime substrate：

`OPL Product Entry / One Person Lab App / CLI -> OPL stage-led family runtime provider -> thin Domain Adapter -> selected domain capability surface -> domain-owned stage pack / receipt / deliverables`

这里的核心点是：

- `OPL` 当前主线以 `Codex-default session/runtime + explicit activation layer` 为 canonical truth
- `OPL Framework` 集成开发与运行：developer-facing CLI/contracts/package 入口和 runtime control plane 使用同一套 truth；不通过拆仓或复制 runtime 来制造第二框架
- OPL-compatible Agent 以独立 repo/package 形态开发；运行时通过 `opl framework locate` / `opl_framework_locator` 定位外部 OPL Framework 环境，再调用 framework-owned runtime、contract、package 或 projection surface
- `One Person Lab App` 是 user-facing workbench：它消费 Framework 的 runtime/activation truth 和 domain-owned projection，持有 GUI product truth、GUI runtime bridge 产品合同、active shell validation、release gate、updater metadata 和用户文档，不成为 domain runtime、quality verdict 或 artifact authority
- App 普通用户路径等价于 `Codex App wrapper`：`Codex CLI` 是固定 concrete executor，MAS/MAG/RCA 及后续 Foundry Agent 以任务入口内置呈现；`opl-aion-shell` 只是当前 App-owned GUI contract 的 implementation carrier，上游 AionUI 的多 backend、多 Agent 选择只允许作为 shell implementation / developer-operator diagnostic 细节，不成为普通用户产品面。当前 GUI 主线是 OPL-branded AionUI shell；`opl-native-workbench` 是 App-owned foreground alternative；Hermes Desktop / `hermes-codex` 是 retained explicit reference candidate；AG-UI/CopilotKit / `agui-codex` 只作为 archived technical proof 与显式 replay surface 保留
- App / AionUI / Native Workbench 的 runtime、task、package 语义必须从同一条 App / Framework canonical projection 派生：runtime 来自 `opl app state --profile fast --json` 和按需 drilldown，task 来自 `app_state.operator.workbench.task_drilldowns` 与 action receipt refs，package 来自 `app_state.agent_packages.directory + app_state.agent_packages.status_index`，安全动作来自 `app_state.actions` 或明确的 dry-run action refs。AionUI 只把这些 canonical id/ref 翻译成主线 GUI 标签和操作按钮；Native Workbench 只把这些 ref 翻译成 preview / inspector / delivery context。fallback 只能降级为 unavailable、preview-only 或 payload-required，不能自造 ready、synced、installed、executable、task truth 或 action id。
- `OPL` 的 family-level agent framework 以 domain `stage` 为可观察、可编排、可恢复、可审计的语义单元；Agent executor 是 stage 内最小执行单位，`Codex CLI` 是当前第一公民 executor
- 大型任务按接近人类专家实施的阶段推进：界定目标、准备材料、执行、审核、修订、交付收口；OPL 负责阶段生命周期与可见性，domain agent 负责领域判断和交付 authority
- OPL 的合同面必须保持 contract-light 且只保下限：Minimal Trust Kernel 约束启动条件、owner、权限、安全、凭据、可写范围、审计、replay、恢复与 route-back；Stage Strategy Kernel 声明 stage 内认知策略、prompt、skills、tool affordance boundary、knowledge、rubric 和独立 quality gate；Readiness 只聚合 launch/evidence gap；Derived Diagnostic Lenses 只解释缺口；AI Capability Aperture 保留 stage 内开放式思考、写作、评审、诊断、工具选择和迭代
- Jason Liu `Codex-maxxing` 这类外部 Codex operating-loop 经验只按 pattern source 吸收到 OPL 自有 surface：durable thread / steering / memory / heartbeat / artifact review 映射为 stage attempt ledger、`stage_progress_log`、refs-only memory/artifact/package refs、provider heartbeat 和 App/operator drilldown。默认可用机器面是 `opl runtime app-operator-drilldown --json` / `--detail full --json` 的 `workstream_operating_loop`，以及 `opl framework readiness --family-defaults --json` 的同源 summary；该 projection 只做 operator steering，不读 memory/artifact body、不执行 domain action、不创建 owner receipt、不声明 domain ready / production ready。外部文章 URL 只能作为 `pattern_source_refs`，不能成为 runtime、authority 或机器真相源。
- OPL 的 surface budget 必须保持减法治理：新增 surface 默认是 diagnostic / reference；升级成 default surface 需要证明它服务 launch safety、authority boundary、evidence/replay/audit/route-back，或被 App / runtime 多次消费；升级成 hard gate 还必须证明缺失会导致错误启动、越权或不可审计 / 不可恢复
- readiness、scorecard、schema completeness、contract completeness、provider completion 与 generated-surface proof 只能定位 advisory、blocker 或 evidence gap；专家质量判断必须来自独立 AI stage、domain-owned quality gate、owner receipt、typed blocker 或 route-back receipt
- 涉及知识交付、专家判断或正式质量裁决的复杂步骤必须保持为独立 stage，例如 MAS AI 审稿、publication quality review、MAG fundability review、RCA visual review；不得把这类工作折叠成另一个 stage 的函数、helper 或后处理
- AI-first quality gate 是独立审核任务：执行 attempt 产出 artifacts / refs / closeout packet，审核 attempt 只读取这些显式输入和必要上下游 refs，产出 gate receipt / typed blocker / route-back；同一个 `Codex CLI` attempt 不能在同一上下文里自审并推进下一 stage
- 本地 `opl`、直接 `Codex` 使用、ACP-compatible 外部壳与 App repo 通过 `opl-aion-shell` 提供的 GUI shell 都消费同一套 runtime truth；`one-person-lab-app` 持有 App-level GUI product contract、release gate 和 active-shell validation，`opl-aion-shell` 只是当前 replaceable GUI shell implementation carrier，不能持有 OPL runtime truth 或 App-level bridge contract authority
- OPL hosted integration 是标准 OPL Agent 的默认长跑 runtime path；它管理 Temporal family runtime provider、stage attempt ledger、domain dispatch projection 与 online runtime readiness，但不复制 domain runtime kernel，也不让 Codex App 成为持续驱动任务的外围 loop。
- family-level runtime supervision 作为 domain-owned wakeup / supervision surface 的 discovery、export、parity 与 projection；Temporal-backed provider 是 production online runtime 的必需 substrate，`local_sqlite` 只保留为 retired-provider negative guard 和 SQLite projection/index 旧名语境，`hermes_agent`、`claude_code` 与 `antigravity_cli` 是显式非默认 executor adapter/backend；旧 Hermes provider / Gateway 语料只作为 proof、provenance、diagnostic、fixture 或负向 guard 读取，MAS 显式 Hermes scheduler 只允许 status/remove legacy cleanup，不允许 ensure/create/edit/resume/run tick；`OPL` 持有通用 provider cadence / attempt ledger / retry-dead-letter / projection，但不接管 domain truth、memory、quality 或 artifact authority。
- Runtime environment、Agent sandbox provider 与 Temporal 是三层：Fast Local Env 是当前默认 dependency prepare / run-context 路径；Local Docker / Devcontainer 与 E2B 只在显式选择时承接 selected stage executor 的隔离 workspace、filesystem、process、network 和 resource substrate；Temporal 仍是 durable workflow / wakeup / retry / human-gate substrate。Sandbox provider 不替换 OPL Runway，也不归 Connect 主执行。当前 local Docker/devcontainer slice 已进入 Codex stage runner 的显式 selected executor process transport，E2B 是当前唯一已实现的显式 remote provider；其他 provider只能作为 generic external adapter候选，不构成 Runway executor support。Sandbox provider 的 live Docker run、E2B credential run、provider long-soak 和 App release cohort 仍是后置 evidence，不能由 docs、contracts、mocked local Docker path、mocked E2B path 或 focused tests 替代。
- `stage_progress_log` 是 OPL family-runtime attempt/progress projection：它从 OPL SQLite attempt ledger、Temporal provider status/history refs、human-gate / dead-letter state、domain-owned receipt / typed blocker refs 和 closeout refs 派生。Agent Lab 只消费该 projection 的 refs 作为 eval/improvement/read-model 输入，不拥有 runtime log，不写 provider history 或 attempt ledger，也不把 refs-only progress 写成 domain truth、quality verdict、artifact authority 或 runtime ownership。
- OPL Agent Lab 属于 Framework 内部 eval / improvement control plane：它把 descriptor、stage attempt、provider receipt、domain-owned eval/proof refs 和 operator blocker 组织成 lab run、improvement candidate、acceptance evidence 与 follow-up projection；它不接管 MAS/MAG/RCA 的 domain truth、quality verdict、artifact authority、memory body 或 owner receipt authority
- 在智能体自进化闭环中，OPL Agent Lab 只负责 evidence / root cause / targeted fix / predicted impact / next-run falsification read model、best-of-N variant comparison、risk-tiered promotion gate、canary / rollback / no-forbidden-write refs 和 App/workbench projection；`opl-meta-agent` 负责把这些 refs 与目标 agent handoff 转成 developer patch work order、target capability candidate、mechanism patch proposal 或 typed blocker；目标 domain agent 负责最终 owner receipt、domain truth、quality verdict 和 artifact authority
- `opl`、`opl exec`、`opl resume` 默认继承 `Codex CLI` 执行语义；`opl --help` / `opl help` 展示 OPL Framework 自有命令树，`opl exec --help` 等执行器命令帮助继续保留 Codex-compatible passthrough 边界
- `opl install` 只安装/修复 OPL Base：Framework、Codex、family runtime provider 与 native helpers；`--with-app` 只增加桌面 App。Agent、capability 与 workflow packages 全部由唯一 `opl packages install <package-id>` 生命周期管理，turnkey 不再接受或执行 package 选择；`--skip-packages` 只供 Homebrew/App 显式声明 base-only reconcile。`--headless` 是脚本和宿主可显式声明的同一默认合同；`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- 首启 readiness 分为 Core、Domain modules、family runtime provider 三层；Full OPL readiness 要求三层都 ready
- `opl connect sync-skills` 把 family domain skill pack 注册到 Codex 环境，并按 workspace/worktree 布局自动发现 sibling repo；显式 runtime switch 或 domain contract 调用才进入 activation layer
- `opl connect install` 负责把缺失 domain repo 拉进 OPL-managed modules root，并串起 repo bootstrap、skill sync 与 health check 这条闭环安装线
- `opl connect exec` 负责把自动化 CLI 调用绑定到 OPL module registry 解析出的当前 checkout；domain CLI 从 repo checkout 内启动，避免把用户 PATH 上的旧全局 tool 当作执行真相
- `Codex CLI` 是默认且第一公民的 concrete executor；family runtime provider 负责 stage-attempt durability / wakeup / approval / retry / query transport，具体 executor 仍由 OPL / domain stage 显式选择
- `OPL Product Entry` 的普通 ask/chat/resume 路径只使用 Codex-default executor；runtime status 不再暴露 Hermes / Gateway diagnostics，显式非默认 executor 只通过独立 receipt / audit surface 进入
- `MAS`、`MAG`、`RCA` 等 Foundry Agents 继续保持独立，并通过 CLI / 本地程序 / 脚本 / contract 暴露 capability surface；它们以 OPL-compatible package / repo 接入，而不是内嵌一份 OPL runtime
- Foundry Agent repo 的目标形态是 `Domain Knowledge / Authority Pack + thin adapter`：按 `agent/`、`contracts/`、`runtime/authority_functions/`、`src/` 或 `packages/`、`docs/` 声明 stage、Stage Strategy Kernel refs（prompt、skills、tool affordance boundary、knowledge、rubric、quality gate refs）、transition spec、projection builder、receipt schema、workspace/source/artifact locator 和最小 authority function；不维护 parallel generic scheduler、queue、attempt ledger、state-machine runner、workspace lifecycle、artifact lifecycle、memory locator 或 App/workbench runtime
- Foundry Agent series 的机器外观由 `contracts/foundry_agent_series.json#/series_design_profile` 固定为同一 canonical profile：所有标准 agent 都必须声明相同 lifecycle、相同 generic input/output slots、相同 stage pack sections、相同 closeout shape 和相同 OPL/domain authority invariants。领域差异通过 `domain_specific_profile`、`domain_progress_aliases`、stage/action contracts 和 authority-function refs 表达；不能把 MAS/MAG/RCA/OMA/OBF 各自的输入输出 taxonomy 写成新的 series lifecycle。
- Foundry Agent 的 developer checkout 只保存 locator、index、schema、receipt refs、restore / retention policy 和可审查 fixture；真实 workspace state、artifact body、receipt 实例、最终交付物、临时 build/cache、venv/pycache/pytest cache 和 install sync 副产物必须进入外部 workspace / runtime artifact root 或仓外临时目录
- Pack OS 是 OPL Pack 的通用 package transport 层：`opl pack os inspect|install|registry|cache|distribute|lock|validate --json` 从 capability pack descriptor 派生 refs-only lock、registry entry、content-addressed cache manifest 和 distribution bundle，记录 descriptor hash、resource refs/hash、artifact lifecycle refs、review receipt refs、provenance 和 authority false flags。它可以运输 MAS display pack、MAG/RCA/deck/report/app UI pack 这类 domain-declared refs；domain truth、artifact body、owner receipt、typed blocker、quality/export/review verdict、publication readiness 和 App release readiness 仍回各自 domain/App owner。
- OPL-owned workspace 面现在按 `OPL Workspace Protocol` 读取，而不是只按目录结构读取。协议由 `contracts/opl-framework/workspace-topology-profile.schema.json` 固定为 `Workspace Group -> Project Unit -> Stage Artifact Unit -> Owner Receipt / Typed Blocker`，实例级 `workspace_index.json` 由 `contracts/opl-framework/workspace-index.schema.json` 固定 canonical topology、display labels、legacy aliases、shared resource roles、shared manifest refs、indexed project roots、stage outputs root manifest refs、stage outputs index refs、current stage pointer refs、workspace inspection / resource inventory refs、project lifecycle、generated refs 和 authority false flags，并由 `opl workspace ensure` / `opl workspace init` 物化成可用目录结构。`workspace_modes` 只允许 `one_off`、`series`、`portfolio`，三者都使用 series-capable skeleton：默认 physical `project_collection_path` 统一为 `projects`；显式 `--mode series|portfolio` 使用通用 `series` / `portfolio` profile，不再把 portfolio 保留给 MAS 或把 series 绑定到 RCA。`rca_series` / `mas_portfolio` 只作为 legacy/default profile alias 与 display compatibility 保留，升级 series / portfolio 不搬已有 project root。MAS 共享 `data`、`literature`、`memory` 并保留 `studies` display / legacy alias，RCA 共享 `shared/sources`、`shared/brand`、`shared/visual_memory`、`shared/style_system`、`shared/material_inventory` 并保留 `deliverables` display / legacy alias；MAG/OMA 保留 `deliverables` display / legacy alias，Book Forge 保留 `books` display naming。这些 alias 不再定义 canonical physical root，也不改写 shared lifecycle。Project-specific artifact / memory current refs 由项目内 `control/opl/artifact_lifecycle/artifact_lifecycle_profile.json` 显式声明；OPL 只投影、检查和汇总 refs，不把 BookForge、MAS 或其他 domain 的 memory/artifact taxonomy 当作 framework default。`workspace ensure` 是默认快速入口：先复用 active binding，已有 project 直接返回，缺 project 时追加，缺 workspace 时初始化；`workspace init` 是显式初始化入口。两者可使用已配置 OPL workspace root 或显式路径，同时写 `workspace.yaml`、`workspace_index.json`、shared `opl_resource_manifest.json`、project `opl_stage_outputs_manifest.json`、project-local `stage_outputs_index.json` / `current_stage.json`、canonical `control/opl/projections/{workspace_map,workspace_health,workspace_inspection,workspace_resource_inventory}.json`、canonical `control/opl/reports/workspace_report.json` 和 root mirror `workspace_*.json` 并激活 OPL workspace registry。root mirror 只为兼容旧检查入口保留；`control/opl/projections` 与 `control/opl/reports` 是 v2 generated truth。`workspace validate` 是 fail-closed 结构门，`workspace doctor` 是同检查的只读诊断；二者检查 generated refs、inspection/resource inventory、stage outputs index/current pointer、profile binding、topology events、canonical projection 与 root mirror 的一致性，同时只验证 runtime projection 的 shape 和 authority boundary，不把合法非空 `current_stage.json` 覆盖成空模板。`workspace adopt --dry-run|--apply` 用于既有目录 adoption，apply 只写 OPL-owned topology metadata / generated refs，不绑定 registry、不迁移 domain truth；`workspace upgrade --apply` 原地刷新 OPL metadata / manifests / map / health / inspection / inventory / report 并补齐缺失的 stage index/current pointer，不移动 project roots、不覆盖 runtime 已写的合法 current pointer；`workspace project archive --apply` 只把 indexed project/study 标记为 archived，不删除文件，也不等价于 registry `workspace archive`；`workspace export-map`、`workspace health`、`workspace inspect`、`workspace inventory` 与 `workspace report` 是 read-only inspection surface。`workspace interfaces` 和 App `workspace_ensure` action 是同一默认 command contract 的调用面，App `workspace_initialize` 保留为显式 init，App 还暴露 `workspace_validate`、`workspace_doctor`、`workspace_adopt_dry_run`、`workspace_adopt_apply`、`workspace_upgrade`、`workspace_project_archive`、`workspace_export_map`、`workspace_inspect`、`workspace_inventory` 和 `workspace_health`；CLI/App 是真实执行入口，MCP/Skill/OpenAI/AI SDK 是 descriptor-only delegate，只能通过 ensure / interfaces delegate 发现或调用 workspace surface，不能自由猜目录。Stage Native 的普通用户默认检查面是 `<project-root>/artifacts/stage_outputs/<stage-id>/`、`control/opl/reports/workspace_report.json` 和 domain-owned product views；workspace inspection、resource inventory、stage outputs index、current pointer 与 root manifest 都只是 refs/root projection，不能替代 `opl_stage_manifest`、owner receipt、typed blocker、domain truth、quality/export verdict 或 production readiness；runtime-state、SQLite sidecar、provider ledger 和 App projection 只做 provider backing / provenance / restore / audit / read-model refs，不是普通用户默认查看面。
- Workspace governance v2 还要求 `workspace_index.json.profile_binding` 绑定 `workspace-topology-profile.v2`、`opl-workspace-topology-profile-v2-projects-stage-outputs`、profile contract ref 与 migration history，并要求 `topology_events[]` 留下初始化、adopt、upgrade 或 lifecycle mutation 的拓扑事件。`agent_workspace_norm` 在真实 workspace 中必须等于 `agent-workspace-norm-contract.json` 派生出的完整 projection；只匹配 norm id/version 不能通过结构门。Project lifecycle 统一由 OPL 投影 `active`、`paused`、`archived`、`superseded`、`locked`，并携带 paused/superseded/locked/archive metadata、retention policy 和 `domain_owner_receipt_required` safe delete gate；domain repo 只能声明 locator 和 owner receipt / typed blocker，不拥有 generic workspace lifecycle 或 physical delete authority。这个 v2 governance 对 MAS/MAG/RCA/OMA/OBF 采用同一物理语义；MAS 的 `study` / `studies` 与 OPL Book Forge 的 `book` / `books` 只保留 display naming 例外，不改变 project unit、stage outputs、generated root、lifecycle 或 report 语义。
- 更严格的准入形态是 `Declarative Domain Pack + OPL generated/hosted surfaces + minimal authority functions`：CLI/MCP/product-entry/sidecar/status/workbench、scheduler、attempt ledger、generic transition runner、SQLite lifecycle index、session store、memory/artifact/review/native-helper/observability shell 默认由 OPL 生成、托管或替换。`functional_privatization_audit` 必须先把代码路径拆成 `standard_domain_pack_inventory`、`authority_function_inventory` 和 `private_platform_residue_inventory`；只有第三层才算私有平台残留。domain repo 如需保留 residue，必须通过 `contracts/opl-framework/standard-domain-agent-skeleton-contract.json` 和 scaffold 生成的 `contracts/private_functional_surface_policy.json` 证明它属于 refs-only adapter、临时 migration bridge、diagnostic cleanup path 或 provenance/fixture；authority function 则必须走 OPL 标准 ABI 和 no-forbidden-write guard。Domain 收薄的完成 gate 是 replacement parity、no-active-caller、owner receipt 或 typed blocker、no-forbidden-write 与 tombstone/provenance；descriptor ready、conformance pass、private audit 分类清零或 refs-only ledger verified 不能授权 physical delete。当前迁移 owner map 见 `docs/active/standard-agent-migration-owner-map.md`。
- `One Person Lab App` 对这些 Agent 来说是可选前端；同一个 Agent 可以通过 direct Codex app skill、自己的 CLI、或 OPL Framework hosted/projection path 运行
- App 的 GUI navigation 只能包装 OPL `app state/action` 与 Foundry Agent task entry，不得把 shell repo 的 backend / Agent selector 当成 runtime truth、domain truth 或 ordinary executor switch
- App 运行状态页消费 OPL `runtime_visualization_projection` 与 `stage_attempt_workbench.stage_progress_log`，并把 Temporal Web UI 作为 operator/debug link 暴露；Temporal Web UI 不成为普通用户主页面、App 状态真相源或 domain authority surface。
- MAS v2 alignment 下，`MAS` 作为独立 domain agent 通过单一 MAS domain app skill 接入；`OPL` 只消费 MAS-owned entry/projection truth，包括 `mas_opl_runtime_workbench_projection` 的 App drilldown/read-only workbench 投影，不新增 MAS runtime kernel、standalone product release 或 OPL-owned readiness verdict
- MAS executor-first paper path 下，paper-progress SSOT 保持在 MAS；OPL Runway 只承载 Codex-selected stage refs、attempt / queue / provider lifecycle与 owner-evidence transport。OPL 不再维护 domain autonomy supervisor、transition packet 或 decision ledger，也不把 legacy projection 改写成 OPL-owned paper mission truth、grant truth、publication verdict、artifact authority、owner receipt或 typed blocker。

## 当前主线资源

`OPL` 当前主线只公开这组产品资源：

- `system`
- `engines`
- `modules`
- `agents`
- `workspaces`
- `sessions`
- `progress`
- `artifacts`

这组资源一起定义了 GUI、CLI 与 activation handles 的共同产品模型。

## 各层职责

### 1. Codex-default Session Runtime

负责：

- family-level session runtime
- 默认交互合同
- `opl` / `opl exec` / `opl resume` 的前门语义
- 工作空间注册表
- 会话生命周期
- 进度投影
- 交付物投影
- shell projection surfaces

### 2. OPL Activation Layer

负责：

- 引擎注册表
- 模块注册表
- 智能体注册表
- stage descriptor、stage pack admission、requires / ensures composition、skill / prompt / evaluation refs、trust lane、handoff envelope、receipt 与 authority boundary discovery
- shared module / contract / index registration
- family skill pack discovery / sync
- 显式 domain contract dispatch
- domain capability surface discovery

### 2.5 OPL Stage-Led Family Runtime Provider / Hosted Integration

负责：

- family runtime provider 的 provision / version pin / profile wiring、readiness
  触发、检查、报告和 repair action；Temporal provider 是 production online
  runtime 的必需 substrate，Hermes-Agent 不作为 provider / Gateway readiness
  surface。
- runtime environment substrate 的 Fast Local Env profile、doctor、prepare、run-context、
  no-host-fallback consumer preflight、receipt projection 和 cache/readback。Local
  Docker/devcontainer slice 是显式后置 local sandbox provider：只有显式选择
  `local_docker` / `local_devcontainer` 或对应 profile 时，Runway 才通过 git workspace
  transport 在 sandbox 内运行 Codex/default executor，并收集 JSONL / stderr / diff refs
  到 receipt。显式选择 E2B 时才进入当前已实现的 remote provider adapter。其他外部
  compute provider只能作为 Connect discovery / generic external adapter候选，不是 Runway
  已支持 executor；OPL 不把任何 sandbox provider写成 workflow owner、Runway 替代品、
  domain truth owner 或 App release evidence。
- stage attempt lifecycle：stage-attempt request/projection、attempt ledger、idempotency、lease、
  currentness、quality-budget accounting、retry/dead-letter、human gate、
  wakeup、event export、stage progress / true-path projection 和 App/operator
  drilldown。provider / lease / receipt / format 缺口只能投影为
  OPL runtime blocker，不改变 domain truth、不创建 domain typed blocker、不替
  domain owner 签 receipt。
- Runtime Manager / Runway / State Index / native helper 这组 provider-backed
  support surface。它们提供诊断、repair、resume、provider observation、
  control-loop reconcile、refs-only index、artifact/workspace/session projection
  和 optional Rust helper 加速；具体命令、字段、cache、prebuild、SQLite sidecar
  和 helper lifecycle 的机器 truth 回到 runtime contracts、support docs、
  source/tests 和 live CLI。
- Agent Lab 与 family runtime supervision 的 refs-only control plane。它们只引用
  domain-owned proof/eval/receipt/artifact locator、provider observations、
  safe reconcile hints 和 repair refs，不产生 domain ready、quality、
  publication、fundability、visual、export verdict、artifact authority 或 Runway L5
  long-soak closure。

不负责：

- domain truth / quality verdict / artifact authority
- domain memory body 或 memory accept/reject decision
- domain truth
- domain-owned eval/proof 结论或 owner receipt authority
- concrete executor
- 底层 agent VM/container sandbox implementation
- domain stage pack 内部专家判断
- provider system-service lifecycle implementation beyond invoking supported install/repair/status commands
- 私有 fork / vendor 一份 `Hermes-Agent` 或把 Temporal/provider runtime history 写成 domain truth owner

这层让未来 provider 切换时，已有 task registration、status projection、native helper、state index 与 domain owner 边界可以直接复用。当前优先级是 Temporal-backed provider pilot；只有 Temporal/provider abstraction 无法表达 OPL 必需的 task、wakeup、approval、audit 或产品隔离合同时，才进入自有完整长期常驻 sidecar 评估。

### 3. Engines

- `Codex CLI`
  - 当前第一公民交互与执行宿主
- `Family runtime provider`
  - production online 形态是 Temporal-backed provider，承接 durable workflow、activity retry/timeout、human-gate signal、status query 与 execution history；由 `OPL Runtime Manager` 做产品级管理和投影
- `Hermes-Agent`
  - 可选 Agent executor adapter 与显式 proof lane；具体执行语义只在显式切换 executor 或 domain route 选择时进入。当前只保证可接入、可回执、可审计，不保证行为效果与 `Codex CLI` 等价

### 4. Domain Capability Surface And Entry

各个独立 `domain agent` 仓继续持有自己的智能体入口。

它们负责：

- 稳定 capability surface（CLI / 本地程序 / 脚本 / contract）
- 领域逻辑
- 领域规则
- domain transition spec、owner receipt、typed blocker 和 projection builder
- 领域交付物

在当前定位下：

- `agent entry` 是给 `Codex`、`OPL` 与其他通用 agent 调用的稳定入口
- `direct entry / product entry` 是各个 domain agent 自己的轻量独立前门
- `domain harness / controller` 继续保留为仓内边界层与执行层语言，不再作为仓库对外第一身份
- `OPL` 当前通过 repo-owned `domain agent entry spec` 消费各 domain agent 的基础入口真相，而不再只依赖顶层硬编码蓝图
- `MAS` 的当前接入单元是单一 domain app skill 加 repo-owned projection surfaces；`OPL` 消费这些 surface 做统一发现、显示和路由，不替代 MAS 的 controller/publication authority、domain transition semantics 或 owner receipt authority
- `mas_opl_runtime_workbench_projection` 是 MAS 输出给 OPL App 的 read-only study workbench 投影；OPL runtime snapshot 可以把它映射为 study drilldown、links、terminal read-only status 和 action transport metadata，但 action receipt、terminal attach owner、study truth、publication verdict、quality verdict 与 artifact authority 继续由 MAS 持有
- `MDS` 不再作为 MAS 默认运行依赖参与 OPL 安装；MAS 只可把它显式暴露为 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion，不作为这一层的 OPL 顶层 domain agent

#### Unified Domain-Agent Descriptor

`Unified Domain-Agent Descriptor` 是 OPL 对已收录 domain agent 的统一只读发现入口。它不新建一套 domain contract，也不把自然语言经验正文或 stage 内判断移入 OPL；它把现有 domain-owned manifest surface 聚合成一个可给 CLI、App、维护者和后续 admission gate 使用的 read model。

当前机器入口是：

- `opl agents descriptors --json`：列出 MAS/MAG/RCA 的统一 descriptor index。
- `opl agents descriptor --domain mas --json`：检查单个 domain agent 的 entry、standard skeleton、action catalog、stage control plane、domain memory descriptor、skill catalog、runtime/session/progress/artifact refs 与 authority boundary。

它聚合的字段包括：

- `domain_agent_entry_spec`
- `standard_domain_agent_skeleton`
- `family_action_catalog`
- `family_stage_control_plane`
- `domain_memory_descriptor`
- `skill_catalog`
- `runtime_inventory` / `session_continuity` / `progress_projection` / `artifact_inventory`
- `descriptor_refs`、`readiness`、`parity`、`non_authority_flags`

边界如下：

- OPL 持有 descriptor discovery、projection、transport 和 runtime lifecycle metadata。
- Domain agent 持有 domain truth、memory body、quality verdict、publication / fundability / visual judgment、artifact authority 与写回接受/拒绝。
- 给 Agent 理解的长正文继续按 Markdown-first 管理：例如 MAS publication-route memory 正文在 MAS policy / memory Markdown 里；OPL descriptor 只引用 `memory_pack_ref`、freshness、receipt locator 和 forbidden-authority flags。

这个设计对应成熟系统的常见分层：工具、插件、CRD 或 MCP surface 用 machine-readable descriptor 做发现、schema、权限和状态；Skill / domain knowledge / operating guidance 用 Markdown 或自然语言材料给 Agent 读取。OPL 的 descriptor 因此是总入口和索引，不是 recipe engine。

#### Family Action Catalog

`Family Action Catalog` 是这一层新增的 machine-readable callable-action surface。它服务的目标是让 `MAS`、`MAG`、`RCA` 在各自仓内声明一次 action metadata，再派生 CLI、MCP descriptor、Skill command contract、product-entry manifest、OpenAI tool 与 AI SDK tool descriptor。

边界如下：

- `family-action-graph` 继续描述流程图、节点、边、checkpoint policy 与 human gate。
- `family-action-catalog` 描述可调用 action：`action_id`、owner、effect、input/output schema ref、source command、supported surfaces、human gates、workspace locator 与 authority boundary。
- `OPL` 只负责 shared schema、TS/Python helper、manifest normalizer、parity helper，以及 `opl actions list|inspect|export` 这组只读发现命令。
- domain 仓继续持有 handler、runtime、controller truth、review truth、quality verdict 与 publication/deliverable authority。
- 外部 `Ageniti` 的可取之处只被吸收到 contract 思路：单一 app action 定义派生多种调用面；OPL family 不引入 `@ageniti/core` runtime dependency。

#### Family Stage Control Plane

`Family Stage Control Plane` 是 `MAS` stage 化经验上升后的 family 级 shared descriptor / discovery surface。它把程序责任限制在阶段目标、prompt / skill refs、tool affordance boundary、knowledge / evaluation refs、输入输出、handoff、receipt、projection 与 authority boundary 上，把阶段内部的专家拆解、创作、审核、工具选择、修订和诊断继续交给被选中的 Agent executor、Stage Strategy Kernel 与 domain-owned AI workflow。阶段的粒度应接近人类专家真实推进复杂工作的方式，而不是把开放式知识工作压成固定脚本节点。

Stage / route 的顶层运行语义固定为 `declared stage graph + Codex route selection + attempt ledger + passive transport persistence`。`Stage` 是 OPL 可启动、可恢复、可审计的 attempt 单元；静态 pack是否完整只影响context质量。`Route` 是Codex CLI基于domain artifact、diagnostic、owner recommendation与human input做出的advance、skip、repeat、reverse或route-back选择。Transport reconciler只把该选择物化成stage attempt request/projection并对账actual attempt/provider/currentness；它不能生成、批准、否决或自动替换semantic route。attempt ledger只持久化Codex已选择的stage attempt与外部transport观察，不构成第二控制面。

这个模型以 MAS 作为复杂范本：MAS 输出可读研究 artifact、诊断、阴性结果、owner refs 与 route recommendation；Codex 判断 advance 或回到 hypothesis/cohort/endpoint/analysis 等 owning stage；OPL 负责 Temporal attempt、retry budget、stale-reuse filter、ledger 与 App/operator projection。缺 route、attempt 或 packet identity 只禁用旧 attempt 复用，不能阻止新 stage；identity 冲突才阻止错误目标 mutation。provider projected/completed 不能写成 MAS owner receipt、publication quality ready 或 artifact ready。

这组边界不再定义独立 transition runtime：Codex 直接选择 declared stage，OPL 只消费该显式 stage-attempt request并负责 provider transport、StageRun identity readback与 projection demotion。Domain pack把本域 stage、gate、artifact delta、human gate 和 owner receipt shape映射到 OPL published language，但不产出 transition request、successor decision或 programmatic route verdict。

调度表达只借鉴 durable transport，不引入第二 runtime：Temporal 的 durable execution、event history 与 message passing对应provider history、attempt ledger、signal/update/query；OpenAI/agent handoff的structured delegation对应owner answer / handoff payload / target owner refs；Dagster的asset graph / op boundary对应declared dependency graph与callable action边界。OPL吸收的是checkpoint、message、transport reconciliation和read-model词汇，不吸收semantic successor selection；domain truth、quality verdict、artifact authority、memory body和owner receipt继续留在domain owner。

这层必须保持 AI 原生专家判断优先和 contract-light。stage descriptor 可以声明目标、输入、约束、可用工具 affordance、知识、质量门、owner、receipt 与禁止写入边界，但不能把开放式推理、写作、评审和路线发现写成封闭工具剧本。domain stage / professional skill 可以固定会影响专业有效性、证据、authority、安全或不可逆动作的先后依赖；工具目录仍只是 affordance catalog，OPL 只标准化能力、权限、凭据、可写范围、side effect 风险和 forbidden authority。executor 在这些依赖闭合的范围内自主选择工具组合、迭代、跳过、替代、并行和追问。Stage Strategy Kernel 的 ideal pattern 来自科学方法式认知循环：候选生成负责提出多样方案；reflection / review 负责从正确性、novelty、safety、feasibility、citation / evidence support 等角度批评和补强；ranking / selection 负责用 rubric、pairwise comparison、proximity / diversity 或 human preference 对候选排序；evolution / revision 负责基于弱点、证据、组合与发散策略产生下一版；strategy retrospective 负责从评审、失败、winner / loser pattern 和 owner feedback 中形成后续 attempt 的策略输入。OPL 依靠 AI executor 的后续能力升级获得智能体进步，合同负责让这些升级在安全、可审计、可恢复的下限边界内运行。

Stage Strategy Kernel 不是一个 OPL-owned domain truth store，也不是对 Co-Scientist、LangGraph、AutoGen、CrewAI 或其他外部系统的 runtime 依赖。外部系统的 generation / reflection / ranking / evolution / retrospective 经验只作为 pattern source 进入 OPL ideal architecture；OPL 吸收的是 stage 内认知策略组织边界、test-time compute / self-improvement 读法和独立评审纪律。每个 Foundry Agent stage pack 必须把 `prompt_refs`、`skill_refs`、`tool_refs`、`tool_affordance_boundary`、`knowledge_refs`、`rubric_refs`、`quality_gate_refs` 显式声明到 domain-owned pack / contracts 中；其中 `tool_refs` 只表示可用 affordance 及其安全边界，不规定 executor 必须如何调用。OPL 只做 refs-only admission、projection、replay、route-back 和 no-forbidden-write 约束，不读取 domain knowledge body，不保存 artifact / memory body，不签发 publication / fundability / visual / export verdict。

复杂知识交付步骤的默认建模单位是 stage，而不是函数。MAS 的 AI reviewer、publication quality review、RCA 的 visual review、MAG 的 proposal / fundability review 这类步骤需要有自己的 goal、inputs、prompt / skill refs、evaluation refs、outputs、handoff 与 receipt；authority function 只能签发最小领域 verdict、owner receipt、typed blocker 或 safe action refs，不能暗中承载完整审稿、质量评估或修订建议生成流程。

Stage progression 的 AI-first quality gate 需要独立 reviewer / gate attempt。执行 attempt 与审核 attempt 必须分开调度、分开上下文、分开 receipt；审核 attempt 只能基于显式 refs 和产物判断是否进入下一 stage。缺少独立 gate receipt、gate evidence stale、审核 attempt 与执行 attempt 相同或共享污染上下文时，`family-stage-control-plane` 与下游 projection 都应把 progression 视为 blocked / route-back，而不是 ready。

#### Stage Pack Admission 与 Trust Lanes

默认 operator / App 总入口是 `opl framework readiness --family-defaults --json`。`opl stages readiness --family-defaults --json` 是 stage-level family 聚合入口；`opl stages readiness --domain <domain>` 是单仓 drilldown。它们把 Minimal Trust Kernel admission、scope refs、expected receipt refs、proof/replay refs、assumption/monitor refs 和 evidence gap 聚成 readiness 摘要；`stages graph|proof-bundle|assumptions|cohort-loop|runtime-budget|registry|source-spec|replay-certification` 继续是 Derived Diagnostic Lenses，服务维护者 drilldown，不是普通首屏，也不是独立学习目标。Surface Budget 的机器政策由 `contracts/opl-framework/surface-budget-policy.json` 冻结；默认文档和 help 不应把这些 drilldown 命令提升成普通 operator 路径。

GraphFlow / GFL 在 active narrative 中只提供治理词汇：boundary、evidence、audit、replay、route-back。OPL 不吸收其 runtime、planner、proof assistant、workflow compiler、stage runner、executor 或 domain verdict 角色；详细参考映射只保留在 [GraphFlow / GFL contract vocabulary reference](./references/runtime-substrate/graphflow-gfl-contract-vocabulary.md)。

OPL 的 stage pack admission 应形成独立准入门：一个可启动的 stage pack 必须声明 stage id、owner、stage goal、输入/输出 refs、`requires`、`ensures`、allowed action refs、handoff、trust lane、authority boundary、launch profile 和 selected executor binding；knowledge refs、skill / prompt / evaluation refs 与 tool affordance boundary 属于推荐显式声明的 AI strategy / safety boundary refs，可提升复用、审计和 reviewer 上下文，但不构成 OPL launch hard gate。准入通过只表示这个 pack 可以进入 OPL queue / provider / executor 启动路径，不表示 domain task 已完成、artifact 已可信、memory writeback 已接受或质量 gate 已通过。

`requires` / `ensures` 是 stage 间组合的 contract 语言：下游 stage 的 `requires` 必须能由上游 `ensures`、显式 source / artifact / memory refs、human gate 决策或 owner receipt 满足；缺少匹配、证据过期、owner 冲突或 receipt 冲突时，组合必须进入 typed blocker / route-back / human gate，而不是由 OPL 猜测补齐。这个组合检查服务 admission、handoff 和 App/operator projection，不替代 domain route contract 或质量判断。

Stage pack 的 launch scope 必须能被机器读面看见：`source_scope_refs` 冻结本次启动使用的 source cohort 或 source set，`artifact_scope_refs` 冻结允许读取、产出或对账的 artifact set，`workspace_scope_refs` 冻结 workspace / runtime scope。OPL 只投影这些 refs 与计数，不拥有 source truth、artifact authority 或 workspace truth；scope 缺失、过期或冲突时应形成 blocker、human gate 或 route-back。

Stage Kernel 采用两层 trust lane：

- `verified_static_core`：stage descriptor 形状、id、owner、requires / ensures、输入输出 ref shape、allowed action refs、executor binding、authority boundary、manifest provenance 和 schema/parity check。这里可以被 OPL 静态验证或在 admission 时 fail-closed。
- `runtime_enforced_boundary`：Agent executor 输出、LLM 判断、人类批准、外部系统返回、artifact mutation、memory writeback、domain quality / publication / fundability / visual verdict、owner receipt 和 long-running provider history。这里只能通过独立 attempt、receipt、gate、typed blocker、SLO 和 no-forbidden-write proof 运行时约束，不能写成静态证明已经保证。

`guarantee_mode` 是给 scheduler / App / operator 的保证读法，不是 domain verdict。`static_admission_only` 只说明 descriptor 和组合可准入；`runtime_enforced` 表示需要运行时 receipt、event、gate 或 guard 约束；`domain_owned_judgment` 表示质量、truth、artifact 或 memory 判断回到 domain owner；`observability_only` 只说明 OPL 可以显示状态或 refs。任何 observability-only 或 domain-owned judgment projection 都不能被 App 写成 ready。

Derived Diagnostic Lenses 是从 Stage Kernel 派生的只读解释面。`family-stage-pack-registry`、`family-stage-replay-certification`、`family-stage-assumption-lifecycle`、`family-stage-cohort-loop` 与 `family-stage-runtime-budget` 可以提供 hash migration、replay/audit、assumption freshness、cohort visibility 或 runtime observability 解释；`opl stages readiness --family-defaults` 和单仓 `opl stages readiness --domain <domain>` 只把它们折叠为 warning、recommendation、typed blocker、human gate 或 route-back ref。它们不产生 domain ready、quality、artifact、owner receipt verdict，也不成为独立 runtime 目标。

默认 selected executor 是 `Codex CLI`，它可以从 declared/requested stage id、hydrated prompt、workspace 和任意可读 prior artifact 启动；stage packet、manifest、receipt 与 capability binding 均为可选质量上下文。非默认 executor 仍必须有显式 adapter/binding，因为缺少可执行 adapter 是实际运行边界。executor 完成只代表 attempt 结束；任意可读 artifact 可供下一 stage 消费，domain owner receipt / independent gate 只决定 quality/export/publication/ready 声明。

在顶层定位上，这就是 OPL 对标 DeerFlow、LangGraph、Temporal、Dify、AutoGen、CrewAI 等 agent / workflow framework 时的核心差异：这些框架通常以 LLM 调用、agent 节点、tool call 或 workflow activity 作为原子能力；OPL family framework 以 domain stage 作为语义调度单元，以 Agent executor 作为最小执行单位。`Codex CLI` 是当前第一公民 executor，其他 executor adapter 可以接入但需显式选择并接受回执/审计约束。OPL 因此提供 durable state、queue、handoff、approval、retry、projection 和 observability，并以高价值知识工作的全自动交付为目标，但不替 domain agent 生成领域判断。

#### Stage-Native Artifact Runtime

标准 OPL Agent 的长期 artifact 读法采用 `Stage-Native Artifact Runtime`：每个可持久化 stage attempt 都应物化成外部 runtime artifact root 下的 `Stage Folder + Manifest + Receipt` 单元。OPL 的 DB、UI、App/operator projection 和状态索引只能从这些 stage folders、manifest、receipt、content hash 与 current/latest pointer 重建；它们不是第一真相源。

固定判定公式是：

```text
Stage progress = physical outputs + manifest validity + receipt authority + current pointer
```

这条规则把“人能直接看目录”和“机器能确定性推导状态”合在一起，但不允许把文件存在升级成 quality/ready。没有 owner receipt 的可读文件仍是可消费 progress artifact；receipt、hash、lineage 或 current pointer 缺失形成质量债。不可读/损坏 artifact 才需要硬修复；旧 attempt 产物可以作为 Codex 输入，但不能被投影为 current quality truth。

Stage attempt 的终态只允许收敛到三类：`success` 表示 required outputs、manifest 与 owner receipt 同时成立；`blocked` 表示 typed blocker 和 missing/failed evidence 已落账；`skipped` / `deferred` 表示有显式 decision receipt。RCA 这类视觉交付 agent 应把 stage 输出声明成稳定角色，而不是随意文件名，例如 source truth pack、strategy brief、storyboard/page plan、render manifest、review verdict、handoff manifest 与 canonical/export artifact refs。领域仓继续持有 visual truth、review/export verdict、artifact authority 和 owner receipt；OPL 只托管 stage folder contract、locator/index、manifest parity、repair route 与 projection。

当前 OPL runtime API 已围绕这组语义收敛：`opl stage open` 创建 attempt workspace，`opl stage commit` 校验 outputs 并写 manifest/receipt 后原子更新 latest/current，`opl stage status` 从物理目录重建 read model，`opl stage explain` 解释 done/blocked/running/stale，`opl stage rebuild` 重建 index/lineage graph，`opl stage promote` 把 stage output 提升为 canonical artifact，`opl stage gc` 按 retention policy 归档非 canonical attempt，`opl stage restore` 通过 restore proof 恢复 archived attempt，`opl stage conformance` 和 `opl stage workbench` 分别提供严格检查与 App/operator refs-only 投影。

标准 agent 结构准入也已经把该读法变成机器 gate：`opl agents conformance` 要求 domain repo 暴露 `contracts/stage_artifact_kernel_adoption.json`，声明 stage folder 单元、terminal states、stage/attempt/manifest/receipt/current/canonical/export/lineage/retention refs、physical folder truth、rebuildable projection、manifest/receipt/hash policy 和 false authority flags。这个 gate 只证明 domain pack 能被 OPL Stage Artifact Kernel 承载；它不生成 owner receipt、不读取 artifact body、不授权 domain ready、quality/export verdict 或 production ready。

对 `MAS` 来说，这一层是对既有 route contract 和 stage-led policy 的 inventory / descriptor 映射，不是替换现有 stage、改变 stage 数量或重写 controller 流程。`scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` 等实际 route id 继续由 MAS 持有。

边界如下：

- `family-action-graph` 继续描述 stage / action 拓扑、入口、出口、checkpoint 与 human gate。
- `family-action-catalog` 继续描述可调用 action metadata 和多 surface descriptor。
- `family-stage-control-plane` 只声明 stage descriptor、skill / prompt / evaluation refs、tool affordance boundary、handoff refs 与 authority boundary，不新建完整流程引擎或工具编排脚本。
- `family-stage-integrity-metadata` 只声明 stage-level integrity、citation-support、evidence-handoff、data-access 与 human-checkpoint metadata；这是从 academic research workflow 中吸收的通用模式，不是 MAS publication gate、MAG fundability gate、RCA visual-quality gate，也不接管任何 domain 的 direct skill path。
- `stage-candidate-portfolio` 只声明 refs-only domain stage candidate portfolio、assumption / provenance / negative-path / advisory-metric / human-review refs 与状态；这是从 Co-Scientist 风格 hypothesis loop 中吸收的通用 stage-candidate 投影模式，不是 domain hypothesis store、scientific truth reducer、quality gate、artifact authority 或 owner receipt signer。医学或科研假设正文、novelty 判断、证据强度和 candidate 排序归 MAS / MAS Scholar Skills 等 domain owner。
- `stage-run-evidence-pack` 只声明 stage run manifest、failed/negative path refs、decision trace refs、artifact lineage refs 与 reproducibility refs；它服务 replay、audit、handoff 和 App/operator projection，不是 research evidence body、claim-evidence truth、publication package 或 domain quality gate。
- `opl stages list|inspect` 只做 discovery、inspection 与 parity，不执行 stage。
- `OPL` 只做 shared vocabulary、manifest discovery、parity、projection 与 stage-attempt request/projection dispatch，不执行 stage 内部专家动作。
- `MAS`、`RCA`、`MAG` 继续持有各自的写作、视觉设计、基金策略、审稿、publication / deliverable / package gate 与最终质量判断。
- `MAS` 命名统一只能在 inventory 证明逻辑层级不变、原 route contract 可追溯、truth surface 不漂移后进行。

当前参考计划是 [OPL Family stage control plane adoption plan](./references/convergence-governance/family-stage-control-plane-adoption-plan.md)。

### 5. Shell Projection Layer

外部界面仓与 ACP-compatible 壳属于这一层。当前 GUI implementation carrier 是 `opl-aion-shell`，并由 `one-person-lab-app` 作为 external checkout 消费；App repo 持有 GUI product truth、release gate、page-state contract 和 active-shell validation。Shell 通过 ACP-compatible runtime surface 消费 OPL session/runtime truth，不拥有 runtime。
它们读取同一套 session runtime truth，把 `agents / workspaces / sessions / progress / artifacts` 映射成：

- 本地 `opl` shell / TUI
- `Codex` 中的显式调用面
- ACP-compatible 外部壳
- `opl-aion-shell` AionUI 定制 GUI，经 `one-person-lab-app` 打包发布；`opl-native-workbench` 是 foreground alternative GUI candidate，Hermes Desktop 是 retained explicit reference candidate，AGUI/CopilotKit 只作为 archived technical proof 读取
- 未来 hosted / online 壳

## OPL 与 Domain Agents 的关系

- `OPL` 持有通用开发与运行框架：stage attempt lifecycle、provider-backed runtime、queue/wakeup、state-machine runner、human gate、workspace/artifact/memory locator、operator projection 和 App/workbench shell
- `OPL` 不替代领域智能体自己的逻辑、domain transition semantics、quality verdict、artifact authority、memory body 或 owner receipt authority
- `OPL` 负责 Codex-default session/runtime、activation layer、shared modules/contracts/indexes、统一入口与 projection surface
- `OPL` 负责 stage-led family framework 支撑：stage descriptor、handoff、queue、wakeup、retry、approval、trace、projection 和 parity；domain agent 负责 stage pack、prompt/skill、quality gate、truth reducer 和交付 authority
- `OPL` core surface 不应以 `research`、`hypothesis`、`publication`、`fundability`、`visual-quality`、`medical` 等 domain 语义命名通用 primitive。确需承载这些工作流的基座投影时，命名必须回到 `stage`、`candidate`、`evidence refs`、`owner route`、`receipt`、`replay`、`artifact lineage` 或 `connector receipt`；domain 判断与专业 Skill 留在对应 Foundry Agent。
- `MAS`、`MAG`、`RCA` 作为独立 `domain agent`，可以通过 `OPL` activation 调用，也可以被 `Codex` 直接调用
- 两条入口的工作逻辑保持一致
- 对 `MAS` 来说，OPL projection 只携带 evidence、provenance、状态和路由信号；ready、submission、publication、quality 等最终判断仍回到 MAS-owned durable surfaces

## 当前实现边界与缺口

当前 OPL 已经实现的是 family framework 的控制面骨架、Temporal production proof 入口与 task-bound bridge 闭环：

- shared contract：`family-action-catalog`、`family-action-graph`、`family-stage-control-plane`、`family-runtime-supervision`、`family-persistence-policy`、`family-lifecycle-ledger`、`family-owner-route`、`family-product-entry-manifest-v2`。
- Framework helper：TypeScript helper 与 `python/opl_framework` Python surface，可供 MAS/MAG/RCA 生成 action/stage/runtime/product-entry projection；二者同属 OPL Framework，不形成独立 module 或 release。
- provider orchestration：`opl family-runtime` 只保留 Temporal provider、stage-attempt request/projection、retry/dead-letter 信号和 stage attempt ledger；本地 queue、pending task intake、enqueue/tick/redrive 成功路径已退役。
- discovery：`opl actions` / `opl stages` / `opl agents` 只读发现与 parity；当前 OPL 已能校验 standard skeleton descriptor 并要求 artifact locator surface，MAS/MAG/RCA 均为 descriptor-level aligned，stage 与 domain-memory descriptor 也均 resolved；stage list/inspect 会投影 source/artifact/workspace scope counts 和 `guarantee_mode`，帮助 App/operator 区分静态准入、运行时约束、domain-owned judgment 与 observability-only 面。
- unified descriptor：`opl agents descriptors` / `opl agents descriptor --domain <domain>` 已把 entry、skeleton、stage、action、memory、skill、runtime/session/progress/artifact refs 聚合成统一 read model；它只携带 refs/status/parity/authority boundary，不承载 domain memory 正文或 domain verdict。
- generic substrate projection：`opl substrate projections` / `opl substrate projection --domain <domain>` 已把 domain manifest 中的 `workspace_locator`、`source_provenance`、`artifact_inventory`、`domain_memory_descriptor` refs 以及 MAS/MAG/RCA `sidecar export.opl_substrate_adapter` 的 opaque refs 聚合成 OPL-owned workspace / source / artifact / memory substrate projection。`opl substrate workbench` 在 projection 之上提供 App/operator drilldown 分组，按 domain、projection status、sidecar status 和 ref family 聚合 refs，并提供 inspect command。该 surface 只做 locator、index、lifecycle、operator projection 与 ref transport；workspace truth、source truth body、artifact body / authority、memory body / writeback accept-reject、domain truth 与 quality verdict 继续归 domain agent。
- Runway provider attempt：只消费 Codex 显式选择的 declared stage-attempt request，把stage/run identity、idempotency key、source generation与expected version normalize成provider transport/readback。OPL不根据domain read-model、action_queue形状、quality gate、receipt completeness或recovery文案自行推导、批准或拒绝下一步domain stage。
- provider execution：Temporal `StageAttemptWorkflow`、Codex / domain sidecar activity、human gate / user instruction / resume signal、stage attempt query、CLI `attempt start|query|signal`、worker lifecycle status 和 fail-closed readiness 已落地为 source / CLI / contract / projection surface。2026-05-14 本机 managed Temporal service / worker proof 只作为历史 provider proof provenance；当前 `full_online_ready`、`durable_online_ready`、SLO、worker lifecycle 或 production-residency 读法必须 fresh-read runtime / readiness owner surface，不能从本文继承。
- typed receipt / workbench：Codex stage activity 已有 dry-run / live-dry-run / `codex_cli` runner repo/test harness、typed closeout claim-evidence 捕获、raw/partial/no-output diagnostic progress、consumed refs / memory refs / writeback receipt refs / rejected writes / route impact / next owner 投影；`opl runtime snapshot` 已输出只读 `stage_attempt_workbench`。typed closeout 只提高 lineage 与 owner/quality/ready claim 证据质量，不是 stage completion 或 transition gate。

当前尚未闭合的是完整生产级 long domain owner chain：

- Temporal-backed provider 已证明本机 managed production residency 与当前 SLO/capability projection 可达；仍未闭合的是真实 domain owner-chain dispatch scaleout、长时 operator evidence、长时间 retry/dead-letter 观测与真实 domain soak。
- `Codex CLI` stage activity runner 已能在 repo/test harness 中启动 `codex_cli` runner、记录 stdout event summary、timeout、process output summary 和 checkpoint heartbeat；真实长时 domain activity soak、token / cost / progress 观测校准、domain sidecar live dispatch 与 owner receipt 连续 evidence 仍需继续落地。
- OPL App / GUI 已能消费 stage-attempt workbench、generic substrate projection 和 provider-level signal 传输，但仍需要真实 worker/domain 执行证明、domain/stage/blocker/memory refs 分组操作面，以及避免把 provider completion 或 substrate refs 写成 domain ready verdict 的持续 UI 验收。
- MAS real paper line 已有 read-only closeout projection，并通过 provider-hosted task-bound bridge 产出 typed blocker / no-forbidden-write proof；MAG/RCA 已有 live task-bound sidecar receipt / no-regression evidence ingestion。仍需证明真实 MAS owner guarded-apply chain 推动论文前进，以及 grant / visual long soak 到最终交付。

所以，OPL 现在可以被描述为 `stage-led family framework control plane, Codex CLI first-class executor, explicit optional executor adapters, Temporal production residency proof, provider-hosted task-bound bridge, Codex runner repo/test harness, progress-first raw/typed closeout capture, and domain skeleton discovery / validation landed`。它的目标是完整智能体运行框架和高价值知识工作全自动交付，但当前不能描述为 `long-running domain-owner production chain fully closed`；当前 standard skeleton 家族对齐已在 MAS/MAG/RCA 三仓达到 descriptor-level aligned，仍不能写成三仓 physical skeleton layout 已完成。

## 默认执行策略

- 第一公民执行器正式名称：`Codex CLI`
- 默认执行模式：`autonomous`
- 默认模型与默认 reasoning effort：继承本机 `Codex` 默认配置
- `Family runtime provider` 当前是 Full OPL online family runtime 的 readiness 对象；Temporal-backed provider 是 production online runtime 的必需 substrate。`hermes_agent`、`claude_code` 与 `antigravity_cli` 是显式非默认 Agent executor adapter/backend，不替代 Codex CLI 默认执行语义，也不承诺行为、质量、工具语义或 resume 等价；旧 Hermes provider / Gateway proof 语料只按历史、诊断、fixture 或负向 guard 阅读

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按 `OPL Framework -> One Person Lab App -> Foundry Agents` 三层产品认知组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护。
- 历史 `frontdoor` 时代的公开语义只保留在参考与历史层，不再进入当前主线。
