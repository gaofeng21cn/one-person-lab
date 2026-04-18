# OPL 架构

## 顶层分层

`OPL` 的主链路是顶层 federation：

`Human / Agent -> OPL Gateway -> Domain Gateway -> Domain Harness OS -> Domain Repository`

## 当前使用链路与目标产品链路

当前 repo-tracked 的本地使用链路已经变成：

`User -> opl front desk / quick ask / ops shell -> OPL Gateway -> Hermes Kernel -> Domain Handoff -> Domain Gateway / Domain Product Entry -> Domain Harness OS -> Domain Repository`

这说明当前 `OPL` 已经拥有本地 direct product entry 的第一版入口壳；
它不再只是 `opl doctor / ask / chat` 三条显式命令，而是已经具备：

- `opl`
  - 默认进入 family-level front desk
- `opl <request...>`
  - 默认走 quick ask
- `opl resume / sessions / logs / repair-hermes-gateway`
  - 提供 landed local shell 的会话与 runtime 运维界面
- `opl frontdesk-manifest / frontdesk-domain-wiring / frontdesk-hosted-bundle / frontdesk-hosted-package / frontdesk-librechat-package / session-ledger / handoff-envelope`
  - 提供 hosted-friendly shell contract、hosted-friendly family wiring truth、hosted-pilot-ready shell bundle、self-hostable hosted pilot package、真实的 LibreChat-first hosted shell pilot package、OPL-managed session attribution 与 family handoff contract
  - 当前 hosted shell bootstrap discovery 顺序固定为 `opl_frontdesk_entry_guide -> opl_frontdesk_readiness -> opl_workspace_catalog -> opl_session_ledger -> opl_project_progress`
- `opl workspace-catalog / workspace-bind|activate|archive`
  - 提供 file-backed workspace registry 与顶层到 domain 之间的 direct-entry locator 管理
- `opl web`
  - 提供 browser-based front desk，并把 workspace registry、managed session ledger 与 handoff-aware control room 一并带到前台

但它还不是 managed hosted / web 形态的完整产品前台。
当前这层 hosted / web 路线已经先落下了真实的 `LibreChat-first` pilot 壳，长期仍回到 `OPL` 自有 web front desk。
同时，`Phase 1` 的 gateway contract commands 仍然是顶层联邦真相面的稳定 formal contract surface。

目标产品链路应是：

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Adapter -> Domain Gateway -> Domain Harness OS -> Executor Adapter -> Concrete Executor`

其中：

- `OPL Product Entry`
  - 面向用户直接暴露入口，例如本地 launcher / CLI shell、未来 web/chat entry
- `Hermes Kernel`
  - 负责长期在线 runtime substrate，例如 session、memory、scheduler、interrupt / resume、delivery / cron
- `Domain Adapter`
  - 负责把通用 runtime substrate 接入具体 domain contract，而不是重写 domain truth
- `Executor Adapter`
  - 负责把 domain 内部动作路由到具体执行器，例如受控 backend、Hermes-native agent、Codex、Claude Code、Python/CLI toolchain
  - 当前家族默认执行器固定为 `Codex CLI autonomous`；默认模型与默认 reasoning effort 统一继承本机 `Codex` 默认配置，不在 family contract 里固定 pin
- `Concrete Executor`
  - 负责完成单个步骤或局部工作，不自动上升为顶层 runtime substrate owner

同样的缺口也存在于三个业务仓：

- 它们今天很多已经具备 `operator entry` 或 `agent entry`
- 但还没有全面长成“用户可直接进入”的轻量 `product entry`
- 因此后续不仅要把 `OPL` 做成 direct entry，也要让各业务仓在各自 scope 内拥有 direct entry

## 统一入口 taxonomy 与 handoff 关系

四仓后续统一使用下面三层入口语义：

- `operator entry`
  - 面向工程操作者的命令、脚本、调试入口
- `agent entry`
  - 面向 `Codex` / Claude Code / OpenClaw 这类 host-agent 的调用入口
- `product entry`
  - 面向最终用户的正式产品入口

`OPL` 的 direct entry 不会替代 domain 仓的 direct entry。
更准确的 family-level 结构应是：

`User -> OPL Product Entry -> OPL Gateway -> Hermes Kernel -> Domain Handoff -> Domain Product Entry / Domain Gateway`

这意味着顶层和单仓都要成长出产品入口，只是作用域不同：

- `OPL Product Entry`
  - family-level 总入口
- `Domain Product Entry`
  - domain-scoped 轻量入口

## Hermes Kernel 与具体执行器的协作边界

`Hermes Kernel` 在家族级架构里负责的是：

- 长期在线 session / run substrate
- gateway / messaging / cron / interrupt / resume
- memory、scheduler、delivery 这类通用 runtime 能力

它不自动等于“唯一执行脑”。

`OPL` 与各 domain 仓继续负责：

- gateway / handoff / authority 边界
- object model 与 domain durable surface
- stage / gate / audit / publication 等业务判断
- executor routing contract

因此全家族统一的不是“每一步都必须由 Hermes 自己执行”，而是：

- 由 `Hermes` 统一 runtime substrate / orchestration
- 由 domain 程序统一 authority / contract / audit truth
- 由 `Executor Adapter` 在每个 domain 内按 route 选择具体执行器

当前冻结的 family-level 默认 route 是：

其中，`Hermes-native` 当前只作为实验路线；只有完整的 Hermes AIAgent agent loop 才算成立，而一步一步 chat、单次 chat completion 或 chat relay 都不算目标主线。

- `Codex CLI autonomous`
  - 当前正式默认执行器
  - 默认模型：继承本机 `Codex` 默认配置
  - 默认 reasoning effort：继承本机 `Codex` 默认配置
  - 语义要求：必须是能自主拆解与执行的 agent loop，而不是一步一步 chat、单次 chat completion，或 chat relay
- `Hermes-native`
  - 当前只作为实验路线
  - 只有完整的 Hermes AIAgent agent loop 才算 `Hermes-native`
  - 任何把 `Hermes` 降格成一步一步 chat、单次 chat completion，或 chat relay 的实现，都只能算迁移桥 / 对照面，不算目标主线

这允许系列项目在不改写顶层 runtime 语义的前提下，保留不同 domain 的最优执行方式。例如：

- 医学研究线可继续通过受控 research backend 承载高复杂度 inner-loop execution
- visual / grant 线可逐步把 repo-local helper、CLI pipeline 或 host-agent route 收敛到同一 substrate 下
- 未来若某一类任务已经证明 `Hermes-native executor` 不降级，也可以单独迁过去，而不是一次性替换全仓执行器

二者之间的最小 handoff envelope 应保持一致，至少包括：

- `target_domain_id`
- `task_intent`
- `entry_mode`
- `workspace_locator`
- `runtime_session_contract`
- `return_surface_contract`

当前 `OPL` 已经把这层 envelope 做成 repo-tracked surface，并且通过 workspace registry 中显式配置的 direct-entry locator，把顶层 front desk 与 domain direct entry / domain gateway 连接起来；没有 locator 的 domain 不会被伪造成“已接好前台”。

## Hermes Kernel Integration 选型

当前顶层已经冻结的选择不是：

- fork / vendor `Hermes-Agent` 代码进 `OPL` 自己长期维护
- 要求用户自己手工安装并理解 `Hermes-Agent` 后再使用 `OPL`

当前冻结的选择是：

- `external kernel, managed by OPL product packaging`

也就是：

- 代码层把 `Hermes-Agent` 视为外部 kernel；
- 产品层由 `OPL` 自己负责 bootstrap、launcher、version pinning、runtime wiring 与受支持版本管理；
- 对用户来说，接触的是 `OPL` 产品入口，而不是一个需要先会 `Hermes` 的拼装流程。

详细对比与运维取舍见：

- `docs/references/opl-product-entry-and-hermes-kernel-integration.md`
- `docs/references/family-executor-adapter-defaults.md`
- `docs/references/family-product-entry-and-domain-handoff-architecture.md`
- `docs/references/opl-hosted-web-frontdesk-benchmark.md`
- `docs/references/family-lightweight-direct-entry-rollout-board.md`

## 结构角色

### 1. OPL 顶层 gateway

- 定义 workstream topology
- 冻结 shared foundation 与 shared substrate 语义
- 管理 admitted domains 与公开入口

### 2. Gateway contracts

- `contracts/opl-gateway/*.json`
- `contracts/opl-gateway/README*`

这层是 machine-readable contract surface，不负责 narrative 协作说明。

### 3. Public docs

- `docs/roadmap*`
- `docs/task-map*`
- `docs/gateway-federation*`
- `docs/operating-model*`

这层负责对外讲清 `OPL` 的角色、当前承载范围与 domain 边界。

### 4. Reference / history docs

- `docs/references/`
- `docs/specs/`
- `docs/plans/`
- `docs/history/omx/`

这层保留审计、验收、示例、计划与历史材料，但不反向改写当前主线。

## 当前家族仓与联邦地位

- `Research Foundry -> Med Auto Science`：活跃 `Research Ops` 线
- `RedCube AI`：活跃 visual-deliverable / `Presentation Ops` 入口
- `Grant Foundry -> Med Auto Grant`：活跃 author-side / proposal-facing `Grant Ops` 业务仓；但顶层 public federation contract 仍需与它的 admission / handoff state 分开表述

## 文档组织原则

- AI / 维护者优先读取核心五件套。
- 对外公开面继续按四层系统组织。
- 机器合同、公开叙事、参考材料、历史记录分层维护，不混为一个入口。
