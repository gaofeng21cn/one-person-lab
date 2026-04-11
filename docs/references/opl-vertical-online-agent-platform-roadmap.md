# OPL 垂类在线 Agent 平台演进蓝图

状态锚点：`2026-04-11`

## 文档目的

这份文档把 `S1 / shared runtime substrate v1 contract freeze` 冻结成一套可执行的 adoption board 与 activation package。

它服务于三个后续业务仓：

- `med-autoscience`
- `med-autogrant`
- `redcube-ai`

但它不反向替代当前公开主线。
公开主线仍以：

- `README*`
- `docs/README*`
- `docs/roadmap*`
- `docs/operating-model*`
- `docs/unified-harness-engineering-substrate*`
- `docs/opl-runtime-naming-and-boundary-contract*`

为准。

## 当前 north star

`OPL` 的当前 north star 不是更大的平台叙事，也不是提前实现统一平台 runtime。

当前 north star 是：

> 先把 `OPL` 顶层对 shared runtime substrate v1 的统一语言、边界、推广顺序和 activation package 冻结下来，让后续 domain 仓在同一个上位目标下推进各自的本地产品 runtime。

## Why Now

现在做 `S1`，原因很直接：

- 顶层 gateway / federation 语言已经比 runtime substrate 语言更稳定
- 三个业务仓已经各自接近需要 runtime substrate 的阶段，再不冻结上位语言就会各写各的
- Hermes benchmark 已经给了足够强的外部工程参照，足以冻结语言与边界，但还不足以诚实宣称统一实现已经存在

## What Counts As Done For `S1`

对 `OPL` 顶层来说，`S1` 算完成，至少需要满足：

1. 公开主线、合同说明与 reference-grade 文档对 runtime substrate 的边界判断一致。
2. `runtime profile`、`session substrate`、`gateway runtime status`、`memory provider hook`、`delivery / cron substrate`、`approval / interrupt / resume` 六组对象被统一定义。
3. Hermes 吸收结论已经冻结为 `adopted / adapted / deferred / rejected`。
4. 三个业务仓的 adoption order、verification、excluded scope、promotion invariants 与 blocker 已经 repo-tracked。
5. 没有把 `OPL` 写成 runtime owner、通用 agent 平台或已经存在的 hosted platform。

## What Must Not Be Done In `S1`

`S1` 明确不能做：

- 不做统一平台 runtime 实现
- 不做托管式 `Web / API` runtime 实现
- 不把 `OPL` 提升成当前 runtime owner
- 不把三个业务仓强行改成同一套执行内核
- 不把 future product entry 写成 current truth
- 不把尚未证明属于 gateway-owned 的 substrate 语言写进 `contracts/opl-gateway/*.json`

## `S1` Adoption Board

### `med-autoscience`

- current position：
  - 当前最接近“成熟本地产品 runtime pilot”的 domain
  - 已具备最强的长跑与研究主线现实约束
- next truthful tranche：
  - 先吸收 `runtime profile`
  - 先吸收 `session substrate`
  - 先吸收 `gateway runtime status`
  - 再把 `delivery / cron substrate` 与 `approval / interrupt / resume` 对齐到本地产品 runtime 语义
- required verification：
  - 明确 profile isolation 与 runtime-home 边界
  - 明确 session / run continuity 如何进入 audit surface
  - 明确 runtime status 如何进入 watch / report / recovery surface
  - 证明不依赖顶层 `OPL` 才能运行
- excluded scope：
  - 不做 hosted runtime
  - 不把 domain truth 上收回 `OPL`
  - 不要求与 `redcube-ai` 共用实现
- promotion invariants：
  - formal entry 仍可保持 domain-owned
  - `OPL` 不成为 runtime owner
  - domain-local study / evidence / delivery truth 不上收
- real blockers：
  - 仍需把现有 runtime reality 整理成稳定的本地产品 runtime 口径
  - 仍需明确哪些 runtime status / session surface 真的值得冻结成长期 contract

### `med-autogrant`

- current position：
  - 已经更接近对象清楚、输出闭环清楚的本地产品 runtime 路径
  - revision / final / export 方向更容易做 runtime substrate 映射
- next truthful tranche：
  - 先吸收 `session substrate`
  - 先吸收 `approval / interrupt / resume`
  - 对齐 `delivery / cron substrate`
  - 在对象更稳定后吸收 `runtime profile` 与 `gateway runtime status`
- required verification：
  - 明确 revision / final / export 生命周期如何绑定 session continuity
  - 明确 approval scope 与 output budget 边界
  - 明确 delivery target 与 final deliverable 的对应关系
- excluded scope：
  - 不提前 admission 成 `OPL` 已 admitted runtime owner
  - 不宣称 hosted runtime
  - 不抽象成通用基金平台
- promotion invariants：
  - 继续保持 domain-specific 对象与 proposal truth
  - `MCP` 仍只是 supported layer，不强推成正式产品入口
  - 不改写 `OPL` 顶层定位
- real blockers：
  - 当前仍停留在 future-facing domain direction，不是 `OPL` admitted domain gateway
  - 需要更多 domain-internal 证据证明其本地产品 runtime 主线已经稳定

### `redcube-ai`

- current position：
  - 当前更需要先稳住 `source-readiness / research-mainline`
  - 仍处在更适合后置吸收 substrate 的阶段
- next truthful tranche：
  - 暂不优先吸收整套 `S1`
  - 先只保留对 `gateway runtime status`、`delivery / cron substrate`、`approval / interrupt / resume` 的后续兼容目标
- required verification：
  - 先证明 research-mainline 与 source-readiness 足够稳定
  - 先证明 family / deliverable runtime 的当前主线不会被 substrate 话术反向扰动
- excluded scope：
  - 不在当前轮次强推 shared runtime substrate 全量落地
  - 不把 visual delivery runtime 误写成 `OPL` 的统一产品 runtime
- promotion invariants：
  - `ppt_deck` 仍只是一条 domain family 入口，不等于整个 `OPL` runtime
  - domain-local deliverable truth、review truth 与 operator semantics 继续留在仓内
- real blockers：
  - `source-readiness / research-mainline` 还不够稳定
  - 现在强推 substrate 吸收会让 runtime 叙事先于主线成熟度

## 哪些内容已经可以压到 domain

下面这些内容已经可以开始压到 domain 仓：

- `med-autoscience`
  - `runtime profile`
  - `session substrate`
  - `gateway runtime status`
  - `delivery / cron substrate`
  - `approval / interrupt / resume`
- `med-autogrant`
  - `session substrate`
  - `approval / interrupt / resume`
  - `delivery / cron substrate`
  - 受控吸收的 `runtime profile`
- `redcube-ai`
  - 当前只建议压入“兼容目标”和 `gateway runtime status / delivery / approval` 的最小边界语言，不建议全量推进

## 哪些内容仍只能停留在 `OPL` 顶层

在当前阶段，下面这些内容仍只能停留在 `OPL` 顶层 reference / contract 层：

- shared runtime substrate v1 的统一命名与边界
- host-agent runtime 与 future managed runtime 的关系定义
- adoption order 与 promotion invariants
- Hermes 吸收结论
- “什么属于 gateway-owned machine-readable surface，什么不属于”的顶层判断

## `S1` Activation Package

### current north star

- 让三个业务仓共享同一个上位 runtime substrate 目标
- 但不让 `OPL` 越界成 runtime owner

### why now

- 顶层语言已经足够稳定，可以冻结
- 共享实现还不够稳定，现在冻结语言比提前写实现更诚实

### what counts as done

- `OPL` 顶层文档与 reference-grade 文档不再打架
- 六组对象有统一定义与边界
- adoption board 与下一棒顺序已经冻结

### what must not be done

- 不写统一平台 runtime 实现
- 不写 hosted runtime 已落地
- 不把 future product entry 写成 current truth
- 不把 domain-local truth 上收到 `OPL`

### immediate follow-on after `S1`

1. 在 `med-autoscience` 证明第一条成熟本地产品 runtime pilot。
2. 在 `med-autogrant` 把同一套语言压进 revision / final / export runtime 路径。
3. 在 `redcube-ai` 等主线稳定后，只吸收真正可复用的那部分 substrate。

### honest continuation conditions

只有在下面条件成立时，才允许从 `S1` 往后推进：

- 至少一个 domain 证明了成熟本地产品 runtime pilot
- 至少一个 shared object group 被证明已经形成可复用实现
- 仍不需要把 `OPL` 错写成 runtime owner 或 hosted platform

## 当前 tranche 记录

- 当前所处阶段：
  - `S1` 在 `OPL` 顶层已经完成 truth sync、substrate freeze、adoption board freeze 与 activation package freeze
- 已完成什么：
  - 阶段 A：truth sync
  - 阶段 B：shared runtime substrate v1 语言冻结
  - 阶段 C：adoption board 冻结
  - 阶段 D：activation package 冻结
- 剩余待办：
  - 在 domain 仓做真实 adoption tranche
  - 验证哪些对象可以升级成 machine-readable gateway surface
- 为什么现在继续会产生 truth drift：
  - 再往前就会被迫发明 runtime owner 语义、托管能力或共享执行实现
- 下一棒必须先满足什么条件：
  - 至少一个 domain 拿出成熟本地产品 runtime 的实证
  - 证明某些 shared object 已经具备稳定复用实现

## 结论

这轮 `S1` 的价值不在于把 `OPL` 讲成更大的平台故事。
它的价值在于：让三个业务仓第一次拥有同一个上位 runtime substrate 目标，同时继续保持 `OPL` 的真实产品边界。
