# 四仓统一开发运行合同

## 文档目的

这份文档用于统一 `OPL` 顶层仓与三个业务仓的开发运行方式。

它解决的不是产品 runtime 本体，而是开发控制面的问题：

1. 谁负责规划、冻结真相、阶段验收与最终集成
2. 谁负责长时间连续执行、验证与 report 回写
3. 在不同仓成熟度不一致的情况下，如何维持同一套开发节奏
4. 如何在不立即推倒历史执行面的前提下，把四仓逐步收进同一开发模式

## 一、适用范围

当前适用仓库：

- `one-person-lab`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

未来若有新的正式 domain 仓加入，也应先对齐本合同，再进入同一长期开发体系。

## 二、统一结论

四仓当前统一采用：

> `Codex Host 负责规划冻结，OMX 负责长时执行`

这里的 `Codex Host` 可以表现为：

- `Codex App`
- 当前会话中的 `Codex` 主控上下文

但语义上都指向同一个角色：

- 规划者
- 真相冻结者
- 阶段验收者
- 最终集成判断者

## 三、核心原则

### 1. 产品 runtime 与开发控制面分离

必须严格区分：

- 产品 runtime
- 开发控制面

产品 runtime 指 domain harness 在 shared substrate 上实际执行任务的运行面。

开发控制面指：

- `Codex Host`
- `OMX`
- `CURRENT_PROGRAM`
- reports
- specs / plans / test-spec
- 验收记录与阶段指针

不能把“开发控制面已经稳定”误写成“产品 runtime 已成熟”。

### 2. leader-first truth freeze

所有跨仓、跨阶段、跨 tranche 的关键动作，必须先由 `Codex Host` 冻结真相，再交给 `OMX` 长跑。

这包括：

- phase 顺序
- north star
- 当前唯一 active mainline
- 跨仓依赖解释
- promotion gate
- final acceptance 标准

### 3. 同一合同，不同成熟度

四仓共享同一开发模式，但不要求成熟度相同。

允许出现：

- `OPL` 偏 docs / contract-first
- `Med Auto Science` 偏成熟业务主线 + 架构收紧
- `RedCube AI` 偏产品稳定化 + runtime evaluation
- `Med Auto Grant` 偏 baseline freeze / hardening

统一的是开发合同，不是阶段整齐划一。

### 3.1 当前业务仓先按 `Auto-only` 主线理解

当前三个业务仓统一按下面方式理解：

- 当前 repo 主线是 `Auto-only`
- 当前主线优先服务全自动闭环、验证、硬化与审计
- 未来若要做高判断密度 `Human-in-the-loop` 产品，应作为兼容 sibling 或 upper-layer product 复用同一 substrate contract 与稳定模块

这条规则统一的是产品分层语义，不等于今天就要在同一个仓里同时维护两套顶层判断逻辑。

### 4. 允许 legacy controlled surface 继续存在

不要求一开始就完全重构旧执行面。

允许 legacy controlled surface 在本合同下继续存在，但必须满足：

- 上游/下游责任边界清楚
- `Codex Host` 可读当前主线与阶段真相
- `OMX` 可持续推进并写回 reports
- 关键状态能落到 durable handoff surfaces

换句话说，治理重点是：

- 先提高可审计性
- 先提高可交接性
- 再逐步吸收或替换旧执行面

## 四、角色与责任分工

### `Codex Host`

负责：

- 规划与设计
- 真相文档冻结
- phase / tranche 激活与 promotion 裁决
- 冲突裁决
- 最终集成判断
- 最终验收

不负责：

- 把长时间连续执行本身当成自己的主职责
- 在没有 durable control surface 的情况下让 `OMX` 盲跑

### `OMX`

负责：

- 长时间连续执行
- team lane 拆分
- 自动化验证
- report 回写
- 中断恢复
- 在已冻结边界内持续推进

不负责：

- 自行改写 north star
- 自行切 phase
- 自行扩大 scope 到未激活阶段
- 把一次性聊天结论当作 durable truth

### 人类

负责：

- 产品方向与价值判断
- 高判断密度 gate 的最终接受/否决
- 是否继续、止损、改题或调序

## 五、最小 durable handoff surfaces

四仓共同最少应具备下面这些 durable handoff surfaces：

1. `AGENTS.md`
2. `contracts/project-truth/AGENTS.md`
3. `docs/documentation-governance.md`
4. 当前有效的 `README*` 与 `docs/README*`
5. 当前有效的 `docs/specs/**` 与 `docs/plans/**`
6. 对应的测试/验证表面

这套最小表面负责保证：

- 新进入的执行者知道项目是什么
- 知道当前什么是活真相
- 知道 docs 与公开面的层级
- 知道该以什么验证结果作为阶段判断依据

## 六、增强型 handoff surfaces

对于已经进入长线主线运行的仓库，应进一步具备增强型 handoff surfaces：

1. `.omx/context/CURRENT_PROGRAM.md`
2. `.omx/context/OMX_TEAM_PROMPT.md`
3. `.omx/plans/spec-program-operating-model.md`
4. `.omx/plans/prd-*.md`
5. `.omx/plans/test-spec-*.md`
6. `.omx/plans/implementation-*.md`
7. `.omx/reports/<program-id>/LATEST_STATUS.md`
8. `.omx/reports/<program-id>/ITERATION_LOG.md`
9. `.omx/reports/<program-id>/OPEN_ISSUES.md`

增强型表面不是所有仓当前都必须具备，但只要进入“OMX 可长跑”的主线模式，就应补齐。

## 七、四仓的当前适配方式

### `one-person-lab`

当前定位：

- 顶层 `Gateway / Federation`
- docs / contract-first 仓

当前开发模式重点：

- 由 `Codex Host` 主导顶层语言、docs 分层、合同冻结
- `OMX` 不是其默认主驱动，但未来可用于 bounded acceptance / inventory / long review 型任务

### `med-autoscience`

当前定位：

- 成熟业务主线
- 架构与 authority boundary 仍在收紧

当前开发模式重点：

- `Codex Host` 冻结主线、authority boundary 与 phase 解释
- `OMX` 适合承接长跑验证、真实课题收口、reports 回写
- legacy controlled surface 可继续存在，但必须纳入 handoff 合同

### `redcube-ai`

当前定位：

- 交付主线已可用
- 正进入 runtime evaluation / poster 扩展 / OPL 联动阶段

当前开发模式重点：

- `Codex Host` 负责冻结 family 边界、runtime framing 与对外口径
- `OMX` 适合承接批量验证、交付样例跑通、reports 与 regression 验证

### `med-autogrant`

当前定位：

- baseline freeze / runtime hardening
- 当前最完整地显式采用了 `Codex Host + OMX` 双层开发控制面

当前开发模式重点：

- 继续作为四仓开发控制面的明确参考实现
- 但不把它误写成“产品 runtime 已最成熟”的代表

## 八、统一开发顺序

当前建议按下面顺序推进四仓共同开发模式：

1. 先冻结 `Codex Host / OMX` 的角色边界
2. 先统一最小 durable handoff surfaces
3. 对进入长跑的仓逐步补齐增强型 handoff surfaces
4. 让 `OMX` 只在已冻结边界内长跑
5. 让 `Codex Host` 保持 promotion / integration / final verification 裁决权

## 九、当前不应该做的事

- 不把 `OMX` 当成可以脱离真相文档独立重建上下文的万能执行器
- 不把 `Codex Host` 与 `OMX` 的职责重新混回同一个模糊对话
- 不为了追求统一，要求四仓一上来都补齐同等级 `.omx` 结构
- 不把开发控制面成熟度误写成产品 runtime 成熟度
- 不因为 legacy surface 仍存在，就否定统一开发模式已经可以先落地

## 十、完成判据

只有当下面这些条件成立时，才可说“四仓开发模式已基本统一”：

- 四仓都明确采用 `Codex Host 负责规划冻结，OMX 负责长时执行`
- 四仓都能区分产品 runtime 与开发控制面
- 四仓都至少具备最小 durable handoff surfaces
- 进入长线主线的仓库能补齐增强型 handoff surfaces
- legacy controlled surface 被纳入合同解释，而不是游离在合同之外
