# OPL 垂类在线 Agent 平台演进蓝图

状态锚点：`2026-04-11`

## 文档目的

这份文档用于把 `OPL` 从当前“文档优先 + contract-first 的顶层 gateway 体系”继续推进到“垂类在线 agent 平台族”时，最关键的边界、阶段和落地顺序冻结下来。

它属于 `docs/references/` 下的中文参考级文档。
它服务于后续四仓统一推进，但不反向替代：

- `README.md` / `README.zh-CN.md`
- `docs/operating-model.md` / `docs/operating-model.zh-CN.md`
- `docs/unified-harness-engineering-substrate.md` / `docs/unified-harness-engineering-substrate.zh-CN.md`
- `docs/roadmap.md` / `docs/roadmap.zh-CN.md`
- `contracts/README.md`
- `contracts/opl-gateway/README.md`

## 一句话结论

`OPL` 不应变成像 `Hermes Agent` 那样的通用长期在线 agent 平台，但应逐步演进为一套面向研究、基金、视觉交付等垂类场景的在线 agent 平台族。

更准确地说：

- `OPL` 继续是顶层 `Gateway / Federation`
- `Unified Harness Engineering Substrate` 继续作为共享上位语言
- `Shared Runtime Contract` 逐步承接共享 runtime substrate
- `Shared Domain Contract` 逐步承接跨 domain 正式行为合同
- 各个业务仓继续作为面向不同场景的 `Domain Harness OS` 与产品入口

## 为什么现在要冻结这条线

当前四仓已经完成了大量 domain 语义、artifact、gate、audit、delivery 的收紧工作。
但它们距离“真正可被用户直接使用的在线 agent 产品”之间，还缺一层统一、稳定、可托管的 runtime substrate。

当前最主要的缺口不是：

- 顶层叙事不够大
- 再发明一套新的抽象名词
- 提前把所有 domain 压成一个共享代码仓

而是：

- 产品入口还主要依附 `Codex`
- 长期在线 owner process 还没有统一下来
- `profile / session / gateway status / delivery / approval / interrupt` 还没有形成跨域共享 substrate
- 从“开发时可运行”到“产品上可使用”之间，还缺清楚的过渡层

`Hermes Agent` 当前最值得吸收的，也正是这一层。

## 固定边界

### 1. `OPL` 仍不是通用 agent 平台

这条演进线的目标不是：

- 支持任意任务、任意团队、任意平台的通用 agent 平台
- 一上来就覆盖 `Telegram`、`Discord`、`Slack`、`WhatsApp`、`Signal` 全平台矩阵
- 把 `OPL` 改写成消息网关产品

### 2. `OPL` 仍不是当前 runtime owner

顶层 `OPL` 仓继续承担：

- 顶层任务语义
- federation 语言
- shared-foundation 解释
- contract 与公开边界

它不直接承接：

- domain-local canonical truth
- domain-local mutation
- domain-local delivery truth
- 当前代际的 runtime owner 身份

### 3. 不把三个业务仓立即压成同一种执行内核实现

统一的是 runtime substrate contract，不是今天就把三个业务仓重构成一个单体 runtime。

当前更合理的结构仍然是：

- `MedAutoScience`
  - 更接近成熟的自动研究 runtime
- `RedCube AI`
  - 更接近视觉交付与 source-readiness runtime
- `Med Auto Grant`
  - 更接近基金申请与 revision / final / export runtime

### 4. 不把“未来平台形态”误写成“当前公开真相”

当前真实状态仍然是：

- formal entry 以 `CLI-first` 为主
- `MCP` 是 supported protocol layer
- `controller` 只保留 internal control surface 语义
- 当前活跃开发控制面仍是 `Codex-only`
- 当前公开主线仍未拥有统一平台 runtime 或托管式 Web runtime

## 目标结构

长期理想结构应收敛为：

```text
User / Operator / Agent
  -> Product Entry Surface
      -> Domain Gateway
          -> Shared Runtime Substrate
              -> Domain Harness OS
                  -> Review / Audit / Delivery Surfaces
```

其中：

- `OPL`
  - 负责顶层 `Gateway / Federation`
- `Product Entry Surface`
  - 负责用户真正接触到的产品入口
- `Shared Runtime Contract`
  - 负责长期在线运行所必需的共享运行合同
- `Shared Domain Contract`
  - 负责 formal entry、运行身份、报告面、审计面与 gate 语义的跨域统一合同
- `Domain Harness OS`
  - 负责 domain-local 的对象、流程、治理、审计与交付

## Shared Runtime Contract v1 应冻结什么

这一层是后续最先要落下来的统一对象。
它至少应冻结下面这些合同：

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

5. `delivery / cron substrate`
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

## Hermes Agent 可以吸收什么

可直接吸收的重点，不是它的通用产品形态，而是它的 runtime substrate 成熟度：

- `profile` 作为一等隔离单元
- `session store` 作为 substrate，而不是附属日志
- `gateway owner process` 作为长期在线 owner
- `memory provider` 作为正式 hook 合同
- `cron / delivery` 作为正式 runtime 能力
- `approval / interrupt / resume` 作为中心控制面

不应直接照搬的部分包括：

- 通用消息平台矩阵
- user-centric memory
- 面向任意任务的大而全 tool universe
- 把整个系统做成单体 runtime

## 阶段梯度

### S0：当前状态

当前已经成立的部分：

- `OPL` 顶层 `Gateway / Federation` 语言已经收紧
- `Unified Harness Engineering Substrate` 已形成共享架构语言
- `MedAutoScience`、`RedCube AI`、`Med Auto Grant` 都已经具备更清楚的 domain runtime 方向
- 当前 formal entry 仍是 `CLI-first`
- 当前活跃开发口径仍是 `Codex-only`

当前还没有成立的部分：

- `Shared Runtime Contract` v1 的统一实现
- `Shared Domain Contract` v1 的统一实现
- 统一 owner process
- 统一 session substrate
- 统一在线产品入口
- 托管式 runtime

### S1：冻结 substrate v1 合同

这一步先做“统一语言”，不先做“大重构”。

要求：

- 在 `OPL` 顶层把 `Shared Runtime Contract` v1 的对象、边界与推广顺序写清
- 在 `OPL` 顶层把 `Shared Domain Contract` v1 的对象、边界与推广顺序写清
- 明确哪些合同是跨域共享的
- 明确哪些 truth 继续留在 domain 内部

退出条件：

- 顶层文档与 reference-grade 文档不再对 runtime substrate 方向互相打架
- 三个业务仓都能对照同一套 substrate 语言解释自己的下一步

### S2：做第一个成熟的本地产品 runtime pilot

这一步优先解决“真的能运行起来”，而不是先做平台托管。

建议顺序：

1. `MedAutoScience`
   - 自动长跑能力最成熟
   - 适合先把长期在线 owner runtime 收紧出来
2. `Med Auto Grant`
   - 结构清楚，适合快速验证本地产品 runtime 的 revision / final / export 路径
3. `RedCube AI`
   - 适合在 research / source-readiness 主线进一步稳定后再吸收更强的共享 substrate

退出条件：

- 至少一个 domain 拥有清楚的本地产品 runtime owner
- 不再完全依赖 `Codex` 才能作为“使用入口”

### S3：从 pilot 回抽 shared runtime substrate

这一步不是把三个仓硬拼在一起，而是从成功 pilot 中回抽真正跨域共享的运行合同与实现。

重点：

- 回抽 `profile / session / gateway status / delivery / approval`
- 保持 domain-local 对象、gate、artifact、delivery truth 不上收
- 把共享实现收敛为 substrate，而不是新顶层 monolith

退出条件：

- 至少两个 domain 能复用同一部分 runtime substrate，而不需要各自重造

### S4：补齐在线产品入口

当本地产品 runtime 已经成熟后，再做在线入口才是稳的。

这一步的目标是让产品不再只能通过开发宿主接入，而是具备：

- 本地 `CLI` 入口
- 可扩展的 `MCP` protocol layer
- future `Web / API / gateway` 入口

这里仍应保持：

- `CLI-first`
- `MCP-supported`
- 不把 `controller` 升格成公开 formal entry

### S5：形成垂类在线 agent 平台族

到这个阶段时，`OPL` 体系才更适合被描述成“垂类在线 agent 平台族”。

它的含义是：

- 顶层有统一的 `Gateway / Federation`
- 中层有共享的 runtime substrate
- 下层有多个垂类 domain 产品
- 入口不再只依赖开发宿主
- 托管式 runtime 可以逐步成立

这仍然不等于：

- 通用 agent 平台
- 单体 runtime
- domain truth 全部上收到 `OPL`

## 当前最推荐的推进顺序

按现在的仓库成熟度，最合理的顺序是：

1. 先把 `OPL` 顶层文档与 reference-grade 蓝图对齐
2. 冻结 `Shared Runtime Contract` / `Shared Domain Contract` v1 的统一语言
3. 优先推进一个“成熟的本地产品 runtime” pilot
4. 再从 pilot 回抽可复用 substrate
5. 再做在线入口与托管化

不要倒过来做成：

1. 先写一个更大的平台故事
2. 先做统一平台 runtime
3. 再回头看 domain 是否真的能接住

## 当前四仓的对应关系

### `one-person-lab`

负责：

- 顶层 `Gateway / Federation`
- `Shared Runtime Contract` / `Shared Domain Contract` v1 的统一语言
- 对外公开边界与体系说明

不负责：

- 直接成为当前 runtime owner

### `med-autoscience`

最适合承担：

- 第一个成熟本地产品 runtime pilot
- 长期在线 owner runtime 的 first proof

但要注意：

- display / 论文配图资产线应继续与主 runtime 线分开推进

### `redcube-ai`

当前最适合继续做：

- source-readiness / research-mainline 稳定化
- one-shot workspace / operator quickstart
- family parity / full autopilot

后续再承接更强的 shared substrate 吸收。

### `med-autogrant`

当前最适合继续做：

- 本地产品 runtime 的 revision / final / export 路线
- 用较清楚的对象和输出闭环证明“可用的本地产品 runtime”该是什么样子

## 当前不应做的事

- 直接宣布 `OPL` 已经是垂类在线 agent 平台
- 直接宣布 `Shared Runtime Contract` 已经实现完成
- 直接宣布统一托管 runtime 已经存在
- 一上来把三个业务仓压成一个共享代码仓
- 把还没吸收的 Hermes 设计写成当前已落地能力

## 参考关系

- `Hermes Agent` 的 substrate 对标，见：
  - `docs/references/hermes-agent-runtime-substrate-benchmark.md`
- runtime 命名与 managed runtime 边界，见：
  - `docs/opl-runtime-naming-and-boundary-contract.zh-CN.md`
- 当前共享 substrate 公开定义，见：
  - `docs/unified-harness-engineering-substrate.zh-CN.md`
- 当前顶层路线图，见：
  - `docs/roadmap.zh-CN.md`
