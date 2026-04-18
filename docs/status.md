# OPL 当前状态

## 当前角色

- 仓库角色：顶层 gateway 与 federation surface，domain runtime ownership 留在各自的 admitted domain 仓
- 当前开发宿主：`Codex` 长线自治会话
- 当前产品入口真相：`OPL` 已经落下本地 direct product-entry shell。当前公开主路径已经统一为 `GUI -> Codex -> OPL`。`opl frontdesk-bootstrap --path <workspace>` 会准备 `OPL Atlas` Desktop 壳、把 `OPL Agent` 对齐到本机 `Codex` 默认模型与 thinking、默认挂上 `OPL Cortex` MCP bridge，并把当前 workspace 接入 OPL 顶层 registry；`opl web` 是同一前台的本地 web companion surface；`opl`、`opl <request...>`、`opl start --project <project_id> [--mode <mode_id>]`、`opl doctor`、`opl ask`、`opl chat`、`opl resume`、`opl sessions`、`opl logs`、`opl repair-hermes-gateway` 继续作为进入或运维这条主路径的 shell surface。frontdesk runtime modes 当前冻结为 `interaction_mode=codex` 与 `execution_mode=codex`；`opl ask` 默认执行器也是 `Codex`；`Hermes` 只通过 `opl chat`、`opl resume`、`--executor hermes` 与前台显式 mode 切换进入备用 lane。`workspace-catalog / workspace-bind|activate|archive / domain-manifests / runtime-status / session-ledger / dashboard` 组成当前顶层管理面；`domain-manifests` 会解析 active binding 上的 `manifest_command`，把 routed domain 的 `product_entry_start`、`product_entry_shell`、`shared_handoff` 与可选 `family_orchestration.action_graph` 回灌到 `dashboard` 与 `handoff-envelope`；壳层默认 bootstrap 顺序保持 `frontdesk-entry-guide -> frontdesk-readiness / frontdesk-domain-wiring -> dashboard`。
- 当前前台工具面真相：默认 `OPL Cortex` MCP bridge 不再把 operator/raw 控制面整包暴露给前台，而是只保留 8 个用户向工具：`opl_project_progress / opl_execute_request / opl_task_status / opl_recent_sessions / opl_resume_session / opl_runtime_logs / opl_projects / opl_activate_workspace`。`dashboard / frontdesk-readiness / workspace-catalog / session-ledger` 等继续作为 repo / operator 面存在，但不再默认占用用户前台的 tool 上下文
- 当前长任务语义真相：前台 `ask` 已改成 `async_accept`；真实执行请求会先返回 `task_id`，后台再按当前前台 `interaction_mode` 异步启动 ask，默认走 `Codex`，显式切换后可走 `Hermes`；随后通过 `/api/task-status` 与 `opl_task_status` 回报阶段、最近输出与已解析出的 `session_id`。`dry_run` 仍保持同步预演
- 当前 hosted / web 前台真相：hosted / web front desk benchmark 当前以 `Chatbot UI / LibreChat / Open WebUI / LobeChat` 为参考面。默认本机 GUI 路径已经切到 `OPL Atlas` Desktop，本地 web front desk pilot 作为 companion surface 可直接打开；hosted-friendly contract surface 与 self-hostable hosted pilot package 已落地。`opl frontdesk librechat install` 与 `opl frontdesk-librechat-package` 只保留 optional compatibility / fallback lane；actual managed hosted runtime 仍未落地。`OPL Cortex` MCP bridge 已把 hosted shell bootstrap 所需的 `workspace binding + session attribution` wiring 明文落成 machine-readable surface；repo 内部 `frontdesk_*` 继续是 machine-readable contract / API 命名
- 当前家族级入口真相：四仓的 `product entry` 成熟度仍不一致。`OPL` 已有 family-level 本地入口壳；三个业务仓现在也都已有 repo-tracked 的 lightweight direct-entry shell，但成熟度和可直接使用性仍不同，且都还不能被误写成成熟的 hosted 或最终用户前台
- 当前产品边界：`OPL` 负责顶层 gateway / federation / shared substrate contract，三个 domain 仓继续各自维护自己的产品 runtime
- 当前共享实现 owner 真相：从 `2026-04-17` 开始，`OPL` 不再只冻结 shared contract，也开始显式持有 family-shared implementation substrate。当前已冻结的中央 helper 包括 JS 侧的 `managed-runtime-contract`、`product-entry-companions`、`runtime-task-companions`、`skill-catalog`、`automation-companions` 与 `family-orchestration` export；其中 `product-entry-companions` 现在已统一持有 `family_product_entry_manifest / family_product_frontdesk / product_entry_quickstart / product_entry_overview / product_entry_readiness / product_entry_start / product_frontdesk` 的公共 builder。可被 Python domain 仓消费的 `python/opl-harness-shared` 子包也同步持有 `managed_runtime`、`hermes_supervision`、`product_entry_companions`、`runtime_task_companions`、`skill_catalog`、`automation_companions` 与 `family_orchestration`。这意味着 `family_orchestration` 的 preview shell、runtime companion、人审 gate helper、frontdoor shared core、family product-entry manifest 公共壳、family frontdesk 投影公共壳，以及 `program_id / active_run_id` 解析 helper 都已经进入 OPL 的单一 owner surface；domain 仓应直接复用这些 family helper，而不是继续各写一套同类 substrate
- 当前统一协作语义：公开默认 agent mode 是 `Codex`；`Hermes` 保留 external kernel 目标与显式长时会话 lane；`OPL` 与 domain 仓继续持有 gateway、authority、对象合同与审计真相；具体单步执行保持 executor-adapter 可插拔，不要求三个 domain 仓共享同一种执行脑
- 当前外部 control-plane 口径：`Paperclip` 现在只作为 `OPL` 的可选下游外部 control plane bridge，被用来承接 issue / approval / 审计 UI；它不替换 `OPL` 顶层 gateway，也不改写 `Hermes` 或 domain runtime owner 的边界
- 当前家族默认执行器：`Codex CLI autonomous`；默认模型与默认 reasoning effort / thinking 统一继承本机 `Codex` 默认配置，不在 family contract 里固定 pin 具体型号
- 当前 family orchestration contract 真相：这轮吸收的是 `CrewAI` 一类框架里最值得保留的 orchestration 语义，而不是把 `CrewAI` 直接拉进来做 family dependency；当前顶层冻结的 5 类 companion surface 是 `family event envelope`、`family checkpoint lineage`、`family action graph`、`family human gate`、`family product-entry manifest v2`
- 当前 `Hermes-native` 口径：只作为实验路线；只有完整的 Hermes AIAgent agent loop 才算 `Hermes-native`，不是一步一步 chat，也不是 chat relay
- 当前执行器收口状态：family 默认 executor-adapter truth 现在同时冻结在参考文档 `docs/references/family-executor-adapter-defaults.md` 与 machine-readable contract `contracts/opl-gateway/family-executor-adapter-defaults.json`；`Med Auto Science / MedDeepScientist` 继续是当前 reference implementation，`Med Auto Grant` 的 critique route 与 `RedCube AI` 的默认 autonomous route 也都已经对齐到 `Codex CLI autonomous`
- 当前 runtime 真相：四个仓并不处在同一集成深度。`Med Auto Grant` 已切到真实上游 `Hermes-Agent` runtime substrate；`Med Auto Science` 已完成 external runtime bring-up，当前开发宿主上的 honest next step 是 real adapter cutover；`RedCube AI` 已把 route / managed execution 收口到本地 `Codex CLI` host-agent runtime，同时落下 repo-verified `product frontdesk / federated product entry / session continuity / family-orchestration companion` 表面；`OPL` 自己继续只持有 gateway / federation / handoff contract，而不持有 domain runtime owner 身份。任何 repo-local shim / pilot / scaffold 都不能被写成“已完成真实集成”
- 当前已冻结的 integration choice：`Hermes Kernel Integration` 采用 `external kernel, managed by OPL product packaging`；不选 fork / vendor，也不把手工安装 Hermes 变成用户前置要求
- 历史执行面：OMX 已退场，仅保留历史入口

## 当前家族仓与联邦地位

- `Research Foundry -> Med Auto Science`：活跃 `Research Ops`
- `RedCube AI`：活跃 visual-deliverable / `Presentation Ops`
- `Grant Foundry -> Med Auto Grant`：活跃 author-side / proposal-facing `Grant Ops` 业务仓；但当前 OPL 顶层 public federation wording 仍需与其 admission / handoff state 分开维护

## 当前基线（repo-tracked）

- AI / 维护者核心工作集：`project / architecture / invariants / decisions / status`
- 对外公开 docs：继续沿用 `docs/README*` 定义的四层结构
- 机器合同：`contracts/opl-gateway/*.json`
- 历史执行与迁移材料：只从 `docs/history/omx/` 进入，不再作为当前入口

## 当前阶段

- 当前顶层主线：family-level front desk / hosted runtime hardening / domain lightweight direct-entry alignment；`central sync` 只作为 admitted-domain 新 absorbed delta 或 central reference surfaces drift 出现时才重开的条件性 follow-on
- 当前顶层执行面收口：`docs/status.md` 继续给出顶层当前真相；`docs/references/opl-frontdesk-delivery-board.md` 负责当前活跃执行主线、主要 gap 与建议下一条执行 issue；`contracts/opl-gateway/README.md` 继续冻结 machine-readable contract boundary 与“`OPL` 不升格成 runtime owner”的约束；`docs/references/opl-phase-2-central-reference-sync-board.md` 只保留 admitted-domain delta / gateway wording drift 场景下的中央同步 follow-on
- 当前重点：先把“上游 `Hermes-Agent` 才算真实接入”与“OPL 采用外部 kernel、产品层托管集成”这两条标准冻结下来，再把三个 domain 仓已经 absorbed 的 delta 收进顶层参考面与公开边界
- 当前重点：在已经落地的 `OPL` 本地 direct-entry shell 基础上，继续冻结 `domain lightweight direct entry + unified handoff envelope` 这条家族级入口架构
- 当前重点：把三个业务仓新增的 `product_entry_start + frontdesk_surface + operator_loop_actions + product_entry_shell + shared_handoff + product_entry_preflight` 收口为同一套家族级用户面 contract，并让 `domain-manifests / dashboard / handoff-envelope / opl web` 一起消费，不再只告诉用户“当前 loop 是什么”，而是直接告诉用户“该从哪个 direct frontdesk 进入、先做什么 preflight、推荐先用哪种 start mode、下一步能做哪几件事、有哪些 builder / federated handoff 可以直接接”
- 当前重点：把壳层默认 bootstrap 顺序冻结为 `frontdesk-entry-guide -> frontdesk-readiness / frontdesk-domain-wiring -> dashboard`；也就是先回答“从哪进、先做什么”，再回答 readiness / parity，最后才落到 operator debug 总览，避免 GUI / shell 再从 `dashboard` 反推入口语义
- 当前重点：把三个业务仓继续压到“显式 `product frontdesk` + 诚实 `operator loop`”这一层；也就是 `frontdesk_surface` 不再只是某个 loop 的别名，而是 controller-owned 的 direct frontdoor contract，底下仍明确保留各自的 loop / action / handoff 真相
- 当前重点：三个业务仓的 repo-tracked `product-entry manifest` 现在都已显式带出 `product_entry_start`、`product_entry_preflight` 与 `family_orchestration` companion preview；`OPL` 顶层现在会把 recommended start mode、startup preflight、human gate、resume surface、checkpoint lineage，以及 repo-tracked `action_graph` 实体摘要一起回灌进 `dashboard / domain-manifests / handoff-envelope / opl web`
- 当前重点：业务仓若继续发布 `product_entry_quickstart`、`product_entry_overview` 与轻量 `product_entry_readiness` companion，`OPL` 顶层也要一并消费；这样 top-level front desk 就不再只知道 manifest 和 loop，而是还能直接展示“先从哪进、接着怎么续跑、看哪条进度面、现在能不能直接用，以及还有哪些产品缺口”
- 当前重点：把 GUI-first 主入口、hosted-friendly shell contract 与 optional `LibreChat` compatibility / fallback lane 一起冻结，避免 hosted / public 口径再次漂移
- 当前重点：以 contract-first 的方式吸收 `CrewAI` 的 orchestration 优点，把 `family event envelope / checkpoint lineage / action graph / human gate / product-entry manifest v2` 冻结为 shared runtime/shared domain 的 machine-readable companion surface，而不是新增 family runtime dependency
- 当前约束：runtime ownership 继续留在 domain 一侧，开发宿主、历史执行面与仓内自写 substrate 都只能描述执行条件与迁移背景，不能被抬升成产品 runtime 真相
- 理想形态与当前差距、以及为什么不能把 repo-local shim / pilot 写成真实集成，统一收口到 `docs/references/hermes-agent-truth-reset-and-target-state.md`
- 产品入口形态与 `Hermes Kernel Integration` 的正式选择，统一收口到 `docs/references/opl-product-entry-and-hermes-kernel-integration.md`
- 家族级入口栈与 `OPL -> domain` handoff 架构，统一收口到 `docs/references/family-product-entry-and-domain-handoff-architecture.md`
- hosted / web 前台选型与 pilot 优先级，统一收口到 `docs/references/opl-hosted-web-frontdesk-benchmark.md`
- 家族级 lightweight direct entry 推进节奏，统一收口到 `docs/references/family-lightweight-direct-entry-rollout-board.md`
- 家族用户面成熟度梯子与四仓当前落点，统一收口到 `docs/references/family-user-facing-maturity-roadmap.md`
- 家族统一 `executor-adapter` 默认口径，统一收口到 `docs/references/family-executor-adapter-defaults.md` 与 `contracts/opl-gateway/family-executor-adapter-defaults.json`
- `Hermes-native` 备选执行器的准入标准与验证维度，统一收口到 `docs/references/hermes-native-executor-proof-lane.md`
- 四仓剩余执行器任务、文档同步清单与 `Hermes-Agent` 备选执行器评估，统一收口到 `docs/references/four-repo-executor-follow-up-and-hermes-evaluation.md`
- 家族统一 orchestration contract 收编说明，统一收口到 `docs/references/family-orchestration-contract-absorb-crewai.md`
- `OPL Front Desk` 当前已完成/未完成事项，统一收口到 `docs/references/opl-frontdesk-delivery-board.md`
- `Med Auto Science` 的顶层切换边界与 `OPL -> MAS` 切换板，统一收口到 `docs/references/mas-top-level-cutover-board.md`
- family executor 下一阶段执行批次，统一收口到 `docs/plans/2026-04-13-family-executor-adapter-next-phase.md`

## 下一阶段

1. 保持公开 docs、gateway contracts 与 admitted domain 状态一致。
2. 在已落地的 GUI-first front desk、hosted-pilot-ready shell bundle、self-hostable hosted pilot package、workspace registry、managed session ledger 与 handoff bundle 之上，继续做 hosted runtime hardening，并把 `LibreChat` 维持在 optional compatibility / fallback lane。
3. 先让 `OPL` 站稳 family-level hosted / web front desk 方案，再让三个业务仓沿已经 landed 的 `product frontdesk + operator_loop_actions` 把 lightweight direct-entry shell 继续压实成更稳定的 direct-entry 面。
4. 统一四仓对“上游 `Hermes-Agent` / repo-local shim / pilot / scaffold”的命名边界，不再允许假集成叙事。
5. 先保持“`Codex CLI autonomous` + 继承本机 `Codex` 默认配置”这条默认执行器主线不漂移；`RedCube AI` 的已 absorbed truth 继续保持在中央 reference surfaces 上同步，并只通过 `docs/references/hermes-native-executor-proof-lane.md` 定义的 full-agent-loop proof lane 测试真正的 `Hermes-native`。
6. 推动各 domain 仓沿同一份 family contract 表达 `runtime substrate / gateway authority / executor adapter` 三层边界，不再有人把“接入 Hermes”误解成“强制替换全部执行器”或“当前 chat relay 已经等于 Hermes-native”。
7. 在已经 landed 的 `family_orchestration` companion preview 基础上，继续推动 `Med Auto Grant`、`Med Auto Science`、`RedCube AI` 把各自的 `operator loop / runtime watch / grant-progress / direct-entry manifest` 往更完整的 graph / gate / resume / discovery 语义压实，避免每仓各自再发明一套。
8. 继续把 `product_entry_quickstart`、`product_entry_overview` 与 `product_entry_readiness` companion 保持成三仓同型 discovery surface，并让 `dashboard / handoff-envelope / opl web` 统一消费，保证 family-level 入口能直接回答“现在怎么进、怎么续跑、看哪、能不能直接用，以及当前缺口和人审门在哪”。
9. 当前已经落地的是 GUI-first 本地 direct product-entry shell、本地 web pilot、hosted-friendly shell contract、hosted pilot bundle、self-hostable hosted pilot package、optional `LibreChat` compatibility / fallback package、workspace registry、managed session ledger、family handoff bundle，以及 service-safe 的本地 front desk packaging；不把它们误写成 managed hosted runtime；下一步继续推进 hosted runtime hardening 与更完整的 direct product entry。
10. 避免 reference-grade 与历史迁移文档继续挤占公开主线。

## 长线目标（规划层）

- 形成面向系列项目的顶层 federation / gateway / contract layer。
- 让 `OPL` 从“主要依赖 Codex 间接调用”演进成“用户可直接进入的 product entry surface”。
- 让三个业务仓也都从 `operator / agent entry` 演进成各自 scope 内的 lightweight direct product entry。
- 让三个 domain 仓在同一 shared substrate 语义下运行，但仍保留各自 domain boundary。
- 当一个或多个 domain 仓真正接入上游 `Hermes-Agent` 后，`OPL` 再把该 runtime substrate 口径提升成联邦层已落地事实；在那之前只保持为目标形态。
- 本地开源版采用 `OPL` 产品层托管集成 external kernel，托管版采用平台内部运行 external kernel。
- 无论 runtime substrate 最终怎么托管，`OPL` 都继续保持顶层协调与发现层。

## 默认验证

- 默认最小验证：`scripts/verify.sh`
- meta 验证：`scripts/verify.sh meta`
- full 验证：`scripts/verify.sh full`
