[English](./shared-runtime-contract.md) | **中文**

# Shared Runtime Contract

> 当前状态说明（`2026-05-11`）：本文作为 stage-led、Agent executor-based OPL framework 的共享边界参考保留。当前 `OPL` 公开主线是 `Codex-default executor -> explicit OPL activation -> provider-backed stage runtime -> selected MAS/MAG/RCA domain agent`；`MedDeepScientist` 不再是 OPL 默认安装的 MAS 运行依赖，只通过 MAS 声明的可选 backend audit / source provenance / historical fixture / explicit archive import / upstream intake / parity oracle 引用出现。下层 domain 执行词汇按 `harness / controller` 内部边界理解，不作为当前默认公开产品模型。

## 目的

这份文档用于冻结 `OPL` 体系下跨 domain 共享的运行合同。
它回答的是“长期在线 runtime 至少要稳定拥有什么对象和行为”，而不是“今天具体由哪套 execution plane 实现”。

这份合同属于 `Unified Harness Engineering Substrate` 之内，但它不等于整个 substrate，更不等于某个具体开源项目的套壳。

## 它负责什么

`Shared Runtime Contract` 负责冻结长期在线 runtime 必须稳定暴露的共享对象与行为面，包括：

- `runtime profile`
- `session substrate`
- `provider bridge status`
- `memory provider hook`
- `delivery / cron`
- `approval / interrupt / resume`
- `family event envelope`
- `family checkpoint lineage`
- `product-entry runtime continuity discovery`
- `family persistence policy`
- `family lifecycle ledger`
- `family owner route`

这些对象是跨 domain 共享的运行底座要求。
它们描述的是 runtime 应具备怎样的结构化能力，而不是某个 domain 自己的对象、评审标准或交付真相。

## 它不负责什么

这份合同不负责：

- 定义 domain-specific object model
- 定义 domain-specific artifact schema
- 定义某个 domain 的 gate / audit / delivery 真相
- 让 `OPL` 越过 domain-agent entry 直接接管 domain-owned runtime 或 delivery truth
- 把某个具体 execution plane 直接写成 `OPL` 当前既成事实

## 当前冻结的 v1 对象

当前最先要冻结清楚的对象包括：

1. `runtime profile`
   - `profile_id`
   - `runtime_home`
   - `subprocess_home`
   - `runtime_status_root`

2. `session substrate`
   - `session_id`
   - `parent_session_id`
   - `session_state`
   - `resume_pointer`
   - `interrupt_reason`

3. `provider bridge status`
   - `bridge_state`
   - `active_runs`
   - `last_heartbeat`
   - `restart_requested`
   - `exit_reason`

4. `memory provider hook`
   - `prefetch`
   - `sync_turn`
   - `on_session_end`
   - `on_delegation`

5. `delivery / cron`
   - `job_id`
   - `delivery_target`
   - `next_run_at`
   - `output_record`
   - `silent_delivery`

6. `approval / interrupt / resume`
   - `approval_request_id`
   - `approval_scope`
   - `approval_decision`
   - `interrupt_reason`
   - `resume_allowed`

## Family Orchestration Companion Schemas

为了避免把 family runtime 层绑死在某一个 orchestration framework 上，这份合同之下现在同步冻结两类 machine-readable companion schema：

1. `family event envelope`
   - 统一 event correlation、producer、session、audit reference 的 envelope
2. `family checkpoint lineage`
   - 统一 checkpoint ancestry、resume、state reference 的 envelope
3. `product-entry runtime continuity discovery`
   - 统一 `runtime inventory + task lifecycle + session continuity + progress projection + artifact inventory` 的发现面，并把 `runtime_control` / `runtime_loop_closure` 作为共享 control reference；repo-owned runtime-control projection 继续由各 domain 仓自己持有
4. `family persistence policy`
   - 统一区分 domain-owned file authority、SQLite sidecar index、projection cache 与 historical/provenance reference 的控制面 surface
5. `family lifecycle ledger`
   - 统一 dry-run / apply / verify lifecycle action、manifest ref、checksum 与 restore proof 的 receipt surface；stage attempt query 会投影 locator-only lifecycle refs，并把 retention / restore apply authority 保留在 domain
6. `family owner route`
   - 统一 route epoch、source fingerprint、next owner、allowed actions、idempotency key 与 handoff / projection refs 的 owner-route surface

这些 schema 位于 `contracts/family-orchestration/`。
它们冻结的是多个 domain runtime 都能吸收的互操作语义，同时继续把 runtime ownership 与 durable truth 留在各自 domain 仓。

persistence / lifecycle / owner-route surface 只属于控制面 discovery contract。它们不会把 `OPL` 改成 domain runtime owner、memory store、scheduler、publication-quality judge、cleanup executor、restore executor 或 artifact authority。

## 与 CrewAI 的关系

这里对 `CrewAI` 的吸收方式是“借鉴 orchestration 思想”，不是“把它变成家族强制 runtime 层”。

当前明确的切分是：

- 在 contract 层吸收 event correlation、checkpoint lineage、flow introspection 与 human-gate pause / resume 语义
- 不把 `CrewAI` 统一成默认 `LLM`、`Agent`、`Crew` 或 memory owner
- 不让 `CrewAI` 替代 `Hermes-Agent`、`Codex CLI`、OPL session/runtime 入口或任何 domain-agent entry

## 与 Hermes-Agent 的关系

上游 `Hermes-Agent` 当前最值得吸收的，是迁移期 runtime 工程经验和可选 proof-provider 语境。

因此，更准确的表达是：

- OPL framework 的生产 substrate 候选是 provider-backed stage runtime，当前目标路径是 Temporal-backed provider
- `Hermes-Agent` 在迁移期保留为 legacy/optional provider、executor/proof lane 或技术参考
- `Hermes-Agent` 不是整个 `UHS`
- `Hermes-Agent` 也不会替代 OPL session/runtime 入口、任何 domain-agent entry 或 domain-owned truth surface
- 任何集成方式都必须保持 OPL 作为 framework/control-plane owner，并保持 domain 仓作为 truth owner

也就是说，`Hermes` 当前不是“怎么稳定地跑”的目标 owner。它作为迁移/proof 语境保留，直到 OPL provider-backed stage runtime 成熟。

## 当前真实状态

截至当前公开主线，真实状态仍然是：

- 默认 OPL 入口是本地 `opl` / `opl exec` / `opl resume`，并继承 Codex-default 语义
- 显式 activation 只路由到已收录 domain agents：`MAS`、`MAG`、`RCA`
- `MCP` 与其他 protocol surface 保持为 supporting 或 domain-owned 层
- `Shared Runtime Contract` 是当前共享边界下的参考合同，不是默认产品入口
- runtime-oriented 的 family orchestration companion schemas 已经落在 `contracts/family-orchestration/`，先冻结共享 `event envelope + checkpoint lineage + product-entry runtime continuity discovery + persistence / lifecycle / owner-route discovery` 语义，而不是把它们误写成某个统一 runtime owner
- 当前活跃四仓公开线是 `one-person-lab + MAS + MAG + RCA`；`MDS` 只保留为 MAS 声明的可选 companion diagnostic、intake 与 parity oracle 引用
- `Hermes-Agent` 只保留为迁移期 legacy/optional provider、显式 executor/proof lane 或 Codex CLI 备线，不再是默认长期在线 substrate

## 实现边界

只要不改写上层合同，`Shared Runtime Contract` 后续可以由不同 deployment shape 实现：

- 当前本地 Codex-default executor 路径
- 目标 provider-backed stage runtime，包括 Temporal-backed provider 路径
- `Hermes-Agent` 这类 legacy/optional proof provider
- future platform-hosted execution plane

从产品形态看，目标形态是：

- 本地开源版可以用 Codex-default execution 与显式 domain activation 运行
- 已配置 family runtime provider 承载 stage attempt、wakeup、receipt、approval、retry、dead-letter 和 projection
- 未来托管版可以在平台内运行受支持 provider，同时不接管 domain truth

变化的应只是 runtime substrate 的承载方式，而不是：

- `OPL` 的 session/runtime 与 activation 语义
- formal-entry matrix
- domain-agent 边界
- domain-owned artifact / audit / delivery truth

## 四仓中的位置

- `one-person-lab`
  - 负责定义这份共享运行合同的公开语言与边界
- `med-autoscience`
  - 在医学 `Research Foundry` 主线里吸收并验证它
- `redcube-ai`
  - 在视觉交付主线里吸收并验证它
- `med-autogrant`
  - 在基金申请 runtime 主线里吸收并验证它

因此，这份合同是四仓统一的运行对齐面，而不是某一个仓独占的内部实现细节。
