[English](./shared-runtime-contract.md) | **中文**

# Shared Runtime Contract

## 目的

这份文档用于冻结 `OPL` 体系下跨 domain 共享的运行合同。
它回答的是“长期在线 runtime 至少要稳定拥有什么对象和行为”，而不是“今天具体由哪套 execution plane 实现”。

这份合同属于 `Unified Harness Engineering Substrate` 之内，但它不等于整个 substrate，更不等于某个具体开源项目的套壳。

## 它负责什么

`Shared Runtime Contract` 负责冻结长期在线 runtime 必须稳定暴露的共享对象与行为面，包括：

- `runtime profile`
- `session substrate`
- `gateway runtime status`
- `memory provider hook`
- `delivery / cron`
- `approval / interrupt / resume`

这些对象是跨 domain 共享的运行底座要求。
它们描述的是 runtime 应具备怎样的结构化能力，而不是某个 domain 自己的对象、评审标准或交付真相。

## 它不负责什么

这份合同不负责：

- 定义 domain-specific object model
- 定义 domain-specific artifact schema
- 定义某个 domain 的 gate / audit / delivery 真相
- 让 `OPL` 越过 `domain gateway` 直接接管 domain harness
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

3. `gateway runtime status`
   - `gateway_state`
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

## 与 Hermes-Agent 的关系

上游 `Hermes-Agent` 当前最值得吸收的，是它在 runtime substrate 上已经比较成熟的工程实现。

因此，更准确的表达是：

- 上游 `Hermes-Agent` 支撑的 runtime substrate，是 `Shared Runtime Contract` 的优选未来实现方向
- `Hermes-Agent` 不是整个 `UHS`
- `Hermes-Agent` 也不会替代 `OPL Gateway`、`Domain Gateway` 或 `Domain Harness OS`
- 优选的集成方式是 `external kernel, managed by OPL product packaging`，而不是长期 fork，也不是把手工安装前置给用户

也就是说，`Hermes` 更适合承接“怎么稳定地跑”，而不是“什么才算过 gate、交付、审计、domain truth”。

## 当前真实状态

截至当前公开主线，真实状态仍然是：

- 顶层 formal entry 仍是 `CLI-first`
- `MCP` 仍是 supported protocol layer
- 当前活跃开发宿主仍是 Codex-only 本地会话
- 当前公开的 OPL 入口仍是本地 `TypeScript CLI`-first / read-only gateway surface
- `Shared Runtime Contract` 还处于冻结与逐步落地阶段
- 四个仓都还没有真正完成上游 `Hermes-Agent` 集成
- 上游 `Hermes-Agent` 运行底座仍是这份合同优选的未来实现方向，而不是已经落地的公开事实

## 实现边界

只要不改写上层合同，`Shared Runtime Contract` 后续可以由不同 deployment shape 实现：

- 当前本地 `host-agent runtime`
- future 上游 `Hermes-Agent`-backed managed runtime
- future platform-hosted execution plane

从产品形态看，优选未来落地应是：

- 本地开源版由 `OPL` 入口为用户 bootstrap 并管理受支持的外部 `Hermes` runtime
- 未来托管版由平台内部运行外部 `Hermes` kernel，而 `OPL` 继续对外暴露产品入口

变化的应只是 runtime substrate 的承载方式，而不是：

- `OPL` 的 federation 语义
- formal-entry matrix
- domain gateway 边界
- domain-owned artifact / audit / delivery truth

## 四仓中的位置

- `one-person-lab`
  - 负责定义这份共享运行合同的公开语言与边界
- `med-autoscience`
  - 在医学 `Research Ops` 主线里吸收并验证它
- `redcube-ai`
  - 在视觉交付主线里吸收并验证它
- `med-autogrant`
  - 在基金申请 runtime 主线里吸收并验证它

因此，这份合同是四仓统一的运行对齐面，而不是某一个仓独占的内部实现细节。
