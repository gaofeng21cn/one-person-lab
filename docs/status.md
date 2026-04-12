# OPL 当前状态

## 当前角色

- 仓库角色：顶层 gateway 与 federation surface，domain runtime ownership 留在各自的 admitted domain 仓
- 当前开发宿主：`Codex` 长线自治会话
- 当前产品入口真相：用户仍主要通过 `Codex` + 本地 `CLI / MCP` 间接触达 `OPL`；`OPL` 还不是 direct product entry。三个业务仓有的已具备本地 `CLI` / runtime baseline，但整体仍更接近 `operator entry` / `agent entry`，而不是成熟 `product entry`
- 当前家族级入口真相：四仓都还没有成熟的 `product entry`；当前真正存在的是不同程度的 `operator entry` 与 `agent entry`
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
- 当前重点：同时冻结 `OPL direct entry + domain lightweight direct entry + unified handoff envelope` 这条家族级入口架构
- 当前约束：runtime ownership 继续留在 domain 一侧，开发宿主、历史执行面与仓内自写 substrate 都只能描述执行条件与迁移背景，不能被抬升成产品 runtime 真相
- 理想形态与当前差距、以及为什么不能把 repo-local shim / pilot 写成真实集成，统一收口到 `docs/references/hermes-agent-truth-reset-and-target-state.md`
- 产品入口形态与 `Hermes Kernel Integration` 的正式选择，统一收口到 `docs/references/opl-product-entry-and-hermes-kernel-integration.md`
- 家族级入口栈与 `OPL -> domain` handoff 架构，统一收口到 `docs/references/family-product-entry-and-domain-handoff-architecture.md`

## 下一阶段

1. 保持公开 docs、gateway contracts 与 admitted domain 状态一致。
2. 统一四仓对“上游 `Hermes-Agent` / repo-local shim / pilot / scaffold”的命名边界，不再允许假集成叙事。
3. 先在更轻的业务仓冻结真实的上游 `Hermes-Agent` pilot 条件，同时补齐 `OPL bootstrap / launcher` 所需的 product-entry contract。
4. 让三个业务仓同步定义自己的 lightweight direct entry，不再长期停留在“只有 CLI / MCP 可被 agent 调用”的状态。
5. 推动各 domain 仓把 `runtime substrate / gateway authority / executor adapter` 三层边界写成同一套 family 语义，不再有人把“接入 Hermes”误解成“强制替换全部执行器”。
6. 在上游 pilot 成立前，不把 `OPL` 写成已拥有独立托管 runtime；在 pilot 成立后，再推进 direct product entry。
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
