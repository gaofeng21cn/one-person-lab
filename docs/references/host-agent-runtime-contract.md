# Codex-default Host-Agent Runtime 合同

> 历史说明（2026-04-11 OMX offboarding）：本文件保留为历史/迁移参考；当前活跃执行口径以 Codex-only 文档为准。
> 当前已同步的现实状态是：三个业务仓都已把 repo-local control-plane state 迁回各自的 repo-tracked truth；若继续复用 OMX，只能作为兼容性的历史长跑 lane，并继续遵守独立 worktree 纪律。

## 文档目的

这份文档用于统一 `OPL` 体系下当前本地默认运行形态的合同语义。

它回答的不是“所有仓库今天是否已经共享同一套执行内核”，而是：

1. 当前本地默认 runtime 应按什么统一方式理解
2. 三个业务仓怎样才算处在同一 `Codex-default host-agent runtime` 体系下
3. 在不提前破坏现有稳定性的前提下，后续应如何逐步把历史实现吸收到统一构架中

## 一、适用范围

这份合同当前适用于：

- `Med Auto Science`
- `RedCube AI`
- `Med Auto Grant`

同时，它也约束 `OPL` 顶层对这些 runtime 的描述方式。

但要明确：

- `OPL` 是顶层 `Gateway / Federation`
- `OPL` 不是 domain-local runtime owner
- 这份合同不把 `OPL` 变成第四个 `Domain Harness OS`

## 二、统一结论

当前 `OPL` 体系下，三个业务仓的本地默认执行形态统一表述为：

> `Codex-default host-agent runtime`

这句话的准确含义是：

- 默认宿主执行者是 `Codex` 类 host agent
- 代码负责稳定对象、controller、tool surface、gate、review surface 与 audit surface
- Agent 负责读取状态、调用正式入口、推进步骤、组织中间产物

这不等于：

- 三个仓库今天已经共享同一份 runtime core
- 所有仓库今天都以完全相同的进程模型长跑
- 未来只能绑定 `Codex` 这一种宿主

## 三、兼容宿主规则

当前正式默认宿主是 `Codex`。

兼容性规则统一如下：

- `Codex`：正式默认宿主
- `Claude Code`：被动兼容
- `OpenClaw`：被动兼容

“被动兼容”的含义是：

- 如果宿主能满足同一 formal entry、同一 runtime contract、同一 artifact truth 与同一 review/gate 语义，就允许接入
- 但当前不以主动适配其他宿主为主线工作
- 不能为了兼容其他宿主，反向改写 `Codex-default` 主线合同

## 四、三层统一中的 runtime 层边界

当前统一构架要分三层理解：

1. 用户交互层
2. 底层长时间运行时层
3. 开发控制面层

这份文档只定义前两层中的 runtime 合同部分；开发控制面另见 `development-operating-model.md`。

## 五、用户交互层的统一合同

当前三个业务仓统一的，不再是“把 `MCP / CLI / controller` 并列列成一张没有层级的入口表”，而是统一同一套 formal-entry matrix 语义：

- `default_formal_entry`
- `supported_protocol_layer`
- `internal_controller_surface`

当前冻结的统一理解如下：

- `default_formal_entry`
  - 当前统一值写作 `CLI`
  - 叙述层可进一步说明为 `CLI-first`
- `supported_protocol_layer`
  - 当前统一值写作 `MCP`
  - 叙述层可进一步说明为 `MCP-capable`
  - 这里统一的是协议层语义，不等于三个仓今天已经把 `MCP` 做到同等成熟度
- `internal_controller_surface`
  - 统一固定为 `controller`
  - 它属于内部控制面，不再与 `CLI`、`MCP` 并列写成同等级对外 formal entry

统一要求：

- 不把临时脚本、一次性 prompt、手工拼 payload 作为正式入口
- 不把 hidden adapter 或未文档化 helper 作为主入口
- formal entry 必须能表达结构化输入，而不只是一段 prompt 文本
- 如果某个仓当前还没有把 `MCP` 做成 repo-verified 能力，就必须诚实写成“协议层保留 / future support”，而不是把 `controller` 冒充成对外 formal entry

### 对 `OPL` 的要求

`OPL` 顶层只负责：

- 统一命名
- 统一路由语言
- 统一 domain 边界与 onboarding 合同

`OPL` 当前不负责：

- 直接持有 domain-local long-running runtime
- 绕过 domain gateway 直接控制 domain runtime internals

## 六、底层长时间运行时层的统一合同

虽然三个业务仓当前的底层实现不同，但只要满足下面这些不变量，就可视为运行在同一 `Codex-default host-agent runtime` 体系下。

### 1. 结构化输入先于执行

执行前必须先完成结构化 hydration，而不是让 runtime 直接消费模糊 prompt。

至少应有下列输入中的大部分：

- workspace / root
- profile / overlay / pack / route
- lifecycle stage / gate
- 目标交付物或目标研究/申请对象
- 必要的 review / audit / export 约束

### 2. 正式执行句柄必须显式存在

长任务运行时必须存在稳定句柄，名字可以不同，但语义必须明确。

允许的典型形式：

- `run_id`
- `quest_id`
- `deliverable_run_id`
- 同等语义的稳定执行 ID

不允许只靠瞬时会话上下文判断“当前跑的是哪一次任务”。

### 3. 运行状态必须可读、可回显、可审计

至少应能稳定提供：

- 当前状态读取
- 关键事件回写
- 运行结果回显
- review / gate 相关状态
- artifact truth 引用

如果支持长跑恢复，则还应支持：

- watch / status
- resume / rerun
- pause / stop

若某仓当前尚未覆盖全部动作，可以阶段性缺失，但不能把缺失动作伪装成已完成能力。

### 4. durable truth 必须在仓内或受控 surface 中存在

运行真相不能只停留在对话里。

至少应有受控 durable surface 承接：

- canonical artifact
- report / audit trail
- review surface
- final delivery or export surface

### 5. 错误必须显式失败

对不合法输入、无效状态迁移、gate 不满足、review verdict 冲突等情况，统一要求：

- 明确失败
- 留下可追踪痕迹
- 不做静默纠偏

## 七、允许不同实现，但不允许不同本体语义

当前三个业务仓可以通过不同实现满足同一 runtime 合同。

### `Med Auto Science`

当前现实是：

- 它的长跑执行仍经由 `MedDeepScientist` 受控 surface
- 这不是问题，也不应被立即视为必须推倒重来

统一要求是：

- `Med Auto Science` 仍是 domain contract / control plane / audit plane owner
- `MedDeepScientist` 继续是受控 execution surface
- 后续迁移应以“吸收、替换、收紧合同”为主，而不是以“立刻完全重构”为前提

也就是说：

- 可以先统一 runtime contract
- 再逐步吸收历史执行面
- 不必为了追求形式统一，牺牲现有稳定性

### `RedCube AI`

当前最接近统一目标形态：

- formal entry 已清楚
- host-agent mainline 已清楚
- direct gateway / family / profile / pack / harness execution 链已较完整

因此它应作为当前 `Codex-default host-agent runtime` 主线的直接参考实现之一。

### `Med Auto Grant`

当前已有最小 runtime baseline，但仍处于：

- `baseline freeze / runtime hardening`

因此它当前满足的是：

- 统一 runtime 合同的最小基线版本

而不是：

- 完整成熟的长跑 runtime

## 八、与五个共享平面的关系

当前统一 runtime 合同应逐步吸收到五个共享平面中理解：

1. 资产平面
2. 记忆平面
3. 治理平面
4. 交付平面
5. 智能体执行平面

但要明确：

- 这五个平面已经是统一构架的目标理解
- 三个业务仓还没有完全迁移到同一套实现状态
- 现在优先统一的是平面语义、合同语义与控制边界
- 不是一上来就做彻底重构

## 九、当前不应该做的事

- 不为了“统一实现”而立即重写 `Med Auto Science` 的历史执行面
- 不把“当前统一 runtime 合同”误写成“已经统一 shared runtime core”
- 不把被动兼容宿主提升成与 `Codex` 并列的正式主线
- 不把 managed web runtime 的未来形态提前写成已完成现实
- 不把 `OPL` 顶层 gateway 误写成 domain runtime owner

## 十、建议的落实顺序

当前最合理的顺序是：

1. 先冻结这份 host-agent runtime 合同
2. 让三个业务仓分别对照这份合同做 gap audit
3. 先完成本轮 `P0` 对齐开发
4. 再让 `Med Auto Science` 与 `RedCube AI` 通过手工测试暴露 runtime contract 差异
5. 先修 formal entry、artifact truth、review/gate、watch/status 等合同缺口
6. 只有在至少两个 domain 的 runtime contract 长期稳定后，再讨论是否抽共享代码框架

## 十一、完成判据

只有当下面这些条件成立时，才可说“当前本地默认 runtime 已基本统一”：

- 三个业务仓都统一使用 `Codex-default host-agent runtime` 作为正式默认表述
- 三个业务仓都能明确给出 `default_formal_entry / supported_protocol_layer / internal_controller_surface` 的边界
- 三个业务仓都能给出显式执行句柄与 durable truth surface
- `Med Auto Science` 的 `MedDeepScientist` 受控 surface 已被明确纳入统一合同，而不是游离在合同之外
- “统一 runtime 合同”与“共享 runtime 内核”在文档上被明确区分
