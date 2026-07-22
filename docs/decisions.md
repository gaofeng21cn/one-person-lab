# OPL 关键决策

Owner: `One Person Lab`
Purpose: `decisions`
State: `active_truth`
Machine boundary: 本文是核心人读真相面。机器真相继续归 contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifest 和真实 workspace / App evidence。

## 2026-07-21

### 决策：Work-item execution scope 成为多任务并发的唯一目标身份

原因：同一 MAS workspace 可以并发执行多篇 Study；workspace path、Stage 名、provider
进程、Temporal Workflow ID、Search Attributes 或“最新 artifact”都不能唯一回答一次运行属于
哪篇论文。旧 StageRun 又可能缺少显式 Study binding，导致 readback 把仍在运行的 Attempt
投影成另一篇 Study 的 current execution，或显示 `paused / idle / clear` 这类互相矛盾的状态。

影响：

- OPL 持有唯一 canonical `execution_scope` snapshot。`ProjectScope` 是可持久迁移的项目身份；
  `WorkItemScope` 只由 `project_scope_id + canonical domain_id + domain_work_item_id`
  推导，不由 workspace path、Stage、Attempt、Workflow 或显示名推导。
- Domain action 只声明 scope kind 与业务 alias。alias 仅在 ingress 解析一次；缺失、多个 alias
  值冲突、host inventory 不唯一、canonical root 逃逸或 workspace binding 冲突都在 Workflow
  创建前 fail closed。MAS 不接收或生成 OPL opaque scope ID。
- Work-item StageRun、StageAttempt、resume、closeout、artifact/receipt consumption 和 readback
  必须携带并 exact-match 同一 snapshot/digest。SQLite 保存完整 snapshot 与拆列索引；同一
  invocation/idempotency key 重用但 scope 或 content digest 不同视为不同意图并拒绝复用。
- Temporal Search Attributes、memo、OpenTelemetry baggage、日志字段和 Codex `OPL_*` env
  只传播/检索已持久化身份，不能创建、修复或授权身份。parent/child Workflow 必须校验同一
  StageRun scope；可观测字段不能替代 ledger exact-match。
- 旧无 scope StageRun/Attempt 原样迁移为 `identity_unresolved`。它们可在 full diagnostic 中
  查看，但不能成为某个 WorkItem 的 current/latest/token source，也不能 resume、wake、
  closeout 或被“同 workspace 最新记录”吸收。迁移不得从 legacy locator alias 猜身份。
- workspace binding 换路径时继承稳定 `project_scope_id`，因此 WorkItemScope 不变；binding
  version、workspace root、canonical work-item root 和 inventory digest 仍进入每次 immutable
  snapshot，用于发现 stale transport，而不改变 WorkItem identity。
- 该设计采用 [Kubernetes multi-tenancy](https://kubernetes.io/docs/concepts/security/multi-tenancy/)
  的 admission/authorization 隔离原则；采用
  [Temporal Workflow identity](https://docs.temporal.io/workflow-execution/workflowid-runid) 与
  [Search Attributes](https://docs.temporal.io/search-attribute) 的 provider identity/visibility
  分层；采用 [OpenTelemetry baggage](https://opentelemetry.io/docs/concepts/signals/baggage/)
  的显式传播边界；并按
  [AWS idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/)
  与 [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests) 拒绝同 key 不同意图。
  OPL 只吸收这些工程原则，不引入第二 identity service、authorization plane 或 dashboard。

## 2026-07-16

### 决策：FoundryRun 是智能体工程唯一运行事实，OMA 只提供语义决策

原因：被本决策取代的独立实验室控制面同时暴露 scaffold、suite、执行工单、promotion 和 OMA 专用交接对象，导致设计 owner 与运行 owner 之间存在第二状态机、第二晋级口径和路径型 ABI。普通用户也被迫理解内部执行生命周期，无法从一个入口获得设计、独立评测、自进化、激活和回滚的完整结果。

影响：

- OPL Foundry Kernel 独占 `FoundryRun`、物化、冻结测试计划、独立评测、事件链、generation 预算、`AgentVersion`、Qualification、canary、activation CAS 和 rollback。Temporal 是 durable workflow；Ledger 是不可变审计事实；StateIndex 只作可重建 projection。
- OMA 作为 `agent_id/package_id=oma`、`domain_id=agent_engineering` 的语义 provider，只接受 `DesignRequest` 或 `EvidenceBundle`，只返回完整 `AgentBlueprint` / `EvalSpec` 或 `EvolutionProposal`。OMA 不返回 patch、执行计划、repo path、CLI、queue、lease、attempt、promotion ledger 或隐藏测试正文。
- 跨 OMA/OPL 的唯一协议对象是 `DesignRequest`、`AgentBlueprint`、`EvidenceBundle` 和 `EvolutionProposal`；它们使用 closed JSON Schema、canonical JSON 和 SHA-256 content digest。Owner 决定是独立 OPL authority receipt，不进入 OMA 协议。
- 普通入口收敛为 `opl agents run --domain oma --action engineer-agent`；`opl foundry status|approve|reject|cancel|versions|rollback` 只作 operator/debug。OMA 内部 `design|diagnose` provider operation 不投影为普通 action。
- 被取代的独立实验室控制面、执行工单 ABI、公开 scaffold 命令和静态 promotion 记录只读归档，不能 resume、不能成为新 active truth，也不提供兼容写路径。该 hard cut 与 OMA provider 必须在同一 Release Set 发布；半套实现不得单独晋级。
- 低风险 prompt/knowledge/新增测试可自动晋级；中风险可自动 canary 但 active 需 Owner；高风险在 canary 与 active 前均需 Owner。任何运行累计风险只能保持或上调，OMA risk hint 不能降低 OPL 重算结果。

## 2026-07-13

### 决策：Workspace registry 测试状态与真实用户状态强隔离，缺失 binding 通过显式归档治理

原因：Runtime V2 inventory 曾出现大量 `opl-workspace-*-root-*` 测试 binding。标准 test lane 已有临时 `OPL_STATE_DIR`，但直接运行 focused `node --test` 时，CLI helper 仍继承 shell 中的用户 state；workspace initializer 会把临时 RCA/MAG workspace 写进真实 registry，并因同 project 只允许一个 active binding 而把真实 binding 降为 inactive。与此同时，`workspace archive` 要求目录仍存在，导致已删除临时目录的 active binding 无法经公开 CLI 归档，进而阻塞安全 prune。RCA inventory 因真实 binding 被测试 binding 降级而消失；OBF 的真实 Book workspace 从未显式绑定；MAG 当前没有 canonical workspace，这三类缺失不能靠目录扫描或 Runtime 投影猜测修复。

影响：

- CLI 测试 helper 与 test lane 都默认使用 runner-owned 临时 state；同步 subprocess、async subprocess 和 in-process read-only invocation 采用同一隔离规则。调用点显式传入 `OPL_STATE_DIR` 时仍优先，用于 fixture state；调用者 shell/live state 不再是测试默认值。
- `workspace bind` 与 `workspace activate` 继续只接受当前 admitted project 和当前存在的目录。`workspace archive` 改为按 registry 中精确 `project_id + absolute path` 归档，因此可以处理已经消失的 active binding，以及仍留在 registry 中但 project id 已退役或改名的 legacy binding；它不重新 admission 旧 project、不删除文件、不按路径名识别测试数据、不自动激活其他 binding。
- `workspace maintenance prune` 继续默认 dry-run、apply 前 byte-exact backup，只清理 missing + non-active binding。active missing binding 必须先显式 archive；真正的 RCA/OBF workspace 需要显式 activate/bind，MAG 在用户选择并初始化 canonical grant workspace 前保持未绑定。
- Runtime V2 inventory 只消费 canonical registry/workspace projection。domain source repo、已删除 worktree、test temp root、autopush binding 和历史 attempt 不能自动成为用户项目；本决策不修改 live registry，也不声明任何 domain/runtime/production readiness。

### 决策：Stage Review 由真正的 StageRun 父级工作流编排

原因：旧实现把一次 Stage 主提示词执行和一次 `StageAttemptWorkflow` 混称为 StageRun，同线程自检又容易被误读为独立 Review。这既污染 reviewer 上下文，也会诱导 domain 用自定义 Attempt role 把一个 Stage 扩张成隐藏的小 Stage graph。

决策：`StageRunWorkflow` 是非模型、durable Temporal 父级 controller；`StageAttemptWorkflow` 是独立 executor child workflow。Framework 只允许 `producer/reviewer/repairer/re_reviewer` 四种 role，按 domain 声明的 quality policy 动态物化，最大形状为 `1 + 1 + 3 x 2 = 8` 个 Attempt。每个 Attempt 使用 fresh Codex session，只通过 exact refs、hashes、rubric、finding、repair map 和 lineage 通信；same-thread self-check 记为 `in_thread_refinement`，same-thread typed-closeout 补全记为 `protocol_closeout_resume`。后者只在 read-only sandbox 中补既有 Attempt 的 JSON closeout，并在 Attempt identity 校验后才算协议补全成功；两者都不产生 review receipt、不消耗质量轮次。

创建边界：StageRun 不接受 raw CLI payload。唯一创建路径是 `opl family-runtime attempt create` 从已编译 domain pack 解析 `opl_pack_bound_stage_quality_runtime_binding`。`stage_run_id` 只由 domain + stage + durable invocation 派生；Stage manifest SHA、quality policy、role prompts、rubric、lineage、pack/source/checkpoint/input artifact identity 统一进入 `stage_run_spec_sha256`。Runway 必须在 Temporal start 前登记 exact bounded input；同 invocation + 同 spec 幂等复用 running/closed Run，同 invocation + 不同 spec fail closed。raw `family-runtime stage-run start` 退役，`stage-run` 只保留 query。对本地 artifact，OPL transport 读取最终 bytes、重算 SHA 并签发 content-addressed `opl_transport_artifact_identity_receipt`；外部 artifact 必须提供可独立读取、绑定 domain/producing Attempt/ref/SHA 的 domain receipt。正式 review receipt 必须绑定该 exact identity、fresh reviewer session、rubric 与 finding lineage。

Re-review 采用 finding closure，不得用普通新建议无限重开循环。预算耗尽但产物可消费时写 `completed_with_quality_debt` 并继续下一 Stage，同时禁止高质量、导出、发表、提交和 ready 声明；零可消费产物或硬 authority/safety/human/currentness gate 才阻断。Meta Review 始终是独立 StageRun，主 role 为 `producer`，不递归套正式 Stage Review。

边界：domain Agent 继续拥有专业 Review 方法、必要认知顺序、findings、repair 和 quality verdict；OPL 只拥有 Attempt identity、上下文隔离、预算、lineage、durable orchestration 和 refs-only projection。普通用户只看 Stage 级状态，Attempt 细节只在 operator drilldown。涉及不同主要开放判断、owner、source/knowledge authority、独立 quality gate、正式 handoff、下游 route、不可逆权限或 human decision 时必须 split / route-back 到新 Stage，不能增加 Attempt role。

### 决策：终局 Attempt 决定专业路由，Framework 只做 ABI guard

原因：让任意 Attempt 都能写下一 Stage 会使 producer、repairer 与 reviewer 互相覆盖；完全禁止 Framework 拒绝 route 又会让越权 role、undeclared target、legacy field、malformed output 或无效 Re-review closure污染 current pointer。两者都不是“Codex 单一语义路由面”。

决策：primary-only StageRun 的 producer，或正式 Review StageRun 的 terminal reviewer / re-reviewer，是唯一终局 route owner。非终局 Attempt 只能写 `route_impact.stage_route_recommendation`；终局 Attempt 写 `route_impact.stage_route_decision`。这只是 closeout 语义判断，不授予 Attempt Stage topology、current pointer 或 transition authority。Framework 必须校验 role/终局资格、StageRun context/lineage、字段互斥、shape、legacy 字段缺失、finding-closure 和 declared target；不校验医学、科研、基金、视觉、编辑等专业判断是否正确。协议失败时 route output 不物化，artifact 保留并形成 route quality debt；fallback 优先沿 action 的 ordered `required_stage_refs`，没有 action route 时仅可沿当前 Stage 唯一的 `next_stage_refs`，分叉点不得按 manifest 文件顺序猜测。

### 决策：Handoff Review 统一风险判据，不统一执行形状

原因：Handoff Stage 的名称不能决定是否需要再审。运输已审 immutable refs 与在 Handoff 内新生成最终 PDF/PPTX/投稿包的风险不同；把五个 Agent 全部强制成相同 Review loop 会制造无意义递归，把它们全部设为 primary-only 又会让 Meta Review 之后生成的新 bytes 和 ready claim 绕过 fresh Review。

决策：packaging Handoff 必须声明 `handoff_review_boundary`。只要 Handoff 生成或转换新的可审交付 bytes、冻结 canonical artifact bytes，或签发 quality/export/publication/ready claim，任一成立就必须启用上下文独立的正式 Stage Review。只有运输已审 immutable refs，或对已审 bytes 做确定性机械封装，同时不冻结 canonical bytes、不签 ready claim且下游 owner 保留 acceptance 时，才允许 primary-only。Human gate 与 formal Review 正交；上游 Meta Review 不覆盖它之后生成的新 bytes。

当前五个官方 Agent 按实际职责分类：MAS `finalize_and_publication_handoff` 与 OMA `baseline-delivery` 是 primary-only；MAG `package_and_submit_ready`、RCA `package_and_handoff`、OBF `publication-proof-handoff` 运行完整 Review loop。这不是按 Agent ID 写死的永久豁免：任一 Stage 的 artifact effect、freeze 或 claim 行为变化时，domain manifest 必须重新分类，Framework compiler 按上述风险信号 fail closed。

### 决策：白皮书正文归各仓，构建与发布证据归 OPL 唯一工具链

原因：白皮书是面向用户解释设计理念的长期公开材料，不是功能说明书，也不是运行状态或 readiness 证明。正文需要由 OPL Framework、App、Cloud、MAS 各自的 truth owner 维护；renderer、样式、构建验证和发布回读如果分叉，则无法证明线上字节来自哪份正文，也会让工具用必备章节和术语反向塑造叙事。

影响：

- 四仓只持有正文和 `contracts/whitepaper_profile.json`；Framework 持有唯一 renderer、样式、family registry、reusable workflow 与 exact-byte readback。
- Profile 只约束 owner、输入输出、页数和公开 URL，不断言叙述性章节或固定措辞。
- 普通 push 只生成可审核 bundle；显式发布消费同一 bundle，经 `whitepaper-production` approval 后更新保留历史的 `gh-pages`，不得本机 orphan force-push。
- artifact verification 只证明 HTML/PDF 已渲染；只有公开 URL exact-byte 回读 receipt 才证明已发布，两者都不声明产品、runtime、domain 或 production ready。

## 2026-07-12

### 决策：标准 Agent 通用接口由 domain descriptor 声明，OPL 按 package currentness 托管消费

原因：workspace profile、domain argv、runtime registration/dispatch、progress alias 和 routing signal 既不能散落在五个 Agent 的私有平台 wrapper 中，也不能复制到 OPL registry 成为第二领域真相。package lock 的 `status=current` 本身也不足以证明实际 checkout bytes/current probe 可消费。

影响：

- MAS/MAG/RCA/OMA/OBF 在各自 `standard_agent_interface.v1` descriptor 中声明上述 domain-owned extension；OPL 只持有 schema、closed parser、generated scaffold、package-current discovery 与 hosted consumers。
- descriptor discovery 必须消费 canonical package readiness，要求 dependency/scope 闭合、managed runtime source tree digest 一致、health/handler probe current；隐式 sibling/cwd 扫描退役，显式 workspace root 只作开发 fallback。
- `standard-agent-registry.ts` 只保留 identity、label、package locator、aliases 和 membership；workspace/runtime/installer/golden-path/Pack/authority 示例全部移出。Workspace 缺 descriptor 时使用统一 generic baseline，runtime dispatch 缺失时 fail closed。
- progress alias 只从 `standard_agent_interface.progress` 读取；缺 descriptor 时只接受两个 canonical delta 字段。OPL attempt/Temporal contract 不再列出 paper/grant/visual alias 或 `paper_stage_log`。
- Atlas、Workspace、Runway、Stagecraft、Ledger、Console 和 Foundry Kernel 只能投影/运输声明内容；不得据此写 domain truth、artifact/memory body、质量/导出裁决、owner receipt、typed blocker、App release verdict 或 ready 声明。

### 决策：安装、管理与更新统一为 OPL Base、OPL App、OPL Packages 三层生命周期

原因：旧 `opl update --component <internal_id>` 把 runtime adapter、App carrier、package channel、Codex projection、companion tools 和 workflow profile 都暴露成同级用户 component，迫使普通用户理解内部路由，并让 projection 看起来像独立 mutation owner。公共生命周期应与用户实际管理对象一致，内部 provider id 只服务 adapter dispatch。

影响：

- `opl update status|check|plan|apply|repair|rollback` 只管理 `OPL Base`，不再接受 `--component`。
- `opl packages list|install|update|enable|disable|repair|uninstall` 是 `OPL Packages` canonical lifecycle；registry validation、status、Framework link 和 shortcut preference 诊断也迁到同一 namespace。旧公共 package namespace 和 legacy component alias 直接退役。
- `managed_update.components[].component_id` 只允许 `opl_base`、`opl_app`、`opl_packages`。`runtime_substrate`、`installation_carrier`、`capability_packages` 只作为内部 `provider_id`；不能作为 selector 或 lifecycle owner。
- OPL Base 独占 Framework、Temporal-backed provider runtime、共享 toolchain 和系统级 dependency/integration lifecycle。Base catalog 至少投影 Codex、Temporal、OfficeCLI 和 MinerU 的版本、ownership、digest/receipt 与 activation policy：OPL-managed clean 对象静默 reconcile，Full bundle 只作 seed，环境变量、Homebrew、global npm、PATH 与用户目录对象只检测。Codex 与 Framework/Temporal 写 pending generation并记录 staging process instance；相同 version/artifact 已 pending 时不重复下载或覆盖 marker；同一 App process instance 的 daily maintenance 不激活，App 重启后的新 instance 才切换。标准 Agent 只声明并消费 Base 提供的 runtime contract；Agent package、App 或 domain repo 都不得安装、更新、回滚或反向管理 Base/Temporal。
- companion tools 归入 Base 的 `dependency_status` / `integration_status`。Codex skill/plugin sync 归入 Packages 的 `projection_status`，OPL Flow profile semantic merge 归入 `profile_migration_status`；空白 profile 可由 package transaction 安装，已有用户 profile 必须生成单一 current merge packet，并只允许 `opl packages profile apply <package_id> --merged-file <packet-path>` 显式应用 reviewed merge。禁止静默覆盖用户 profile，卸载 Package 也不得删除用户 profile。
- package transaction 继续要求 immutable digest/content identity、dirty/developer checkout 保护、同 transaction 的 Codex skill/plugin sync、manifest-declared managed runtime source carrier 和单一 lifecycle receipt；Framework 复用现有 Agent Package lock/materializer 与 managed module package-channel，不创建第二套 package manager。runtime source 只有在 bootstrap、health 与 handler probe 全部成功后才可 current；后续失败必须恢复 previous generation 或删除本轮 fresh root，preexisting adopted root 不得误删。
- OPL Flow 也是普通 `OPL Package`。其 owner `workflow-policy.json` 与 schema 由 manifest 的 `managed_policy_surface` 引入，Framework 先校验 package identity/version/schema，再通过通用 plugin/skill/service/config/prompt inventory 执行 typed conflict retirement；backup、inventory digest、policy digest、profile/model projection、lock、receipt 与 LKG 必须属于同一 Package transaction。禁止恢复 workflow 专属 checkout、lock、receipt、rollback 或 readback。
- MAS 的 `mas-scholar-skills` 是 required capability dependency，不是用户单独选择的扩展。`opl packages install mas` 必须解析并安装整个 digest-locked closure；update、repair、rollback 同进同退，provider 被 MAS 引用时不能单独 disable/uninstall。
- MAS workspace/quest 的每个 hosted action 与新 child Attempt 在首次启动边界由 Packages transaction 静默解析最新可运行的 MAS + `mas-scholar-skills` generation。完整 35 个 exported Skills 进入该 Attempt 自有的只读 `.agents/skills` generation，`<target>/.codex/skills/` 只保留为 Codex discovery/兼容投影；11 个 core Skill exports 加 10 个 module contract ids 是 readiness floor，module ids 只校验、不物化为 Skill 目录。新 generation admission 失败自动回退 LKG，不要求人工 activate、repair 或 reload；同一 Attempt 的重试复用已绑定 generation，新 Attempt 再追最新。
- App/Shell 只消费 `package_dependency_readiness`、`materialization_readiness`、`operational_ready` 和 `launch_allowed`。未安装 package 也是明确的 launch blocker；不能用 `installed_package_count=0`、shortcut、deep link 或 stale selection 绕过。
- first-party package canonical ids 固定为 `mas`、`mag`、`rca`、`oma`、`obf`、`mas-scholar-skills`、`opl-flow`。每个对象只有一个 OCI repository：`ghcr.io/<owner>/one-person-lab-packages/<canonical-id>`；旧 `one-person-lab-modules/*` 和 repo-slug OCI 只可作为迁移或历史 locator。`one-person-lab-manifest` 仅是 Release Set catalog carrier，不是第八个 Package identity。moving channel 只允许 `candidate` 与 `latest-stable`，不可变 tag/version 必须绑定唯一 digest；不得恢复普通 `latest`。
- daily package workflow 只处理 source/content fingerprint 发生变化的 package。package 发生内容变化却未推进 owner manifest SemVer、同一 canonical id/version 漂到不同 digest、channel version 与 manifest version 不一致，或无变化 package 被重发，均应 fail closed；candidate 通过 package gates 后才可逐包提升到 latest-stable。

### 决策：Package 使用 owner SemVer，Release Set 使用独立 CalVer generation

原因：单个 Package 的版本需要表达兼容性与依赖范围，而生态级 catalog 需要表达某次可复现选择。把日期当 Package version 无法可靠表达 breaking change；把所有 Package 绑成 App 版本又会让未变化对象被迫重发。

影响：

- 七个 Package 各自以 canonical owner manifest 的 SemVer 为唯一版本。`1.0.0` 以前，不兼容的 package contract、ABI 或依赖边界变化推进 `minor`，向后兼容的修复或内容更新推进 `patch`；进入稳定期后，不兼容变化推进 `major`、向后兼容的新能力推进 `minor`、向后兼容修复推进 `patch`。尚未稳定的 owner 只有在确实需要 prerelease channel 时才使用 `alpha`、`beta`、`rc`，不把普通开发迭代永久挂在 prerelease 后缀上。owner language version 只作 carrier projection。
- stable cohort 的 owner HEAD 必须存在与 manifest SemVer 相同的 annotated `v<version>` tag；Framework projection 必须逐项绑定 owner HEAD、payload source URL、逐文件 SHA-256，以及适用时的 OPL Flow carrier commit 和 Scholar Skills content lock。同一 SemVer 不得映射到第二组字节；source 已变化但版本/tag 未推进时以 `version_bump_required` fail closed。
- capability、workflow-profile 与通用 payload schema 都必须在 owner manifest 入口接受合法 SemVer；release discipline 再对七个 artifact、Release Set BOM 与 OCI immutable tag 做同一版本校验。内容发生变化但 SemVer 未推进时 fail closed。
- Release Set generation 使用 UTC `YY.M.D`；同日需要新的不可变选择时使用 `YY.M.D-rN`。`rN` 必须按整数解析与比较（例如 `r10 > r9`），禁止字典序比较。operator/环境/CI 重试复用同一 generation，只有不可变 BOM 内容或 digest 变化才分配下一 revision。`opl_release_set.v2` 同时记录 OPL Base、OPL App 与七个 Package 的精确独立版本、source commit、artifact ref 与 digest，是 install/update/rollback 可复现的九组件生态 BOM。Base 与 Package 使用各自 SemVer，App 使用用户可见 CalVer；自动更新跟随 `latest-stable` 的 exact digest，并按组件 version 与 artifact digest 判断变化，Release Set revision 不参与组件更新判断。
- `ghcr.io/<owner>/one-person-lab-manifest:<release-set-generation>` 是 Release Set catalog carrier。它可使用 `candidate` 与 `latest-stable` moving tag，但 `catalog_carrier_is_package_identity=false`，不能进入 Package dependency graph、普通 Package 安装列表或独立用户 lifecycle。
- daily workflow 在尚无 `latest-stable` 时生成完整九组件 candidate；已有 stable baseline 后只在 Base、App 或 Package 的 versioned source/content fingerprint 变化，或显式 Release Set repair 时生成 candidate。未变化组件复用上一 Release Set 的精确 digest。稳定推广只 retag 已存在的 immutable generation digest，不重新抓取 owner HEAD 或重建 BOM。
- daily detection 开始时必须冻结 canonical seven 的 exact owner commit cohort，并把同一 `owner-cohort-lock.json` 作为 artifact 传给 publication；publication 无法 fetch 任一 locked commit、显式 owner checkout 已离开 locked HEAD，或 consumer 试图二次解析 moving tag 时 fail closed。source commit 单独变化不属于组件更新 identity；Base/App/Package 的更新判断只看 `component_id + version + content/artifact digest`。
- OPL Base 的 OCI source layer 改为 runtime allowlist archive：保留 `bin/opl`、编译后的 `dist`、Framework contracts、Python/native runtime 与 dependency manifests，排除 `src`、docs、tests 和 workflows。已发布 immutable Base version 不得换字节；runtime payload 变化必须推进 Base SemVer，`1.0.0` 以前不兼容变化推进 `minor`、兼容修复推进 `patch`。
- App 是跨仓 promotion saga 的 operator，但不获得 Framework/Packages writer 权限。App 用 request id 依次 dispatch Framework candidate 与 `latest-stable`，每阶段都必须等待有限时间、验证 exact generation/carrier digest/App version-source-artifact 三元组和匿名 readback receipt；Framework GitHub Release event 不再是 stable 第二 writer。Homebrew 与 App/WebUI latest 只能消费 stable receipt 后移动。
- Release Set publication为 Base、App、七个 Packages 与 catalog生成 SPDX SBOM、SLSA provenance和 exact-byte attestations，并向每个 OCI digest发布 referrer。receipt只在 immutable push、per-component channel readback与 attestation jobs全部成功后可被 App 视为可消费；部分失败保留 immutable bytes，后续以同 generation/digest roll-forward，不伪装成原子成功。
- Homebrew 只提供 OPL Base 的唯一 Formula `opl`。七个 Package 不创建 Formula/Cask；普通安装、更新、repair、rollback 与卸载继续统一走 `opl packages`。

### 决策：effective Stage prompt 必须绑定正文，专业顺序按依赖而不是工具剧本表达

原因：标准 Agent compiler 过去只投影 `prompt_ref`，Runway 最终交给 Codex CLI 的 prompt 也只有 Stage packet ref，无法证明 domain 主提示词正文真实进入 executor。与此同时，“executor 自主决定顺序”的旧表述没有区分专业因果、证据、authority、安全依赖与普通工具实现顺序，容易在简化 prompt 时误删领域方法。

影响：

- Pack 编译的 `prompt_refs` 同时携带 repo source ref、`domain_stage_main_prompt` layer、SHA-256、字节数和正文；Runway 从同一 manifest/prompt source 解析并注入最终 executor prompt。
- Codex runner receipt 和 command preview 回读 effective prompt 的 source、digest、size 与 hydration 状态；ref 存在或 interface ready 不再被当成正文已消费证据。
- domain stage / professional skill 可以固定专业语义、证据、authority、安全和不可逆动作依赖；Framework tool catalog 只声明 affordance，executor 在依赖图内决定工具、迭代、替代和安全并行。
- OPL terminal closeout contract 在 domain prompt 之后注入，只约束 transport shape，不覆盖 domain truth、质量或 artifact authority。

## 2026-07-11

### 决策：Headless 基座安装是独立公开合同，Homebrew 版本真相来自 Framework manifest

原因：服务器/CI 需要完整 OPL Framework runtime、provider、module、skills 与 native helpers，但不应下载、安装或打开桌面 App；Homebrew tap 也不应自行推导 Framework 版本或 source ref。

影响：

- `opl install` 与 `opl install --headless` 都进入同一个 headless base 合同；无显式 module 时不安装 Agent，只有 `--with-app` 才进入可选 GUI 安装路径。
- release/channel manifest 的 `framework_core.homebrew_formula` 固定 `package_name=opl`，并从 `framework_core.version` 与 `source_git.head_sha` 投影 immutable GitHub commit archive URL；旧 `opl-framework` / `opl-framework-shared` Formula identity 必须被 tap fail closed 拒绝。Homebrew 只承载 OPL Base；任何 Agent、capability 或 workflow package 都不得拥有 Formula/Cask。
- tap sync 下载该 immutable URL 后计算 formula sha256；Framework manifest 不伪造未下载 archive 的 hash，tap 不创建独立版本真相。

### 决策：Foundry Agent 的通用 task/artifact/helper/source 机制由 OPL 公共 runtime surface 承载

原因：RCA 等 domain repo 已各自实现 executor、run/event、Stage Folder、Python 环境和 source materialization，造成 Framework 机制重复。缺少公共 API 不是保留私有平台的理由；Framework 应先提供少数深接口，domain repo 再只保留领域 request builder、quality/readiness verdict、artifact mutation authorization、owner receipt 与 native helper body。

影响：

- `opl-framework/domain-task-runtime` 统一 run/event、executor invocation、Codex stdin/timeout/event/final-message transport 与 action dispatch；domain prompt 和输出语义仍归 domain owner。
- `opl-framework/domain-artifact-runtime` 统一 Stage Artifact Unit 字节读写和 refs-only index。
- `opl-framework/domain-helper-runtime` 只解析 OPL-managed Python 并执行 helper；domain repo 不再自行安装 uv/venv/browser runtime。
- `opl-framework/domain-source-runtime` 负责复制、哈希、索引材料以及通用 workspace Git bootstrap / gitignore merge；不解释材料语义，也不裁决 source readiness。
- 四个入口的机器边界由 `contracts/opl-framework/domain-runtime-surfaces-contract.json` 固定；它们不能生成 domain verdict、owner receipt、typed blocker 或未经 domain 授权的 artifact mutation。

### 决策：Foundry Agent 系列 policy body 只由 OPL canonical contracts 持有

原因：domain agent 为消费 series design、stage closeout、progress、typed blocker、workspace 与 public projection policy，不应复制 Framework canonical JSON body。release pin 与 domain delta 足以表达 consumer 绑定。

影响：

- `foundry-agent-series-policy` public consumer 从 `foundry-agent-series-contract.json` 与 `standard-domain-agent-skeleton-contract.json` 读取 canonical policy，并由 `opl-framework` 直接导出；consumer 返回值保留全部 no-authority flags。
- domain agent 只保留 release pin、canonical contract/export refs、identity 与 domain delta；不得再把 canonical series/public/workspace/stage policy body当成本仓 authority。

### 决策：source-only Agent Package manifest 不声明发布 payload

原因：first-party standard Agent 的 source manifest 过去为满足 schema 必填项而写入 `non_live_contract_fixture`、预设 OCI `latest` 和重复数字 SHA-256。这些值不是 release authority，也不应进入 package/channel readback。

影响：

- source-only 或尚未发布的 manifest 省略 `distribution_payload`；compiler 也不输出该 key，source/package identity、Codex carrier 和 capability dependency graph 保持有效。
- 只有存在真实发布元数据时才声明 `distribution_payload`；一旦声明，完整字段、SHA-256 格式、`candidate` / `latest-stable` channel、immutable SemVer tag、digest lock 与 proof false-claim 约束继续 fail closed。
- 带 `ordinary_user_source` 的 published registry entry 必须同时提供合法 `distribution_payload`；不能用 source-only manifest 绕过已发布安装路径的 digest/immutable-tag 校验。

### 决策：Framework surface 只保留 OPL 根 package 与内置 Python namespace

原因：第二个只镜像根包公开 subpath 的 package 会额外引入 manifest、build copy、pack/test lane 和安装叙事，却没有独立 authority 或不可替代的运行边界。

影响：

- 不创建或保留第二个静态 package、Python distribution、build copy、独立 lock、alias、tombstone 或兼容 wrapper。
- `opl-framework` 保持现有六个同名公开 exports、`opl` CLI、Temporal dependencies 与 E2B optional dependency。
- 标准 Foundry Agent 的 manifest / lock 不再声明或安装 `opl-framework`；OPL module workflow 在 agent checkout 中维护到当前 resolved OPL root 的 package link，避免复制 package 或安装第二份 Temporal tree。
- `opl packages link-framework --agent-root <repo> [--check|--dry-run] --json` 复用同一 OPL-owned link helper，同时托管 JavaScript package link 与 Python source carrier；它不创建第二个 package、publication channel 或 runtime authority。

### 决策：Stage attempt domain output 只运输 domain-owned ref

原因：domain stage 的可消费构建结果属于 domain workspace；若把结果 body 放入 Temporal activity result、workflow state 或 OPL ledger，会让 Framework 持有第二份 domain truth。只保留普通 `closeout_refs` 又无法标识哪个 ref 是 stage 的主输出。

影响：

- typed closeout 可携带 `domain_output={surface_kind,version,domain_id,output_ref}`；该 envelope 只允许这四个字段来授权 typed claim。inline payload、owner verdict 或其他未知字段不得进入 owner/quality/ready claim，但必须降级为 raw-output diagnostic继续推进。`domain_id` 冲突仍按 wrong-target identity硬停，`output_ref` 缺少 closeout binding只形成质量债。
- normalizer、Temporal compaction、ledger 与 attempt query 只保留该 refs-only envelope；operator visibility 只暴露 `domain_output_ref`，不复制或读取 output body。
- domain consumer 通过 ref 读取 domain-owned output；payload 内的 owner verdict、domain-ready 字段或 artifact 内容不改变 OPL completion boundary，也不授权 OPL 写 domain truth、owner receipt 或 quality verdict。

## 2026-07-10

### 决策：family action v2 只允许 hosted handler 或 StageRun binding

原因：`workspace_locator_fields` 只描述 workspace 定位身份，不能继续被 generated surface 暗中当成完整请求参数；私有 `source_command`、command template 与 module target 字符串会把每个 domain repo 重新变成一套命令控制面，无法由 OPL 统一校验 package currentness、schema、sandbox、StageRun、exact-byte persistence 和 refs-only Ledger。

影响：

- action catalog 固定为 `family-action-catalog.v2`，显式声明 `required_fields`、`optional_fields`、`workspace_locator_fields`、input/output schema refs，并只允许 exact `{kind:"handler_ref",handler_ref:"handler:<id>"}` 或 `{kind:"stage_binding",stage_manifest_ref:"agent/stages/manifest.json"}`。
- handler registry 固定为 closed `domain-handler-registry.v1`，entry 只保留 `handler_id` 与 TypeScript export / Python callable binding；generated CLI、MCP、Skill、product-entry、OpenAI 与 AI SDK surface 只投影同一 action metadata，不再保存私有 executable command。
- `opl agents run` 从本次静默解析的 current/LKG immutable generation 读取 schema、catalog、registry 与 stage manifest；普通用户的 source channel 是 `latest-stable`，Developer Mode 的 source channel 是可信本地 checkout。Handler input/output schema validation、sandbox、exact-byte persistence、refs-only Ledger 和 StageRun SHA-bound launch 由 OPL 统一提供；domain implementation 与 truth/quality/artifact/memory/receipt/blocker/human-gate authority仍归 domain repo。

### 决策：Profile capability planning 只组合显式 exact refs 与 owner catalogs

原因：论文/PDF 驱动 OMA 设计需要把 profile selection、现有 capability、依赖与环境动作接成一条可消费链，但 Framework 不能因此复制 OMA `ReferenceDesignPacket` ABI、维护 central specialty catalog、扫描本机 HOME/Skill cache，或用 heuristic scoring 猜测“相似能力”。现有 Connect exact resolver 已经定义 optional fail-open 与 current-owner-delta route-required hard-boundary gate，应直接复用。

影响：

- canonical 入口是 `opl profiles capability-plan --selection-file <path> [--catalog-repo <owner-repo>] [--current-owner-delta-file <path>] [--capability-ref <exact-ref>] --json`。
- selection file 必须携带 Framework-owned `profile_capability_plan_input` 固定投影；只有其中的 `exact_capability_refs`、显式 `--capability-ref` 和 current-owner-delta typed requirements 可以进入 exact resolver。Profile requirement refs不能被 heuristic 映射成 capability，OMA object 内部同名字段也不能被递归扫描。
- owner catalog 只从显式 repo读取 schema-valid `contracts/capability_map.json`；专业能力包继续由 owner repo 的标准 capability map 和 Connect package/source refs暴露，OPL 不复制 module body、legacy id catalog、固定 owner commit/fingerprint 或字段级 parity validator。Catalog content fingerprint与 catalog root identity进入 plan provenance/fingerprint。
- dependency、runtime environment、descriptor materialization、Pack lock只输出条件化 action refs；network、search、sync、install、download、cache write、preflight、materialize 和 lock write默认均不执行。
- optional exact miss继续 fail open；只有绑定 current-owner-delta 的 route-required hard-boundary miss输出 typed blocker candidate，Framework不能创建 typed blocker instance。
- capability-plan、catalog hit、resolver pass、descriptor ref或Pack lock candidate都不构成 target/domain/production readiness、owner acceptance或quality/export verdict。

## 2026-07-09

### 决策：退役 StructuredCloseoutGate，Runway 只派生 progress closeout projection

原因：OPL stage attempt 的进度曾被 structured closeout 格式、`--output-schema` 和 same-session enforcement 绑架，形成 Codex CLI 之外的第二控制面。当前边界改为：任何可读的 Codex 输出、部分草稿、负结果或实际文件都是可消费进度；OPL 持久化 raw artifact，并自动派生 refs、hash、lineage 和最小 progress envelope。格式/receipt/schema 缺口只形成质量债务。domain 内容质量、owner receipt、typed blocker、human gate、AI route-back 和不可逆权限仍由 domain/stage owner refs 表达。

影响：

- `StructuredCloseoutGate`、Codex `--output-schema` 和 same-session closeout enforcement 全部退役；它们不得作为 Runway、domain agent 或 App 的隐藏 stage 控制层重新出现。
- `Codex CLI` 的任意可读 final message、部分草稿、负结果或实际文件都构成 stage 进度。Framework 持久化 raw artifact，并派生 refs、hash、lineage、最小 progress envelope 与非阻断质量债务。
- typed JSON closeout 仍可作为高质量 refs-only 输出，但不是 transition admission 的必要输入。格式、schema、receipt、review 或 normalizer 缺口不能触发自动 repair/redrive，也不能冻结下一 stage。
- Codex 可选择顺序前进、重复当前 stage，或 route-back 到任一已声明 stage；静态 transition table 只验证目标是否属于声明图，不决定语义路线。
- 零可消费 artifact、artifact 损坏不可读、free-text、partial、negative、failed 或 no-output 都必须物化为 progress diagnostic，并允许 Codex 启动任一 declared stage。只有 executor unavailable、权限/安全/authority、wrong-target identity/currentness、不可逆 mutation 或明确 human/owner decision 才能硬停止。质量债务继续阻止 ready、accepted、publication、export 等高阶声明，但不阻止交付推进。

## 2026-07-08

### 决策：Research Frontier Board 只作为 Runway refs-only 可视化投影

原因：MAS 的 research frontier 属于 stage-local rolling board 与 research memory，候选路线、假设正文、证据正文、memory body、route decision、owner receipt、typed blocker、quality verdict、domain ready 和 artifact mutation 都归 domain owner。OPL Runway / Console 只需要把 domain 已给出的 frontier refs、status、candidate id、route family、rollback target 和 advisory reason ref 投影成 workbench 可视化概览，方便 operator 看到候选路线板，不制造第二真相源。

影响：

- stage attempt 的 `route_impact.research_frontier_board` / `opl_research_frontier_projection` / `frontier_board` / `stage_candidate_portfolio` 只作为 refs-only 输入读取；OPL 不读取或写入 memory body、hypothesis body、evidence body 或 artifact body。
- MAS 8-stage rollback target board 只作为同一 refs-only 输入的一个 board item family 读取；OPL 只投影 stage/status label、route family、rollback target ref、advisory reason ref、board ref 和 summary ref，不推断医学路线或 rollback 决策。
- `opl_research_frontier_board_projection` 的 owner 是 OPL projection owner only；所有 domain truth、memory accept/reject、owner receipt、typed blocker、quality verdict、domain ready、route decision 和 artifact mutation authority 均为 `false`。
- Workbench 只汇总 `status_counts`、`route_family_counts`、`rollback_target_refs` 和 refs-only items；这些汇总不能声明 MAS frontier accepted、paper progress、domain ready、runtime ready、publication ready 或 owner acceptance。

### 决策：Runtime workbench 默认投影按用户 Work Item 去重和命名

原因：App Runtime 页是用户和智能体协作的项目控制台，不是 provider / binding / stage-attempt 诊断面。同一 MAS workspace path 可能因为自动 push、milestone follow-through 或历史 binding 产生多个 runtime binding；这些 binding 只能作为高级证据，不能在默认范围选择或任务列表中变成“项目”。同理，MAS 论文线的 owner typed blocker 在没有自动流程运行、没有 provider failure、没有 pending terminalization 时，表示“论文线暂停，等待后续方向”，不表示 OPL Framework 或 App 故障。

影响：

- `app state` / workbench 默认任务投影以 `workspace_path + study_id` 识别用户 Work Item；同一论文来自多个 binding 时只保留一条默认行，优先真实 workspace/project binding，autopush / milestone / stage-attempt binding 进入诊断证据层。
- workspace scope 默认按真实 `workspace_path` 去重和命名；自动任务、autopush、milestone binding 不作为默认项目范围。
- `system_attention_required` 只用于真实 runtime/provider/App/Framework repair 或 latest runtime result 待 owner 收口；MAS owner typed blocker idle 默认投影为 `paused_waiting_for_direction`。
- MAS owner 已消费 route checkpoint 且没有更新的 runtime closeout pending 时，默认投影为 `delivered_auto_paused`，即使存在历史 autopush attempt failure residue。
- raw stage id、typed blocker、binding id、attempt id 和 source refs 继续保留在 drilldown/advanced evidence；默认页不把它们直接翻译成用户需要处理的项目状态。

### 决策：标准智能体 canonical id 与 repo/package carrier 名分层

原因：`opl-meta-agent`、`opl-bookforge` 这类 repo / package / plugin / carrier 名容易被误读成标准智能体 canonical id；`mas-scholar-skills` 也容易因为出现在 Foundry / package readback 中被误读成第六个 standard domain agent。当前机器读面已经把 Foundry Agent series 分成两层：standard domain agent 的 canonical ids 是 `mas`、`mag`、`rca`、`oma`、`obf`；`mas-scholar-skills` 的 membership 是 `framework_capability_package`。文档读法必须跟随这层身份边界，而不是跟随仓库名、GHCR package 名或 Codex carrier 名。

影响：

- `opl-meta-agent`、`opl-bookforge`、Codex Plugin、OPL App shortcut、GHCR package、workflow profile 和 generated surface 都只能作为 carrier / projection / distribution 名称；标准智能体身份仍分别写作 `oma`、`obf`。
- `opl agents modules`、workspace norm、conformance projection 和 generated / hosted surface 的标准智能体读回都必须输出 `mas`、`mag`、`rca`、`oma`、`obf`；`medautoscience`、`medautogrant`、`redcube`、`oplmetaagent`、`oplbookforge`、`bookforge` 只能作为输入 alias、package/module carrier 或 repo owner 名出现。
- `mas-scholar-skills` 只作为 MAS required capability package、professional Skill source 和 framework capability package 读取；它不进入 standard domain agent membership、domain-agent default-caller deletion gate 或 physical-delete 判断。
- OPL core 中的 domain-specific 名称只能作为 compatibility carrier、profile、fixture 或 refs-only evidence 出现；不得被写成 OPL canonical ontology、domain truth、quality verdict、owner receipt、typed blocker、human gate 或 artifact authority。
- `opl agents default-callers --family-defaults --json` 可以提供 no-active-caller、no-forbidden-write、tombstone/provenance 和 refs-only deletion evidence 读面，但 empty worklist / zero missing gate / closed retirement gate 不等于 physical delete ready。物理删除仍需要 domain owner 返回 `physical_delete_authorization_ref`、`keep_as_authority_adapter_ref` 或 `typed_blocker_ref`。
- 该决策只澄清身份和 owner gate，不声明 domain ready、runtime ready、App release ready、production ready 或 owner acceptance。

### 决策：OPL foundation/support Skill 增强优先改现有 AI 路由，不新增默认暴露

原因：Foundation/support Skill 的价值在于把跨 MAS / MAG / RCA / BookForge 复用的判断经验留在 AI 层，而不是把每个经验都沉淀成新 Skill、schema 或默认 Codex metadata。正确边界是：能力模块先行、暴露方式后置；模块化只在运维层固定 identity、refs、receipt、sync scope 和 fail-closed 边界，弹性判断继续留在 Skill / stage prompt。Support Skill 数量增长本身不是能力成熟证据，必须继续由 `plugins/opl-foundation-skills/exposure.json` 控制暴露范围。

影响：

- `opl-external-specialist-skill-router` 与 `opl-connect-source-and-skill-router` 继续保持 gap-gated：默认 OPL/domain pack 不足时，才对 registered external skill/source registry 做最小 `search`、`inspect` 一个候选，并只在 workspace / quest 需要时 single-skill sync。
- `K-Dense-AI/scientific-agent-skills` 等外部来源只读作 registered registry；不默认安装、不 bulk metadata、不全库同步、不写入 global/user Codex context，也不恢复 scientific-only alias router。
- Stage support Skill 吸收 MAS/MAG/RCA/BookForge 的共同失败模式，但只作为 AI review heuristics：`critique_as_repair_hint`、`source_or_receipt_stale`、`owner_route_overclaim` 和 `candidate_body_reconstruction_forbidden`。
- 这些 support Skill 只能输出 missing refs、repair hints、route-back、owner route 和 no-authority handoff；不能签 owner receipt、typed blocker、human gate、domain verdict、artifact authority、runtime/provider truth 或 readiness claim。
- 后续若 support Skill 数量需要增长，先证明现有 Skill 无法覆盖该 AI 判断，并同步 `exposure.json` 的 scope / activation gate / no-regression redirect；不得通过新增 Skill 绕开按需暴露政策。

### 决策：domain-specific active caller 继续保留，但 readback 必须 profile 化

原因：OPL 当前仍有 MAS paper route、MAS current-work-unit、MAS publication owner-answer 和 RCA visual-transition 等 active compatibility caller。直接删除这些 carrier 会破坏真实消费面；把它们继续写成 OPL core ontology 又会混淆 Framework substrate 与 domain truth。正确边界是：旧 carrier 可以留，但新增 readback / policy / tests 必须先暴露 generic `domain_route`、`domain_progress`、`domain_owner_answer_projection`、`domain_current_work_unit_projection` 和 `domain_transition_adapter_profile`，再把 MAS/RCA 名字标为 compatibility profile。

影响：

- Runway 的 MAS paper route / paper autonomy 继续可用，但 readback 增加 `domain_route_readback`、`domain_progress_policy_adapter` 和 false-ready flags；provider completion 不等于 domain progress、domain ready 或 owner receipt。
- Stagecraft owner-answer lookup 读作 generic domain owner-answer projection registry；MAS publication handoff 只是 compatibility projection。
- Stagecraft visual ingestion 读作 generic domain transition adapter profile；RCA visual transition 只是 compatibility projection / profile extension。
- Console MAS current-work-unit / runtime workbench 投影 normalize 到 generic domain profile projection；MAS source projection ref 只作为 compatibility source。
- 这些字段只证明 OPL 能消费和投影 refs；不能声明 paper progress、publication/export/grant/visual readiness、runtime readiness、owner acceptance、typed blocker 或 human gate。

## 2026-07-07

### 决策：Agent Package 抽象统一，标准 Agent 的 Codex carrier 由 repo-owned primary skill 统一物化

原因：同一个标准 OPL Agent 需要同时服务 Codex App 独立安装和 OPL App 托管管理。把两者说成两个不同智能体会制造身份割裂；让 MAS/MAG/RCA 保留旧 repo plugin installer，而让 OMA/OBF 走 OPL hardcoded generated skill，也会制造第二套物理行为。正确口径是：用户抽象统一为 `OPL Agent Package`；标准 agent 的 Codex Plugin carrier 统一由 repo-owned `agent/primary_skill/SKILL.md` materialize；OPL App 继续管理 package graph、依赖、更新、receipt、Developer Mode 和 shortcut/action refs，不把这些上层管理面写进 Codex plugin 格式。

影响：

- 用户叙事统一为“安装 / 管理 OPL Agent Package”；Codex Plugin、OPL App module、Capability Pack、MCP/Web/native surface 都只是 carrier / projection detail。
- 标准 agent 公共身份继续来自 standard agent registry 和 Foundry Agent series；plugin transport、generated surface 或 OPL App shortcut 不能成为 membership/status 轴。
- `contracts/opl-framework/foundry-agent-series-contract.json#agent_package_exposure_unification_policy` 是该规则的机器入口；`opl connect skills --json` 必须投影 `agent_package_exposure_model`。
- 标准 domain agent 的 Codex Plugin carrier 物理路径统一：domain repo 持有 rich primary skill 源 `agent/primary_skill/SKILL.md`，并持有 repo-local full-copy carrier `plugins/<plugin_name>/skills/<plugin_name>/SKILL.md`；OPL Connect 只负责校验、复制到本机 marketplace/cache 并注册 Codex config，不再拼接或生成另一份 skill body。
- OPL App 不以 Codex plugin 格式作为主接口；它使用同一 Agent Package 抽象上的 managed dependency graph、package lifecycle receipt、exposure policy、shortcut/action refs 和 Developer Mode source channel。
- App / carrier adapter 不拥有 domain workflow、prompt body、artifact schema、quality verdict、owner receipt、typed blocker、human gate 或 runtime authority。

### 决策：专业 Skill 默认按需暴露，metadata 也按暴露面治理

原因：标准 agent 和 OPL 基座都有大量专业 / support Skill。把所有本机已安装 package 的 Skill metadata 默认暴露给用户级 Codex，会污染普通任务上下文，也会让 source、安装 payload、Codex registry 和当前任务上下文四个层面混在一起。

影响：

- 专业 Skill 默认走 `source -> search/inspect -> explicit sync -> workspace_local|quest_local`；`global_user` 只允许用户显式个人安装。
- `contracts/opl-framework/foundry-agent-series-contract.json#skill_on_demand_exposure_policy` 是统一机器政策；`opl connect skills --json` 的 `professional_skill_exposure.on_demand_exposure_policy` 必须投影该政策。
- OPL foundation/support Skill 继续由 `plugins/opl-foundation-skills/exposure.json` 和 `opl connect foundation-skills inspect|sync` 管理，默认禁止 global / codex scope。
- MAS Scholar Skills 等专业能力包可以作为 `domain_profile` 或 package dependency 出现，但实际进入任务上下文仍应优先同步到 workspace / quest-local discovery 面。

## 2026-07-06

### 决策：Agent Package Manager 保留为 OPL package core，不扩成私有通用 package manager

原因：OPL App 需要管理智能体 package，且 OPL Agent Package 不等于 Codex Plugin。Codex Plugin 只是其中一种 carrier；同一个 Agent Package 还可能被 OPL App、workspace / quest Skill sync、Capability Pack、未来 MCP/Web/native surface 消费。该阶段曾把 package core 收薄在 Connect；2026-07-12 三层生命周期决策已进一步把公共入口迁至 `opl packages`，Connect 不再持有 package lifecycle namespace。

影响：

- `OPL Packages` 持有 Agent Package registry / manifest / lock / lifecycle receipt，并通过 `opl packages` 暴露公共生命周期；package core 只管理 package id、version、digest、dependency、trust tier、lock、lifecycle receipt、exposure 和 shortcut refs。
- Carrier adapters 负责 Codex Plugin、OPL App、Capability Pack、MCP/Web/native 等物理投影；adapter 不能写入 domain workflow、prompt body、artifact schema、quality verdict、owner receipt、typed blocker、human gate 或 runtime authority。
- `OPL App` 是 package cockpit 和操作入口，只消费 Framework 输出的 package refs、install/update/repair/rollback/uninstall/exposure/shortcut action refs 和 receipt refs；App 不 hard-code MAS/MAG/RCA 语义，也不成为 package truth owner。Agent Package rollback 是 `opl packages` 的闭包事务，按 last-known-good lock 恢复 package 及其 dependency/carrier，不另设 App 或 package-channel 专属 rollback lifecycle。
- Package manager 的优化遵循删除无语义 wrapper、复用标准库与既有 Framework primitive 的稳定原则；完成度只从 source、contracts、tests 与 fresh `opl packages ... --json` readback 判断，不维护静态清理快照。该原则不声明 App release-ready、domain-ready、Brand L5 或 production-ready。

### 决策：Full runtime bundle producer 由 Framework `runtime env build` 暴露，App 只消费 refs

原因：App Full release 需要可读的 runtime dependency bundle 入口，但 runtime dependency truth 不能迁入 App 仓。Framework 已有 `opl runtime env inspect|lock|build|materialize|contract` 结构，因此最小边界是在 `runtime env build` 输出中稳定暴露 bundle manifest、bundle lock、producer readback/receipt refs、layer taxonomy、target profile/platform 和 false-ready flags，而不是新增第二套平台或 App-owned dependency manifest。

影响：

- `contracts/opl-framework/runtime-environment-substrate-contract.json` 增加 `runtime_bundle_producer_policy`，固定 `opl-runtime-bundle` producer、schema/version、stable ref fields、App Full consumer boundary 与 false-ready flags。
- `opl runtime env build --domain <domain> --profile <profile> --platform <platform> --json` 继续是 dry-run projection；它可作为 App Full 的 manifest/lock/readback refs 来源，但不能声明 runtime ready、domain ready 或 App release ready。
- App Full release 只消费 Framework 输出的 `bundle_manifest`、`bundle_lock`、`producer_receipt` 和 `runtime_bundle_producer` refs；App 仍持有 release verdict，不持有 runtime dependency truth。
- 真正 materialized runtime root 仍由 `opl runtime env materialize --apply` 和 materialization receipt 证明；dry-run manifest、lock 或 cache hit 不能替代 runnable runtime artifact。

### 决策：Agent Package moving channel 收敛为 candidate 与 latest-stable

原因：普通用户需要一个稳定可解释的安装目标，release gate 又需要在提升前验证候选。裸 `latest` 把候选与稳定混为一谈，也无法阻止同一 SemVer 漂到不同 digest。每个 package 应独立晋级；Release Set catalog 只记录精确 BOM，不把所有 package 绑成同一版本或强制未变化对象重发。

影响：

- `.github/workflows/daily-package-channel.yml` 逐包比较 source/content fingerprint，只为 changed package 生成 immutable SemVer artifact 并移动 `candidate`；无变化 package 不重发。
- package gates 通过后才把同一 digest 提升为 `latest-stable`；普通安装只消费 `latest-stable`，运行中不跟随 channel 热切换。
- 内容变化未推进 owner manifest SemVer、同 canonical id/version 对应不同 digest、manifest/channel version 不一致或人工修复试图绕过这些 gate 时必须 fail closed。`latest`、`stable`、`nightly` 仅可作为历史 locator，不是当前 moving channel。

## 2026-07-05

### 决策：标准 Agent package 可声明 OPL-managed capability dependency

原因：MAS 是标准 OPL Agent package，但医学论文执行还依赖外部 `mas-scholar-skills` 能力包。该能力包不能被物理塞进 MAS 仓、也不能由 MAS 私自安装更新；同时 OPL 在管理 MAS package、Developer Mode 和 workspace / quest activation 时必须明确知道这层依赖关系。

影响：

- `contracts/opl-framework/packages/mas.json` 是 MAS first-party agent package 的依赖单源；carrier/module readback 只从该 manifest 投影 `capability_dependencies`。其中 `mas-scholar-skills` 的 `kind` 固定为 `framework_capability_package`，安装 / 更新 owner 是 `one-person-lab`，普通用户来源是 `ghcr.io/<owner>/one-person-lab-packages/mas-scholar-skills:latest-stable`。
- Codex App、headless CLI 和 Full App 都通过同一 `opl packages install mas` 语义安装 MAS；Packages 自动解析并安装 `mas-scholar-skills` required closure，不能要求用户手动补装外挂专业 Skill 库。
- MAS 与 `mas-scholar-skills` 是两个独立维护、同一闭包事务管理的 package target；provider 在未安装 MAS 时不是全局默认 package，依赖关系由 MAS manifest 声明，不由 OPL App hard-code。
- `scholarskills` package manifest 通过 `dependency_of: ["medautoscience"]` 暴露反向关系；这只表达 package 管理关系，不把 MAS Scholar Skills 变成 MAS domain module。
- Developer Mode target authority resolver 把 `mas-scholar-skills` 解析为 `framework_capability_package` target；有 repo 写权限时可直修，无权限时走 fork / PR。手动打开 Developer Mode 不能授予直接写权限。
- 论文执行的 ScholarSkills 由 MAS package closure 在 hosted action / 新 child Attempt 首次启动时自动写入 Attempt 自有的只读 `.agents/skills` generation；目标 `.codex/skills/` 只作 Codex discovery/兼容投影。旧 Connect sync 只作为迁移输入，不再是用户安装、激活或修复入口；两类投影都不写 domain truth、owner receipt、typed blocker 或 runtime queue。

## 2026-07-04

### 决策：Agent Package Registry 和第三方 manifest lifecycle 归 OPL Connect / Framework receipt 面

原因：OPL App 的专业智能体管理需要“入口可配置、package 可管理、receipt 可读”，但不能把 MAS/MAG/RCA/OMA/OBF 写成 App 固定模块，也不能把第三方 registry 变成 domain authority。Framework 因此只承接 registry URL 拉取、manifest shape 校验、显式 trust tier、package lock 和 lifecycle receipt；专业 workflow、prompt、artifact schema、quality verdict、readiness 和 owner receipt 继续归各 agent / domain owner。

影响：

- `opl packages registry refresh --registry-url <url> --json` 是 registry URL 的真实拉取与缓存入口；registry 只做 discovery，不能成为安装 authority。
- `opl packages validate-manifest (--manifest-url <url>|--registry-url <url> --package-id <id>) --json` 校验单个 OPL Agent Package manifest 并写 validation receipt，显式拒绝 `session_contract_ref`、domain workflow schema、prompt body、artifact schema、readiness/quality verdict rule 和 owner receipt authority。标准 Agent Package manifest 的机器 SSOT 留在 OPL contracts / Connect validator；OMA / new-agent generator 只能生成候选 sidecar 后调用该 CLI 校验，不能复制一套 package manifest 标准。
- `opl packages install ... --json` 在 Framework `OPL_STATE_DIR` 写 `agent-package-locks.json` 和 `agent-package-lifecycle-ledger.json`；lock/receipt 记录 package id、version/source digest、Codex visible entry、required/optional Skill refs、source kind、trust tier、dependency closure、scope receipt，以及标准 Agent 声明的 managed runtime source carrier 的 module/source/tree digest、bootstrap、health、handler probe、ownership 与 rollback ref。runtime source 是 Packages transaction participant，不形成第二个 module lifecycle。
- `opl app action execute --action install_from_manifest_url --payload <json>` 只路由到上述 Framework package lock writer；App shell 仍只展示 package / shortcut / receipt refs，不拥有 agent 语义。
- 该能力不接管 Pack OS generic capability-pack descriptor，也不替代 first-party GHCR package channel；第三方 agent package lifecycle 是 Connect 的 external descriptor / distribution surface，Pack OS 继续持有通用 capability pack descriptor / content-addressed cache / refs-only distribution lock。
- 该 landing 不声明 domain ready、publication ready、visual/export ready、App release ready、Brand L5 或 production ready；package 的 Codex/runtime-source carrier currentness 只授权 package launch gate，真实 domain 结果、App release、生产长稳和用户交付仍需要对应 owner evidence。

### 决策：Display pack 作为通用 OPL Pack resource 消费，不新增 `opl display`

原因：`medical-display-core` 是 MAS Scholar Skills 的医学科研画图资源包。它需要被 OPL 基座以通用 pack 资源 inspect/check/run/gallery，而不是把 Display 提升成 OPL Framework 顶层 domain 命令。若新增 `opl display`，会把一个医学论文专业资源误写成 OPL core 能力，也会绕开 Pack OS 已有 refs-only / false-authority 边界。

影响：

- OPL 提供 `opl pack inspect --pack <path>`、`opl pack check --pack <path>`、`opl pack run --pack <path> ...` 和 `opl pack gallery --pack <path>` 这组 generic UX，底层复用 Pack OS descriptor / validation / lock 语义。
- `opl pack run/gallery` 在 Framework 侧只生成 refs-only action/gallery plan，不执行医学 renderer，不写 artifact body，不签 owner receipt，也不声明 publication / visual export readiness。
- MAS Scholar Skills 在自己的 pack 中声明 `opl_pack.json`、templates、render modes、gallery refs 和 no-authority boundary；OPL 只消费这个 descriptor。
- 不新增 `opl display`、Display 专属 Pack OS 分支、独立 display-pack repo 或第二套 registry。

## 2026-07-03

### 决策：Standard Agent AI-first Principle Pack 由 OPL 持有通用原则，domain 持有领域映射

原因：标准 OPL Agent 需要一组跨 MAS / MAG / RCA / OMA / OBF 都适用的 AI-first 原则，用来说明 stage 内开放式判断、capability 使用、workspace/source intake、owner answer 和 forbidden authority 的默认边界。但这些原则只能固定通用组织方式，不能把医学、基金、视觉、写作或其他领域 intake 判断抽成 OPL-owned Skill；否则会把 locator / refs / read-model / contract pass 误读成 domain source truth 或质量 verdict。

影响：

- OPL 持有 Standard Agent AI-first Principle Pack 的通用层：AI-first / contract-light、stage 主提示词优先、capability_kind 管理、workspace/source intake shell、generated/hosted surface、owner-answer shape、no-second-truth 和 false-ready guard。
- 模块化只承担运维层边界：identity、capability_kind、index、refs、receipt、恢复和验证；开放判断、审计、路由、质控、route-back 与 owner-facing 解释保留在 Skill / stage prompt 层。
- Domain agent 持有领域特化层：domain intake mapping、source body / source semantics、领域路线选择、专业 Skill / knowledge / rubric、quality/export/review verdict、artifact authority、owner receipt、typed blocker 和 human gate。
- `intake` 不成为独立 OPL Skill。通用 intake 归 `OPL Workspace` / `OPL Atlas` / `OPL Stagecraft` / `OPL Runway` / `OPL Console` / `OPL Ledger` 的 locator、catalog、stage scope、attempt projection、operator drilldown 和 refs-only evidence；domain intake mapping 留在 domain stage pack、prompt、professional skill 或 domain-owned authority function。
- 品牌模块组织口径固定为协同承载：`OPL Charter` 冻结原则和 forbidden claims；`OPL Pack` 承载 declarative pack、capability ABI 和 generated/hosted surfaces；`OPL Stagecraft` 承载 stage/prompt/capability use policy；`OPL Workspace` 承载 workspace/source shell；`OPL Atlas` 承载 capability / source / tool-card catalog；`OPL Connect` 承载 connector 与 Skill/descriptor 分发；`OPL Runway`、`OPL Ledger` 和 `OPL Console` 分别承载 durable attempt、refs-only evidence 和 owner-delta-first operator projection。
- `docs/policies/standard-agent-ai-first-principles.md` 与 `contracts/opl-framework/standard-agent-principles.json` 是该原则包的人读入口和机器边界；domain 仓通过 `contracts/standard-agent-principles-adoption.json`、`agent/principles/opl-standard-agent-principles.md` 和 `agent/principles/domain-specialization.md` 声明采用与领域映射。
- 该原则包只关闭文档/合同定位缺口，不声明 standard-agent complete、domain ready、target-agent ready、Brand L5、App release ready 或 production ready；docs/read-model/test 绿只能作为结构证据输入。

### 决策：OPL Cloud 是条件产品语义，消费 Framework 模块但不重划物理源码 owner

原因：物理模块化后，Framework 已经有 `src/modules/<module_id>/`、`entrypoints/` 和 `kernel/` 三层源码组织；同时产品叙事里又出现 `OPL Cloud`、在线 `OPL Workspace`、Console、Gateway / API 和 Fabric 等用户可见或资源底座语义。如果把这些产品名反向写成源码模块 owner，会让维护者误以为 Cloud / Workspace 产品、Console 页面、Connect connector 和 Ledger evidence 是同一层事实，进而制造第二 source of truth。

影响：

- 当前必要用户工作面是 App desktop + Docker/WebUI；`OPL Cloud`、online / managed Workspace / Gateway 是长期、条件启用的产品包装，只有真实 account、storage、isolation、backend 与 owner policy 齐备时才出现，不是当前 runtime/App release gate，也不是当前十个 Framework 品牌模块之外的第 11 个源码模块。
- `src/modules/<module_id>/` 是 Framework 源码 owner；`src/entrypoints/` 只承接 CLI / product / adapter 启动面，`src/kernel/` 只承接 brand-neutral shared runtime primitive。二者都不拥有独立品牌模块或产品语义。
- 条件启用的在线 `OPL Workspace` 产品体验可以消费多个 Framework 模块；Framework `workspace` 模块只持有 workspace protocol、Project Unit、Stage Artifact Unit 和文件生命周期投影，不持有 Cloud product truth、artifact body、quality verdict 或 owner receipt。
- `OPL Connect` 是 Fabric 上可独立调用的连接 / 分发能力，不是 Console 私有后端；`OPL Console` 负责治理、投影、action catalog 和 operator 管理集成；`OPL Ledger` 只保存 refs-only evidence、receipt/blocker refs、lineage 和 provenance。
- `contracts/opl-framework/source-module-map.json` 只记录源码归属 metadata 和物理入口；更新 owner note 不改变 runtime truth、domain truth、owner receipt、typed blocker、release verdict 或 production readiness。

### 决策：标准智能体能力按 capability_kind 管理，默认内置，满足外置门才拆包

原因：MAS / MAS Scholar Skills / Connect / runtime projection 已经同时存在 stage 主提示词、专业 Skill、工具 connector、reference pack、contract module 和 runtime projection。若只用 “Skill” 统称，会让 stage policy、专业判断、资源访问、机器合同和 Codex discovery 混在一起，进而把 connector receipt、contract pass 或 refs-only projection 误读成 domain authority。

影响：

- 标准能力必须按 [OPL 标准智能体能力管理规范](./policies/standard-agent-capability-management-policy.md) 声明 `capability_kind`、`canonical_owner`、`physical_source`、`runtime_projection`、`sync_policy`、`authority_boundary` 和 `externalization_reason`。
- `capability_kind` 固定六类：`stage_prompt`、`stage_projection/runtime_projection`、`professional_skill`、`tool_connector`、`reference_pack`、`contract_module`。
- 标准 scaffold 必须生成 `contracts/capability_map.json`，作为 OMA / Foundry Kernel / Pack compiler 定位 stage prompt、professional skill、tool connector、knowledge pack、quality gate 和 eval suite 的 refs-only resolver 索引；它不是 domain truth、owner receipt、typed blocker、quality verdict 或 readiness 证据。
- `capability_map` 还必须为每个能力声明 `improvement_tokens`、`canonical_target_paths`、`verification_refs`、`forbidden_surfaces` 和 owner closeout boundary。Foundry Kernel 在协议边界内消费 OMA 的语义 refs，再由 Pack 在边界内解析单源文件与验证入口；解析失败时 fail closed 或 quarantine，不能把物理路径暴露给 OMA，也不能靠宽泛关键词猜 patch target。
- 重复 policy 可以收敛到顶层 `capability_policy_profiles`，capability 通过本地 `capability_policy_profile_ref` 引用；Framework 在 conformance 与 capability-plan 消费前展开 profile。现有 per-capability expanded fields 继续有效；profile ref 缺失或无法解析必须 fail closed，不能回退到空 authority 或宽泛默认值。
- 默认归属是内置在 domain agent；只有跨 workspace 复用、体量大、引用/模板/脚本多、独立版本维护、多个 stage 反复调用或需要 Codex 原生 discovery 时，才外置为专业 pack、reference pack 或 connector。
- Connector 只负责资源访问、source refs、invocation refs 和 receipt，不承接专业判断；contract module 只负责机器边界，不伪装成 true Skill。
- MAS stage prompt / projection 继续归 MAS；professional specialist skill 的清单与内容归 `mas-scholar-skills` 外部 package，通过 OPL Connect 从实际 `skills/*/SKILL.md` 校验并按需同步；OPL 不维护医学 Skill ID 列表、required/default profile 或内容镜像。

## 2026-07-02

### 决策：Workspace canonical profile 与 artifact lifecycle 必须保持 domain-neutral

原因：OPL 是智能体开发、运行、测试基座，不应把 `MAS portfolio`、`RCA series` 或 `BookForge memory/artifact refs` 写成 framework default。Workspace 可以提供 topology、locator、refs-only lifecycle projection、safe delete gate 和 generated reports；domain-specific project taxonomy、memory model、current artifact refs、quality verdict、owner receipt 和 typed blocker 必须由 domain/project owner 声明或签收。

影响：

- 显式 `opl workspace init|ensure --mode series|portfolio` 使用通用 `series` / `portfolio` profile，不能把 portfolio 限定为 MAS，也不能把 series 绑定到 RCA。
- `rca_series` / `mas_portfolio` 只作为 legacy/default profile alias 与 display compatibility 保留；它们不是新的 OPL canonical profile。
- `opl workspace artifact-lifecycle` 默认只生成 source、output、review-repair 和 health 的 refs-only projection；project-specific memory/current refs 由 `<project-root>/control/opl/artifact_lifecycle/artifact_lifecycle_profile.json` 显式声明。
- `opl workspace source ingest` 作为通用 source material intake：它只把用户提供的 PDF、Office、Markdown、数据文件或参考设计复制到 workspace-owned `shared/sources/source_materials/<role>/`，计算 sha256，写 `control/opl/source_materials/<sha>.json` receipt，并返回 source refs / receipt refs / stored file refs 给 Codex CLI、OMA、MAS、BookForge 等 domain stage 消费。OPL 不解析文件语义、不判断提取质量、不写 domain truth、不签 owner receipt 或 typed blocker。
- BookForge、MAS、MAG、RCA 或其他 domain 可以声明自己的 lifecycle refs，但 OPL 只检查文件 ref、hash、缺口和 no-authority guard，不解析 domain artifact body，不写 memory body，不签 owner receipt，也不宣称 publication/domain readiness。

### 决策：Runway route handoff canonical surface 是 domain route，不是 MAS paper mission truth

原因：OPL Runway 可以承载 domain stage route handoff、runtime request、attempt/queue/provider lifecycle 和 owner-route projection，但不能拥有 MAS paper progress、paper body、publication verdict、owner receipt、typed blocker 或 human gate。历史 MAS paper mission carrier 仍可作为 legacy input/output compatibility 存在；canonical 字段必须表达通用 `domain_route_*`。

影响：

- Runway route handoff readback 新增 `opl_domain_route_handoff_*`、`domain_route_*`、`canonical_task_kind`、`canonical_runtime_request_kind` 与 `canonical_dedupe_key`。
- `paper_mission/stage-route`、`mas_paper_mission_*` 等旧字段只作为 legacy compatibility/readback 保留，不能作为 OPL 新能力命名。
- Codex CLI 是唯一 stage 语义路由者；OPL 不再提供 supervisor CLI、transition packet 或 decision ledger 来替 Codex 选择下一 stage。
- Owner wait / executable owner handoff projection 使用 generic owner-route surface；MAS 继续持有 typed blocker、human gate、paper progress 和 publication authority。

### 决策：Ledger sustained-consumption canonical surface 是 owner-evidence，不是 MAG manifest truth

原因：OPL Ledger 可以保存 refs-only owner evidence / sustained-consumption receipts，支持 App/operator/default-caller followthrough 的可追踪投影；它不能声明 MAG grant ready、submission ready、grant artifact body 或 MAG owner receipt。历史 MAG sustained-consumption route 是第一个消费方，不应成为 OPL Ledger canonical ontology。

影响：

- Canonical CLI / ledger / action result 使用 `runtime owner-evidence-sustained-consumption ...` 与 `owner_evidence_sustained_consumption_*`。
- `runtime mag-manifest-sustained-consumption ...` 保留为 compatibility alias。
- Ledger payload 继续拒绝 domain body、ready claim、owner receipt、typed blocker creation 或 provider soak completion claim；允许记录 refs-only success path 或 typed blocker refs。
- App/operator projection 如仍用 MAG action kind，应只被解释为 legacy route carrier；执行结果和 ledger readback 回 generic owner-evidence surface。

### 决策：OPL foundation 外部 Skill router 是 generic specialist router，scientific 不再单独暴露

原因：外部 Skill discovery/sync 是 OPL Connect 的通用能力，不只服务医学/科研。把 router 命名和说明固定成 scientific-only，容易让非科研专业能力被误判为 MAS/science 能力，或者让 MAS Scholar Skills 被误读成 OPL core。

影响：

- `opl-external-specialist-skill-router` 是 canonical foundation Skill，用于默认 OPL/domain professional pack 覆盖不到的专业工具、source、workflow 或 method。
- 科研场景只是 `opl-external-specialist-skill-router` 的 trigger specialization，不再保留单独 compatibility alias，避免多一个 Codex metadata entry。
- 默认路径是对 registered external skill/source registry 做最小 `search`，再 `inspect` 一个候选；只有 workspace/quest 需要时才 single-skill sync，不 bulk sync、不安装全库、不新增 scientific/MAS-only alias Skill。
- router 只返回 selected external Skill refs、inspect evidence、sync receipt candidate 和 owner route；不签 owner receipt、typed blocker、domain verdict、artifact authority、runtime truth 或 readiness claim。

### 决策：标准 OPL Agent 用 Stage 主提示词承载阶段策略，不把 stage 定义成专业 Skill

原因：MAS 的历史实现把部分 stage 主提示词物化成 `.codex/skills/medical-research-*`，容易让人误以为 OPL 标准智能体需要一类独立的 stage 专用 Skill。RCA 和 BookForge 的实际形态更接近标准：`agent/stages/` 定义阶段目标、输入输出、owner boundary、quality gate 与 route-back，`agent/prompts/` 承载 stage 执行主提示词，`agent/skills/` 或外部 specialist pack 承载专业方法。这个模型更符合 AI-first：stage 只说明“这一阶段怎么推进和守边界”，专业 Skill、工具、知识库和 connector 负责“具体专业任务怎么做好”。

影响：

- 标准 OPL Agent 的 canonical stage source 是 domain repo 内的 `agent/stages/` + `agent/prompts/`；Codex Skill、App action、CLI action、MCP descriptor 或 hosted runner input 都是可生成 / 可投影的消费面，不是 stage 的唯一源头。
- MAS 当前保留 overlay template 生成 `.codex/skills/medical-research-write|review|figure` 的兼容物理形态，但文档和规划按 stage 主提示词读取：它们负责阶段进入、证据门槛、route-back、owner gate、handoff 和可用 specialist/tool refs，不负责维护医学写作、审稿或图件设计的专业 playbook。
- Professional specialist skill 默认放在 domain agent repo 的 `agent/skills/`；体量大、依赖重、跨 workspace 复用、独立发布或需要单源维护时，拆到专业 pack repo。MAS 的 `medical-manuscript-writing`、`medical-manuscript-review`、`medical-figure-design`、`medical-figure-style`、`medical-figure-composer`、`medical-research-lit`、`medical-statistical-review`、`medical-table-design`、`medical-submission-prep` 和 `medical-data-governance` 因为医学论文专业面重，由 `mas-scholar-skills` 维护并通过 OPL Connect 同步；其中 `medical-figure-style` / `medical-figure-composer` 是 Display 子 Skill，不新增 active module。
- 工具和外部资源接入进入 OPL Connect / Fabric：PubMed、数据库、HPC、渲染器、存储和软件环境返回 source refs、invocation refs、receipt candidates 和 no-authority boundary；它们不决定 domain truth、质量 verdict 或 owner acceptance。
- 临床队列数据治理使用 OPL 的 workspace/source locator、index、lifecycle projection、receipt/ref transport 和 memory/artifact lifecycle guard；临床数据 body、语义映射、source readiness verdict、数据清洗/归一化接受、不可逆 data mutation、owner receipt、typed blocker 和 publication readiness 仍归 MAS 或下游 domain owner。
- 默认防止策略固定为三段：stage 主提示词不得冒充专业技能或 domain verdict；professional specialist skill 不得签 owner receipt、typed blocker、human gate、publication readiness 或 artifact authority；tool/connector 不得把 transport/read receipt 升级成领域判断。
- 后续改造优先更新 domain stage pack、prompt、professional skill、knowledge/rubric refs 和独立 reviewer gate；不得把开放式专家判断下沉成脚本流程，也不得为了统一把所有 stage 强制物化为 Codex Skill。

### 决策：科学文献 connector profile 进入 OPL Connect，MAS 保留科研判断与论文权威

原因：OPL Connect 只保留 provider-neutral 的只读 transport、receipt、cache/retry 与 source-ref normalization；具体 provider 的请求协议属于 transport adapter，不应留在 MAS 私有 runtime。Crossref / OpenAlex 作为通用 metadata、coverage 与 citation graph search provider；PubMed ESearch + ESummary 与 Europe PMC search 作为生物医学发现入口，并继续为已知引用提供 metadata / full-text availability 校验。MAS 与 MAS Scholar Skills 继续承接医学 query strategy、结果取舍、证据判断和论文权威。

影响：

- `opl connect scientific search --provider crossref|openalex|pubmed|pmc --query <query> --limit <n> --json` 是 optional scientific connector profile 的统一 read-only search 入口，返回 normalized source refs、PMID / PMCID / DOI、article types、检索计数核对、source URLs、connector invocation ref、ledger receipt candidate ref 和 no-authority boundary。
- `opl connect references verify` 持有 PubMed / PMC provider invocation、限流重试、cache、identifier / metadata normalization 和 receipt candidate；不恢复 `opl connect pubmed` compatibility command，也不把 provider metadata 当成医学判断。
- 这些 connector 只调用 provider API 和输出 refs/metadata，不保存全文、不创建 OPL 文献库、不写 MAS paper truth、不签 owner receipt、不创建 typed blocker / human gate，也不声明引用质量、论文进度、publication-ready、domain-ready 或 production-ready。
- MAS `scout`、`write`、`review`、`figure` 等 stage 主提示词可以优先调用 PubMed refs，并在 metadata、coverage 或 citation graph 缺口时消费 Crossref/OpenAlex fallback refs；医学取舍、证据链、claim-evidence map、review ledger、写作质量和 owner route 仍归 MAS。
- MAS Scholar Skills 仍可提供医学文献检索 playbook、query 设计、筛选策略和专门 Skill；MAS 只消费 OPL Connect receipt，并承担医学 source-ref 解释、证据取舍与 publication authority，不再维护私有 provider 网络、重试或 cache 控制面。
- `OPL Fabric` 是通用资源底座，`OPL Connect` 是其中可独立调用的连接能力；Console 可治理和展示 connector 策略，但不是 Connect 的唯一入口。本机 OPL App、在线 Workspace、CLI 和 domain agent 都可以按权限与 profile 直接调用 Connect。

### 决策：引用 metadata 校验进入 OPL Connect provider receipt 面

原因：医学论文写作和审阅需要稳定的 DOI / PMID / title metadata 交叉核对，但“引用是否支撑论点”“是否可纳入论文证据链”仍是 MAS / domain owner 的科研判断。OPL Connect 因此只提供 provider receipt candidate、cache metadata 和 retry evidence，让 MAS、Workspace 或本机 CLI 可以复用同一条只读校验链路。

影响：

- `opl connect references verify --references-file <json> --providers crossref,openalex,pubmed,pmc,semantic-scholar,crossmark,publisher --cache-root <path> --max-retries <n> --json` 是引用 metadata provider receipt 的稳定入口。
- 当前已执行 provider 是 Crossref、OpenAlex、PubMed、PMC、Semantic Scholar、Crossmark 和 Publisher。PubMed 读取 NCBI ESummary；PMC 读取 Europe PMC core metadata，并在 provider 声明全文可用且存在 PMCID 时探测 `fullTextXML`。Publisher 只做 DOI resolver landing page metadata lookup。
- `full_text_available` 只表示 provider metadata 声明存在全文；只有实际返回可解析 article XML 才能写 `full_text_body_verified=true`。两者都不等于引用质量、claim support 或 publication truth。
- 输出包含 provider evidence、provider receipt candidate refs、cache hit/miss/write 状态、retry attempts 和 no-authority boundary。
- 该 connector 不写 MAS paper truth、不签 owner receipt、不创建 typed blocker / human gate，不声明 reference truth、citation quality、claim-evidence correctness、publication-ready、domain-ready 或 production-ready。

### 决策：外部科学 Skill 库通过 OPL Connect 可发现和选择性同步，MAS 不全量装载

原因：`K-Dense-AI/scientific-agent-skills` 这类大型 Agent Skills 库对 MAS 有参考价值，也能覆盖罕见专科任务。但全量安装会扩大上下文、混淆 `mas-scholar-skills` package owner 声明的专业能力边界，并把外部库误读成 MAS 权威。OPL Connect 应承接 source registry、manifest index、search/inspect 和 selective sync，MAS 仍决定何时请求外部能力以及是否采纳候选结果。

影响：

- `opl connect external-skills sources add|list|search|inspect|sync --json` 成为外部科学 Skill 库的通用登记、发现和选择性同步面。
- 当前支持的外部 source 是 `kdense-scientific-agent-skills`。Source registry 记录 repo、pin 和可选本地 checkout 路径；本地路径也可以通过 `--source-root` 或 `OPL_CONNECT_KDENSE_SCIENTIFIC_AGENT_SKILLS_ROOT` 提供。缺少本地 source 时，OPL Connect 按登记的 repo/ref 自动 materialize tarball 到 OPL state cache，再从 cache 读取 `skills/`。
- 默认策略是 `selective_sync_only`：只把一个被选中的 skill 同步到 workspace/quest 的 `.codex/skills/<skill-id>/`，并生成 `.opl-install-receipt.json`。
- 触发方式必须明确：用户显式命名工具/数据库/工作流、MAS 核心专业 Skill route-back、stage prompt 判断默认八技不能覆盖，或任务需要联网、云计算、敏感数据与环境策略。
- OPL Connect 只负责发现、读取、同步和 receipt；不写 MAS paper truth、不签 owner receipt、不创建 typed blocker / human gate，也不声明 domain-ready、publication-ready 或 production-ready。

### 决策：用户反馈通过新的 improve FoundryRun 进入自进化闭环

原因：用户对标准 OPL Agent 的交付提出明确建议时，反馈不能只靠前台临时修，也不能绕过版本、评测与回滚直接修改 active bytes。统一做法是把反馈保存为 source/evidence refs，绑定 exact active version，并创建新的 `mode=improve` FoundryRun。

影响：

- feedback intake 只负责保留反馈内容、target identity、source refs 与幂等键；它不直接修改 Agent，也不生成第二套运行状态。
- OPL 将反馈、当前版本 digest、验收条件与约束组装为 `DesignRequest`，启动 FoundryRun，并用同一冻结测试计划比较 baseline 与 candidate。
- OMA 的 `design|diagnose` operation 只消费 `DesignRequest` 或 `EvidenceBundle`，只返回 `AgentBlueprint` / `EvalSpec` 或 `EvolutionProposal`；它看不到保护测试正文，也不返回文件 patch 或执行指令。
- Foundry Kernel 负责确定性物化、独立评测、generation budget、风险重算、Owner gate、canary、CAS activation 与 rollback。App/Console 只投影同一 Run、版本和 Owner wait，不维护另一份自进化状态。
- MAS、MAG、RCA、OBF 及其他 target owner 继续持有 domain truth、保护测试、artifact body、quality/export verdict、权限授权与生产采用决定。

### 决策：Python family-runtime transport 统一归 OPL Runway

- Python domain consumer 统一通过 `opl_framework.family_runtime_client` submit/query Temporal stage attempt；bin resolution、subprocess lifecycle、timeout 和 canonical JSON envelope validation 归 OPL Runway，domain repo 不再保留自己的 OPL CLI transport wrapper。
- StageRun transport receipt 只证明请求被可靠执行和回读；它不等于 Foundry qualification、AgentVersion、Owner acceptance、domain ready 或 production ready。

## 2026-07-01

### 决策：Linux/Docker WebUI 的 OPL 本体更新走 runtime_substrate Framework artifact，不更新 Docker image

原因：Docker WebUI 内部运行的 OPL 本体本质上是 Linux runtime root，普通用户需要的是在 WebUI/CLI 里更新 OPL Framework runtime，而不是让容器内进程控制宿主 Docker daemon 去拉取和替换镜像。Docker image、entrypoint、base OS、compose 和端口/volume 映射仍是 Installation Carrier；容器内 `opl update apply --json` 只能维护挂载数据卷中的 OPL Runtime Fabric。

影响：

- Docker/WebUI 和裸 Linux 共用 `runtime_substrate` 更新语义；`opl update apply --json` 通过 Framework artifact channel 下载、校验、stage、依赖安装、激活 OPL Framework runtime，并写 `.opl-framework-source.json` metadata。
- Docker/WebUI 默认 target root 是 `${OPL_DATA_DIR}/opl/framework` 或 `${AIONUI_DATA_DIR}/opl/framework`，即通常的 `/data/opl/framework`。这让 OPL 本体更新留在 mounted data volume 中，避免写回 image seed，也避免旧 image seed 在后续启动时覆盖 newer managed root。
- 首次 artifact apply 可以从当前 image seed / project root 生成 `/data/opl/framework.previous` 作为 rollback root；后续 apply 用 previous/current pointer 语义回滚。
- Framework artifact staging 允许跨文件系统：临时目录可能在 `/tmp`，目标可能在 Docker Desktop bind mount `/data`。实现必须先把 stage materialize 到 target parent 下的 incoming root，再在同一文件系统内切换 current/previous，避免 `EXDEV` 跨设备 rename 失败。
- `opl system startup-maintenance` 的普通后台启动不得无条件消费 Framework channel；只有 runtime_substrate scope / managed-update apply 这类显式运行时维护路径才执行 OPL 本体 artifact apply。
- 该能力不授权容器内 Docker socket、Watchtower、compose 操作或 host executor。Docker/WebUI image refresh 仍由 App/installer 的 host-side Installation Carrier route 处理，并必须证明 data/projects volume preservation。
- 该能力只证明 OPL Framework runtime update/rollback 机制；不单独声明 GHCR channel latest/current、Docker image release-ready、App release-ready、domain module ready 或 family production-ready。release/currentness 必须另有 channel artifact readback、checksum、same-cohort image/manifest 和 owner gate。

### 决策：OPL family 语言选型按 owner boundary 克制分工，不把 Rust 扩成核心语言

原因：OPL family 已经形成清楚的 owner 分层：Framework / App / generated surface / runtime control plane 需要稳定的 CLI、JSON readback、contract 消费和 Codex / Electron / Node 生态；MAS/MAG/RCA/BookForge 等 domain agent 需要科学计算、文档、PDF/Office、统计、ML 和 domain-native helper 生态；native helper / state index / sysprobe 则需要少量跨平台系统能力。成熟的 polyglot 口径不是增加语言数量，而是在问题边界确实不同且收益能抵消认知成本时才引入第二语言。因此 family 默认保持 TypeScript / Node 优先，Python 用于科学 / 文档 / native helper execution，Rust 只用于系统边界和 hot path native helper。

影响：

- `TypeScript / Node` 是 OPL Framework 控制面、App / shell UI、CLI、JSON readback、contracts 消费、安装 / 更新编排、Codex surface、manifest / receipt / owner-route 编排和 domain orchestration 的默认语言。
- `Python` 继续服务 MAS / MAG 这类科学与文档主仓，以及 RCA / BookForge 的 Office/PPT/PDF、截图 / 导出、统计 / ML、数据分析和 domain-native helper。Python helper 必须挂在 domain route、proof lane、contract、owner receipt / typed blocker 或 refs-only output 边界下，不能绕过 domain truth 或替代 AI-first quality verdict。
- `Rust` 只作为 OPL-owned native helper / state-index / sysprobe / watcher / file scan / cross-platform native boundary 的实现语言；它可以加速系统探测、artifact discovery、session / progress / artifact projection，但不得持有 OPL core orchestration、domain truth、owner receipt、typed blocker、quality verdict 或 runtime authority。
- 标准 Agent 的 language / implementation contract 进一步收敛为 `contracts/opl-framework/standard-agent-implementation-profile.schema.json`：`implementation_profile` 只声明 declarative Markdown/JSON identity、可替换 helper（`authority_function`、`domain_helper`、`native_helper`）和 OPL generated-surface owner；helper language 不是 Agent kind，domain profile 显式拒绝 Rust，Rust 只可落在 OPL Framework hot path。该 profile 不复制 generic runtime / CLI / workbench ownership，也不把 OBF reference implementation 升格为标准 owner。
- App GUI 当前继续以 Electron / Node / TypeScript 为主；除非 native reliability / security / performance 边界有明确收益，不因为 Tauri/Rust 模式本身而迁移 GUI shell。
- 跨语言 shared surface 必须尽量从 machine-readable contract / schema / generated projection 派生；TS helper 与 Python mirror 可以存在，但不得继续复制 domain semantics 或形成两套 source of truth。
- 该决策不要求任何仓库迁移语言，不声明 release/currentness/readiness，也不新增 contract surface；后续新增语言或扩大 Rust/Python/TS 边界时，必须说明 owner、machine boundary、active caller、验证口径和不能用现有语言解决的理由。

## 2026-06-28

### 决策：Standard Agent 每次新执行静默解析 latest/LKG，单个 Attempt 内不热换

原因：Standard Agent 在 OPL 基座运行时，每个 hosted action 和每个新 child Attempt 应自动使用 source channel 中最新可运行的 Agent + 完整 Skill；普通用户从 `latest-stable` 获取，开发者从可信本地 checkout 获取。Release Set、digest 与 receipt 负责验证新发布候选和记录 provenance，不应把后来漂移升级成执行拒绝。为避免一次执行中途换指令，每个 Attempt 仍绑定一个不可变 generation；刷新失败只是不采用坏的新 generation，并自动使用 LKG。

影响：

- 普通用户以 `latest-stable` 选择更新渠道；Developer Mode 以可信本地 checkout 作为更新渠道。每个 hosted action 和每个新 child Attempt 静默解析 latest runnable generation，新 candidate 的 ABI/payload/digest admission 失败时保留并使用 LKG。
- package id 是运行身份；Git SHA、version、lock ref、manifest/content/dependency digest、receipt 与 currentness 是可空 provenance。它们存在时必须格式正确，但缺失或与当前 source 漂移本身不改变 `launch_allowed`，也不产生 repair/reload attention。
- dirty/ahead/diverged 开发 checkout 不被 OPL 覆盖；OPL 从当时可读 bytes 创建新的不可变 developer generation。一个 Attempt 一旦绑定 generation，重试复用同一 binding；下一新 Attempt 才重新解析 latest/LKG。
- 只有 current/LKG 均不可运行、必需 ABI/export/module/Skill 缺失、路径/权限/安全失败或 health/handler probe 真失败才 fail closed。package 更新不使既有论文、图表、artifact 或历史证据失效；该 gate 也不写 domain truth、不签 owner receipt、不创建 typed blocker / human gate、不声明 domain/runtime/quality/export/publication/production ready。

### 决策：标准 Agent 不默认暴露 standalone MCP，MCP 由 OPL Connect 统一精选投影

原因：Codex App 里只有 MAS 出现 MCP 的直接原因是 MAS plugin manifest 曾携带 `mcpServers`，把 MAS 作为独立 plugin MCP 暴露；这会让标准 OPL Agent 的 public surface 因 transport 细节分裂。进一步看，成熟 MCP 工程经验也不支持把完整 CLI 平铺成 MCP 工具：MCP 官方 client best practices、GitHub MCP server、Stripe MCP 和 Speakeasy dynamic toolsets 都把大 surface 通过 progressive discovery、toolsets、search/details/read/write、read-only / exclude / human confirmation 和 lazy schema 控制上下文和权限。OPL 因此选择统一策略：插件/Skill 是当前 Codex App 可见主面，MCP 是 OPL Connect 持有的精选 agent-facing descriptor / invocation surface。首个统一 server 已在只读 scientific / references toolset 完成 stdio 协议验证；其他 toolset 和任何 mutation 仍须单独准入。

影响：

- `contracts/opl-framework/foundry-agent-series-contract.json#/skill_mcp_surface_policy` 固定 `standard_agent_standalone_mcp_default_enabled=false`、`standard_agent_plugin_manifest_must_not_expose_mcp_servers=true`、`opl_unified_mcp_projection_owner=one-person-lab`、`unified_mcp_server_ready=true`、`unified_mcp_server_id=opl-connect` 与 `unified_mcp_server_command=[opl,connect,mcp-stdio]`。
- CLI/MCP 关系固定为：CLI 是 authoritative broad operator / control / debug / admin surface；MCP 是 curated agent-facing discovery / invocation surface；`all_cli_commands_are_mcp_tools=false`，不得默认 mirror 全量 CLI。
- `opl connect skills --json` / `opl connect sync-skills --json` 对所有标准 agent 投影同一 `mcp_projection`；`opl connect sync-skills` 还会在 Codex config 注册 `[mcp_servers.opl-connect]`，并清理旧 MAS/MAG/RCA/OMA/OBF standalone MCP 表。
- MAS/MAG/RCA/OMA/OBF plugin manifest 不得用 `mcpServers` 暴露 standalone server；repo-local MCP server 只可作为 direct protocol adapter、domain handler target、proof lane、fixture 或 migration/provenance 保留。
- 当前 `opl-connect` 只暴露 `opl_connect_search_tools`、`opl_connect_describe_tool`、`opl_connect_execute_tool` 三个 meta-tools，内部仅有 `scientific_search` 与 `references_verify` 两个只读工具；它们复用 OPL Connect 的权威实现，不复制 provider client。后续 toolset 仍必须按 progressive discovery / descriptor-first lazy schema / read-only default / explicit mutation gate 设计；mutation tool 不得绕过 domain owner receipt、typed blocker、human gate、quality/export verdict、artifact authority 或 release verdict。

## 2026-07-07

### 决策：外部 specialist skill 只通过 OPL Connect 注册源按需 search / inspect / 单 skill sync

原因：专业 skill 要提高 OPL / domain agent 的上限，但外部库和小类目 skill 不能默认暴露到用户本机 Codex 上下文，也不能要求普通用户知道某个 GitHub repo、手动下载并注册。`K-Dense-AI/scientific-agent-skills` 等高质量来源应读作 OPL Connect 的 registered external skill/source registry，而不是默认安装包、默认 Codex metadata、或一组全量可见 skill。

影响：

- `opl-external-specialist-skill-router` 保持单一 workspace-local 路由 skill：默认包不足时先用 OPL Connect registered registry 执行最小 query 的 `external-skills search`，再 `inspect` 一个候选；只有当前 workspace / quest 真需要时才 sync 一个选中的 skill。
- 外部 registry approval 只授权 targeted search / inspect / optional single-skill sync；不 bulk-sync source，不安装全库，不把 source catalog 全量塞进 Codex context，也不新增 scientific alias router。
- router 输出必须包含 `default_pack_gap`、`search_query`、`inspected_candidate`、`sync_decision`、`support_map`、`route_recommendation` 和 refs-only owner handoff；这些都不是 owner receipt、typed blocker、domain verdict、runtime/provider truth 或 readiness claim。
- 物理组织原则是能力模块先行、暴露方式后置：外部专业能力可以来自第三方 registry，但暴露层级必须由 `exposure.json` 和 Connect sync scope 控制在 workspace / quest，而不是污染 default global Codex surface。

## 2026-06-27

### 决策：framework capability package 复用 GHCR capability packages channel，不新增专属 source manager

原因：`MAS Scholar Skills` 是外部仓持有内容真相的 professional capability package；OPL 只负责通用 package 校验、安装、更新、回滚、workspace / quest 同步和 provenance receipt。它不能在 OPL 内复制医学 catalog、validator、artifact engine、profile 或 plugin mirror，也不能新建专属 git clone / pull / path manager。

影响：

- `MAS Scholar Skills` 作为 `framework_capability_package` 纳入统一 OPL Packages 对象模型，唯一 OCI 是 `ghcr.io/<owner>/one-person-lab-packages/mas-scholar-skills`。普通 App 只从 MAS package row/launch 自动管理该依赖，不提供 ScholarSkills 专属安装入口或 git clone / pull manager。
- `.github/workflows/daily-package-channel.yml` 继续通过 `packages.yml` 执行 changed-package-only 发布与 SemVer/digest gate；新增 capability package 必须复用 `candidate` -> `latest-stable` 晋级，不新建 daily job、source manager 或 OCI namespace。
- `opl packages list/update/repair --json` 与 `opl system startup-maintenance --json` 把 MAS Scholar Skills 作为 MAS required dependency 处理；普通 channel 与 Developer Mode/显式本地 source 都由下一 hosted action/new Attempt 静默解析成 immutable generation。dirty checkout 只作 provenance，不被 OPL 覆盖，也不触发 manual-required；真实必需 Skill/ABI/probe 失败且无 LKG 才阻断。
- 论文工作目录的 Codex discovery 兼容投影由 `opl packages` transaction 持有，落点仍是目标 workspace / quest 的 `.codex/skills/`；真正执行的完整 35 Skills 则来自 hosted action / 新 child Attempt 解析并绑定的只读 `.agents/skills` generation。Developer Mode 从可信本地 checkout 获取当前 bytes，普通用户从正式 channel 获取；新 generation 校验失败自动使用 LKG。11 core + 10 modules 只作 readiness floor；ScholarSkills 不进入系统全局默认 package，也不由 MAS 程序仓维护 mirror。
- 新增 framework capability package 的统一步骤是：声明通用 module/package spec、archive / manifest / checksum、release discipline gate、managed update/startup/workspace sync 测试和人读 owner route；专业 skill IDs、schema 与内容合同留在 package owner 仓，不复制进 OPL contract catalog。
- 该决策不改变 domain authority。MAS Scholar Skills package channel readiness 不授权 MAS/MAG/RCA/OMA/OBF domain truth、quality verdict、artifact authority、owner receipt、typed blocker、runtime queue 或 publication/export readiness。

## 2026-06-25

### 决策：typed closeout ref ingestion 必须接受 refs-only object refs

原因：MAS `paper_mission/stage-route` live session 可以产出合法 typed closeout packet，其中 `closeout_refs` 是 refs-only object array，例如 `{ref_kind, uri, sha256, size_bytes}`。旧 OPL parser / Temporal compaction 只读取字符串和 `ref` 字段，导致 task-complete session 里已有 closeout-like JSON，却被恢复成 `session_found_without_closeout`，再在 Temporal closeout path 投影为 `typed_closeout_packet_required`。这不是 MAS 论文产物缺失，而是 OPL transport/parser 合同不完整。

当前替代关系：该记录只解释历史 parser 缺陷。普通 progression 已改为 raw/readable artifact projection，typed closeout packet 不再是 stage transition 前置条件；缺 packet 只能形成 provenance/quality debt，不能否定已有 artifact 或阻止 Codex 选择下一 declared stage。

影响：

- `normalizeTypedStageCloseoutPacket` 是 OPL typed closeout ref ingestion 的单一规范化入口；`closeout_refs[]` 支持字符串、`ref` object 和 `uri` object，但仍要求 supported `surface_kind` 和至少一个 closeout ref，不能把任意 JSON 当作 closeout。
- `closeout_refs` 继续保持 string-list index / ledger / query 合同；object-shaped refs 的 refs-only 元数据保留在 `closeout_ref_metadata[]`，只允许非空字符串 `ref_kind`、`kind`、`uri`、`sha256`、`ref` 与有限非负数 `size_bytes`。未知字段、嵌套对象/数组或错误类型不得进入 typed claim metadata；原始输出仍进入 diagnostic artifact与质量债。
- Temporal activity completion compaction 必须复用同一 normalization，再裁剪大字段；不得维护第二套只接受 string-list 的 closeout parser。
- Codex session recovery 的 `task_complete.last_agent_message`、Temporal activity result 和 downstream terminal observation 使用同一宽容消费合同：合法 refs-only object refs恢复为typed metadata，unsupported shape保留为raw diagnostic，不能成为缺typed closeout blocker。
- 该修复只关闭 OPL runtime closeout transport/currentness 断点；不授权 OPL 写 MAS owner receipt、typed blocker authority file、human gate、publication eval、controller decision、current package、paper body，也不声明 paper progress、domain-ready、publication-ready、runtime-ready 或 production-ready。

## 2026-06-23

### 决策：MAS paper-progress SSOT 留在 MAS PaperMissionRun


影响：

- OPL 文档只维护 Framework runtime、Runway StageRun、Temporal-backed stage attempt、SQLite sidecar projection/readback index、`current_owner_delta`、generated/hosted descriptors、App/workbench projection、refs-only evidence 和 shared primitive 的 SSOT。
- MAS 文档和 MAS repo-owned contracts/source/CLI 继续维护 `PaperMissionRun`、legacy truth import pack、mission input / decision constraint、publication quality、AI reviewer / auditor verdict、publication gate、artifact/current package authority、owner receipt、typed blocker、human gate、evidence/review ledger 和 paper mission consume verdict。
- OPL 可以消费 MAS `paper_mission/start_or_resume` refs、承载 hosted attempt、记录 provider observation、投影 next owner、运输 owner answer refs 或把合法 owner answer 折回 `current_owner_delta`；OPL 不能签 MAS owner receipt、创建 MAS typed blocker、写 MAS publication eval / controller decision / current package / paper body，也不能授权 MAS publication-ready、paper-progress、domain-ready 或 production-ready。
- 品牌模块归位：`OPL Charter` 固定 no-second-truth 边界；`OPL Runway` 承载 runtime envelope；`OPL Pack` / `OPL Connect` 承载 generated/hosted descriptors；`OPL Console` 投影 `current_owner_delta` 和 mission refs；`OPL Ledger` 仅保存 refs-only evidence。
- 旧 DHD、owner-route、default-executor dispatch、PaperRecovery 或 MAS legacy blocker 在 OPL 文档中只能出现为 diagnostic、migration、provenance、ABI carrier 或 non-degradation evidence，不得作为普通用户默认 paper mission route。

后续决策：

- 2026-07-08：MAS 默认 `paper_mission_default_tasks[].payload.paper_mission` 中的 `paper_mission_materialized_readback`，以及旧 consumption ledger 的显式 `opl_route_handoff`，不再进入 OPL 本地 intake/enqueue/tick 队列。OPL 只把它们作为 Temporal stage attempt request refs、outbox/projection evidence 或 owner handoff refs 读取；真正执行必须由 Temporal external history、worker liveness、owner receipt 或 typed blocker 证明。
- `stop_with_typed_blocker`、`wait_for_human` 和 `complete_mission` 不进入 OPL runtime queue；它们保持 owner wait / terminal no-runtime，避免 OPL 越权创建 MAS typed blocker、human gate、owner receipt 或 publication verdict。
- 任何 `paper_mission/stage-route` readback 都必须保持 `writes_opl_stage_run=false`、`writes_provider_attempt=false`、`can_claim_stage_run_created=false`、`can_claim_provider_running=false`、`can_claim_paper_progress=false` 和 `can_claim_runtime_ready=false`，直到 Temporal provider start / terminal history 或 domain owner surface 给出对应证据。SQLite sidecar 只能物化 OPL `stage_attempts` / readback projection，不能作为 provider、queue truth、scheduler、tick、redrive 或 intake 成功机制。任何这些 readback 都不授权 MAS owner receipt、typed blocker、human gate、paper artifact delta、publication gate、paper-progress、domain-ready 或 production-ready claim。
- `paper_mission/stage-route` 不走 MAS domain-handler fallback，也不派生 `domain_owner/default-executor-dispatch`；OPL 只消费 MAS 已 materialized 的 terminal decision / route command 作为 runtime request，不能重新解释医学质量或论文阶段完成。
- 当 MAS export 已存在 `paper_mission_default_tasks`，旧 current-control transition carrier 只保留为 diagnostic / migration input，不再作为默认 `domain_owner/default-executor-dispatch` 派生源；OPL readback 用 `paper_mission_current_control_suppressed_count` 记录该 suppression，避免 PaperMission terminal decision 与旧 dispatch path 双重消费。
- 同一 route identity 的旧 `paper_mission/stage-route` projection 若仍由 OPL repo workspace locator 占用，而 fresh MAS handoff 已携带明确 domain workspace root，则 OPL 必须把旧 active StageAttempt 标记为 `paper_mission_stage_route_stale_workspace_superseded_by_domain_workspace_handoff` 并等待 Temporal / owner handoff 重新 admission；这只关闭 OPL attempt projection currentness 缺口，不写 MAS truth、不启动 provider、不签 owner receipt、不创建 typed blocker / human gate，也不声明 paper progress、runtime-ready、domain-ready 或 production-ready。
- 2026-07-08 terminal progress projection，2026-07-12 修订：domain-route provider attempt 进入 terminal status 后，OPL 只同步 transport readback。可消费 closeout/raw artifact、阴性/零结果或 no-output diagnostic都投影为progress，并明确`next_stage_may_start=true`；typed closeout不是progression前提。只有executor不可用、真实authority/safety/identity/currentness、不可逆动作授权或human decision保留attempt-bound blocker。OPL不生成semantic transition、不选择successor，也不写domain owner answer；后续stage由Codex CLI根据artifact与领域语义选择。
- 2026-06-29 NextAction identity follow-through：当 MAS route handoff 或 provider attempt 同时携带 request / NextAction idempotency 和 attempt idempotency 时，OPL `stage_run_currentness_identity.idempotency_key` 必须优先绑定 request / NextAction identity；`attempt_idempotency_key` 只保留为具体 StageAttempt / provider attempt 身份。OPL 不能把 attempt id 当成 MAS next-action request identity，也不能用 attempt terminal / queue terminal 重新判断 MAS stage 是否完成。

## 2026-06-20

### 决策：OKF 只作为 OPL context bundle / interchange layer

原因：Google Cloud `Open Knowledge Format` v0.1（blog 发布于 2026-06-12；`GoogleCloudPlatform/knowledge-catalog` main 观察 commit `d44368c15e38e7c92481c5992e4f9b5b421a801d`）把知识表达成 Markdown 文件目录、YAML frontmatter、`index.md` / `log.md` reserved files、crosslinks 和宽容消费模型。这个形态很适合 OPL 的 AI-native context 传递，但 OKF 本身明确是 format / interchange pattern，不是 runtime、registry、SDK、scheduler、quality gate 或 authority plane。

影响：

- `contracts/opl-framework/okf-context-bundle-contract.json` 成为 OPL-owned OKF context bundle 边界合同；`src/okf-context-bundle.ts` 和 `opl okf validate|inspect|project-pack|project-repo --json` 提供可执行投影、校验、读回和物化入口。
- OKF 映射到现有品牌模块，不新增模块：主模块是 `OPL Atlas`、`OPL Pack`、`OPL Stagecraft` 和 `OPL Connect`；协同模块是 `OPL Ledger`、`OPL Console`、`OPL Workspace` 和 `OPL Foundry Kernel`。`OPL Runway`、Codex route selection、domain quality verdict、owner receipt、typed blocker、artifact authority 和 production readiness 不消费 OKF 作为授权证据。
- `opl okf project-pack --pack <pack_compiler_input.json> --output <dir>` 只把 Foundry Agent declarative pack refs 投影成 body-free OKF bundle；`opl okf project-repo --repo <domain_repo> --output <dir>` 在同一边界内读取 domain repo 的 `contracts/pack_compiler_input.json` 和可选 `contracts/memory_descriptor.json`，把 pack refs 与 memory locator refs 合成完整 body-free bundle。prompt、skill、knowledge、quality gate、artifact、memory body 和 domain truth 仍留在 domain repo。
- `buildOkfMemoryLocatorConcept` 只生成 memory locator concept，默认 `resource_body_mode=body_free_locator`，不复制 memory body，不接受/拒绝 writeback，不替 MAS/MAG/RCA/OMA owner 做 memory authority decision。
- 原生 OKF frontmatter 只作为 opt-in advisory migration lane：稳定 domain-owned `agent/**/*.md` 可以携带 OKF-compatible `type`、`body_owner`、`domain_authority` metadata，并通过 `opl okf native-frontmatter inspect --repo <domain_repo> --json` 做只读 advisory readiness readback；默认 bundle source 仍是 exporter-generated body-free projection。OPL 只能 preserve / validate / inspect / project refs-only metadata，不能通过 frontmatter 迁移成为正文 owner、domain truth owner、artifact authority、owner receipt / typed blocker authority、runtime scheduler 或 readiness gate。
- 进度优先口径固定：unknown frontmatter / unknown type / broken crosslink / missing optional metadata 都只能是 warning 或 advisory gap，不能阻断普通 stage launch、provider wakeup 或 executor 推进；只有 OKF 被用于 source/data authority、owner identity、forbidden write、irreversible mutation、hard reviewer/publication/final export/submission claim、owner receipt / typed blocker / readiness claim 时，才回到既有 authority gate。
- 这次落地不声明任何 domain ready、App release ready、Brand L5、provider long-soak 或 production ready；OKF 只让 AI executor 更容易获得结构化上下文和 refs-only 发现面。

### 决策：Domain Markdown Memory 是 advisory prompt context，不是程序化控制器

原因：MAS/MAG/RCA/Book Forge/OMA 的领域经验需要以 Markdown 自然语言保留，让 AI executor 按当前数据、对象、证据、owner gate 和质量目标自行判断是否借用；如果把这类经验硬做成 recipe engine、route scorer、winning-path generator 或 readiness gate，会降低开放式判断质量，并制造新的 false authority。

影响：

- `contracts/opl-framework/advisory-knowledge-boundary-contract.json` 成为 family-level 机器边界。
- OPL Atlas / Pack / Stagecraft / Runway / Ledger / Console / Connect 只能承载 catalog、locator、knowledge refs、prompt-context refs、consumed refs、writeback proposal refs、router receipt refs 和 operator projection。
- OPL 不持有 memory Markdown body，不接受/拒绝 writeback，不依据 memory refs 生成 route verdict、quality/export/publication/submission verdict、owner receipt 或 typed blocker。
- 缺少 advisory memory 默认不阻断 stage launch；memory 冲突默认进入 route-back / human gate / reviewer attention，只有 source/data authority、owner identity、forbidden write、不可逆 mutation、hard reviewer / publication / final export / submission claim 或 owner answer claim 才成为 hard gate。
- 2026-06-20 follow-through：`contracts/opl-framework/advisory-knowledge-boundary-contract.json` 增加 `gate_intent` 和三栏 operator projection 机器边界。`context` 进入参考建议，`advisory_check` 进入软缺口，只有绑定具体 claim/source/owner authority ref 的 `claim_gate` / `authority_gate` 可进入硬 owner gate；`src/advisory-knowledge-boundary.ts` 只生成 projection，不写 domain truth、不读取 memory body、不接受/拒绝 writeback、不签 owner receipt、不创建 typed blocker，也不授权 quality/export/domain-ready verdict。

### 决策：Domain helper dependency maintenance 归 OPL system route

原因：OPL Book Forge 的 publication proof helper 使用 Pandoc/XeLaTeX/Poppler 和 TeX Live packages。若 Book Forge 在领域仓内通过 workaround、跳过验证或私有安装脚本处理 `titling.sty` / `tocloft.sty` / TinyTeX 依赖漂移，会把本机工具链维护误放进 domain truth 层，也会让普通写作推进被出版 proof 环境预检反向阻断。

影响：

- `opl system dependency-doctor --profile bookforge-publication-proof --json` 是 OPL-owned 本机依赖诊断面，但 profile 与依赖清单来自 BookForge package / descriptor 声明；OPL 只按 `domain_dependency_profile` 执行 executable / LaTeX package discoverability 检查。
- `opl system dependency-maintenance --profile bookforge-publication-proof --json` 默认只输出维护计划；只有显式 `--apply` 才尝试通过检测到的 TeX Live package manager 执行修复。doctor 路径不得突变系统环境。
- Book Forge 仍拥有 manuscript、proof profile、helper behavior、书稿质量、出版 proof / final export owner gate；OPL 只拥有本机依赖诊断、维护 route 和 no-domain-authority readback。
- 该 surface 的 hard blocker 只适用于 Book Forge publication proof / final export 相关 claim。普通 storyline、chapter drafting、context compile、claim integrity、style calibration、review PDF 以外的写作进度不得因为该 doctor blocked 而停摆。
- `titling.sty` 与 `tocloft.sty` 从 bundled Book Forge proof header 中退役后只作为 `legacy_not_required` 诊断项；不得再因为它们缺失阻断当前 proof profile。
- 该能力不写 MAS/MAG/RCA/Book Forge truth，不写 manuscript，不签 owner receipt，不创建 typed blocker，不授权 quality/export verdict，不声明 domain ready、publication ready、final export ready 或 production ready。

## 2026-06-14

### 决策：StageRun 不设执行授权控制面

原因：Codex CLI 已经持有 stage 语义、当前 workspace 和可读输入；另设授权 ledger、格式校验器或 closeout binding 会形成第二套程序控制面，并把可恢复的质量缺口误变成执行阻断。

影响：

- StageRun 只记录 attempt transport、provider lifecycle、可选 stage packet ref、artifact/progress refs 与 currentness observation。
- 缺 stage packet、manifest、role、receipt、review 或 capability binding 时，Codex 仍从 declared stage、主提示词、workspace context 和可读产物启动；这些缺口只形成质量债。
- transport identity 缺失只禁用 stale reuse；只有 identity 冲突会阻止向错误目标写入。
- OPL 不生成语义 route、owner receipt、domain typed blocker 或 quality/export/ready verdict。

## 2026-06-13

### 决策：MAS current-control admission identity 必须包含 selected stage packet / route / attempt key

原因：MAS DM003 复现出同一 `action_type + work_unit_id + work_unit_fingerprint` 下，旧 closeout 绑定旧 mutable dispatch，而当前 admission 绑定新的 immutable stage packet。MAS 修复 closeout evidence 后，OPL 基座也必须避免把同 fingerprint 的旧 queued / terminal admission 当成当前 admission；否则同类问题会在 OPL enqueue、tick、live attempt reconcile 或 terminal attempt no-op 路径继续复活。

影响：

- `providerAttemptCurrentnessIdentity` 必须把 `stage_packet_ref`、规范化 `stage_packet_refs`、`route_identity_key` 和 `attempt_idempotency_key` 纳入 current-control admission identity；早期曾允许 `idempotency_key` 兜底 attempt idempotency，但该口径已被 2026-06-29 NextAction identity follow-through 收紧：request / NextAction identity 与 attempt identity 必须分开，通用 `idempotency_key` 不再兜底 provider attempt identity。
- `sameProviderAttemptCurrentnessIdentity` 比较上述字段。只要 selected stage packet 或 route / attempt key 不一致，即使 work-unit id、fingerprint、source eval、truth/runtime epoch 与 source fingerprint 相同，也必须视为 stale / fresh identity 差异，允许 queued admission refresh、terminal attempt stale requeue 或 tick reconcile。
- OPL 仍只处理 generic Runway / current-control identity，不解释 domain recovery semantics，不签 domain owner receipt，不创建 domain typed blocker，不写 domain study/runtime artifacts，也不声明 domain ready、App release ready、Brand L5 或 production ready。

### 决策：Family runtime 控制面输出与 hydrate/export 前置门必须 fail closed

原因：Popper 审计指出三个相邻 control-plane 缺口会让 operator 或工具链误读运行态：`module_exec_profile` 的 domain-handler export 可在 dirty checkout 上执行并入队，`attempt list --compact-timeline` 顶层 JSON 没有稳定数组字段，`--payload-match payload.*` / `task.payload.*` 会被当作真实 payload path 静默接受。这些都不会直接写 domain truth，但会让 hydrate/tick、monitoring 和 scope selector 产生 false progress 或 false empty read。

影响：

- domain-handler export / route handoff 进入 OPL provider 路径前，必须从 selected source channel 解析 current/LKG immutable generation；dirty/ahead/diverged checkout 只进入 provenance observation，OPL 不修改 checkout，而是按当前可读 bytes 生成 snapshot。只有 source 不可读或不安全、必需 ABI/module/Skill 缺失、health/handler probe 失败且没有 LKG 时输出 `status=blocked`；不得因 Git 状态或 digest/receipt 漂移制造 false blocked、false queue success 或 false progress。
- `family-runtime attempt list` 的 compact 与 full view 都必须提供稳定顶层数组字段 `items` 和 `attempts`，并保留 `summary`、`filters`、`view_mode` 与 compact 兼容字段 `compact_timeline`；消费方不得因 compact view 缺 `attempts` 而误读为空。
- `family-runtime attempt list --json` 默认必须返回 bounded / audit-safe compact timeline，即使带 `--domain`、`--study`、`--status` 或 `--since-hours` 过滤也限制 25 条并省略 `provider_run`、`activity_events`、`route_impact` 等重 body；需要完整 attempt body 时必须显式传 `--full`。`summary.compact_timeline_omitted_total` 表示仍有未展开的 ledger 条目，不能被 operator、worker supervisor 或 domain handoff 误读为无 active attempt、provider ready、domain progress 或 worker restart authority。
- `--payload-match` path 永远相对 task payload root；`payload.`、`task.payload.`、`payload` 与 `task.payload` 前缀必须 fail-fast，错误信息提示使用 `study_id=...` 这类 root-relative path。该 parser 只适用于仍存活的 attempt/query/projection 读面；退役的 `queue list`、`tick --hydrate` 和 `intake` 只能作为 fail-closed / history 语境读取。
- 该决策只加固 OPL Runway / Console control plane 与 task scope semantics，不授权 OPL 写 MAS/MAG/RCA truth、执行 live DHD apply/hydrate/tick/redrive、写 Yang runtime/study artifacts、生成 owner receipt、typed blocker、quality verdict、domain ready、App release ready、Brand L5 或 production-ready claim。

### 已取代：Stage Transition Authority observation fold

2026-07-12 起，Stage Transition Authority、transition intent/event ledger、accept/reject decision 和对应 CLI/contract/test 已物理退役。Codex CLI 直接选择下一 declared stage；OPL 只记录 attempt/transport observations 并被动投影。下面只保留仍有效的 false-ready 计数边界：

影响：

- Domain dispatch evidence 的 `domain_ready_claim_count` 只统计明确 positive verdict，例如 `ready`、`domain_ready`、`domain_ready_claimed` 和正向 `*_ready` / `*_ready_claimed`；包含 `not`、`non`、`pending`、`observed`、`blocker`、`blocked`、`failed` 或 `rejected` token 的 verdict 一律按非 ready observation 处理。
- 该修复属于 OPL Console / Runway / Stagecraft false-authority guard：它只防止读面误降级或误计数，不让 OPL 签 domain owner receipt、创建 typed blocker、写 domain truth、授权 quality/export verdict、声明 domain ready、App release ready、Brand L5 或 production ready。

### 决策：FoundryRun qualification 与 activation 成为 Standard Agent 验收门

原因：标准 Agent 迁移、创建、接管和改进时，容易把 descriptor、generated interface、conformance、单次 suite、provider completion、refs-only ledger 或 App projection 误读成完成。验收必须绑定确切版本、独立证据、风险与可回滚激活，而不能绑定某个仓库形态或一次命令成功。

影响：

- 机器验收边界由四份 Foundry protocol schema、FoundryRun 哈希事件链、不可变 `EvidenceBundle` / `QualificationRecord` / `AgentVersion` 与 `ActivationPointer` CAS 共同定义，不再维护独立 landing status ledger。
- create、takeover、improve 都必须绑定 target identity；takeover/improve 还必须绑定 exact `target_version_ref`。baseline 与 candidate 使用同一冻结测试计划，正式 verdict 来自独立 evaluator/reviewer。
- qualification 只证明 exact candidate 满足冻结 gate；production adoption 还必须满足风险策略、必要 Owner receipt、canary 和 activation transaction。`qualify_only` 可以终止为 `completed_qualified`，不能冒充 active。
- OMA 只负责 `AgentBlueprint` / `EvalSpec` 与失败后的 `EvolutionProposal`，不能签 target Owner receipt、创建 target truth、读取保护测试正文或修改 active pointer。
- descriptor ready、generated interface ready、schema/conformance pass、provider completion、Console projection、候选 bytes 或单次公开测试通过都只能作为输入，不能单独声明 Agent delivered、domain ready、Brand L5 或 production ready。
- MAS-specific recovery 与领域质量状态继续留在 MAS 等 target owner；OPL 只持有通用 StageRun transport、FoundryRun、证据、版本、激活和 operator projection。

本决策只定义 family-level Foundry 验收边界；它不声明任何既有 domain Agent 已完成重新评测、Owner 接受、生产采用或发布安装。

### 决策：StageRun currentness identity 绑定 selected dispatch / stage packet

原因：MAS DM002 暴露的 `stage_packet_not_current_selected_dispatch` 不应长期只停留在 MAS blocker 名称里；它对应 OPL / Runway / Foundry Agent substrate 的通用问题：同一 study/action/work-unit/source/currentness basis 下，旧 selected dispatch、旧 stage packet、queue residue、trace/span 或 provider completion 不能被当成当前 StageRun。若 StageRun currentness 只比较 work unit / source / epoch / idempotency，而把 selected dispatch / stage packet 留在旁路比较，operator 和恢复逻辑仍可能在合同层把 stale packet 读成 current route。

影响：

- `stage_run_currentness_identity` 的 required fields 扩展为包含 `dispatch_ref`、`stage_packet_ref` 和规范化后的 `stage_packet_refs`。
- `stage_run_currentness_identity` 的 required fields 同时包含 `route_identity_key` 与 `attempt_idempotency_key`；通用 `idempotency_key` 不能兜底为 provider attempt intent。缺 route identity、attempt identity、selected dispatch 或 stage packet identity 时，`missingStageRunCurrentnessIdentityFields` 必须报告缺字段，`sameStageRunCurrentnessIdentity` 与 `sameStageRunRouteCurrentnessIdentity` 都 fail closed。
- `sameStageRunRouteCurrentnessIdentity` 继续忽略 `stage_attempt_id`，以允许同一 route identity 的 fresh candidate 与 admitted attempt reconcile；但 selected dispatch / stage packet refs 必须匹配，不匹配时 fail closed。
- live skip、terminal closeout reconcile 和 current-control projection 只能复用同一 selected dispatch / stage packet identity；旧 selected dispatch、trace/span、queue residue、provider completion 或 read-model refresh 只能作为诊断，不得生成 domain owner receipt、typed blocker、quality verdict、domain ready、App release ready、Brand L5 或 production-ready claim。
- DM003 类 pending attempt / projection inconsistent 继续由 current-control provider attempt identity、StageRun currentness identity、terminal closeout ordering 和 recovery obligation identity 回归覆盖；平台层不再因为 live recovery 状态而手写 MAS runtime/study artifacts。

## 2026-06-11

### 决策：Stage-route transport/currentness substrate 固定为 OPL 基座合同

原因：MAS/DM-CVD 003 暴露出的坏例不是单一投影字段缺失，而是 stage-route loop 缺少统一 currentness 读法：OPL ledger/Temporal 可能已经 running，但 MAS read-model 还停在 provider attempt pending；OPL attempt 已 terminal 且 closeout accepted，但同一 identity 又被投回 pending；同一 work unit 多次 closeout/no-op/read-model reconcile，却没有论文、gate、receipt、typed blocker 或 next owner 的实质 delta。根因在于 identity、terminal ordering、当时的 no-progress budget、worker stale guard 和 trace refs 分散在多个 surface，operator 只能从 action_queue 或 active_run 字段倒推状态。

影响：

- `contracts/opl-framework/stage-route-transport-contract.json#stage_route_transport_substrate_contract` 是 OPL-owned passive substrate，只保障 identity/currentness、attempt transport、stale reuse filtering 和 operator projection；不能接受、拒绝、排名、选择或覆盖 Codex route。
- 普通路径固定为 `fresh_current_owner_delta -> domain_provider_attempt_identity -> stage_run_currentness_identity -> provider_attempt_or_owner_callable -> terminal_closeout_packet_ref -> domain_closeout_consumption_ref -> next_current_owner_delta_or_typed_blocker`。
- Currentness 优先级固定为 terminal closeout 压过同 stage attempt live 投影，strict live attempt 压过同 identity pending，accepted closeout / executed typed blocker 压掉同 identity pending；fresh provider attempt、stable domain typed blocker 与旧 trace/queue/sidecar residue 只进入 StageRun/current-control 的合法状态或诊断投影，不授予 tick、redrive 或 no-progress counter admission enforcement。
- 历史设计曾以 `domain_id + study/quest + action_type + work_unit_id + work_unit_fingerprint + source_eval_id` 形成 no-progress budget，并在预算耗尽后冻结默认 redrive；该 enforcement 已退役。当前 no-progress 只保留 repeated-lineage diagnostic，`canonical_admission_consumer=null`，不得冻结 launch、current pointer 或 terminal state；`receipt_only`、`read_model_reconcile_only`、`stale_route_redrive_only`、`platform_repair_only`、`owner_output_already_current`、`no_deliverable_delta` 仍不能冒充 domain progress。
- `worker_source_stale` 是 fail-closed supervisor projection。只有 explicit developer supervisor、Temporal reachable、ledger readable 且 blocking active attempt count 为 0 时才允许 restart；`running` attempt 会阻止 worker restart，`queued` / `checkpointed` / `human_gate` 进入 diagnostic backlog，不得让历史或等待型 ledger backlog 永久阻断 provider liveness repair。
- Trace/span/lineage 只做 refs-only drilldown。它们可解释因果链，但不能成为 planning root、domain truth、owner receipt、typed blocker、quality verdict、publication ready 或 production-ready evidence。
- 该合同吸收 Kubernetes controller desired/current/status reconcile、Temporal/Airflow 小 payload 与 refs-only transport、Step Functions idempotent execution identity、OpenTelemetry / OpenLineage links/facets 和 Argo retry/exit-handler 的成熟经验；吸收的是边界原则，不复制外部 runtime 形状。
- 验证口径固定为 contract test：必须断言五项 substrate surface、currentness precedence、false-authority flags 和 current-control admission policy ref；运行态闭环仍用 fresh MAS DHD / study progress / OPL attempt readback 验证，不靠合同本身声明论文进展。

### 决策：Temporal activity completion 与 stage_progress_log 固定为 refs-only transport / projection

原因：MAS/DM-CVD 002/003 运行中多次暴露出 Codex stage 已写 closeout，但 Temporal activity completion 因 payload 超过 4MB 失败的卡点。这个问题会把真实 closeout、workflow terminal、MAS DHD consumption 和 operator read-model 拉成四个不一致状态，形成“看起来在跑、最后没有被消费”或“已 terminal 但又回到 pending”的循环。根因不是 domain 文本，也不是自动化 prompt，而是 OPL provider completion payload 把大 closeout body / stage log / transcript 当作 workflow result 运输。

影响：

- `codexStageActivity` 返回给 Temporal 的 `closeout_packet` 必须是 refs-only compact packet：只保留 `stage_attempt_id`、idempotency key、closeout refs、consumed refs、memory/writeback refs、rejected writes summary、next owner、domain-ready verdict、route impact 和 authority boundary。
- `paper_stage_log`、`user_stage_log`、`stage_log_summary`、`human_stage_log`、transcript、paper/artifact/memory body 和大 detail arrays 不得进入 Temporal activity result、workflow state 或 queue metadata；完整正文留在 domain closeout file / OPL ledger，通过 refs 连接。
- `stage_progress_log.user_stage_log` 只投影 domain typed closeout 明确给出的语义摘要、duration/token/cost observed/missing 状态和 refs。OPL 不得从 artifact body、memory body、publication verdict body 或 transcript 自行生成“做了什么 / 论文推进了什么”；缺 domain semantic summary 时只显示 missing-domain-fields / missing semantic summary。
- `stage_progress_log` / Temporal completion / provider completed 不能被任何 status、tray、workbench、Runway 或 App read model 表述为 domain ready、owner receipt observed、typed blocker created、quality verdict、artifact ready、paper repaired、publication ready 或 production ready。
- 该规则与成熟工程经验一致：Temporal workflow history 只应承载可重放的小结果和 refs，Airflow XCom 只适合小元数据，Kubernetes controller 对 desired/current/status 做 reconcile，OpenTelemetry / OpenLineage 用 links / lineage refs 关联事实，不把可观测性事件升格为 domain authority。
- 验证口径固定为：大 closeout 输入下 compact result 不含 stage log / transcript，JSON payload 保持小于 transport 阈值；stage-route scheduler contract 声明 missing domain stage log 只投影、不由 OPL 生成 typed blocker 或 domain summary。
- 落地证据归 `contracts/opl-framework/family-runtime-attempt-contract.json`、runtime source、focused tests、CLI/read-model 和 git history；本文不维护单次提交 SHA。
- 这只修 OPL transport / projection基座，不修改 MAS truth、paper body、publication verdict、domain owner receipt、typed blocker、quality/export verdict、artifact authority、App release verdict 或 production-ready 结论。active attempt 存在时，worker_source_stale 仍必须等 active attempt 为 0 后由 supervisor guard 重启，不能为了加载新代码杀掉运行中 stage。

## 2026-06-10

### 决策：Default executor retry budget 按当前 source identity 计算

原因：MAS/DM-CVD 003 暴露出一个 control-plane 缺陷：同一 default-executor task 在 current owner work unit 不变但 source fingerprint 多次刷新时，会保留多个历史 stage attempts。OPL auto-redrive 过去用 task 下 stage attempt 总数判断 retry budget，导致 1 次当前 source 失败被 9 个旧 source 成功/失败 attempt 放大成 `retry_budget_exhausted`，从而把仍可推进的 current work unit 误置 `dead_letter`。

影响：

- Default executor provider transport retry budget 只统计当前 task payload 对应的 `domain_source_fingerprint` / current source identity 下的 stage attempts；旧 source attempts 只能作为 provenance、stage log 和 audit tail，不消耗当前 source 的 retry budget。
- Auto-redrive 的 `used_attempts`、retry/dead-letter 决策和 operator 判断必须绑定 current MAS owner/work-unit source identity，不能用同一 task 的历史 attempt 总数。
- 这类问题属于 OPL Runway / family-runtime control-plane 修复，不得通过改 MAS 论文文本、手写 closeout、手写 owner receipt、改 automation prompt 或直接修改 runtime artifacts 解决。
- 验证口径固定为：构造同一 task 下多个旧 source attempts 加一个当前 source failed attempt；tick 必须 redrive 当前 source 并继续调度，而不是 `retry_budget_exhausted`。
- 当前读法：`mas_default_executor_superseded_by_current_source` 是历史 currentness blocker，只能用于阻止旧 task / attempt 继续 redrive，不能反过来作为 current source 去遮蔽 fresh MAS provider attempt。哪些 attempt status 可参与“当前源”裁决属于 family-runtime source/tests/read-model 事实；canceled / terminal residue 只能作为 audit 或 stale-redrive filter 的比较对象。

### 决策：ideal operating model 作为 north-star，active baton 回当前差距文档

原因：`docs/active/opl-family-ideal-operating-model-redesign.md` 需要沉淀 multi-plane operating model、外部成熟工程映射和 OPL 基座优化验收标准，但如果它继续维护 lane 状态、下一步或 dated checklist，会与 `docs/active/current-state-vs-ideal-gap.md` 形成第二 active backlog。OPL family 当前执行需要单一 active baton、单一 ordinary route 和单一 owner evidence intake。

影响：

- `opl-family-ideal-operating-model-redesign.md` 固定为 `active_reference`：只表达 north-star、评估标准、plane / primitive 分类和 acceptance standard，不维护第二 owner queue、第二 ordinary route、第二 truth source 或 worktree closeout。
- `current-state-vs-ideal-gap.md` 继续是唯一 active owner：multi-plane operating model、OPL 基座优化、Runway / Console / Ledger false-authority、`current_owner_delta` single ordinary route、证据缺口、next action 和完成口径都折回该文档。
- Ordinary App/CLI/operator route 固定为 fresh `current_owner_delta`。Runway 只承接 durable execution / repair / reconcile，Console 只承接 owner-action projection，Ledger 只承接 refs-only evidence / telemetry / audit packet；它们都不能生成 domain owner answer、domain typed blocker、quality/export/review verdict、artifact authority、App release verdict、Brand L5、physical delete authorization 或 ready declaration。
- OPL 基座优化只推进 generated/hosted surfaces、durable Runway、Stage Artifact Unit、passive Ledger、Console owner-action producer、FoundryRun improvement loop 和 human/domain owner decision gate；domain repo 私有 scheduler、queue、dashboard、status shell、generic wrapper 或 selector 只能作为迁移输入、diagnostic/support surface 或 retirement candidate。
- 后续 docs foldback 只能关闭 `hygiene_only_supporting_active_gap` 或支撑具体 owner-evidence requirement；不能用 docs updated、plane health、provider completion、verified refs-only ledger、conformance pass 或 App projection 声明 domain ready、App release ready、Brand L5 或 production ready。

### 决策：MAS Agent OS 方案提升为 family-level Foundry Agent OS 标准

原因：MAS 的目标态已经明确为 `OPL Agent OS + MAS Declarative Medical Research Pack + MAS Minimal Authority Kernel + Scientific Capability Registry`。这不是 MAS 单仓特例，而是 MAS/MAG/RCA/OMA 都需要的标准 OPL Agent 形态：OPL 上收通用 runtime、StageRun、Pack compiler、generated/hosted surfaces、Console、Ledger、Runway 和 conformance；domain 仓只保留无法声明化的最小 authority kernel。

影响：

- `contracts/opl-framework/target-operating-architecture-contract.json#foundry_agent_os_standard` 成为 family-level target contract，目标形态固定为 `OPL Agent OS + Domain Declarative Pack + Domain Minimal Authority Kernel + Domain Capability Registry`。
- `MAS`、`MAG`、`RCA` 和 `OMA` 都必须提供 target delta：哪些 generic substrate 上收到 OPL，哪些保留为 domain authority kernel。
- `Domain Capability Registry` 不是第 11 个品牌模块；它由 `OPL Atlas` 持 catalog、`OPL Pack` 持 ABI、`OPL Stagecraft` 持 use policy。默认行为是 `current_owner_delta_bound_jit_or_fail_open`，只有当前 owner delta route-required ref 缺失且影响 source/data/evidence、owner-route identity、forbidden write、irreversible mutation 或 hard reviewer/publication gate 时才升级 blocker。
- MAS external-learning 后续优化必须并入 family-level Capability Registry。OPL `W3` 负责 current-delta-bound resolver / selector、fail-open policy 和 route-required blocker policy；MAS/MAG/RCA/OMA 只在各自 domain pack / authority kernel 中声明可消费 refs、forbidden authority、owner receipt / typed blocker / quality gate 晋级边界，不另建 domain-local selector、always-on sidecar 或第二 active backlog。
- `brand-module-registry.json`、`brand-module-surfaces.json` 和 `brand-module-l5-operating-evidence.json` 同步补充 Pack compile parity、`current_owner_delta` default read、capability fail-open、domain-authority false boundary 和 cross-agent adoption 证据类。
- Cross-agent conformance 必须证明 default read root 是 `current_owner_delta`，OPL generated / hosted surfaces 不写 domain truth，Ledger / Console / Runway / Pack 不签 owner receipt、不创建 typed blocker、不授权 quality/export verdict，conformance pass 不等于 domain ready。
- family-level 目标架构、primitive、迁移阶段和验收门统一回 `docs/active/opl-foundry-agent-target-operating-architecture.md`；当前 active gap、执行顺序和完成口径仍回 `docs/active/current-state-vs-ideal-gap.md`，不再保留第二实施计划。
- 当前读法：MAG/RCA/OMA/OBF 的 default CLI、Skill/plugin、App/product-entry、status read model、workbench 和 conformance readback 必须把 ordinary owner route 表达为 `StageRun + current_owner_delta`；repo-local runner、private wrapper、generic owner surface 或旧 product/status shell 只能作为 migration residue / deletion gate / diagnostic。`generated_direct_parity`、Capability Registry resolver ABI、W7 refs-only intake、owner-route refs、private-platform retirement decision 和 owner evidence ref-shape readout 是 machine readback 输入，不是 completion truth。它们不能替代真实 owner receipt、typed blocker、human gate、reviewer/quality/export receipt、long-soak、release/install、physical delete owner decision 或 owner acceptance evidence；`open_count=0`、conformance pass、App projection 或 docs foldback 均不得授权 domain ready、App release ready、Brand L5 或 production ready。
- 本决策不声明 MAS/MAG/RCA/OMA 已 domain ready，不声明 App release ready、Brand L5 或 production ready；后续必须由 domain-owned owner receipt、typed blocker、quality/export/review receipt、human gate、no-regression ref 或真实 L5 operating evidence 关闭。

## 2026-06-09

### 决策：Runway 采用 control-loop runtime 目标态，但不扩大 domain authority

原因：OPL 长跑任务需要比定时 tick 和 provider 状态投影更清晰的控制面。Temporal 能提供 durable execution history、task queue、signal/query、retry/timeout、timer 和 replay，但它不保证 worker process 永久在线，也不判断 domain 目标是否完成。worker supervisor 只能保 worker liveness；scheduler 只能制造 hydrate/tick/reconcile/repair 机会；真正决定下一步的是把 desired owner route 与 current queue/attempt/provider/gate/receipt refs 对账的 Progress Reconciler。

影响：

- Runway 的目标态固定为 transport/liveness control loop：`Codex-selected route -> current transport state -> Progress Reconciler -> zero or one runtime repair action -> provider/owner/gate observation -> append-only refs/read-model`。这里的 runtime repair action 只处理 wakeup、lease、provider、currentness、dead-letter 与不可逆操作门，不选择、接受、拒绝或重写 semantic stage route。
- Temporal 是 production online durable substrate，不是 worker supervisor、domain truth owner、receipt signer、quality verdict 或 L5 evidence closer。
- Worker supervisor / deployment substrate 只负责 worker process 启动、保活、重启、扩缩容和 health check；worker healthy 不等于 Temporal workflow healthy、stage complete、domain ready 或 production ready。
- Scheduler / cadence surface 只负责提供 reconcile 机会和 cadence refs；scheduler ticked 不等于 worker liveness、domain progress、owner answer 或 safe redrive。
- Progress Reconciler 只比较 Codex 已选择的 route 与当前 transport/liveness 状态，输出零或一个 provider repair、dead-letter redrive 或真实 hard-stop observation；它不得根据 artifact shape、receipt、review、quality score 或 stage 顺序决定 semantic next stage。identity 冲突只阻止错误目标 mutation，不否定可读 artifact，也不阻止 Codex 启动其他 declared stage。
- Reconciler、handoff、human gate 和 provider observation 只能传 refs、typed blocker requirement、owner answer shape、repair command 或 runtime observation；不得创建 domain owner receipt、domain typed blocker、quality verdict、artifact/memory truth、domain ready、App release ready、production ready 或 L5 证据闭合结论。
- 这是 Runway `L4 executable baseline` 到 L5 的结构前置能力，不是 `production ready` 或 `L5 production operating maturity`。L5 仍需真实长跑/恢复、跨 agent scaleout、operator repair loop、release/install 和 owner acceptance evidence。
- 当前读法：Runway L4 可执行读面由 `opl runway readiness|reconcile|handoff-gates|recovery-repair|control-loop status --json`、`status|inspect|interfaces|validate|doctor`、contracts/source/tests/read-model 共同持有。它们只能表达 provider readiness、desired/current reconcile、handoff gate、repair plan、唯一下一 safe action 和 false-authority flags；Temporal 未配置、service down、worker not ready 或 scheduler missing 只能形成 OPL repair action，不能写成 domain ready、owner receipt、typed blocker、quality verdict、artifact ready、production ready 或 Runway L5 long-soak closure。

### 决策：普通推进主干与审计证据旁路分层治理

原因：MAS / OPL 最近的卡住现象集中在普通推进路径被 closeout、currentness、receipt accounting、read-model reconcile、StageRun binding、restore proof、readiness inventory、refs-only ledger 和 cleanup / production evidence 尾项拖住。RCA、DeepScientist 和旧 MDS 的顺滑体感说明默认控制面必须短；但这不代表恢复旧 backend 或降低 domain authority，而是要把审计证明从普通推进主干中分离出来。

影响：

- OPL family 的普通推进主干固定为 `current stage goal -> Codex concrete artifact delta -> Codex selects any declared next/previous stage -> OPL transports StageRun and passively projects current_owner_delta`。
- Audit / Evidence Sidecar 记录 trace、lineage、refs、replay、restore、readiness inventory、long-soak、cleanup、release cohort、L5 evidence 和 full diagnostic，但默认不能生成 next action。
- Sidecar 只有在错误目标 identity、实际不可用 executor、安全/权限/authority、不可逆 artifact/package/memory/release/physical-delete mutation 或明确 human/safety/compliance decision 时，才升级为 hard stop；其余格式、scope、receipt、review、manifest 和 restore 缺口只形成 quality/operational debt。
- 新增 `ProgressDeltaReceipt` 作为普通 step 的轻量接力形态；它只能证明 changed surfaces、produced refs、consumed refs、delta classification、next owner 和 next required delta，不能授权 publication-ready、submission-ready、artifact mutation、memory accept/reject、App release ready、domain ready 或 production ready。
- Stage Artifact Unit 按 `T0_progress_delta`、`T1_stage_transition`、`T2_delivery_artifact`、`T3_production_evidence` 分层。普通写作、分析、证据整理、review 修订和平台修复不要求每步都带 full delivery proof；Stage transition、delivery/export/publication/release 和 production evidence 按风险升级。
- MAS readiness surface 采用 just-in-time 读法：只检查当前 delta 需要的 readiness surface；缺口转为下一 owner delta、route-back、typed blocker 或 human gate，不能变成“补齐全部 readiness inventory 后才允许推进”的默认门。
- MDS / DeepScientist 只吸收单循环、少默认门、持续产出的 smoothness learning，继续作为 MAS 声明的 provenance、fixture、backend audit、upstream learning 和 parity oracle reference；不得恢复为默认 runtime、quality owner、artifact authority 或 OPL top-level domain agent。
- ordinary progress spine、audit sidecar、artifact tiering 与 readiness JIT 的稳定设计统一回 `docs/active/opl-foundry-agent-target-operating-architecture.md`；当前 gap、next action 和完成口径仍回 `docs/active/current-state-vs-ideal-gap.md`，不再保留第二规划。
- 当前读法：ordinary progress / audit sidecar 已归入 current-owner-delta、surface budget、target architecture、family product operator projection、stop-loss、wrapper payload、provider SLO/readback、owner-answer refs 和 read-model currentness 的 contracts/source/tests/read-model。决策面只保留 durable rule：默认 planning root 是 fresh `current_owner_delta`；audit sidecar、evidence worklist、provider trace、readiness inventory、projection cache 和 stop-loss diagnostics 只能 drilldown / advisory / hard-gate 输入，不能生成默认 next action；同 lineage no-progress 默认 redrive 必须冻结，合法出口只能是 fresh owner delta、domain-owned typed blocker / owner answer、human/operator gate、identity-different successor 或 provider hard-gate clearance；退役 queue redrive 不再是成功路径，旧 transport residue 只能作为 projection/diagnostic 读取，不能绕过 accepted owner refs 或 live same-identity attempt。OPL 只投影 owner-answer shape 与 currentness identity，不伪造 domain owner receipt、typed blocker、quality verdict、domain ready、publication ready、App release ready、physical delete 或 production-ready authority。字段级 follow-through 只作 git/history provenance。

## 2026-06-08

### 决策：新增 OPL Pack，品牌模块 taxonomy 从九模块扩展为当前十模块

原因：九模块基线已经证明品牌模块作为 Framework 顶层 taxonomy 有价值，但 `Declarative Domain Pack + Authority ABI + pack compiler + generated/hosted surfaces + minimal authority functions` 不是 Atlas、Stagecraft、Foundry Kernel 或 Connect 的子细节。Atlas 负责 catalog/discovery，Stagecraft 负责 stage 内认知设计，Foundry Kernel 负责 agent improvement control plane，Connect 负责外部接口和分发 transport；把 Pack 强塞进这些模块会模糊 domain pack source、authority ABI、generated surface input 和 domain owner boundary。

影响：

- 当前 OPL Framework 品牌模块读作十模块：`OPL Charter`、`OPL Atlas`、`OPL Workspace`、`OPL Pack`、`OPL Stagecraft`、`OPL Runway`、`OPL Ledger`、`OPL Console`、`OPL Foundry Kernel` 和 `OPL Connect`。
- `OPL Pack` 持有 Declarative Domain Pack、authority ABI、pack compiler、generated/hosted surfaces 和 minimal authority functions 的模块级 read/validate/doctor 语义；minimal authority functions 仍通过标准 ABI 返回 refs / receipt / typed blocker / safe action，不接管 domain handler implementation、owner receipt、typed blocker、quality verdict、artifact authority、App release truth 或 production readiness。
- 2026-06-07 的九模块决策保留为历史基线，表示品牌模块 taxonomy 正式进入 Framework 设计语言；它不是模块数量上限。后续新增或拆分模块必须证明独立 bounded context、owner、purpose、machine boundary、authority false flags、L4/L5 口径和 docs/contracts/tests foldback。
- 核心五件套、`docs/references/brand-modules/*`、contracts README、CLI help 和 focused tests 必须以 registry 的当前模块集为准，避免把旧“九模块”写成当前硬约束。
- Foundry Agent CLI series 仍使用自己的 ordinary spine，不复制 OPL Framework 品牌模块；旧 machine 字段名若保留 `nine` 只按兼容字段读取，不得作为当前 taxonomy 事实。

### 决策：MAS current-control provider attempt 只进入 stage-attempt projection

原因：DM002/DM003 论文线重启时，MAS 已在 workspace-level `runtime/artifacts/supervision/opl_current_control_state/latest.json` 写出当前 `provider_attempt_candidates[]`，其中包含唯一当前可执行的 `return_to_ai_reviewer_workflow` work unit、fingerprint、dispatch path 和 owner-route currentness。旧 OPL `family-runtime hydrate/enqueue/tick` 会把 sidecar `pending_family_tasks[]` 转成本地 queue task，形成 Temporal 之外的第二套 admission 机制。当前路线改为只消费 domain transition request / OPL-native command record，并把结果投影到 provider-backed stage-attempt request/readback，不再生成本地 queued task。

影响：

- OPL 不再通过 `family-runtime hydrate/enqueue/tick` 把 MAS export 或 current-control candidate 写成本地 queue task；旧 pending task 只能作为 retired transport residue / projection diagnostic。
- 同一 study 的 stale sidecar pending task、旧本地 task row、retry-waiting/waiting-approval residue 只能被压下或投影为诊断，不能绕过当前 blocker 重新 admission。
- Current-control provider attempt 必须携带 selected stage packet refs、`route_identity_key` 和 `attempt_idempotency_key`；`dispatch_ref` 只能作为 dispatch payload / diagnostic ref，不能兜底为 stage packet 或 provider attempt identity。缺 identity 时 OPL 必须 fail closed，并抑制同 study stale sidecar / queued / retry-waiting / waiting-approval residue。
- Current-control/currentness read-model payload 必须标记 observed / derived generation 来源。root provider candidate 缺 currentness basis 时，OPL 只能从合法 domain command record 填充，不得把 queue residue、action_queue 形状或业务 recovery 文案当作 domain state。
- MAS current-control candidate 不得声明 provider completion 等于 domain completion，且必须携带 `semantic_route_boundary`，明确 Codex CLI 是唯一 semantic stage route owner。仅有 dispatch receipt、stage-attempt projection、provider completion 或 read-model clean 不能声明论文质量或 ready；可读 artifact 本身仍算 progress，并可被 Codex 带入任意 declared stage。
- 该规则只关闭 OPL provider projection / currentness 边界；OPL 仍不写 MAS truth、不生成 publication verdict、不更新 artifact gate、不签 owner receipt、不创建 typed blocker，也不声明 paper ready 或 domain ready。具体 blocker ids、repair action shape、suppression event 和 source implementation 归 contracts/source/tests/CLI read-model 与 git history。

### 决策：默认治理采用抓大放小，细粒度完整性不得反向成为 ordinary 卡点

原因：workspace topology v2 的后续复盘暴露出一个可扩展到全 OPL family 的设计风险：为了防止走歪而持续增加规则、profile、projection、receipt、fleet report、L5 evidence、cleanup gate 和 release gate，最终可能让普通 owner delta 先被平台证明、诊断、镜像一致性、计数或 delete accounting 卡住。OPL 需要把“大边界”和“小细节”分层治理：大边界保证不越权、不误闭合、不制造第二真相源；小细节必须服务推进，不能抢占默认路径。

影响：

- `抓大` 的真实 hard boundary固定为wrong-target owner/identity/currentness、authority、selected executor不可用、权限/安全、不可逆mutation、明确human decision、App release verdict与physical delete authority。Stage lifecycle、workspace topology、route/closeout shape、accepted owner answer shape和no-second-truth缺口只关闭相应claim并形成diagnostic，不能阻断Codex推进。
- `放小` 的默认降级对象包括 prompt / skill / tool / knowledge / rubric refs 完整性、path alias、generated projection mirror、workspace fleet/detail drift、worklist raw counter、diagnostic proof、route variant、receipt accounting、wrapper lineage、L5 evidence matrix item、provider ops detail 和 release cohort diagnostic。它们默认进入 advisory、audit、diagnostic、cleanup 或 production evidence lane。
- 小细节只有在造成错误启动、越权、不可恢复、不可审计、无法 closeout、owner answer shape 不合法或不可逆 mutation 时，才允许升级为 hard blocker；只让报告更全、证明更漂亮或不确定性更少，不构成 ordinary blocker。
- ordinary App/CLI/operator path 继续以 `current_owner_delta` 为唯一 planning root。raw worklist、evidence ledger、provider trace、route variant menu、private residue inventory、cleanup delete gate、L5 evidence ledger 和 release diagnostics 不得覆盖当前 domain / App / human / provider owner answer。
- 新增 surface / gate / contract / read model 必须先声明 default lane、hard-blocker upgrade condition、demotion condition、protected boundary 和 accepted answer shape；答不出这些问题时，只能作为 diagnostic/reference 起步。
- 该决策不减少 launch safety、authority boundary、receipt binding、forbidden-write、domain owner receipt、typed blocker、quality gate、release gate 或 physical delete gate 的要求；它只防止这些要求的支撑细节反向成为普通进展卡点。
- 本决策的长期维护 taste 固定在用户级 `~/.codex/TASTE.md`；当前 active owner、gap 和下一步回到 `docs/active/current-state-vs-ideal-gap.md`；机器预算回到 `contracts/opl-framework/surface-budget-policy.json` 的 `grip_big_release_small_review`。支撑文档、审计矩阵和 production evidence lane 不维护第二 ordinary backlog。
- Production evidence lane 只接收真实用户路径、跨 agent scaleout、long-soak、release/install、operator repair loop、owner acceptance、no-regression 或等价证据。缺这些证据只能说明 production evidence tail 未闭合，不能抢占 `current_owner_delta` 普通接力，也不能写成 production ready。

### 决策：App-owned Codex runtime updater 不修改全局 Homebrew / npm / system Codex

原因：Full first-install 和普通 App startup-maintenance 需要能更新 App 自己携带的 `runtime/current/bin/codex`，但用户机器上的 Homebrew、全局 npm 和系统 PATH Codex 是用户级工具链，不应被 OPL 自动安装流程改写。此前把 Codex update 表达成 `npm install -g @openai/codex@latest` 会把 App runtime 修复和全局工具链 mutation 混在一起，增加权限、污染和回滚风险。

影响：

- `opl engine install|update|reinstall --engine codex` 与 `opl system startup-maintenance` 使用 App-owned staging root 拉取 `@openai/codex@latest`，验证 staged `codex --version` 后原子替换 `runtime/current/bin/codex`，并同步 App runtime 内的 `rg` payload。
- staged npm install 的平台二进制 source of truth 是 npm 物化后的 package layout；当前 `@openai/codex` macOS arm64 payload 位于 sibling optional package `node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/`，不能只查 `@openai/codex` package 内部 vendor 目录。
- 若 root `@openai/codex` package 已安装但 optional platform payload 没被 npm 物化，updater 必须根据 root package 的 `optionalDependencies["@openai/codex-darwin-arm64"]` 在同一个 App-owned stage prefix 内显式安装平台包，再从平台 package vendor 复制 `codex` / `rg`；该步骤不能落到全局 npm、Homebrew 或系统 PATH。
- `core_engines.codex.runtime_substrate_updater` 是机器可读的 updater/readiness surface，必须暴露 runtime root、current binary、staging root、version status、latest status、platform package materialization policy 和 `global_toolchain_mutation_allowed=false`。
- 若 PATH / env 已选到兼容 system Codex，且 App runtime toolchain 已 current，startup-maintenance 可以 skipped；这不授权 OPL 修改 Homebrew、全局 npm package 或用户系统 Codex。
- 2026-06-08 追加：Standard / Homebrew clean-machine 首启若没有 PATH / env Codex，`opl system startup-maintenance` 必须把缺失 Codex 当作 App runtime toolchain install，静默 stage、验证并写入 `runtime/current/bin/codex`，不能只返回 `codex_cli_missing` skipped/manual blocker；这仍不授权修改 Homebrew、全局 npm 或系统 PATH 工具。
- 该 updater 只修 App/OPL runtime concrete executor payload，不声明 domain ready、production ready、App release ready、Temporal provider ready、MAS/MAG/RCA quality verdict 或 artifact authority。

## 2026-06-07

### 决策：采用 OPL 九个品牌模块作为长期顶层 taxonomy

原因：OPL 已经从单一 CLI/runtime 项目演进成 `OPL Framework -> One Person Lab App -> Foundry Agents` 的 family-level 系统。仅用 runtime、workspace、stage、App、Foundry Kernel 等局部技术名组织长期设计，会让 owner boundary、文档分层、contract 入口、用户理解和后续重构继续分散。九个品牌模块把这些能力收成可管理的 bounded context：`OPL Charter`、`OPL Atlas`、`OPL Workspace`、`OPL Stagecraft`、`OPL Runway`、`OPL Ledger`、`OPL Console`、`OPL Foundry Kernel` 和 `OPL Connect`。

2026-06-08 追加：本决策定义的是品牌模块 taxonomy 的采用基线，不是模块数量上限。当前 taxonomy 已扩展为十模块，并新增 `OPL Pack` 承接 Domain Pack、Authority ABI、pack compiler 和 generated/hosted surfaces 的独立边界。

影响：

- 核心五件套必须把品牌模块读作 OPL Framework 的长期架构语言；详细 north-star 继续留在 `docs/references/brand-modules/*`。
- 新增 capability、CLI/App surface、contract、read model、docs support、release/install path 或 external interface 时，应能归入一个主品牌模块，并写清该模块不拥有的 truth / authority。
- 成熟度按 `L1 conceptual`、`L2 emerging`、`L3 structural`、`L4 executable baseline`、`L5 production operating maturity` 管理。`OPL Workspace` 当前只是 `L4 executable baseline`，不能外推为 domain ready、App release ready 或 production ready。
- `L5` 需要真实用户路径、跨 agent scaleout、长跑/恢复 evidence、release/install evidence、运维闭环和 owner acceptance。docs foldback、conformance pass、provider completion、verified ledger 或 App projection 只能作为输入，不能单独形成 L5 结论。
- `Charter / Atlas / Runway / Ledger` 是下一轮 L3/L4 优先补强对象；`Console / Foundry Kernel / Connect` 的成熟度必须绑定 App release/user-path、agent improvement loop、install/release drift matrix 和真实 owner evidence。

### 决策：Foundry Agent CLI 使用系列 spine，不复制 OPL Framework 品牌模块

原因：基于 OPL 的智能体需要让用户明确看出“这是同一系列”，但智能体 CLI 的心智模型不应再暴露 OPL Framework 的旧实现桶，也不应把 framework brand modules 原样复制到每个 agent。品牌模块是 OPL Framework 顶层 taxonomy；Foundry Agent 的普通入口应围绕用户实际执行链路组织成 series spine。

影响：

- `opl foundry status|inspect|interfaces|validate|doctor|peers` 成为 Foundry Agent series 的普通 CLI command spine，表达 `workspace -> work -> stage -> run -> ledger -> handoff -> connect` 的同源执行链。
- MAS/MAG/RCA 的品牌 CLI 字段是 series identity / shorthand，不再等同于本机 PATH-safe 可执行命令。当前标准 public / active surface 是 OPL generated/hosted Foundry Agent surfaces 与 domain-owned direct skill / handler path；旧专属命令只作为历史 provenance 读取，不能作为当前 standard surface、当前验证目标、membership/status/list 分组依据、兼容面或新 Agent 模板。相关 tombstone 见 `docs/history/compatibility/domain-foundry-cli-tombstone.md`。
- Agent CLI 的机器输出统一接受 `--json`。OPL 聚合面 `opl foundry list|inspect` 只能投影当前 generated/hosted series surface、membership/status policy 和 no-authority flags；不得为旧专属命令保留验证字段、入口别名或 JSON flag alias。
- `contracts/opl-framework/foundry-agent-series-contract.json` 固定 series CLI policy、Skill/MCP surface policy 和旧实现桶退役策略；新 scaffold 生成的 `contracts/foundry_agent_series.json` 必须继承这些字段。
- `opl connect skills` / `opl connect sync-skills` 输出同一 series contract 派生的 `foundry_agent_series`、series spine projection、`mcp_projection` 和旧桶退役策略，Skill/MCP 不再另起一套解释。
- 旧 `skill`、`module/modules`、`packages`、`engine` 等实现桶作为普通入口已退役并 fail closed 到 Connect；`runtime`、`family-runtime`、`index`、`stage-artifact`、`domain`、`system`、`status`、`session` 等只能作为诊断、迁移或内部治理下钻，不进入 root help 的普通入口。
- 该 series spine 只声明 CLI/Skill/MCP/App action 的同源暴露面，不写 domain truth、不生成 owner receipt / typed blocker、不声明 domain ready、quality/export ready、artifact ready 或 production ready。

## 2026-06-06

### 决策：domain-dispatch identity 只防写错目标，不授权推进

原因：owner receipt、typed blocker、partial artifact、诊断和阴性结果都可能成为下一 stage 的输入。要求它们先匹配一套 OPL closeout 格式会让 read model 变成事实控制面。

影响：

- Domain-dispatch payload 可通过 artifact、output、progress delta、diagnostic、negative result、owner receipt 或 typed blocker refs 记录进展。
- payload 中的 transport identity 只是 stale reuse / wrong-target mutation guard；字段缺失不阻止下一 stage，字段冲突才拒绝本次错误目标写入。
- owner receipt 与独立 review 仍只授权 quality/export/publication/ready 声明，不授权 stage transition。
- StageRun cockpit 不再生成默认 next owner 或执行授权 blocker；Codex 根据可读 artifact 和 domain 语义选择 advance、skip、repeat、reverse 或 route-back。

### 决策：default-caller deletion / cleanup gate 不得占用 ordinary progress worklist

原因：default-caller deletion evidence、wrapper retirement 和 cleanup gate 有长期治理价值，但它们不是论文、基金、视觉或 target-agent 的交付推进。若这类 gate 进入普通 open safe action / first-screen next action，会把 operator 注意力从 owner delta 拉回 cleanup accounting。

影响：

- default-caller deletion / cleanup gate 默认降为 `audit_cleanup_lane`；ordinary open safe action、default progress attention 和 first-screen next action 不得由这类 gate 驱动。
- full detail 仍保留 replacement parity、no-active-caller、domain owner receipt / typed blocker、no-forbidden-write、tombstone/provenance、physical-delete false authority flags 和 per-surface drilldown refs。
- `physical_delete_authorized=false`、`default_caller_delete_ready=false` 和 `domain_repo_owner_physical_delete_receipt_or_typed_blocker_after_surface_review` 继续作为 cleanup owner gate，而不是 domain progress blocker。
- `same_work_unit_live_evidence` 只约束 current owner-answer compensation chain 的身份归属；缺少 owner evidence 只关闭 ready/delete 声明，不得阻止 stage progress 或已满足静态退役条件的 wrapper / alias / facade 清理。OPL 不替 domain 仓签物理删除授权。

## 2026-06-03

### 决策：GUI shell owner surface 与非默认 executor adapter 不能被 cleanup 误删或误推进

原因：跨仓 cleanup 审计曾把两类仍有 owner 的面放进“后续可删”语境：其一是 `one-person-lab-app` 中的 GUI shell contract、candidate validator、release/user-path evidence；其二是 MAG/RCA 中 Hermes-named proof/helper/mock tail。前者的 GUI product truth、active shell contract、foreground alternative policy 和 archived proof policy owner 是 App 仓，OPL Framework 只能记录边界和消费规则，不能替 App 退役或推进 shell。后者的长期 owner 是 OPL Framework 的显式非默认 executor adapter/backend；MAG/RCA 只保留 domain-local receipt/proof lane、route bridge、negative guard 或迁移残留，不应被写成 domain 自己拥有 Hermes executor substrate。

2026-06-20 追加，2026-07-09 按 App candidate registry 读回修正：App GUI 路线当前读法为 `AionUI mainline + OPL Native Workbench foreground alternative + Hermes retained explicit reference candidate + AGUI archived technical proof`。因此 `opl-agui-codex-shell` / `agui-codex` 不再按 active foreground candidate 读取；它只作为 AG-UI/CopilotKit 技术验证归档与显式 replay surface 保留。除非用户明确要求 AGUI，OPL 主仓、App 仓和相关 shell 仓都不得继续把 AGUI 当作日常完善、默认验证或候选推进路线。

影响：

- App GUI 当前主线是 `one-person-lab-app` 通过 `shells/aionui` 消费的 OPL-branded AionUI shell，shell source repo 是 `opl-aion-shell`。
- `opl-native-workbench` 是 App-owned foreground alternative GUI candidate；它仍不能替代 active release shell，除非 App owner 明确修改 active shell contract 并完成对应 release/user-path gates。Hermes Desktop / `hermes-codex` 只作为 retained explicit reference candidate 保留。
- `agui-codex` 只作为 archived technical proof / explicit replay surface 读取；不能进入默认候选验证、普通开发 worklist、功能抛光、release readiness 或 active-shell adoption claim。
- `hermes_agent`、`claude_code`、`antigravity_cli` 等非默认 executor adapter/backend 统一归 OPL Framework owner；它们只能通过显式 stage binding、executor receipt、audit 和 fail-closed gate 进入，不承诺行为、质量、工具语义或 resume 与 `Codex CLI` 等价。
- MAG/RCA 文档、schema 和测试里的 active owner label 必须写成 `OPL executor adapter ... receipt/proof owner` 或 selected backend，不写成 MAG/RCA 自有 executor owner；domain repo 只持有 grant/visual truth、quality/export verdict、artifact authority、owner receipt 或 typed blocker。
- OMA materializer/helper 与 Aion Team/E2E bridge tail 只删除无 active caller、已有 replacement proof 和 repo-native verification 的 fixture/alias/helper；active materializer、target-agent handoff、legacy migration window、explicit bridge fallback 和 App-owned shell candidate 不进入物理删除。
- 物理删除门固定为 replacement parity、no-active-caller、owner receipt 或 typed blocker、provenance/tombstone、no-forbidden-write 和 repo-native verification。任何 active caller、migration window、negative guard、proof lane 或 dirty root 都必须先收敛为明确 owner answer，再执行删除。

### 决策：退役 frontdesk / web surface 不得继续由 LaunchAgent 或 runtime ledger 反复放大

原因：`frontdesk`、`opl web` 和 8787 本地服务已进入 history / retired 语境。若用户级 LaunchAgent 仍以 `KeepAlive` 调用退役命令，CLI unknown-command JSON、help catalogue 和 Node warnings 会被反复追加到前台 stderr；同时 family-runtime dispatch 若把 domain handler 完整 stdout JSON 同时写入 events 与 notifications，会让 `queue.sqlite` 被少数大 payload 快速放大。

影响：

- 旧 `ai.opl.frontdesk` / `opl web` 只能作为历史兼容对象处理；默认运行、安装、App state、operator drilldown 和 product entry 不得重新依赖该 service。发现该 LaunchAgent 仍在运行时，source of truth 是 `launchctl print gui/$(id -u)/ai.opl.frontdesk` 与 `~/Library/LaunchAgents/ai.opl.frontdesk.plist`，应先停用服务，再检查 stderr 是否继续增长。
- 顶层 unknown-command 错误详情必须保持有界，只返回 command、command_count 和 `opl help` 指针；完整 command catalogue 只属于显式 `opl help` / command-scoped help，不属于 daemon stderr 或退役命令错误面。
- `family-runtime` events / notifications 是 queue observability ledger，不是 domain artifact store。入库 payload 必须做有界 envelope：长字符串、超长数组、超深对象只保留 preview、长度、hash 和截断标记；domain truth、owner receipt、artifact body 和质量 verdict 仍归 MAS/MAG/RCA owner。
- 历史 queue 清理只能做 observability compaction、完整性检查和可回滚备份，不删除 task / event 行、不写 domain truth、不生成 owner receipt、不改变 publication eval、artifact gate、paper package 或 current package。

## 2026-05-30

### 决策：Progress-First queue / attempt currentness 只保留主题级边界

原因：DM002/DM003 的 repeated closeout、read-model reconcile、provider liveness、same-source redrive 和 stale owner-route 问题曾在 `docs/decisions.md` 中按实现日期追加为多条 queue / attempt / provider 细节决策。当前这些字段、事件名、超时、guard 和 CLI projection 已归入 `src/family-runtime-*`、`contracts/opl-framework/*`、`contracts/family-orchestration/*`、`tests/src/cli/cases/family-runtime-*`、`docs/invariants.md`、`docs/architecture.md` 与 `docs/status.md`；决策面只保留当前取舍，不继续维护实现流水。

影响：

- `current_owner_delta` 是 ordinary App/CLI/operator 默认读根；queue、attempt、provider、evidence-worklist、compact timeline 和 App drilldown 只能投影 owner、accepted answer shape、currentness、liveness、typed blocker 或 audit refs，不能生成 domain truth、owner receipt、typed blocker、artifact authority、quality verdict、domain ready、App release ready 或 production ready。
- OPL Runway 默认必须先读取可执行 owner delta / stage-attempt projection，再把 terminal sync、missing identity repair、waiting-approval reconcile、superseded task reconcile、repeated-source diagnostic、provider blocker 和 lease/read-model hygiene 作为 OPL attempt currentness 治理；同源重复无交付物的 executor work 只形成 advisory diagnostic，ordinary route 仍回到 fresh owner delta、domain receipt、domain typed blocker、human decision 或 provider hard-gate clearance。退役的 `family-runtime tick` / `scheduler tick` 本地成功路径及 anti-spin admission enforcement 不得复活。
- `waiting_approval`、superseded current source、accepted typed closeout、stale owner route、current-control admission、same-study single-flight、terminal Temporal observation 和 provider liveness 都只收敛 OPL ledger / projection，不改写 MAS/MAG/RCA/OMA truth，不刷新 publication eval、artifact gate、paper package 或 domain package。
- Temporal provider liveness 是 OPL runtime blocker：worker not ready/source stale/dependency unavailable/crash/stale state/guarded mutation 先投影为 OPL-owned provider repair or blocked safe action；provider proof、scheduler status、provider SLO、worker repair、compact timeline 或 evidence-worklist 计数不得抢占已存在的 domain owner delta。
- 2026-06-11 追加：`stage_run_currentness_identity` 不只是存在性登记，而是 default-executor live skip、terminal closeout reconcile 和 current-control projection 的共同路由身份。`sameStageRunRouteCurrentnessIdentity` 用同一 domain / study 或 quest / stage / action / work-unit / source / epoch / idempotency basis 判断候选 task 与 provider attempt 是否同一路由 currentness；它允许同一业务路由跨不同 `stage_attempt_id` 对账，也必须让 stale work-unit/source/currentness basis fail closed。该身份只归 OPL Runway ledger / projection / reconcile 使用，不让 OPL 持有 MAS owner receipt、typed blocker 或 quality authority。
- 本段压缩 2026-05-30 到 2026-06-09 的 Progress-First queue/currentness 实现增量；历史细节见 `docs/history/process/plans/2026-06-09-opl-decisions-progress-first-currentness-compression-closeout.md` 和 git history。

### 决策：source-stale worker restart 必须有 explicit supervisor 和 no-active-attempt proof

原因：OPL source fast-forward 后，旧 worker 被投影为 `worker_source_stale` 是正确的 fail-closed currentness 保护。旧 repair 路径只要看到 stale worker 和 `restart_temporal_worker` action 就 stop/start，缺少 active stage attempt 与 explicit developer-supervisor gate，可能在 running / checkpointed / human-gate attempt 期间杀掉 worker，并把 provider lifecycle repair 误当成普通恢复动作。

影响：

- `provider-slo tick` 与 `provider repair` 在 `worker_source_stale` 时必须先产出 `temporal_worker_source_stale_restart_guard`。只有 `worker_mutation_guard.mutation_guard_status=allowed_explicit_developer_supervisor`、Temporal service reachable、stage attempt ledger readable、且 blocking active attempt count 为 0 时，才允许执行 stop/start。`running` attempt 是 blocking active attempt；`queued`、`checkpointed` 和 `human_gate` 只进入 `diagnostic_stage_attempt_*` backlog 统计，不阻止 reload 新源码。
- Active attempt 状态固定为 `queued`、`running`、`checkpointed`、`human_gate`，与 provider-hosted default executor 和 stage attempt control 已有 live attempt 语义一致；旧 queue hold 只保留为 history/projection residue 语境。
- 任一 gate 不满足时，worker repair receipt 返回 `repair_status=blocked` 和 `blocker_ids`，不得调用 `stopTemporalWorkerLifecycle` 或 `startTemporalWorkerLifecycle`。`stage_attempt_ledger_unavailable` 也必须 fail closed，不能假设无 active attempt。
- 该策略只修 OPL provider worker liveness；它不消费 domain queue，不写 MAS/MAG/RCA truth，不生成 owner receipt / typed blocker / quality verdict，也不把 provider restart 计为 domain progress。

### 决策：Foundry Agent series 需要统一 canonical design profile

原因：MAS、MAG、RCA 和 OPL Meta Agent 都已经按标准 OPL Agent 接入，但如果每个 domain 把 `series_design_profile` 写成自己的 input/output taxonomy，机器验证只能看到“各自都像 OPL”，看不出它们是一套同源设计。series-level profile 应该表达所有 Foundry Agent 共同的不可变设计逻辑，领域差异应留在 domain-owned profile、stage/action contract 和 authority refs 中。

影响：

- `contracts/opl-framework/foundry-agent-series-contract.json` 固定 canonical `series_design_profile.profile_id=opl_foundry_agent_series_design_profile.v1`，并要求相同 shared lifecycle、generic input/output slots、stage pack sections、closeout shape 与 authority invariants。
- MAS/MAG/RCA/OMA 的 `contracts/foundry_agent_series.json` 必须使用同一个 canonical `series_design_profile`；domain-specific input/output、alias、authority function 和包装差异放入 `domain_specific_profile` 或既有 domain-owned contract 字段。
- `opl agents conformance` 把缺失或漂移的 canonical profile 作为 structural blocker。conformance 通过只证明 shared design signature 和 scaffold contract 对齐，不声明 domain ready、quality/export ready、artifact ready、App release ready 或 production ready。

### 决策：Foundry-series Progress-First policy bundle 必须有 OPL-owned release pin

原因：Progress-First 合同已经覆盖 stage progress、currentness、typed blocker lineage 和 App projection。如果 domain repo 只 pin OPL owner commit，而没有单独 pin policy bundle release，就容易出现两类漂移：domain adapter 复制一份旧 policy body 当成本地 authority，或 App/operator 看到共享 helper 已对齐却不知道 Progress-First policy surface 是否同版。共享 release pin 要把“依赖版本对齐”和“政策合同对齐”拆开，让 MAS/MAG/RCA/OMA 和后续 Foundry Agent 都能用同一套可验证 release ref/fingerprint 说明自己遵循的是同一个系列设计。

影响：

- `contracts/opl-framework/foundry-agent-series-policy-release.json` 成为 OPL-owned policy release surface，记录 Progress-First policy bundle、`sha256:stable-json` fingerprint、domain pin contract ref 和 authority boundary。
- `contracts/opl-framework/foundry-agent-series-contract.json`、standard scaffold 和 generated `contracts/foundry_agent_series.json` 都必须带 `shared_policy_release`，并要求 exact release ref、exact policy bundle fingerprint、`foundry:policy-release` alignment check。
- Domain repo 只能 pin release ref/fingerprint 和映射 domain alias；不能把 OPL policy body 复制成 domain truth、quality/export verdict、artifact authority、memory authority 或 owner receipt authority。
- 标准智能体不再安装或锁定 OPL Framework 实现；OPL 安装、更新并托管唯一 Framework 根包。Progress-First 只保留独立的机器合同 fingerprint，由 `foundry:policy-release` 校验语义版本，不形成第二个实现发布 channel。

### 决策：Progress-First 成为 OPL family shared stage contract

原因：MAS late-stage paper lane 暴露的问题不是单一研究个案，而是所有 Foundry Agent 都需要统一回答四件事：当前有没有交付物实质进展、是否只是 platform repair、下一次必须产出什么 delta 或 typed blocker、重复 blocker 何时升级。若这些字段留在各 domain 的局部 read model 中，App/operator、Foundry Kernel、evidence-worklist 和 readiness 会继续把 refs-only/currentness 修复误读成交付推进。

影响：

- 标准 `user_stage_log_contract` / `stage_progress_log` 扩展 `progress_delta_classification`、`deliverable_progress_delta`、`platform_repair_delta`，分类固定为 `deliverable_progress`、`platform_repair`、`mixed`、`typed_blocker`、`human_gate`、`stop_loss`。
- `effective_current_context.v1` 成为 owner route、source fingerprint、stage packet、workspace/session identity、latest closeout、running attempt 和 superseded lineage 的唯一 shared currentness packet。
- `family-stall-lineage.v1` 成为 repeated blocker 的 shared lineage/budget surface，并要求暴露 `next_forced_delta`、escalation owner 与 terminal flag。
- `contracts/opl-framework/foundry-agent-series-contract.json` 成为 Foundry Agent 系列化顶层合同；标准 scaffold 和 `opl agents conformance` 要求 domain repo 暴露 `contracts/foundry_agent_series.json`，把 identity、stage authority、progress/currentness/closeout packet、typed blocker lineage 和 App projection 边界统一到同一机器面。
- MAS/MAG/RCA/OMA 可以保留 paper/grant/visual/target-agent domain alias，但 alias 只映射到 OPL generic deliverable/platform delta；App 只消费 shared projection，不读取 domain artifact/body，也不新增 truth authority。
- platform repair、projection hygiene、currentness 修复、refs-only ledger 与 typed-blocker accounting 必须单独列账，不能显示成交付物实质进展。
- `family-stage-control-plane` 必须显式保存 `user_stage_log_contract`、`progress_delta_policy` 与 `typed_blocker_lineage_policy`；runtime stage log 必须对 `progress_delta_classification` 做枚举校验，未知分类 fail closed 为 typed blocker，并暴露缺失 Progress-First 字段与 evidence refs。

## 2026-05-28

### 决策：同步 domain-handler checkpoint 不受 Temporal workflow-missing 回收覆盖

原因：OPL family-runtime 中的 domain-handler dispatch 是同步 owner callable transport；它可以在 stage-attempt projection / dispatch receipt 中记录 checkpointed owner receipt / admission receipt，而不是一定启动一个可查询的 Temporal `StageAttemptWorkflow`。如果 terminal observation 回收器把这类 `domain_handler` executor 的 `temporal_workflow_not_started_or_not_found` 当成 provider failure，会把已被 domain owner 接收的 route task 错投影为 runtime unhealthy。

影响：

- `domain_handler` executor 的 stage attempt 不再因为 Temporal workflow-missing unavailable observation 被标记为 `failed`；该 observation 只能作用于真正由 provider workflow 承载的 stage attempt。
- MAS/MAG/RCA 等 domain-handler 仍必须返回 owner receipt、typed blocker、closeout refs 或 admission receipt；OPL 只保留 stage-attempt projection / attempt / liveness 投影，不据此授权 domain ready、quality verdict 或 artifact ready。
- 缺失的 provider scheduler cadence 不能报告为 healthy：`not_installed` 必须给出 `attention_required` 和 `opl family-runtime scheduler install --provider temporal`，让持续推进依赖显式 OPL provider scheduler，而不是 Codex heartbeat 手工补 tick。
- 若历史 residue 已经把 `domain_handler` attempt 写成 `failed` / `temporal_workflow_not_started_or_not_found`，但同一 stage-attempt projection 已由 domain-handler transport 标记为 terminal success，`current_control_state` 必须以 stage-attempt projection terminal observation 作为 OPL transport 收敛事实，并把该 terminal observation 标成 superseded observability evidence。这个状态仍然不等于 MAS owner receipt、domain ready、publication ready、artifact ready 或 paper package refreshed。

### 决策：uv archive cache recovery 成功后必须吸收到 managed-shell 首跑环境

原因：domain manifest 与 domain-handler command 的 `uv archive-v0` 缓存缺 `METADATA` 失败属于 OPL managed environment 损坏。若 OPL 只在当次失败后切 stable recovery tmp root，但后续 tick 继续从同一个损坏 primary `UV_CACHE_DIR` 首跑，就会让 Progress-first/read-model/reconcile 反复消耗一次无效失败和 retry。

影响：

- 当 `uv_cache_archive_missing` recovery retry 成功时，OPL 必须在 workspace-scoped managed root 写入 recovery marker；后续同一 workspace 的 domain manifest 与 domain-handler export / dispatch 首跑应直接使用该 stable recovery root。
- 当 domain clean runner 在 managed Python env 中出现 `ModuleNotFoundError` 这类 stale/incomplete env 证据时，OPL domain-handler export / dispatch 同样必须切到 fresh managed root 重试，并把 trigger 标为 `managed_python_env_missing_dependency`；不得把缺依赖吞掉、改成 domain ready，或恢复 domain 私有 runtime。
- marker 只改变 OPL managed shell 的 `OPL_DOMAIN_COMMAND_TMP_ROOT`、`UV_CACHE_DIR`、`UV_PROJECT_ENVIRONMENT` 等外部环境路由，不写 domain truth、不生成 owner receipt、不授权 domain ready、quality verdict、artifact authority、App release ready 或 production ready。
- 若 recovery root 自身失败，仍按原 domain manifest / domain-handler fail-closed 路径暴露错误、typed blocker、retry 或 dead-letter；不得用静默 fallback、随机 tmp root 或清空 checkout 缓存掩盖问题。

### 决策：domain-handler 非零退出的错误摘要优先采用结构化 owner stdout

原因：domain handler 由 domain owner 负责返回 typed receipt / blocker。`uv`、安装器或 runner 可能在 stderr 输出环境同步噪声；如果 OPL queue `last_error` 优先采用 stderr，就会掩盖 stdout 中的 `reason` / `detail` / `blocked_reason`，让 operator 和自动巡检看不到真正的 owner blocker。

影响：

- `family-runtime` 在 domain-handler 非零退出时，超时和 spawn error 仍优先；除此之外，若 stdout 是结构化 JSON 并携带 `reason`、`detail`、`message` 或 `blocked_reason`，task `last_error`、tick dispatch `error`、stage activity error 和 notification body 必须使用该结构化摘要。
- stderr 和 stdout 继续保留在 runtime event payload 中，供诊断命令噪声、环境同步或底层进程行为；但无结构化 owner 错误时才回退到 stderr。
- 该规则只改善 OPL queue / retry / dead-letter 可观察性，不把 OPL 变成 MAS/MAG/RCA truth、quality verdict、artifact authority 或 owner receipt signer。

### 决策：App drilldown 继续通过真实模块拆分恢复 line-budget gate

原因：OPL line budget 仍是结构维护信号，但不再作为普通 `scripts/verify.sh` 的第一道硬门。若当前 main 的 App drilldown 聚合器或长测试超过 reviewed baseline，应通过职责明确的 parts 模块和独立测试文件在结构治理任务中收薄，而不是让普通 feature verify 被行数预算卡住，或把结构 debt 当成下游 domain 任务失败。历史超线文件可以通过 `contracts/opl-framework/source-structure-budget.json` 记录 reviewed baseline，但 baseline 只表示已审查的维护账本，不表示该结构已经理想。

影响：

- `runtime-tray-app-operator-drilldown` 继续保持薄聚合器；新增投影块进入 `runtime-tray-app-operator-drilldown-parts/`。
- App drilldown 的 manifest-cache 等独立测试场景必须独立成 case 文件；文件回到默认预算内后必须删除 retired baseline。
- 该规则只恢复 OPL repo 结构验证与可维护性，不改变 MAS/MAG/RCA truth、quality verdict、artifact authority 或 owner receipt 边界。

### 决策：Temporal provider 与长 CLI case 的 line-budget 恢复同样走 parts/cases 拆分

原因：同一 line-budget ratchet 规则适用于 provider runtime 与长 CLI test case。若 `family-runtime-temporal-provider.ts` 或 provider/system/MAS 相关测试超过 locked baseline，优先把稳定子职责迁入 `family-runtime-temporal-provider-parts/` 或独立 `tests/src/cli/cases/**` case/helper 文件；文件回到默认预算内后同步删除 retired baseline。

影响：

- `family-runtime-temporal-provider.ts` 保持 public export aggregator 与 worker lifecycle 入口；scheduler cadence 等独立 provider primitive 放在 provider parts 模块。
- 长测试按行为组拆分，聚合入口负责 import coverage，不用单文件继续承载所有 system/provider case。
- 该规则只治理 repo-source maintainability 和标准验证可执行性，不声明 provider production long-soak、domain ready、owner-chain closeout 或 global goal complete。

## 2026-05-27

### 决策：用户可读 stage log 成为标准 OPL Agent admission 要求

原因：stage attempt 的时长、token、cost 和 closeout refs 是 OPL 通用可观察性，但用户真正关心的是每个 stage 里问题是什么、目标是什么、对论文/基金/视觉交付/agent 构建做了什么、结果如何、还剩什么 blocker 和证据在哪里。这个语义不能由 OPL 从 artifact body 或领域 truth 里推断；必须由 domain stage closeout 明确返回，或明确返回 typed blocker。

影响：

- `stage_progress_log.user_stage_log` 是 OPL 投影面；OPL 负责 attempt ledger、duration、token、cost、usage refs、closeout refs、receipt refs 和 missing/null 语义，不生成领域解释。`duration` 可以用 provider start/end 或 attempt created/updated 作为用户可读 fallback，但 `duration_telemetry_status` 仍必须保留真实 telemetry 是否缺失。
- 标准 domain agent scaffold / admission contract 现在要求 `user_stage_log_contract`，并要求每个 stage closeout 提供 `stage_name`、`problem_summary`、`stage_goal`、`progress_delta_classification`、`deliverable_progress_delta`、`platform_repair_delta`、`next_forced_delta`、`stage_work_done`、`changed_stage_surfaces`、`outcome`、`remaining_blockers` 和 `evidence_refs`，或给出 typed blocker。
- `token_usage` / `cost` 缺失时只能显式保留为 observed-missing/null，不允许填 0 或事后猜测；domain 给了不完整人话摘要时，OPL 必须暴露 `missing_domain_fields`，不能把半截摘要当成完整 stage log。
- MAG、RCA、OMA 这类 Foundry Agent 需要在各自 stage plane 中声明同一合同，并由各自 owner 提供 grant-facing、visual-facing 或 agent-building-facing 的人话摘要。OPL admission / App / Foundry Kernel 只消费该摘要和 refs，不写 domain truth、不读 artifact body、不授权质量或 export ready。

### 决策：嵌套 runtime help 是只读命令发现面

原因：operator 巡检经常通过 `--help` 确认当前 OPL CLI 是否支持某个 runtime 子命令。如果 `opl family-runtime queue list --help` 执行真实 queue list，或者 `provider-slo tick --help` / `tick --help` 穿透到 runtime parser 报 unknown，就会把帮助探测变成巨量 read-model 输出或误判为功能缺失。

影响：

- 顶层 CLI 在 command 参数中遇到 `--help` 时，必须返回对应 command-scoped help；`--help` 位于 `--` passthrough 之后时继续由下游命令接收。
- `family-runtime` help / usage 必须列出当前可用的 provider SLO、scheduler cadence status/trigger 和 attempt query/inspect surfaces；本地 queue redrive、queue hold/release、queue list、enqueue/intake/tick 不再作为成功入口出现在当前 help。
- help 输出只做命令发现，不启动 queue、tick、provider proof、domain dispatch 或任何 runtime mutation。

## 2026-05-21

### 决策：OPL stage / route 调度固定为 graph hydration reconciliation attempt-ledger 模型

原因：MAS 这类复杂 domain agent 会输出 owner-route、route-back、typed blocker、owner receipt、source fingerprint、dispatch ref 和推荐 task/stage 语义。如果把 route 当成小 Stage，OPL 会重新发明 domain runtime，或者让 domain repo 继续保留私有 scheduler / runner / lifecycle loop。经 2026-07-13 的 Multi-Attempt Stage 收敛后，正确分层是：Stage 表达一个主要开放语义判断，StageRun 是该 Stage 的一次 durable 工单，Attempt 是同一 StageRun 内一次独立 executor 调用。`family-owner-route` 是 domain-owned 输入/建议包；只有 StageRun 的终局 decisive Codex Attempt 将其中可采纳的语义写成 `route_impact.stage_route_decision`，它才成为权威的跨 Stage 路由判断。OPL 只校验 ABI/Attempt authority、运输 refs、物化 declared target，并用 stage graph、reconciliation、read model 和 attempt ledger 管理可见性与恢复。

影响：

- `contracts/opl-framework/stage-route-transport-contract.json` 成为 framework-level stage/route 调度边界合同。它把 MAS 作为 complex-domain reference，固定 stage、route、route hydration、attempt ledger 四个定义，并声明 route 不是小 stage、route hydration 不执行 route、provider completion 不等于 owner receipt。
- `family-stage-graph-projection` 继续表达 admitted stage pack 的 nodes、requires/ensures edges、integrity digest、launch blockers 与 scheduler/App read model；它不执行 stage、不写 domain truth、不授权 domain readiness。
- `family-owner-route` 继续表达 domain owner 的下一步建议、route-back 建议、typed blocker、allowed action、owner receipt 或 handoff refs；它不等于 Attempt，不是 stage graph 的隐藏 node，也不能绕过终局 decisive Codex Attempt 直接成为 `stage_route_decision`。
- `family-runtime-attempt-contract` 负责把 owner-route refs、typed blocker refs、owner receipt refs、source fingerprint 和 dispatch ref 记录为 route hydration input / attempt ledger refs，并输出 stage attempt request/projection、conflict envelope 或 operator projection。
- OPL reconciliation loop 的读法对齐 Temporal event history、LangGraph checkpoint / conditional edge、Kubernetes desired/current reconciliation 与 Dagster graph/op boundary，但只吸收图、checkpoint、reconciliation、read-model 和 op boundary 模式，不引入这些系统作为新的 OPL core runtime，也不把 domain truth / quality verdict / artifact authority 迁入 OPL。
- 后续若 MAS/MAG/RCA 或新 Foundry Agent 暴露 route refs，默认先检查 OPL route hydration、stage graph、attempt ledger、dead-letter 和 owner receipt projection；不得让 domain 仓重新补 generic scheduler、local queue、attempt loop、SQLite lifecycle platform 或 App/workbench wrapper。

### 决策：MAS publication aftercare owner-route refs 由 OPL stage-attempt projection 承接

原因：MAS 已按标准 OPL Agent 边界收薄为只输出 publication aftercare owner-route refs、source refs、typed blocker refs 与 owner receipt refs。后续推进不能再让 MAS 补 runtime liveness、active run、redrive、retry/dead-letter 或 queue arbitration；这些属于 OPL provider/runtime manager 与 provider-backed stage-attempt projection。

影响：

- MAS sidecar export 的 `publication_aftercare/*` refs-only owner-route handoff 只能进入 OPL stage-attempt request/projection 或 provider-backed dispatch state，不再通过 `opl family-runtime intake|tick --hydrate` 创建本地 queued task。OPL 接受 MAS 使用 `med-autoscience` domain alias、`recommended_task_kind`、`owner_route_ref(s)`、`owner_route` explicit ref、`runtime_state_path`、`quest_waiting_opl_runtime_owner_route` reason 和 `opl_runtime_owner_route_handoff` envelope，但只把这些作为 attempt/projection refs。
- OPL runtime status 可以展示 `owner_route_refs`、`owner_receipt_refs`、`typed_blocker_refs`、`source_refs`、`source_fingerprint` 与 publication aftercare reason，但这些只是 refs 和投影，不是 MAS quality verdict、study truth 或 artifact authority。
- MAS sidecar dispatch 仍是 domain owner callable；OPL 只负责 stage-attempt request/projection、dispatch transport、retry/dead-letter 和 operator status。是否更新论文、publication gate、AI reviewer verdict 或 current package，继续由 MAS owner receipt / typed blocker 决定。
- 任何 DM002 这类 paper-line 卡住时，优先检查 OPL provider-backed stage-attempt projection / attempt / dead-letter，再回到 MAS owner surface；不得把 liveness / redrive 仲裁补回 MAS 私有 runtime，也不得恢复 OPL 本地 queue runtime。
- 2026-06-09 的 `family-runtime scheduler` cadence / `tick --hydrate` 规则只保留为历史 provenance；当前不能作为 active command path 复活。
- `domain_owner/default-executor-dispatch` 的 stage-attempt projection success 只表示 OPL 已接收 domain owner handoff 并启动或记录 provider-backed attempt；它不是 Codex owner attempt 完成、MAS owner receipt、publication quality closeout、artifact gate 或 package refresh。
- `codex_cli` 作为当前第一公民 executor 必须走真实 runner / typed closeout / StageRun binding / provider blocker 语义；dry-run、fixture、diagnostic 或 read-model projection 只能在显式测试/诊断入口出现，不能成为 live owner handoff 的兼容降级。
- `stage_attempt_workbench`、`stage_progress_log`、`user_stage_log`、Temporal terminal observation、safe read-model sync、typed closeout parser、current attempt binding 和 stage-attempt projection sync 都是 OPL provider/read-model currentness projection；它们让 operator 看清 transport state、semantic summary missing、terminal failure、typed closeout refs 和 liveness blocker，但不能关闭 domain stage、生成 MAS owner receipt、刷新 artifact/package 或声明 production evidence。
- Dead-letter retry budget、bounded SQLite/read-model wait、attempt cancel 和 provider cancellation are OPL attempt/provider owner actions. They can restart, pause, cancel or project transport state through provider-backed attempt semantics; retired queue hold/release/redrive/stranded-hold repair must not return as local runtime success paths.
- Codex JSONL/session recovery、stage-attempt projection terminal sync、domain-handler closeout requirement、task-level projection ordering, executor single-flight, stale source supersession and study-level mutual exclusion are currentness implementation details owned by source/tests/read-model. The durable decision is that OPL may reconcile attempt and provider projection state, but cannot infer or overwrite domain completion from stale provider observations.
- Temporal worker lifecycle, source-version equivalence, workflow bundle, dependency integrity, replay gate, payload guard, worker stop/orphan cleanup, Developer Mode shared-state mutation guard, resident worker supervision and provider safe-action ordering are OPL provider substrate rules. They belong to Runway/provider source, lifecycle receipts and tests; they do not become MAS progress, domain receipt, artifact authority, release readiness or production closure.
- Details compressed by this tranche are history/provenance only. Current field names, event names, timeout constants, guard reasons and command payloads must be read from source, contracts, CLI/read-model output and tests, not from this decision file.

## 2026-05-20

### 决策：MAS Hermes scheduler ensure path 退役为 cleanup-only

原因：OPL family runtime 已把 production cadence 固定到 Temporal-backed provider 与 OPL provider/runtime manager。MAS 继续创建、刷新、触发或恢复 Hermes cron tick，会形成第二 scheduler owner，并重新污染“domain repo 不持有 generic scheduler / daemon”的标准 OPL Agent 边界。

影响：

- MAS `runtime-ensure-supervision --manager hermes` 不再是公开入口；controller direct-call 只返回 retired tombstone。
- 显式 Hermes 只保留 `runtime-supervision-status --manager hermes` 与 `runtime-remove-supervision --manager hermes`，用于读取或移除旧 job/script/session/gateway evidence。
- MAS 不再写 Hermes tick script，不 create/edit/resume/run cron job，也不修复旧 watch-runtime service。
- 默认 scheduler/cadence owner 是 OPL provider/runtime manager；domain repo 只能输出 paper-progress SLO 语义、owner receipt、typed blocker、safe action refs、no-forbidden-write evidence 或 legacy cleanup/tombstone refs。
- 后续任何 domain agent 若需要周期性唤醒，只能通过 OPL provider scheduler、stage attempt、queue、SLO/projection 或 explicit cleanup diagnostic path 表达，不能在 domain 仓重新引入私有 daemon。

## 2026-05-19

### 决策：OPL 采用 AI-first、AI 原生专家判断优先、contract-light 作为长期智能体原则

原因：OPL 的目标是让高价值知识工作随着 `Codex CLI` 等 AI executor 的能力进步持续变强。如果把规划、创作、审稿、路线判断、修订和诊断策略写成越来越厚的脚本或合同，系统会把当前 AI 能力冻结成机械流程，也会让后续模型升级难以转化为真实智能体进步。更合适的边界是：OPL 用 stage、selected executor 和推荐显式声明的 AI strategy refs（prompt、skill、knowledge、rubric、quality gate refs）承载开放式智能工作；合同只承担边界、安全、权限、审计、receipt、阻塞、恢复、projection 和 fail-closed 这些下限。

当前 active narrative 进一步收敛为 `Minimal Trust Kernel + Readiness + Derived Diagnostic Lenses + Surface Budget + AI Capability Aperture`。Minimal Trust Kernel 是最小合同核；Readiness 是 operator / App 默认聚合面；Derived Diagnostic Lenses 只解释 blocker、assumption、cohort、runtime budget、replay、failure localization 或 route-back evidence；Surface Budget 控制新增默认 surface 的升级门槛；AI Capability Aperture 保留开放式专家执行空间，让更强 executor、domain stage pack 和 reviewer 能力直接进入系统收益。外部框架或论文只允许贡献 boundary / evidence / audit / replay / route-back 这类治理词汇，不引入 runtime、planner、proof assistant、workflow compiler 或 domain verdict 角色。LangGraph 的 checkpoint / time-travel / replay，AutoGen 的 agent runtime 边界，以及 CrewAI 的 Crew / Flow 分层只作为成熟经验词汇进入 OPL 的 refs-only control plane；OPL 不引入 LangGraph、AutoGen、CrewAI、CrewAI Flow 或 AHE runtime dependency。

影响：

- `family-stage-control-plane`、action catalog、proof bundle、receipt、runtime event、projection 和 App/operator read model 只能固定 owner、输入输出 refs、权限、禁止写入、handoff、expected receipt、gate、blocker、audit 和 recovery 语义；不能把 stage 内的推理、写作、审查、路线探索或修订策略写成封闭流程引擎。
- AI-first 不等于无边界。涉及 artifact mutation、memory writeback、quality verdict、publication/fundability/visual/export verdict、credential/network/write policy 或 owner authority 的行为仍必须通过 explicit owner boundary、independent gate receipt、no-forbidden-write、human/owner gate 或 typed blocker 约束。
- AI 原生专家判断优先意味着 readiness、scorecard、checklist、schema 完整性、contract completeness、descriptor ready、provider proof 或 generated surface proof 只能作为 advisory、evidence gap 或 blocker localization；它们不能替代 AI reviewer/auditor、domain-owned quality gate、owner receipt、typed blocker 或 route-back verdict。
- Contract-light 不等于少证据。OPL 仍必须保留 attempt ledger、runtime event、receipt、source/artifact/workspace refs、proof bundle、SLO、replay/audit 和 recovery surface；轻的是智能行为本身，不是审计和安全边界。
- 后续优化优先投向 domain stage pack、prompt、skill、knowledge、rubric、quality gate refs、AI reviewer/auditor attempt 和 executor adapter 能力；这些 AI strategy refs 推荐显式声明，但不构成 OPL launch hard gate，质量 / 专家判断仍归独立 AI reviewer、domain-owned quality gate、owner receipt、typed blocker 或 route-back verdict。
- 该原则不改变 domain ownership：MAS/MAG/RCA 继续持有 domain truth、quality/export verdict、artifact authority、memory body / accept-reject decision 和 owner receipt；OPL 只托管、调度、投影和审计边界。
- 新增 surface 默认先进入 refs、warning、diagnostic lens、reference 或 history。只有满足 launch safety、authority boundary、evidence / replay / audit / route-back，或被 App / runtime 反复消费，才允许升级为 default surface；只有影响错误启动、越权或不可审计 / 不可恢复，才允许升级为 hard gate。该预算由 `contracts/opl-framework/surface-budget-policy.json` 作为机器政策冻结。
- 2026-05-22 追加：`contracts/opl-framework/public-surface-index.json` 中每个 active public surface 必须携带 `surface_budget` envelope，并由 `contracts/opl-framework/surface-budget-policy.json` 约束。该 envelope 显式声明 default surface 状态、允许理由、promotion evidence refs、consumer refs 和 authority false flags；默认 public surface 只能作为 App / operator navigation、framework discovery 或 authority-boundary attention entry，不能声明 domain ready、quality verdict、artifact authority、production ready，也不能替代 AI executor planning 或 domain owner。

本决策的 stage-led 合同读法同步为：Stage pack提供启动context；AI-first执行不被静态合同写死；默认selected executor是`Codex CLI`，非默认adapter必须显式绑定。`requires` / `ensures`、scope、composition、expected receipt、audit、replay与route-back refs在启动前只做diagnostic检查，缺口不能拒绝launch。Stage Kernel只硬守wrong-target identity/currentness、executor availability、authority/forbidden write、权限安全、不可逆动作和human decision。其他未闭合边界返回quality debt、review context或route recommendation；descriptor/read model/generated/provider/cleanup proof不能替代production evidence。

## 2026-05-18

### 决策：One Person Lab App 的产品运行路径默认使用 OPL-managed environment，developer checkout 只能显式 override

原因：MAS/MAG/RCA 的 skill、MCP、product-entry 与 generated interface 已经由 OPL 统一发现和投影，但本机同时存在 OPL-managed modules、`~/.codex/skills`、Codex plugin cache 和 workspace developer checkout。若 App 普通用户路径直接依赖 developer checkout，workspace 的 dirty/ahead/实验分支会污染产品运行环境；若完全忽略 developer checkout，又会让开发调试无法验证下一版行为。因此必须把产品运行真相和开发 override 分开：App 默认使用 managed environment，开发仓只在显式 opt-in 时生效。

影响：

- One Person Lab App、`opl install`、`opl system initialize`、`opl connect modules`、`opl connect sync-skills` 与 Codex-visible plugin/skill metadata 默认以 OPL-managed modules 为产品运行来源。旧 `opl modules` 与 `opl skill sync` 已退役并 fail closed 到 Connect 替代入口，不作为机器或用户前门。
- App 启动维护、每个 hosted action 与每个新 child Attempt 都可静默检查 source channel 并物化最新可运行 generation；普通渠道从已验证的 Release Set 获取，Developer Mode 从本机 checkout 当前可读 bytes 获取。新 generation admission 失败时继续 LKG，不要求用户先 repair/reload。
- dirty、ahead、diverged、no-upstream、version/digest/receipt 漂移都只作为 provenance observation；OPL 不覆盖 developer checkout，也不修改用户源目录，而是在 OPL state 内生成 content-addressed immutable snapshot。只有真实 ABI/module/Skill/路径/权限/安全/health/handler probe 失败且无 LKG 时显示阻断。
- developer checkout 只通过显式开发模式、环境变量、workspace registry 或命令行 override 进入 source channel；默认 `auto` 配置在 GitHub identity 等于 `auto_enable_github_login`（当前默认 `gaofeng21cn`）且 mode 为 `developer_apply_safe` 时，等价命中 Developer Mode local checkout source channel。App 可以显示当前 channel 与所选 generation，但不得把 provenance 漂移投影为 `attention_needed`。
- 不得用 developer checkout 静默覆盖 managed runtime，不得把 Codex plugin cache、`~/.codex/skills` 或 domain repo 下的 `.agents/plugins/marketplace.json` 当成第二真相源；它们只是 active source channel 的本地投影。标准 domain agent 的 Codex config marketplace `source` 由 OPL 写到 `OPL_STATE_DIR/codex-plugin-marketplaces/<marketplace-id>` 这一 OPL-owned wrapper root；wrapper 内 `plugins/<plugin-id>` 是 OPL 从当前 active repo 的 `agent/primary_skill/SKILL.md` 和 action-contract readback 生成的 canonical Codex carrier，会把 Codex-visible id 投影为 `mas`、`mag`、`rca`、`oma`、`obf`，但不把短名写回 domain repo 的 package/source identity。Developer Mode 命中开发 checkout 时不得继续读取 OPL-managed module copy，也不得为了刷新 Codex metadata 在 domain agent 开发 checkout 写入 `.agents/plugins/marketplace.json`。旧 repo plugin 目录只能作为 compat/provenance mirror，不能替代 primary skill source。Config Hygiene 只移除 source 已消失且身份与路径一致的 OPL 临时 marketplace，包括 `opl-repo-temp*` 和 `opl-package-<package-id>-source-state-* / codex-plugin-marketplaces/<matching-marketplace-id>`；存在的 OPL source、身份不匹配的条目和第三方 marketplace 必须保留，apply 继续受 backup、CAS、receipt 与 rollback 约束。
- managed module health check 必须调用目标 module 的真实验证入口。OPL Meta Agent 的 repo-owned contract 是 `scripts/verify.sh smoke|typecheck|full`，因此 OPL 对 `oplmetaagent` 使用 `smoke` lane；OPL 不要求 OMA 添加 `fast` 兼容 alias，也不把 OPL 自身 lane vocabulary 强加给目标仓。
- OPL 消费 MAS sidecar export / owner-route handoff 时，也必须先通过 OPL module locator 解析 active MAS module checkout，再以 `uv run --directory <checkout> --extra analysis medautosci sidecar export ...` 调用 domain sidecar；不得裸调用 PATH 上的旧 `medautosci` 工具。DM002 这类 live paper handoff 的完成证据是 Temporal-backed stage-attempt evidence 加 MAS owner receipt 或 typed blocker，不是本地 queue hydrate 成功或 MAS 内部 runtime liveness/resume 投影。
- 该决策不改变 domain truth、quality verdict、artifact authority 或 direct app skill path 的 owner。MAS/MAG/RCA 继续持有领域权威；OPL/App 只管理安装、发现、同步、投影、health 和可见维护状态。

### 决策：OPL Developer Mode 由系统配置、App 设置开关和 Foundry Kernel 巡检/修复路由共同承接

原因：OPL 同时服务普通用户和开发者。普通用户路径需要稳定的 managed environment；开发者路径需要在智能体调用过程中把发现的 framework / domain repo 问题直接转成可审计的修复、提交或 PR。若只靠 developer checkout override，容易把产品运行真相和开发修复权限混在一起；若只靠观察告警，又会让已经具备 repo 权限的维护者无法把问题闭环。因此需要把 Developer Mode 定义成独立系统配置和 App 设置面，并把外围 AI 巡检、问题归因、owner route、repo fix / PR route 放到 OPL Foundry Kernel 优先承接。

影响：

- 产品名是 `OPL Developer Mode`；当前机器面可以沿用 `developer_supervisor` 配置与 `opl system developer-supervisor` action。配置属于 OPL state，不属于某个开发 checkout。
- `OPL Developer Mode` 只是开发者路径开关：它允许 App / CLI 暴露 developer checkout source channel、repair route 和外围巡检入口，但本身不授予 upstream direct write，也不把 local checkout source 变成 repo authority。
- One Person Lab App 设置页必须有 Developer Mode 开关，并显示当前状态、配置来源、GitHub login、模式、当前 source channel 和可用 repo authority。安装流程检测到配置的 developer login（默认 `gaofeng21cn`）时可以默认开启 local checkout source channel；其他用户可以手动开启。
- Developer Mode 至少区分只观察的外围巡检模式和 `developer_apply_safe` 模式。前者只产生 evidence / issue / PR proposal；后者在权限满足时允许进入 repo 层修复、提交和 owner-visible 审计路径。
- repo developer / collaborator 身份必须按目标 repo 判断。direct write 只来自 target repo / target agent 的真实 GitHub authority；具备直接写权限时，可以在对应 repo 的受控 worktree / branch 中修复并提交；不具备直接写权限时，只能创建 fork / branch / pull request 或进入 owner handoff，不得静默推送到 upstream。
- Developer Mode 的 developer 身份不是单一全局身份：OPL maintainer 只在 GitHub repo permission 覆盖的 OPL/agent repo 上获得 direct-fix；target-agent developer 只在自己 agent repo 上获得 direct-fix；普通 contributor 即使手动开启 Developer Mode，也只能捕获反馈、生成 issue/fork/PR evidence。手动开启不能把无写权限 repo 升级成 direct mutation。
- Developer Mode 开启后，任务可以默认启动外围 AI 巡检。巡检由 Foundry Kernel 或同等 refs-only control plane 组织，输出 blocker、owner route、candidate fix、evidence refs 和 PR refs；它不拥有 domain truth、quality verdict、artifact authority、memory body 或 owner receipt authority。
- Developer Mode 不改变 managed environment 优先原则。普通用户运行仍以 OPL-managed modules / skills / plugin metadata / provider state 为真相；开发修复和开发 checkout source 只通过显式配置、显式身份和可审计 repo route 生效。`auto` 命中只允许 source channel 选用本机开发 checkout；shared runtime mutation 仍必须满足 `enabled=on`、`mode=developer_apply_safe`、`source=user_config`。
- 2026-07-05 追加：Developer Mode public CLI/read-model 输出必须保留 `enabled`、`mode`、`effective_state`、`allowed_route` 兼容字段，但新消费方应优先读取 `developer_profile`、`capabilities` 与 `agent_authority`。`developer_profile` 至少区分 Contributor、Maintainer、Runtime Maintainer；`capabilities` 必须分别表达 `source_channel`、`workspace_trust`、`github_authority`、`agent_automation`、`runtime_mutation_scope` 的 `status`、`level`、`source` 和 `impact`；`agent_authority` 固定 feedback capture、authorized direct-fix、manual-on-without-write、official/third-party-without-authority 的 route matrix。local checkout source、repo direct/fork route、shared runtime mutation许可不得继续压缩成单一 Developer Mode 开关；shared runtime mutation 只有在 `enabled=on`、`mode=developer_apply_safe`、`source=user_config` 时投影为 ready。
- 2026-07-16 supersession：标准 OPL Agent 的 feedback self-evolution 统一创建新的 `mode=improve` FoundryRun。target agent / package 只发布 domain-thin observation 与 feedback refs；OPL 绑定 exact active version、运行 OMA `design|diagnose`、物化新候选、独立评测并按风险进入 Owner gate/canary/activation。OMA 返回完整下一版 blueprint，不规划 repo patch；MAS 等 domain 侧仍是 feedback source 与 target Owner，不承担通用优化控制面。

## 2026-05-17

### 决策：吸收 academic-research-skills 的完整性 / 引用支撑 / checkpoint 模式为 OPL-owned stage integrity metadata primitive

原因：`Imbad0202/academic-research-skills` 里值得吸收的不是论文运行时或领域判断，而是把开放式学术工作拆成阶段，并在阶段边界显式记录 integrity check、citation / claim support、evidence handoff、data access 和 human checkpoint 的模式。OPL 需要这类通用 metadata 来增强 stage packet、App/operator drilldown 和 fail-closed routing；但医学论文真相、基金可行性、视觉质量、artifact 权威和 direct app skill path 必须继续归 MAS/MAG/RCA 等 domain agent。

影响：

- `contracts/family-orchestration/family-stage-integrity-metadata.schema.json` 成为 active family orchestration companion contract。
- `family-product-entry-manifest-v2` 可以通过 `family_stage_integrity_metadata` 暴露可发现的 stage integrity metadata projection。
- OPL 只持有 schema、discovery、transport、projection、human checkpoint route 和 fail-closed metadata vocabulary。
- MAS/MAG/RCA 只发布 domain projection / thin adapter；底层 evidence ledger、audit body、owner receipt、quality verdict、publication / fundability / visual authority、artifact authority 与 direct skill path 继续归 domain。
- 该吸收不引入 `academic-research-skills` runtime dependency，不重写 domain stage，不授权 OPL 生成 domain-ready、publication-ready、fundability-ready、visual-ready 或 artifact-ready verdict。

### 决策：吸收 Co-Scientist 风格 candidate loop 为 refs-only stage candidate contract

原因：Co-Scientist 式 candidate portfolio、assumption decomposition、provenance check、negative path 记录、ranking / proximity metric 和 human review loop 对 OPL family 的开放式 stage 很有价值。但这些能力只能上升为 OPL-owned refs-only projection contract，不能把 OPL 变成领域 candidate truth owner、scientific quality judge、artifact authority 或 owner receipt signer。

影响：

- `contracts/family-orchestration/stage-candidate-portfolio.schema.json` 成为 active family orchestration companion contract。
- OPL 只持有 schema、discovery、index、projection、advisory metric refs 和 review route refs。
- ranking / proximity / advisory metrics 只能作为 operator / reviewer 路由输入，不能声明 candidate acceptance、domain ready、quality verdict、artifact authority 或 stage completion。
- MAS/MAG/RCA 和未来 domain agent 继续持有 candidate body、evidence body、accept/reject decision、domain truth、quality verdict、artifact body authority、owner receipt 与直接 domain skill path。

## 2026-05-16

### 决策：workspace initialization 是 OPL-owned framework action，不进入 domain family action catalog

原因：MAS/MAG/RCA/OMA/OBF 都需要默认可用的 Stage Native workspace topology，但创建 OPL workspace skeleton 与写入 OPL workspace registry 是 framework responsibility。domain repo 可以持有 domain truth、artifact body、product view、owner receipt、typed blocker 和 quality/export verdict，但不能写 OPL registry，也不能把 workspace topology 初始化包装成 domain-owned action。

影响：

- `opl workspace init --agent <mas|mag|rca|oma|obf>` 是显式初始化面，可使用已配置 OPL workspace root 或显式路径，按 `workspace_topology_profile` 物化 shared roots、project root、`artifacts/stage_outputs`、`workspace.yaml` 和 `workspace_index.json`，并默认激活 workspace registry binding；同 topology 的 series / portfolio workspace 可追加 project，而不是覆盖 metadata。
- `opl workspace ensure --agent <mas|mag|rca|oma|obf>` 是默认快速入口：先复用 active binding 和已有 project，缺 workspace 或缺 project 时再调用同一 topology initializer；复用 active binding 时也必须补齐并检查 OPL-owned protocol refs，不能把旧 binding 当成结构健康证明。`opl workspace interfaces` 以 ensure 作为 CLI/App/MCP/Skill/OpenAI/AI SDK command contract；App 的 `workspace_ensure` action 调 ensure，`workspace_initialize` 保留为显式 init action。
- `opl actions export --domain ...` 继续只投影 domain-owned `family_action_catalog`，不导出或执行 framework workspace initialization。
- 该 action 只写 OPL topology metadata 和 registry binding，不写 domain truth、不创建 owner receipt 或 typed blocker、不修改 artifact body、不授权 quality/export 或 production readiness。
- 2026-06-07 追加：`contracts/opl-framework/agent-workspace-norm-contract.json` 是 OPL Agent workspace 的可执行规范锚点，`contract validate`、`opl workspace interfaces`、workspace-local `workspace_index.json`、App workspace actions 和 `opl agents conformance` 都必须消费它。它固定 `workspace ensure` 为默认 pre-task gate、`workspace init` 为显式初始化、MCP/Skill/OpenAI/AI SDK 为 descriptor-only delegate、Stage Native 用户检查面为 project-local `artifacts/stage_outputs`，并把 runtime-state / conformance pass / OPL registry projection 的 authority false flags 固定为机器检查项，避免各 domain agent 或 GUI 入口各自漂移。
- 2026-06-07 追加：`contracts/opl-framework/workspace-index.schema.json` 是 workspace-local `workspace_index.json` 的实例级合同。`workspace_index.json` 必须同时提供统一物理根、领域命名和统一语义层：新 workspace 的 `workspace_topology_profile.project_collection_path` / `canonical_topology.project_collection_path` 默认固定为 `projects`，`workspace_index.json.projects[*].project_root` 默认落在 `projects/<project-id>`；MAS 的 `studies` 与 RCA/MAG/OMA 的 `deliverables` 只作为 `display_labels`、`legacy_project_collection_aliases`、adopt/provenance terminology 或 domain semantic alias，不再定义 canonical physical root。`canonical_topology` 统一映射到 `workspace_group -> project_units -> stage_artifact_unit -> owner_receipt_or_typed_blocker`，`display_labels` 保留领域显示名，`shared_resources` 给 shared roots 明确 role / manifest ref / owner / user-visible / domain-truth-owner，`generated_refs` 给出 `workspace_inspection_ref` 与 `workspace_resource_inventory_ref`，`projects` 给每个 project/study 明确 stage outputs root manifest ref、stage outputs index ref、current stage pointer ref 与 lifecycle。
- 2026-06-07 追加：`workspace_inspection.json`、`workspace_resource_inventory.json`、project-local `artifacts/stage_outputs/stage_outputs_index.json` 和 `artifacts/stage_outputs/current_stage.json` 是 OPL Workspace Protocol 的实际 projection 文件，不是可选文档建议。`init` / `ensure` / `adopt --apply` 必须生成并索引它们；`upgrade --apply` 必须补齐缺失 projection，但不得覆盖 runtime 已写入的合法非空 current pointer；`validate` / `doctor` 必须检查存在性、协议形状、lifecycle status 集合和 authority false flags。
- 2026-06-07 追加：`opl workspace validate --workspace <path>` 是 hard-blockers-only gate；`opl workspace doctor --workspace <path>` 是同检查的只读诊断，并分层输出 `hard_blockers`、`repairable_findings`、`advisory_warnings` 与统一 `findings`；`opl workspace adopt --agent ... --workspace ... --dry-run|--apply` 支持既有目录采用，apply 只写 OPL-owned metadata / manifests / map / health / inspection / inventory / stage projections，不写 domain truth、不绑定 registry、不迁移 artifact body；`opl workspace upgrade --workspace ... --apply` 原地刷新 generated refs，不移动 project root；`opl workspace project archive --workspace ... --project-id ... --apply` 只更新 indexed project lifecycle，不删除文件，也不等价于 registry binding archive；`opl workspace export-map`、`opl workspace health`、`opl workspace inspect` 和 `opl workspace inventory` 提供只读用户检查投影。`opl workspace interfaces`、App action catalog 和 App action execute 必须暴露这些管理面，避免 workspace 合同只有叙事没有可调用接口。
- 2026-06-08 追加：workspace governance v2 把 generated projection 的 canonical root 固定到 `control/opl/projections`，把默认用户检查摘要固定到 `control/opl/reports/workspace_report.json`；根层 `workspace_map.json`、`workspace_health.json`、`workspace_inspection.json`、`workspace_resource_inventory.json` 和 `workspace_report.json` 只作为兼容 mirror。`workspace_index.json` 必须携带 `profile_binding`，其中包含 `profile_version=workspace-topology-profile.v2`、`profile_fingerprint=opl-workspace-topology-profile-v2-projects-stage-outputs`、profile contract ref 和 migration history，并必须携带 `topology_events[]`。`agent_workspace_norm` 必须与 executable norm projection 全量一致，不能只按 norm id/version 判断。生成投影 currentness 仍是结构检查项，但缺失或漂移默认是 repairable finding，`workspace validate` 不因这类缺口阻断默认智能体执行；缺 workspace/index identity、项目根、stage pointer/index shape、authority 或 runtime-state 边界才是 hard blocker。
- 2026-06-08 追加：Project lifecycle 统一为 `active`、`paused`、`archived`、`superseded`、`locked`。这些状态是 OPL-owned workspace lifecycle projection，不删除文件、不关闭 stage、不签 owner receipt，也不改变 domain truth；physical delete 必须由 domain owner receipt 授权。MAS/MAG/RCA/OMA/OBF 共享同一 Project Unit 物理语义，MAS 的 `study` / `studies` 与 OPL Book Forge 的 `book` / `books` 只作为 display naming 例外。workspace governance v2 只能声明 `L4_structural_baseline`；L5 仍需要真实 App user path、跨 agent scaleout、long-soak、release/install evidence 和 owner acceptance。
- 2026-06-08 追加：`opl workspace fleet report` 是 `workspace list` 的 sibling surface，不改变 `workspace list` registry-only 语义。fleet report 只从 registry binding 和 workspace-local `workspace_index.json` / generated reports 读结构状态，输出 ready / blocked / archived_binding / not_bound 和 lifecycle counts；它不得执行 direct-entry command、manifest command 或 domain product-entry resolver，不得把 domain manifest 解析结果写成 readiness。`opl workspace project lifecycle` 是 pause / resume / lock / supersede / archive 的统一 runtime；`workspace project delete` 只返回 owner-receipt safe-delete gate，OPL 不执行 physical delete。shared resource provenance 只允许在 `opl_resource_manifest.json.resources[]` 中记录 refs、checksum、provenance、reuse、staleness，`body_ref` 必须规范为空；`workspace upgrade` 必须保留这些记录，`workspace inventory` 只投影 refs-only record。
- 2026-06-10 追加：active workspace binding 指向不存在目录时，`opl domain manifests` 必须报告 `workspace_missing`、`stale_binding_count` 和 `stale_binding_project_ids`；active binding 缺 `manifest_command` 时，必须报告 `manifest_not_configured_count` 和 `manifest_not_configured_project_ids`。二者属于 OPL registry currentness / binding configuration attention，不属于 domain manifest command failure；不得计入 `failed_count`、`live_failed_project_ids` 或 framework stage diagnostic failure。真实 manifest command failure、timeout、invalid JSON 和 invalid manifest 仍按原 fail-closed 路径暴露。

### 决策：Settings Control Center read/action surface 归 OPL Framework，App/Aion 只消费投影

原因：One Person Lab App 的 Settings Control Center 需要把 model access、capability sync、OPL packages、Codex surface readiness 和 runtime roots cleanup planning 组织成用户任务导向的设置面。如果这些状态由 App 或 Aion shell 分别拼接 `connect`、`system`、provider 和 workspace 命令，GUI 很容易反向成为 runtime truth、domain truth 或 release truth owner。稳定边界应是 OPL Framework 继续持有 `opl app state/action`，App 只消费 read model 与 action envelope。

影响：

- `contracts/opl-framework/settings-control-center-action-read-model-contract.json` 冻结 Settings Control Center v2 的 IA、issue status code、action sections、allowed action ids、action taxonomy、action metadata、dry-run / apply / verify 边界和 authority false flags。
- `opl app state --profile fast|full --json` 输出 `settings_control_center`，并在 operator workbench 中引用同一对象；它是 GUI-ready projection，不写 domain truth、不读取 artifact/memory body、不签 owner receipt、不创建 typed blocker，也不声明 App release ready 或 production ready。v2 增加 `settings_ia`、`app_settings_read_model`、`issue_catalog`、`issue_queue` 和 `action_catalog`，并在 `settings_ia` 中显式列出 ordinary routes 与 Workspace、Local Services、About、Update、Theme secondary/deep-link routes；`app_settings_read_model` 从既有 `core.codex`、`developer_mode`、`modules`、`provider`、`paths`、`release`、IA 和 action catalog 派生页面结构、Codex model/reasoning policy、Access/API key、workspace services 和 local environment 状态，避免 App/Aion shell 维护第二套策略解释。这些字段只从现有 App state / update 状态语言投影用户可读问题，不模拟 domain owner truth。
- `settings_repair_model_access`、`settings_verify_workspace`、`settings_sync_capabilities`、`settings_apply_opl_packages`、`settings_check_app_update`、`settings_prune_runtime_roots_dry_run` 和 `settings_rollback_runtime_substrate` 只通过既有 `opl app action execute` envelope 暴露；更新类动作默认消费 Managed Update coordinator：capability/package apply 走 `opl packages update`，App carrier check 走 `opl app state --profile fast`，runtime restore route 走 `opl update rollback`。workspace / quest use boundary 自动复用 Packages scope reconciliation transaction；`agent_package_activate` 只保留为内部 launch-boundary 与旧调用兼容路由，不进入 Settings/action catalog，也不暴露第二个 Connect 安装入口。cleanup 只提供 dry-run plan，不删除 runtime roots。
- App repo 继续持有 GUI product truth、page-state contract、release artifact 和 shell validation；Aion shell 只实现渲染与 IPC adapter，不能把 Settings Control Center 的 domain/runtime truth 搬到 shell。

### 决策：generic workspace / source / artifact / memory substrate 由 OPL 持有 locator / index / lifecycle / projection，domain agent 持有 truth / body / verdict / authority

原因：MAS/MAG/RCA 都需要把真实运行 workspace、source refs、artifact refs 和 memory refs 暴露给 OPL App、CLI 与 runtime manager，但这些 refs 背后的正文、交付物内容、记忆内容、质量判断和 owner receipt authority 不能迁入 OPL。把这一层落成独立 machine-readable contract 和 CLI projection，可以让 OPL Framework 成为可运行的 generic substrate surface，同时避免制造第二 domain truth。

影响：

- `contracts/opl-framework/generic-substrate-projection-contract.json` 成为活跃 framework contract，定义 OPL 只持有 locator index、ref transport、lifecycle projection 和 operator projection。
- `opl substrate projections` / `opl substrate projection --domain <domain>` 输出 OPL-owned substrate projection JSON，读取 domain manifest 中的 `workspace_locator`、`source_provenance`、`artifact_inventory`、`domain_memory_descriptor` refs，以及 MAS/MAG/RCA sidecar export 中的 `opl_substrate_adapter` opaque refs。
- `opl substrate workbench` 是 App/operator-facing 聚合面，按 domain、projection status、sidecar status 和 workspace/source/artifact/memory ref family 分组现有 projection，并提供 drilldown inspect command。
- projection 只携带 workspace/source/artifact/memory refs、status、summary、inspect paths、lifecycle role 和 authority boundary；不读取 memory body、source truth body 或 artifact body。
- OPL 明确禁止写 domain truth、接受或拒绝 memory writeback、应用 memory body、修改 artifact body、持有 artifact authority 或下 quality / publication / fundability / visual verdict。
- domain agent 继续持有 workspace truth、source body、artifact body、artifact authority、memory body、memory writeback accept/reject、domain truth 与质量裁决。
- 当前 surface 已覆盖 MAS-like payload 的 workspace root、source refs、artifact refs、memory refs 和 authority boundary；剩余 production gap 是真实长时 domain owner chain、真实 memory writeback apply/body migration、artifact mutation receipt scaleout 和 App drilldown 的持续 soak。

### 决策：Runtime Environment Bundle 是 OPL-owned substrate；domain repo 只声明 dependency intent

原因：App Full、MAS/MAG/RCA/BookForge/OMA、CI/VM smoke 和部署脚本不应各自持有 Python/uv/Node/native helper/domain repo/skills/cache bootstrap。运行环境必须成为 OPL Framework 的 shared primitive，按 descriptor、lock、content-addressed layers、bundle manifest、materialized runtime root、receipt、cleanup 和 rollback 分层；App 是 consumer，domain agent 只声明 dependency intent 和 reproducibility refs。

影响：

- `contracts/opl-framework/runtime-environment-substrate-contract.json` 固定 OPL runtime environment substrate 的 machine boundary、module mapping、layer taxonomy、cache policy、lock / bundle manifest projection policy、materialization policy、cache inventory policy、false-ready flags 和 forbidden claims。
- 普通用户环境入口固定为 `opl env doctor|prepare|run`；`opl runtime env inspect|lock|build|prepare|materialize|verify|cache status|cache inventory|cache prune|doctor|run-context|contract --json` 是 advanced/operator surface，提供 fail-closed readback，输出 descriptor / deterministic lock / bundle manifest / layer graph / dependency prepare lock / receipt / run-context / materialization receipt / verify receipt / cache inventory / cleanup plan / doctor / run-context consumer preflight 边界。
- 当前实现只在显式 `--apply` 下写 OPL-managed state：`materialize --apply` 写 `${OPL_STATE_DIR}/runtime-environment` 下的 runtime root、lock、manifest、env、receipt 和 selected pointer；`cache prune --apply` 只删除未被 current / rollback pointer 保护且带 receipt 的 stale runtime root；`prepare --apply` 只把缺失 R 包安装进 OPL-managed R library、把缺失 Python 包安装进 OPL-managed uv environment，并向显式 artifact root 写 dependency lock / receipt / run-context。`run-context --artifact-root <path>` 只读取这些 refs 并输出 consumer preflight；缺 run-context、target identity 不匹配或未提供 artifact root 时 fail closed，消费者不得回落到宿主机包环境；`--paper-root` 只保留为 compatibility alias，由 `root_vocabulary` 标注。它不写 development checkout、不写 domain truth / memory body / artifact body、不调度 domain stage、不签 owner receipt / typed blocker。
- Cache hit、descriptor exists、run-context exists、materialization receipt、verification receipt 或 cleanup receipt 都不能替代 domain ready、App release ready、owner receipt、quality/export verdict、provider long-soak 或 production readiness。runtime materialization/verification 只能证明指定 OPL runtime environment root 已物化并可读；prepared run-context 只能证明指定 dependency profile 的 managed R/Python run bindings 可消费。
- 下一步应把 App Full runtime cache 降为 OPL runtime bundle manifest consumer，并让 MAS/MAG/RCA/OMA 只声明 dependency intent、消费 OPL run-context；它们不新增私有通用 environment manager。

### 决策：Fast Local Env 是当前默认环境路径，Docker / E2B 后置为 provider

原因：当前 OPL 的直接需求是让 R / Python / MAS 画图等本机高频路径快速获得可诊断、可接力的依赖环境，而不是把 Docker 设成全局硬依赖或默认引入托管 sandbox 云服务。更低复杂度、符合当前工程事实的默认路径是 `Fast Local Env`：由 Runtime Environment Substrate 提供 environment profile、compiler、doctor 和 run-context，按显式 profile 管理 OPL-managed R library、OPL-managed Python uv environment、runtime refs 与 no-host-fallback consumer preflight。Local Sandbox / Docker 与 Remote Sandbox / E2B 仍保留为后置 provider，用于需要更强隔离、复现、远程执行或 release evidence 的场景。OPL 的核心价值仍然是用 stage、Runway、Temporal、owner boundary、receipt、readback 和 false-ready guard 把 agent work 变成可恢复、可审计、可接力的 family runtime。

影响：

- 默认环境路径属于 `OPL Runway` 的 runtime environment consumption / doctor / run-context / receipt 投影职责。它不是 `OPL Connect` 的主执行责任，也不是 Docker-first sandbox requirement。
- Runtime Environment Substrate 是 Runway primitive：负责 env profile / compiler / doctor / run-context / descriptor / lock / bundle manifest / materialization / no-host-fallback 边界；`OPL Pack` 声明 domain dependency intent；`OPL Workspace` 负责 workspace/artifact mount 与路径映射；`OPL Ledger` 保存 environment / provider / run / artifact / diff refs-only evidence；`OPL Console` 做 operator readback 和 repair/config action；`OPL Connect` 只在需要时做 provider discovery、configuration、package/install 或 connector 分发辅助。
- Temporal 仍是 production online durable workflow / wakeup / retry / human-gate substrate。Sandbox provider 不持有 workflow history、stage-attempt request/projection、human gate、attempt ledger、owner route 或 domain authority。
- Runtime environment substrate 不继续扩张成自研 VM/container sandbox；Docker/devcontainer 和 E2B 只是后置 provider，不是所有 runtime env profile 的必备 substrate。
- 当前 Framework 的默认环境 profile 是 `fast_local_env`：doctor / prepare / run-context 负责确认 R/Python/MAS display 这类本机依赖是否可消费；R 标准 handoff 是 `renv.lock` refs + `R_LIBS_USER` managed library，Python 标准 handoff 是 `uv.lock` / project refs + `UV_PROJECT_ENVIRONMENT` managed env。Fast Local Env doctor 只检查 host binary、language packages 和 system hints；缺 run-context、target identity mismatch 或 doctor failure 必须 fail closed，不能偷偷回落到未声明的宿主机包环境，也不能声明 runtime/domain/App ready。
- Local Docker / Devcontainer slice 保留为显式 local provider：只有显式选择 `local_sandbox` / `local_docker` / `local_devcontainer` profile 或 `OPL_CODEX_STAGE_SANDBOX_PROVIDER=local_docker|local_devcontainer` 时，Runway 才进入 Docker/devcontainer path；Codex stage runner 无显式 sandbox provider 时走 host executor，不默认启动 local devcontainer。Runway 通过 Docker/devcontainer preflight、workspace transport、executor run 和 `sandbox_execution` receipt 证明隔离执行路径；缺本地 image / Docker preflight 或 workspace transport 时只输出 repair / preflight action。
- E2B slice 保留为当前唯一已实现的显式 remote provider / OPL Connect 配置辅助，不是默认依赖：选择 `remote_sandbox` / `e2b` profile 时，Runway 会创建或连接 E2B sandbox，并保留 credential-ref / provider-receipt-ref / no-secret-log guard。其他外部 compute provider只能进入通用 external adapter / Connect discovery候选，不构成 Runway executor support。E2B adapter不读取、打印或转发 host secret material，不在缺 credential 或 git workspace transport 时回落到 Fast Local Env，也不声明 provider ready / runtime ready / domain ready。
- Fast Local Env doctor/run-context、live Docker/devcontainer run、live E2B credential run、provider long-soak、App release cohort 和真实用户路径是不同证据层；docs、contracts、focused tests、materialization receipt、cache hit、doctor pass、run-context exists、mocked local Docker path 或 provider adapter dry-run 都不能声明 runtime ready、provider ready、domain ready、App release ready、Brand L5 或 production ready。

## 2026-05-15

### 决策：One Person Lab App 采用 clean 产品仓，AionUI shell 独立保留为 `opl-aion-shell`

原因：OPL Framework 已经形成完整的 stage-led 智能体开发与运行框架边界；继续把 App 打包、页面状态、截图教程、Electron 更新、AionUI upstream intake 和 framework runtime/contracts 混在同一层，会让维护者难以判断 owner，也会把当前 GUI 基座误读成 OPL 顶层身份。更清晰的维护形态是：`one-person-lab` 保持 Framework repo，`opl-aion-shell` 保留 AionUI 历史与 upstream-following fork / OPL overlay carrier，`one-person-lab-app` 成为 clean App 产品仓并通过外部 `shells/aionui` checkout 消费 shell。

影响：

- 不再采用“把 history-rich `opl-aion-shell` 直接改名为 `one-person-lab-app`”作为最终路径；该路径会把 AionUI contributors 带入 App repo，且后续 upstream intake 会持续污染 App contributor 图。
- `one-person-lab` 继续持有 OPL Framework：CLI、runtime、Temporal provider、contracts、module/skill sync、domain discovery、runtime snapshot 和 framework-level verification。
- `opl-aion-shell` 保留 AionUI shell 源码、contributors、upstream remote、shell-local build/test/packaging 和 OPL overlay 退役审计，但 upstream AionUI fork body 不是 OPL 自主设计面。
- OPL 对 `opl-aion-shell` / App `shells/aionui/**` 的写入只限 App adapter、OPL overlay、packaging/readback hooks 和明确 owner 的最小验证；非 OPL-owned upstream fork body 不做测试瘦身、结构重写、实现清理、样式/交互重构或依赖升级，误动必须回退。
- App 产品文档、打包、更新、Full first-install 包、页面状态测试、首启测试、截图和用户教程迁入 App repo。
- AionUI 不进入 App repo 默认分支历史；App repo 的 `shells/aionui` 是外部 checkout / symlink / CI checkout，来源为 `gaofeng21cn/opl-aion-shell`。
- 当前 GUI 主线是 OPL-branded AionUI shell；`opl-native-workbench` 是 App-owned foreground alternative。AionUI 大版本迁移可以在 `shells/aionui-next/` 这类主线升级路径中适配；新的 foreground GUI 候选必须先经 App owner 明确修改 candidate policy。
- `agui-codex` / `opl-agui-codex-shell` 只作为 AG-UI/CopilotKit archived technical proof 与显式 replay surface 保留；除非用户明确要求 AGUI，不再作为日常候选推进、默认验证或 polish lane。
- App 仍然只消费 OPL CLI / machine-readable surfaces 和 domain-owned projection refs，不复制 runtime/provider/domain truth，也不成为 quality verdict 或 artifact authority。
- App repo 是标准 DMG、Full DMG、updater metadata、GitHub Release、GUI smoke 和用户教程的唯一 owner；Framework repo 只保留 App release discovery/consumer surface 和 Full DMG payload source。

## 2026-05-12

### 决策：产品认知固定为 OPL Framework、One Person Lab App 与 Foundry Agents 三层

原因：OPL 已经从入口聚合和工作台投影演进为完整的 stage-led 智能体框架。如果继续把框架开发、运行托管、普通用户 App 和 MAS/MAG/RCA 这类领域产品都用同一个不分层的 `OPL` 叙事表达，开发者用户和纯使用者都会难以判断自己应该进入哪一层。更清晰的产品结构是：OPL Framework 负责开发与运行框架；One Person Lab App 负责普通用户使用体验；Foundry Agents 负责医学研究、基金、汇报等领域交付。

影响：

- `OPL Framework` 成为开发者与技术操作者面向的主语：CLI、stage control、activation、stage-attempt request/projection、provider-backed runtime、contracts、模块发现、skill sync、恢复、审计和 shared projection 都属于这一层。
- `One Person Lab App` 成为普通用户面向的主语：它消费 OPL Framework 和已安装 Foundry Agents，把通用工作、医学研究、基金写作、汇报/PPT 等工作呈现成桌面工作台；它不持有 domain truth，不复制 runtime/provider 实现。
- `Foundry Agents` 成为 MAS/MAG/RCA 和后续 Patent/Award/Thesis/Review 的产品线主语：这些 agent 基于 OPL Framework 开发，可被 App 托管运行，也保留 direct Codex/app-skill 入口；领域判断、质量 verdict、artifact/package/submission/publication authority 继续归对应 domain 仓。OPL Meta Agent 是 Agent Foundry 的 managed builder/tester module，用于创建、测试和改进 OPL-compatible agents，不成为 MAS/MAG/RCA 之外的新 domain truth owner。
- 开发和运行保持集成在 OPL Framework 内；当前不拆 repo，也不把每个 domain agent 改成内嵌一份 OPL runtime。
- agent 的推荐发布形态是 OPL-compatible package / repo：声明 framework/version/contract 要求、stage descriptor、skill、quality gate、artifact locator、projection 和 authority refs，由 OPL Framework 安装、发现、托管、唤醒和投影。
- Full 首次安装包可以把 App、OPL Framework、OPL Meta Agent、MAS/MAG/RCA、provider payload、`officecli` 与推荐 skills 打在一起；这只是分发形态，不改变 single framework runtime truth，也不改变 MAS/MAG/RCA 的领域权威。
- 后续 README、project/status/architecture、contracts 说明、App 文案和 onboarding 文档应优先使用这组三层主语，避免把 App 写成 Framework 本体，或把 Foundry Agents 写成 OPL 内部模块。

## 2026-05-10

### 决策：Temporal 成为 OPL production online family runtime 的必需 substrate，已退役 Hermes-first 口径退出目标在线底座

原因：OPL 当前目标已经从“找一个长期在线会话宿主”收敛为“以 domain stage 为语义单元、以 Agent executor 为最小执行单位的 durable family agent framework”。这类框架需要的是可恢复 stage attempt、activity retry/timeout、human gate signal、status query、workflow history、idempotent dispatch、dead-letter 和 operator projection。Temporal 的 Workflow / Activity / Signal / Query / History 模型正好对应 OPL production online runtime 的可靠性底座；它应像 Codex CLI 一样被安装、检测、修复和持续维护。Hermes 不再承担目标长期 session/wakeup substrate，也不保留 active family runtime provider、provider proof surface、Gateway bridge 或默认 executor surface 语义；`hermes_agent` 仍可作为显式非默认 executor adapter/backend，与 `claude_code`、`antigravity_cli` 一样只承诺连接、生命周期、回执、审计和 fail-closed 边界，不承诺行为、质量、工具语义或 resume 与 `Codex CLI` 等价。

2026-05-21 追加口径：标准 OPL Agent 的默认长跑路径固定为 `opl_temporal_hosted_autonomous`。MAS/MAG/RCA 这类 domain agent 不应内置通用 daemon、scheduler 或 attempt loop；任务启动后默认由 OPL/Temporal provider 管理 stage attempt、stage-attempt request/projection、wakeup、resume/re-query、retry/dead-letter、attempt ledger 和 operator projection。Codex App 只作为启动、观察、介入和展示入口，不作为外围持续驱动任务的主体。该默认 runtime path 不改变领域权威：domain truth、quality/export verdict、artifact authority、memory body accept/reject、owner receipt 和 typed blocker 继续归对应 domain agent。

2026-06-11 追加口径：Temporal-backed provider 的常规调度路径必须在 live-skip 前收敛 terminal observation。`same task`、`same dispatch` 和 `same study` 的 single-flight guard 不得只看本地 stage_attempt `running` 字段；在准备刷新 lease 或跳过当前候选前，先通过 safe Temporal read-model query 同步 completed typed closeout / failed / canceled / blocked terminal 状态。同步后仍 live 或仍处于已 claim queued admission window 时才 skip；同步为 terminal 时先更新 OPL ledger / linked task，再让当前候选继续 claim/start 或返回 terminal closeout。该规则用于关闭 `attempt inspect` 才能解卡的假 running，仍不改变 OPL / domain authority split。

影响：

- `OPL Runtime Manager` 的目标表述从 Hermes-first 改为 Temporal-backed production family runtime；active provider 只允许 `temporal` 作为 runtime provider。`local_sqlite` 仅保留为 retired-provider negative guard 和 SQLite projection/index 旧文件名语境；`hermes_legacy` 不再是 provider kind；若环境或旧 fixture 仍选择它，必须 fail-closed。
- Temporal provider 的语义映射固定为：Workflow = `stage_attempt`，Activity = selected Agent executor stage execution / domain sidecar dispatch，Signal = human gate / user modification intake / resume，Query = App/CLI progress projection，History = durable replay/audit。Activity 的具体隔离 workspace / process 可由 external sandbox provider 承接，但这不改变 Temporal 的 durable orchestration owner，也不把 sandbox provider 升级为 workflow、Runway、receipt 或 domain authority。
- `Codex CLI` 是当前第一公民 concrete executor；Temporal 只负责 durable orchestration substrate，不生成 domain idea，不判断 publication/fundability/visual quality。
- 当前必须分开两层：`hermes_agent`、`claude_code` 与 `antigravity_cli` 是 canonical 显式非默认 executor adapter/backend；旧 Hermes online runtime / provider / Gateway / readiness / compat 面只作为历史 provenance、参考材料、诊断语料或负向 guard。Full readiness 不再要求 Hermes 作为目标 session/wakeup substrate，也不提供 Hermes 安装 / 更新 / provider compatibility action surface；Temporal service / worker / readiness proof 是生产在线依赖。任何非默认 executor receipt gate 都不得恢复旧 Hermes/Gateway 兼容接口或默认路径。`antigravity_cli` 仅用于类似 `RCA` HTML route 选择 `Gemini flash/high` 的 stage-level explicit adapter 示例，不成为默认执行器，也不声明质量、工具语义或 resume 等价。
- `MAS`、`MAG`、`RCA` 继续持有 domain truth、quality gate、artifact/package/submission/publication/deliverable authority；OPL 只持有 provider abstraction、stage attempt ledger、human gate transport、retry/dead-letter、observability 和 projection。
- 2026-05-08 的 Hermes-first 决策保留为历史与迁移背景，但被本决策 supersede；后续新增投入默认服务 Temporal-backed production runtime lane。

### 决策：OPL 定位为完整 stage-led family agent runtime framework，Codex CLI 是当前第一公民 executor

原因：`MAS`、`MAG`、`RCA` 的共同需求不是让 OPL 变成一个领域大脑，而是需要长期自治、状态恢复、唤醒、队列、human gate、trace、projection 和跨域可见性这类 agent framework 能力。与以 LLM 调用或 agent node 为原子单位的通用框架不同，OPL family 的执行原子是 Agent executor，当前第一公民 executor 是 `Codex CLI`，更合理的语义单元是 domain stage：一个 stage 冻结目标、输入、skill/prompt、评价方法、handoff、receipt 和 authority boundary，stage 内部让被选中的 executor 与 domain skill 自主完成专家工作。

这次定位同时明确：OPL 不是只做入口聚合、工作台投影或共享合同目录，而是完整的智能体运行框架。active provider 只允许 Temporal production substrate；`local_sqlite` 只作为 retired-provider negative guard 和 SQLite projection/index 旧名语境；阶段生命周期、stage-attempt request/projection、attempt ledger、human gate、恢复、投影、artifact/file lifecycle 和 operator visibility 的 framework 边界归 OPL。OPL 的产品目标是让医学研究、基金写作、视觉交付和后续高价值知识工作尽可能自动推进到可审计交付。

影响：

- `OPL` 的当前身份统一写成完整 stage-led family agent runtime framework，而不是 MAS/MAG/RCA 的领域模块集合、入口聚合层或单纯 runtime support layer。
- `OPL` 持有 activation、stage-attempt request/projection、durable runtime/session support、wakeup/retry/dead-letter、approval transport、stage descriptor、handoff envelope、receipt、projection、trace 和 parity helper。
- `MAS`、`MAG`、`RCA` 持有各自 stage semantics、prompt/skill、quality gate、truth reducer、artifact/package authority、publication / submission / deliverable verdict。
- 直接 Codex App skill 调用保持一等入口；OPL 可以托管和唤醒 domain agent，但不要求所有调用都先经过 OPL。
- 大型任务默认按接近人类专家实施的 stage 推进；Agent executor 是 stage 内最小执行单位，`Codex CLI` 是当前第一公民 executor。
- 涉及知识交付、专家判断或正式交付质量的复杂步骤必须建模为独立 stage，例如 MAS 的 AI 审稿、publication quality review、RCA 的 visual review、MAG 的 fundability / proposal review；不得把这类工作塞进另一个 stage 的普通函数、helper 或后处理逻辑里。
- AI-first quality gate 必须由独立的审核 stage attempt / 智能体任务完成。执行 attempt 和审核 attempt 需要有独立上下文、输入 refs、closeout / gate receipt 与 owner；不能把同一个 `Codex CLI` 任务写成“先执行、再自审、再放行”。
- 后续流程优化优先改 domain stage pack、prompt、skill、quality gate 和 framework descriptor；不得把领域判断重新写回 OPL 机械脚本。

### 决策：将 MAS stage 控制面经验提升为 OPL family 设计方向

原因：`MAS` 的论文生产、`RCA` 的视觉交付和 `MAG` 的基金写作都属于开放专家工作流。把这些流程写成大段硬编码脚本会限制 Agent executor 的自主拆解、创作、审核和修订能力，也会让程序承担不该承担的领域质量判断。更稳妥的 family 原则是用 `stage` 描述专家工作阶段：每个 stage 冻结目标、输入输出、skill、prompt、评价方法、handoff、receipt 与 authority boundary；stage 内部的执行由被选中的 Agent executor 和 domain-owned AI workflow 自主推进。

影响：

- `OPL` 可以上收 family-level stage descriptor vocabulary、skill / prompt / evaluation refs、stage lifecycle receipts、handoff envelope、product-entry projection 与 parity helper。
- `family-action-graph` 继续承载 stage / action topology，`family-action-catalog` 继续承载可调用 action metadata；新增的 machine-readable surface 只允许是窄的 `family-stage-control-plane` companion，不新建重流程 runtime。
- Stage closeout 的 next / route-back / stop / human-gate 建议必须由 StageOutcome / owner answer / typed blocker / human gate refs 给出；OPL 只接手目标 stage、StageRun 投影、调度与 transport，不新增 stage 外语义控制面，repair/backlog 只作为 diagnostic。
- `MAS` 作为深 adapter 候选，必须先盘点现有 `scout`、`idea`、`baseline`、`experiment`、`analysis-campaign`、`write`、`review`、`decision/finalize` 等 route contract，以及 controller / runtime / quality / delivery / read-model surface；OPL 文档里的 study intake、evidence preparation、analysis / argument、manuscript authoring 与 publication gate 只作为 family 抽象维度，不替换 MAS 实际 stage 名称、数量或 route id。
- `RCA` 作为轻 adapter 优先候选，把 source intake、communication strategy、visual direction、artifact creation、review / revision 与 package / handoff 映射成 stage，但视觉质量 verdict、deliverable authority 与最终审美判断仍归 RCA。
- `MAG` 把 call intake、fundability strategy、specific aims、proposal authoring、review / rebuttal 与 package gate 映射成 grant stage pack，但 fundability verdict、评审结论与提交可行性仍归 MAG。
- `OPL` 的角色保持 discovery、index、projection、parity 与 stage-attempt request/projection dispatch；不得把 stage 控制面写成替代 Agent executor 或 domain quality gate 的固定脚本引擎。
- `authority function` 只能承担最小领域裁决、receipt 签发、typed blocker 或 safe action refs，不得承载完整的 AI 审稿、质量评估、修订建议生成或其他跨输入/产物/证据的复杂知识交付流程；这类流程必须是可观察、可恢复、可单独审核的 stage。
- Stage progression 默认 progress-first：缺少独立 reviewer / gate receipt、gate evidence stale、审核与执行来自同一 attempt 或同一污染上下文时，只关闭 quality/export/publication/ready 声明；已有可读 artifact 时仍可进入任意 declared stage。
- 当前落地面是参考计划 [OPL Family stage control plane adoption plan](./references/convergence-governance/family-stage-control-plane-adoption-plan.md)、最小 `family-stage-control-plane` schema、manifest normalizer / parity helper 与只读 `opl stages list|inspect`；它不是 workflow runtime。MAS 第一阶段是 inventory 和映射，不是 stage 重构。

## 2026-05-08

### 历史指针：Hermes-first / hosted-runtime 回滚叙事已迁入 history

状态：已被 2026-05-10 Temporal-backed provider 决策 supersede。旧 Hermes 默认在线 substrate、Gateway、cron/webhook wakeup、Full package payload、system initialize readiness、hybrid provider adapter，以及“默认安装依赖降为显式 hosted/runtime adapter”的中间回滚语境，已迁入 [退役 runtime / gateway / GUI 决策历史](./history/runtime-substrate/retired-decisions-history.md)。

当前读法：Temporal-backed provider 是 production online runtime 的必需 substrate；`Codex CLI` 是默认且第一公民 executor；`hermes_agent`、`claude_code`、`antigravity_cli` 只能作为显式非默认 executor adapter/backend。历史 Hermes provider / Gateway / readiness / compat 叙事不得恢复为安装路径、readiness 目标、default executor、provider fallback、compatibility interface 或 current worklist。

### 决策：引入 Family Action Catalog 作为 action metadata 单一声明面

原因：`MAS`、`MAG`、`RCA` 已经分别暴露 CLI、MCP、Skill、product-entry 等多种调用面。如果每个 surface 单独维护 action metadata，命令、schema、effect、human gate 与 authority boundary 容易漂移。`Ageniti` 值得学习的是“单一 app action 定义派生多种 tool surface”的思路；但它当前不应成为 OPL family runtime dependency。

影响：

- `contracts/family-orchestration/` 新增 `family-action-catalog.schema.json`，并允许 `family-product-entry-manifest-v2` 携带 `family_action_catalog`。
- `family-action-graph` 继续描述流程拓扑与 gate；`family-action-catalog` 专门描述可调用 action metadata 与 surface projection。
- `OPL` 增加 TS helper、Python mirror、manifest normalizer、parity helper，以及只读 `opl actions list|inspect|export` discovery/export 命令。
- `OPL` 不执行 domain actions，不生成 handler，不持有 domain runtime truth；actual execution 仍走 MAS/MAG/RCA 各自已有 CLI、MCP、Skill 或 product-entry handler。
- `MAS` 作为完整参考 adapter，`RCA` 作为 TypeScript 参考 adapter，`MAG` 作为轻 adapter；`MAG` 第一轮只声明 MCP-compatible descriptor，不宣传 public MCP server 已落地。
- 本决策不引入 `@ageniti/core` 或其他 Ageniti runtime package。

### 决策：引入 Family Runtime Supervision 作为只读 wakeup / supervision projection

原因：`MAS`、`MAG`、`RCA` 都需要把长期任务的 supervision freshness、repair hint 与 domain-owned source refs 投影给 OPL family 工作台，但这些信息不能被误读成 OPL 拥有 scheduler、daemon、session、memory、quality 或 artifact authority。

影响：

- `contracts/family-orchestration/` 新增 `family-runtime-supervision.schema.json`，并允许 `family-product-entry-manifest-v2` 携带 `family_runtime_supervision` discovery surface。
- 该 surface 覆盖 `adapter_id`、cadence、`last_success` / `last_tick`、lease freshness、SLO state、repair command、safe reconcile hint、domain-owned source refs 与 read-only authority boundary。
- `runtime-task-companions` 增加 TS builder，供 domain repos 投影同一 shared supervision surface。
- `OPL` 只做 discovery、export、parity 与 read-only projection；repair command 与 safe reconcile hint 只把操作者路由回 domain-owned repair / supervision surface。
- 本决策不引入 OPL daemon，不让 OPL 成为 domain scheduler、session store、memory owner、quality verdict owner 或 artifact authority。

### 决策：OPL 接管 family-level scheduler replacement owner

原因：MAS/MAG/RCA 的目标形态已经收窄为 domain authority pack + thin program surface，通用 scheduler lifecycle、supervision cadence、provider SLO、queue intake、attempt ledger、job/latest-run projection 和 runtime-manager repair projection 应由 OPL Framework 承载。MAS 本机 LaunchAgent / 300 秒 tick 可以作为迁移期 diagnostic / cleanup path，但不能继续作为 Foundry Agent 的默认运行外围。

影响：

- `contracts/opl-framework/runtime-manager-contract.json` 与 `opl runtime manager` 暴露 `family_scheduler_replacement`，默认 owner 是 `opl_provider_runtime_manager`，默认 adapter 是 `opl_family_runtime_provider`。
- OPL replacement 允许 provider SLO tick、domain registration intake、family runtime tick 和 runtime manager projection；禁止写 domain truth、安装 domain daemon、写 domain memory body、下 quality/export verdict 或直接执行 domain repair。
- MAS 是 P0 migration consumer：默认 status/ensure/remove/bootstrap 应委托 OPL replacement；MAS 只保留 paper-progress SLO 语义、owner receipt、typed blocker、safe action refs 和显式 local legacy diagnostic / cleanup path。
- MAG/RCA 是 consumer projection：可以引用 OPL `family_scheduler_replacement`、返回 owner receipt / typed blocker / no-regression evidence refs，但不能新增 repo-owned generic scheduler 或 daemon。
- `opl agents default-callers` 已承载 domain active caller migration、no-active-caller proof 与 legacy physical retirement 的 closed no-resurrection/readback guard；它们不再作为 OPL active migration sequence。后续只有 domain owner 显式返回 `physical_delete_authorization_ref` 时才进入物理删除，否则保留 authority adapter / tombstone / typed blocker 路径，再按 cross-repo integration、provider SLO 和 live soak 做后置证据。

### 决策：MAS monolith / MDS 默认依赖退役上升为 family companion-retirement 原则

原因：MAS 已完成 no-history physical absorb 与 monolith closeout，外部 `med-deepscientist` checkout 不再是 MAS 默认 study/status/progress/cockpit operation 的运行必需依赖。这一经验值得上升到 OPL family 层，但上收对象是通用 companion lifecycle 原则，不是 MAS 的医学论文 truth 或研究执行细节。

影响：

- admitted domain 可以吸收外部 companion 的可保留能力，但吸收后默认只暴露 domain-owned capability surface。
- 被降级的外部 companion 只能作为显式 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle 引用出现，不得回到 OPL 默认安装依赖、顶层 domain agent 或独立 OPL-managed module。
- 未来类似 no-history absorb 必须记录 source ref/hash、snapshot checksum、license refs、capability classification、domain owner、authority boundary、parity proof 和 contributor audit。
- `OPL` 只消费 domain-owned projections 与可发现 refs；不接管 domain runtime、scheduler、memory store、quality verdict、publication gate 或 artifact authority。

### 决策：MAS 验证过的 persistence / lifecycle / owner-route 原则上升为 family control-plane contract

原因：MAS 近期把 runtime 小文件压力收敛到 SQLite sidecar index，并把持久化层、记忆层、论文真相与 lifecycle cleanup 分开管理。这一类经验值得在 `OPL` family 层复用，但可上收的只有共享控制面：持久化角色、lifecycle receipt、owner-route 与 discovery refs。医学论文质量、publication readiness、AI reviewer、paper package 与 current package authority 仍属于 MAS domain truth。

影响：

- `contracts/family-orchestration/` 新增 `family-persistence-policy`、`family-lifecycle-ledger` 与 `family-owner-route` 三个 machine-readable schema。
- `family-product-entry-manifest-v2` 只增加 `persistence_policy`、`lifecycle_ledger`、`owner_route` 三个 optional discovery refs，不强制 domain runtime 改形。
- TS helper 与 Python mirror 提供对称 builder / validation surface，供 admitted domains 暴露 adapter，不复制 domain runtime。
- `MAS` 作为完整参考 adapter，映射 SQLite sidecar、lifecycle ledger 与 owner-route；`MAG` 第一轮只在既有 runtime-control / session-continuity / grant-progress / artifact_inventory 上做轻 adapter；`RCA` 第一轮把 managed-runs、product-entry sessions、review/publication projections 映射到 shared refs，并继续把 SQLite 标记为 deferred。
- `OPL` 继续只是 shared contracts / helpers / indexes owner；它不成为 domain runtime、scheduler、memory store、quality verdict owner 或 artifact authority。

## 2026-05-04

### 决策：MAS v2 以独立 domain agent 和单一 app skill 对接 OPL

原因：`MAS` 的 v2 alignment 需要同时保持两件事：医学科研 domain agent 继续独立演进，OPL 又能以统一定义、shared contract/index 与 projection 消费方式把它纳入同一工作台。把 MAS 写成 OPL runtime kernel 的一部分、恢复 MAS standalone release 通道，或把 OPL projection 写成 MAS ready / publication verdict，都会制造第二真相源。

影响：

- `MAS` 继续作为独立医学科研 `domain agent`；`MAG`、`RCA` 的独立 domain-agent 表述不受影响。
- `MAS` 对 `Codex` / `OPL` 暴露一个 MAS domain app skill；OPL 负责发现、同步和消费该 skill，不新增 OPL-only MAS skill family。
- `OPL` 持有 unified definitions、shared module/contract/index registration、module discovery 与 projection consumption surface；医学科研 runtime、controller truth、quality authority、publication gates 与 deliverable truth 继续由 `MAS` 持有。
- `MDS` 不再作为 OPL 默认安装的 MAS 运行依赖；MAS 只可把它显式声明为 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 或 parity oracle companion。
- 公开文档与技术入口不得恢复 MAS 用户安装型 standalone GitHub Release / standalone product release 叙事；MAS 仍按 OPL package 坐标 / prepared module archive 坐标与 git checkout / sibling repo 更新路径表达，Packages/GHCR 被 install/update live 消费前不得写成 active module channel，MDS 只保留 MAS-declared optional companion 引用。
- OPL 对 MAS progress、publication、quality、runtime control、`mas_opl_runtime_workbench_projection` 等 projection 只做证据、provenance、状态、App drilldown 和路由/transport metadata 展示；不得把 projection 文案写成 OPL 持有的 ready verdict、submission-ready verdict、publication verdict、质量裁决、runtime authority 或 artifact authority。
- 本决策不修改 `contracts/` 与 projection contract；它只同步公开文档和核心 docs 的 MAS v2 wording。

## 2026-05-02

### 历史指针：Hermes online-management 首启 readiness 已迁入 history

状态：先被 2026-05-08 Hermes-first online substrate 决策取代，又被 2026-05-10 Temporal-backed production runtime 决策 supersede。旧 core/domain 可用与 Hermes online-management 渐进就绪分层已迁入 [退役 runtime / gateway / GUI 决策历史](./history/runtime-substrate/retired-decisions-history.md)。

当前读法：`opl install`、`opl system initialize`、App 首启和公开 README 的 current readiness 按 Core、Domain modules、Temporal-backed family runtime provider 和 App release/user-path evidence 分层；不得把 Hermes gateway、online-management pending 或 provider adapter 写回当前安装行为、首屏层级、readiness blocker 或 compatibility surface。

## 2026-04-27

### 决策：App 更新按 OPL 日期版本判断，GUI 基线版本只作为内部兼容信息

原因：用户下载和检查更新时看到的是 One Person Lab 版本，而不是 AionUI upstream package 版本。GUI 继续跟随 AionUI 大版本演进，但自动更新、Release tag、安装包文件名和环境管理里的最新版本判断都应使用 OPL 日期版本。

影响：

- App repo release wrapper 调用 `opl-aion-shell` 打包时，把 Electron updater 元数据写成 `OPL_RELEASE_VERSION`
- App 关于页继续单独展示 OPL 版本与 GUI 基线版本
- GUI package.json 的 upstream/AionUI 基线版本不再决定 One Person Lab 自动更新顺序

### 决策：Packages 作为机器消费通道，Releases 继续作为用户下载通道

原因：桌面 App、Docker WebUI、native helper 和 domain modules 的更新节奏不同。把所有东西塞进 App release 会拖慢发布和回滚；只用 git repo 又缺少固定版本、校验和与机器可读更新面。

影响：

- `opl connect packages manifest` 成为 Packages 坐标的机器可读入口和后续分发目标；旧 `opl packages manifest` 已退役并 fail closed 到 Connect 替代入口。
- 当前 `opl install`、App 首启协调和环境管理仍以 git checkout 更新到远端最新为正式路径；Packages/GHCR 接入模块安装更新前不得写成当前机制
- 中央 release manifest / Packages workflow 可以继续维护为机器分发雏形，但各 domain repo 不需要单独恢复用户安装型 GitHub Release
- WebUI Docker 镜像的发布与用户路径 evidence 归 `one-person-lab-app`；OPL Framework 只保留 App-owned GHCR 坐标 / external reference，不在 framework packages workflow 中构建或发布 WebUI image
- Native helper 预构建 archive 同步发布到 GHCR，后续 `native:repair` 可优先消费
- 标准桌面 App 与自动更新包仍不打入 `OPL Meta Agent/MAS/MAG/RCA` runtime payload；macOS arm64 可额外发布 Full 首次安装资产，随包带 Agent Foundry 用的 `OPL Meta Agent`、`MAS/MAG/RCA`、`officecli` CLI binary 与推荐 companion skill payload，但不得写入 `latest*.yml` 或改变 App 自动更新通道

### 决策：One Person Lab App 只做 CLI-backed GUI，不复制安装与环境管理逻辑

原因：OPL 的可维护边界应是 CLI 提供安装、初始化、诊断、更新、模块管理与 workspace 管理等完整能力；GUI 只负责触发命令、展示状态与提供更低门槛的交互界面。这样命令行一键安装、App 首启、Docker WebUI 与后续自动修复能共享同一套行为，不形成 GUI-only 第二实现。

影响：

- App 首启继续通过 `opl system initialize` 读取状态，必要时通过 `opl install --headless --skip-packages` 自动补齐同一基座
- 设置里的环境管理继续通过 `opl doctor`、`opl install`、`opl connect modules`、`opl connect install|update|reinstall|remove|exec`、`opl engine *` 与 `opl workspace *` 完成动作
- GUI 在找不到 `opl` 时调用同一 OPL 主仓安装脚本的 `--headless --skip-packages` 基座合同，再回到 `opl ...` 命令面；`--skip-packages` 不保留 alias，`--carrier-only` 只供载体分阶段物化，不是另一套用户安装语义
- 新增安装、修复或状态能力时，先落到 OPL CLI 与机器可读输出，再由 GUI 消费

## 2026-04-26

### 决策：首启默认走静默自动配置，减少新手选择障碍

原因：One Person Lab App 和 Docker WebUI 的首要目标是让新手或 OPL-first 用户尽快进入可用界面。workspace root、模块安装、推荐 skills 这类可以合理默认或自动修复的事项不应变成首启向导问题；命令行 `opl install` 已完成的配置也不应在 App 首启时重复打断用户。

影响：

- 未显式配置 workspace root 时，`opl system initialize` 默认使用用户 Home 目录
- 兼容版本的 `Codex CLI` 已可用时，不因缺少可读 Codex config 单独阻塞首启
- `opl install` 默认安装/检查 domain modules，并以保守 managed 模式同步推荐 companion skills 和 `officecli` CLI 工具
- `opl install` 默认安装/复用 family runtime provider；Full readiness 需要 provider ready。`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- App 首启先静默读取 `opl system initialize`；若命令行安装已经完成，则不再运行安装或打开首启向导
- 只有缺少 Codex CLI、当前命中版本过旧或无法解析、模块无法安装等不可自动解决事项，才进入环境管理提示

### 历史决策：`MDS` 默认安装依赖面已被 MAS monolith closeout 取代

原因：2026-04-26 的安装面决策服务于迁移期，当时 MAS 仍需外部 `Med Deep Scientist` 作为隐藏运行依赖。MAS 现已完成 no-history physical absorb、retained capability absorb、default-runtime-retirement 与 docs closeout；外部 `med-deepscientist` checkout 不再是 MAS 默认 operation 的运行必需依赖。

影响：

- `opl install` 默认安装/检查 `MAS`、`MAG`、`RCA`，不再把 `meddeepscientist` 写成 MAS 默认运行依赖。
- `opl connect modules` 与 App 设置里的环境管理可以显示 MAS 声明的可选 companion diagnostic / oracle / intake 状态，但不得把它写成独立 OPL module。
- 首页和 domain-agent 入口继续只露出 `MAS`、`MAG`、`RCA`。
- 若 MAS 未来继续学习 MDS / DeepScientist 能力，只能按 snapshot provenance、capability classification、owner boundary、parity proof 与 no-history contributor audit 进入 MAS-owned surface 或显式 oracle / intake / diagnostic 引用。

### 决策：冻结 `OPL Runtime Manager` 为 provider-backed 产品控制面，而不是自有完整 runtime sidecar

状态：Runtime Manager 作为产品控制面继续有效；“Hermes 上”这一目标 substrate 已被 2026-05-10 的 Temporal-backed provider 决策 supersede。后续按 provider-backed Runtime Manager 解释。

原因：Runtime Manager 需要产品级 provision、version pin、profile wiring、stage-attempt request/projection、domain task registration hydration、诊断、恢复入口、native helper catalog 与高频状态索引，但不应复制一套 runtime kernel。早期 “Hermes 上” / 自有 sidecar 叙事已迁入 [退役 runtime / gateway / GUI 决策历史](./history/runtime-substrate/retired-decisions-history.md)。

当前读法：Runtime Manager 的细节 SSOT 已转到 `contracts/opl-framework/runtime-manager-contract.json`、`docs/references/runtime-substrate/opl-runtime-manager-target.md`、`docs/runtime/opl-runtime-naming-and-boundary-contract.md`、source/tests 和 fresh CLI/read-model。本文只保留决策来源与 no-resurrection 边界：

- `OPL Runtime Manager` 是 provider-backed family runtime 之上的产品控制面与 typed dispatch / diagnosis / projection 层；它不是自有 runtime kernel、domain scheduler、concrete executor、domain truth owner、quality verdict owner 或 artifact authority。
- Runtime Manager 可持有 provider selection、stage-attempt request/projection、diagnostics/repair entry、optional native helper catalog 和 state-index projection；native helper / state index 只按合同和 runtime support docs 读取，不在本决策中维护动态实现清单。
- Temporal 是唯一 runtime provider；`local_sqlite` 只作 retired-provider negative guard 和 SQLite projection/index 旧名语境；旧 Hermes provider / Gateway / readiness 只保留为 history provenance、诊断语料或负向 guard。`hermes_agent` 另按显式非默认 executor adapter/backend 处理。
- Domain task hydration 的本地 queue 成功路径已退役；OPL 不从 read-only projection 自行推断医学、基金或视觉交付任务，不写 domain truth、memory body、owner receipt、typed blocker 或 quality/export verdict。
- Provider service / worker lifecycle 由对应 deployment substrate 承担；OPL 只触发、检查、修复入口和报告 readiness。未来若要转向 OPL 自有完整 sidecar，必须先证明 provider abstraction / Temporal 无法表达必要的 task、wakeup、approval、audit 或产品隔离合同。

## 2026-04-25

### 决策：8787 Product API service 模块退役

原因：当前 OPL GUI/WebUI 主线由 OPL-branded AionUI shell 提供，不消费仓内 8787 Product API service。该 service 来自旧本地 web adapter 历史阶段，继续保留模块本体会把后台 JSON/adapter 面误导成当前产品能力。

影响：

- `opl install` 不再安装、启动或打开 8787 Product API service
- public `opl service *`、`opl system reinstall-support`、`opl web`、`web bundle` 与 `web package` 退出当前命令面
- 仓内旧本地 web adapter 与 self-hostable web package 实现删除，避免继续形成第二产品入口
- GUI 分发由 `one-person-lab-app` 构建并发布到 `gaofeng21cn/one-person-lab-app` GitHub Release；Framework repo 不再保留 App release/upload/build workflow

## 2026-04-23

### 历史指针：gateway-first / federation 合同语料已迁入 history

状态：gateway-first / federation / routed-action 语料不再是 active compatibility 或默认公开集成合同。历史读法、迁移背景和 no-resurrection 边界见 [退役 runtime / gateway / GUI 决策历史](./history/runtime-substrate/retired-decisions-history.md)。

当前读法：OPL 当前真相优先回到 `README*`、核心五件套与 `contracts/README.md`；已收录 domain 的实际接入单元继续写成 repo-owned capability surface 与单一 app skill。

### 决策：`OPL` 默认合同冻结为 `Codex-default session runtime + explicit activation layer`

原因：当前产品目标已经明确为“默认尽量等价 Codex，只在显式切换 runtime 或显式调用 domain agent 时进入 OPL 增量语义”。继续把 `OPL` 叙事写成 wrapper-first、GUI-first 或混合默认 runtime，会直接污染默认交互合同。

影响：

- `opl`、`opl exec`、`opl resume` 继续以 `Codex` 语义为默认前门
- `opl connect sync-skills` 成为 family domain skill pack 的统一同步入口；旧 `opl skill sync` 已退役并 fail closed 到 Connect 替代入口，默认前门继续保持原生 Codex 语义
- GUI 壳与 ACP-compatible 外壳都围绕同一套 Codex-default runtime contract 工作

### 决策：admitted domain 通过 repo-owned capability surface 接入 `OPL`

原因：系列项目需要让 `Codex` / `OPL` 调用 domain agent 时尽量保持同一使用体验。更自然的接入方式不是为每个 domain 发明 ask-wrapper，而是让 domain 仓把 CLI、本地程序/脚本与 repo-tracked contract 暴露成稳定 capability surface，再由 `OPL` activation 层消费。

影响：

- `MAS`、`MAG`、`RCA` 等 admitted domain 继续以 repo-owned CLI / 程序 / 脚本 / contract 作为稳定接入面
- `OPL` 负责 activation / dispatch，不把 domain-specific 行为改写成 OPL-only 语义
- 直接在 `Codex` 中调用某个 domain，与先进入 `OPL` 再显式激活该 domain，工作逻辑保持一致

## 2026-04-21

### 决策：活跃 domain 仓对外统一写成独立 `domain agent`

原因：在 `OPL` 已经收敛为 family-level `session runtime` 之后，`MAS`、`MAG`、`RCA` 的公开主语更准确地应是“可被 `Codex`、`OPL` 或其他通用 agent 直接调用的独立 `domain agent` 仓”。继续把 `domain gateway / domain harness` 当成仓库对外第一身份，容易把内部边界层语言和公开产品角色混在一起。

影响：

- `MAS`、`MAG`、`RCA` 当前公开主语统一收口为独立 `domain agent`
- `agent entry / direct entry` 成为对外更优先的入口语言
- `domain gateway / domain harness` 继续保留为各仓内部的边界层与执行层术语

### 决策：`OPL` 继续持有 shared modules / contracts / indexes，但不制造 OPL-only domain semantics

原因：系列项目必须有一层承接跨仓共享模块、共享合同和共享索引；这层归属继续属于 `OPL / UHS`。但共享模块的存在，不应把 domain-specific 行为语义绑成“只有经过 `OPL` 才成立”的特殊工作流。

影响：

- `OPL` 继续持有 family-level shared modules、shared contracts、shared indexes
- `MAS`、`MAG`、`RCA` 通过 `OPL` 调用或被 `Codex` 直接调用时，领域语义保持一致
- 顶层 session/runtime/projection 与 domain-specific truth/logic 继续分层

### 决策：`OPL` 主线切换为 `ACP-native session runtime`

原因：对开发者和一线使用者来说，`OPL` 的一等使用路径不是直接调用 API，而是进入本地 `opl`、在 `Codex` 中显式激活 `OPL` 与其 domain agent，或让外部壳通过显式 adapter 消费同一套 session runtime。继续把 `Product API` 作为主语，会把交互主线与真实用户路径写反。

影响：

- `OPL` 主仓当前主线以 `Codex-default session runtime + activation layer` 为中心，而不是以 GUI 或 API 壳为中心
- canonical truth 收敛到：workspace binding、session lifecycle、progress / artifact projection、agent entry dispatch、runtime mode
- GUI / Web shell 使用这套 session runtime；本地 8787 Product API / `opl web` 模块退役
- `one-person-lab-app` 是 App 产品仓；当前第一 GUI adapter 位于 `shells/aionui`，基于 AionUI codebase 产出 OPL 品牌壳，但原版 AionUI app 不是 OPL GUI，也不是 runtime owner。`opl-native-workbench` 是 App-owned foreground alternative；Hermes Desktop 只作为 retained explicit reference candidate；AGUI/CopilotKit 只作为 archived technical proof 读取

### 决策：GUI 主线确定为基于 AionUI codebase 的 OPL 品牌壳

原因：在 `OPL` 已经明确走 `Codex-default session runtime + activation layer` 主线之后，当前 GUI 形态确定为基于 AionUI codebase 的 OPL 品牌壳。用户面对的交付物必须是 OPL 品牌壳：去掉 OPL 用不上的通用 AionUI 模块，替换品牌、文案和安装包身份，并消费 OPL runtime/release contracts。App GUI 路线当前收敛为：AionUI 是主线，`opl-native-workbench` 是 foreground alternative，Hermes Desktop 是 retained explicit reference candidate，AGUI/CopilotKit 只保留为 archived technical proof。

影响：

- `OPL` 主仓继续保留 family-level session runtime、`opl` shell / TUI、release distribution surface 与 activation contracts
- 当前第一 GUI 交付物按 `opl-aion-shell` 的 OPL 品牌壳推进，并由 `one-person-lab-app` 负责发布包装
- 当前 GUI 实施依据收敛到 `one-person-lab-app` App-owned contracts、`opl-aion-shell` 与 AionUI codebase；`opl-native-workbench` 作为 App-owned foreground alternative candidate；Hermes Desktop 只作为 retained explicit reference candidate；AGUI/CopilotKit 不再作为普通备线材料推进

## 2026-04-20

### 历史指针：Product API / 旧本地 UI adapter 公开模型已迁入 history

状态：旧 Product API、旧本地 UI adapter、entry-guide、domain-wiring、hosted bundle/package 语义已退出当前主线。历史读法见 [退役 runtime / gateway / GUI 决策历史](./history/runtime-substrate/retired-decisions-history.md)。

当前读法：当前产品与 GUI 边界回到 OPL Framework、One Person Lab App、AionUI mainline shell、runtime/product docs 和 App-owned release/user-path evidence。

### 决策：Domain Agents 与 OPL 保持松耦合

原因：`MAS`、`MAG`、`RCA` 等仓的专业逻辑需要继续独立演进，而 `OPL` 需要保持顶层共享运行时和统一入口。

影响：

- `OPL` 负责共享运行时、shared modules/contracts/indexes 与 release distribution surface
- 各个领域仓继续持有智能体入口、领域逻辑、运行规则与交付物
- 通过 `OPL` 调用领域智能体，与直接在 `Codex` 里调用该智能体，工作逻辑保持一致

### 历史指针：旧本地 UI adapter 退役清单已迁入 history

旧本地 UI adapter、entry-guide、domain-wiring、hosted bundle/package 只作为 provenance 阅读；当前主线不再把它们作为公开产品主语。历史读法见 [退役 runtime / gateway / GUI 决策历史](./history/runtime-substrate/retired-decisions-history.md)。

## 2026-04-19

### 历史指针：frontdoor-era GUI 分仓和外部 GUI 基座叙事已迁入 history

状态：`OPL 主仓共享运行时 + 独立界面仓` 和外部 GUI 基座语境区分已经被 2026-05-15 App clean 产品仓、2026-06-03 GUI shell owner surface 和 App-owned contracts 吸收。历史读法见 [退役 runtime / gateway / GUI 决策历史](./history/runtime-substrate/retired-decisions-history.md)。

当前读法：AionUI mainline shell 是 App 当前 GUI 主线；`opl-native-workbench` 是 App-owned foreground alternative；Hermes Desktop 是 retained explicit reference candidate；AGUI/CopilotKit 只作为 archived technical proof / explicit replay provenance。

## 2026-04-11

### 历史指针：Hermes 命名 / runtime substrate 早期决策已迁入 history

状态：早期 `Hermes-Agent` 命名和统一 runtime substrate 叙事已被 Temporal-backed provider、explicit executor adapter/backend 和 Codex CLI first-class executor 口径吸收。历史读法见 [退役 runtime / gateway / GUI 决策历史](./history/runtime-substrate/retired-decisions-history.md)。

当前读法：`Hermes-Agent` 文案可用于上游项目 / 服务本体，以及 `hermes_agent` canonical 显式非默认 executor adapter/backend 的标签；不得再把 Hermes 写成 OPL provider、默认 runtime substrate、readiness path 或兼容接口。

### 决策：家族第一公民执行器正式名称冻结为 `Codex CLI`

原因：这是当前最成熟、质量最可控、并且已经在医学研究线证明可行的默认路线；把正式名称、默认模式与路线状态分开表达，更适合跨仓共享合同长期维护。

影响：

- 家族第一公民执行器正式名称统一写作 `Codex CLI`
- 家族默认执行模式统一写作 `autonomous`
- `Hermes-Agent` 继续保留正式名称；当前 executor 路线状态写作 `explicit_non_default_executor_adapter / experimental`，provider/Gateway/readiness 路线状态写作 `retired_from_active_provider_surfaces / history_provenance_diagnostic_reference`
- 默认模型与默认 reasoning effort 继续继承本机 `Codex` 默认配置
