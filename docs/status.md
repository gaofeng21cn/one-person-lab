# OPL 当前状态

## 当前角色

- 仓库角色：顶层 gateway 与 federation surface，domain runtime ownership 留在各自的 admitted domain 仓
- 当前开发宿主：`Codex` 长线自治会话
- 当前产品入口真相：`OPL` 已经落下本地 direct product-entry shell，默认前台命令就是 `opl`；`opl <request...>` 可直接作为 quick ask，而 `opl doctor / ask / chat / resume / sessions / logs / repair-hermes-gateway / frontdesk-manifest / frontdesk-hosted-bundle / frontdesk-hosted-package / frontdesk-librechat-package / session-ledger / handoff-envelope / domain-manifests / frontdesk-service-*` 构成显式入口与 runtime 运维命令面。`opl projects / workspace-status / workspace-catalog / workspace-bind|activate|archive / domain-manifests / runtime-status / session-ledger / dashboard` 已把顶层管理面补成“可观察 + 可写 workspace 管理 + 会话归因”的第一版；其中 `workspace-catalog` 继续只是 registry，会输出 project-level binding summary、可写 action 提示，以及可选的 domain-owned `manifest_command`；`domain-manifests` 则会实际解析这些 active binding 上的 `manifest_command`，把 family wiring 指向 routed domain 的 machine-readable product-entry discovery surface，并把 routed domain 的 recommended shell / command、repo mainline 摘要与 `product_entry_status` 状态摘要一起回灌到 `dashboard` 与 `handoff-envelope`；`session-ledger` 现在会输出 session aggregate 级别的归因视图。`opl web` 则把本地 web front desk pilot 与 hosted-friendly 的 `health / manifest / domain-manifests / hosted-bundle / hosted-package / librechat-package / sessions / resume / logs / handoff-envelope` 表面也一并落地；现在又进一步补上了基于 launchd 的 service-safe 本地包装层。用户在本机上不再必须先通过 `Codex` 才能触达顶层 `OPL`
- 当前 hosted / web 前台真相：这轮已经有了可直接打开的本地 web front desk pilot，也已经把 future hosted shell 可消费的 hosted-friendly contract surface 冻结出来，并导出了 self-hostable hosted pilot package，以及真实可部署的 `LibreChat-first` hosted shell pilot package；但 actual managed hosted runtime 仍未落地。真正的 hosted / web 入口选型继续冻结为短期 `LibreChat-first`、长期 `OPL` 自有 web front desk。`Chatbot UI` 不作为主 hosted 基座
- 当前家族级入口真相：四仓的 `product entry` 成熟度仍不一致。`OPL` 已有 family-level 本地入口壳；三个业务仓现在也都已有 repo-tracked 的 lightweight direct-entry shell，但成熟度和可直接使用性仍不同，且都还不能被误写成成熟的 hosted 或最终用户前台
- 当前产品边界：`OPL` 负责顶层 gateway / federation / shared substrate contract，三个 domain 仓继续各自维护自己的产品 runtime
- 当前统一协作语义：`Hermes` 负责产品级长期在线 runtime substrate / orchestration；`OPL` 与 domain 仓继续持有 gateway、authority、对象合同与审计真相；具体单步执行保持 executor-adapter 可插拔，不要求三个 domain 仓共享同一种执行脑
- 当前 runtime 真相：四个仓并不处在同一集成深度。`Med Auto Grant` 已切到真实上游 `Hermes-Agent` runtime substrate；`Med Auto Science` 已完成 external runtime bring-up，当前开发宿主上的 honest next step 是 real adapter cutover；`RedCube AI` 仍处于 upstream pilot prep；`OPL` 自己继续只持有 gateway / federation / handoff contract，而不持有 domain runtime owner 身份。任何 repo-local shim / pilot / scaffold 都不能被写成“已完成真实集成”
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

- 当前顶层主线：truth reset、central sync、surface authority convergence、admitted-domain state alignment
- 当前重点：先把“上游 `Hermes-Agent` 才算真实接入”与“OPL 采用外部 kernel、产品层托管集成”这两条标准冻结下来，再把三个 domain 仓已经 absorbed 的 delta 收进顶层参考面与公开边界
- 当前重点：在已经落地的 `OPL` 本地 direct-entry shell 基础上，继续冻结 `domain lightweight direct entry + unified handoff envelope` 这条家族级入口架构
- 当前重点：把 hosted / web 前台的真实选型、hosted-friendly shell contract 与 family-level direct entry 推进板一起冻结，避免下一轮又回到“随便套一个 chat UI 就算产品入口”的漂移
- 当前约束：runtime ownership 继续留在 domain 一侧，开发宿主、历史执行面与仓内自写 substrate 都只能描述执行条件与迁移背景，不能被抬升成产品 runtime 真相
- 理想形态与当前差距、以及为什么不能把 repo-local shim / pilot 写成真实集成，统一收口到 `docs/references/hermes-agent-truth-reset-and-target-state.md`
- 产品入口形态与 `Hermes Kernel Integration` 的正式选择，统一收口到 `docs/references/opl-product-entry-and-hermes-kernel-integration.md`
- 家族级入口栈与 `OPL -> domain` handoff 架构，统一收口到 `docs/references/family-product-entry-and-domain-handoff-architecture.md`
- hosted / web 前台选型与 pilot 优先级，统一收口到 `docs/references/opl-hosted-web-frontdesk-benchmark.md`
- 家族级 lightweight direct entry 推进节奏，统一收口到 `docs/references/family-lightweight-direct-entry-rollout-board.md`
- `OPL Front Desk` 当前已完成/未完成事项，统一收口到 `docs/references/opl-frontdesk-delivery-board.md`
- `Med Auto Science` 的顶层切换边界与 `OPL -> MAS` 切换板，统一收口到 `docs/references/mas-top-level-cutover-board.md`

## 下一阶段

1. 保持公开 docs、gateway contracts 与 admitted domain 状态一致。
2. 在已落地的 hosted-pilot-ready shell bundle、self-hostable hosted pilot package、真实的 `LibreChat-first` hosted shell pilot package、workspace registry、managed session ledger 与 handoff bundle 之上，继续做 hosted runtime hardening，同时明确长期仍是 `OPL` 自有 web front desk。
3. 先让 `OPL` 站稳 family-level hosted / web front desk 方案，再让三个业务仓把已经 landed 的 lightweight direct-entry shell 继续压实成更稳定的 direct-entry 面。
4. 统一四仓对“上游 `Hermes-Agent` / repo-local shim / pilot / scaffold”的命名边界，不再允许假集成叙事。
5. 推动各 domain 仓把 `runtime substrate / gateway authority / executor adapter` 三层边界写成同一套 family 语义，不再有人把“接入 Hermes”误解成“强制替换全部执行器”。
6. 当前已经落地的是本地 direct product-entry shell、本地 web pilot、hosted-friendly shell contract、hosted pilot bundle、self-hostable hosted pilot package、真实的 `LibreChat-first` hosted shell pilot package、workspace registry、managed session ledger、family handoff bundle，以及 service-safe 的本地 front desk packaging；不把它们误写成 managed hosted runtime；下一步继续推进 hosted runtime hardening 与更完整的 direct product entry。
7. 避免 reference-grade 与历史迁移文档继续挤占公开主线。

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
