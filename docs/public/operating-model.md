# OPL 运行模型

OPL 把复杂知识工作组织为一组可恢复、可审阅、可交接的 Stage。AI 在 Stage 内选择方法，人类和 domain owner 保留关键判断，Framework 负责通用运行与证据边界。

## 工作链

```text
目标与材料
  -> Workspace + Work Item
  -> Stage contract
  -> Agent / executor Attempt
  -> artifact + evidence refs
  -> independent review / owner decision
  -> next Stage or delivery
```

## 角色

### 用户

定义目标、提供材料和权限、处理 human gate，并对最终采用、发布或提交负责。

### 专业 Agent

理解材料、设计方法、执行专业工作、生成产物、审阅和修订。Agent 的 domain owner 持有专业事实与质量边界。

### OPL Framework

提供 Workspace、Stage/Attempt、Package discovery、Runway 执行器适配、opld、evidence refs、恢复和 operator projection。Framework 不替专业 Agent 作 verdict。

### OPL App 与 Cloud

App 提供本地产品体验，Cloud 提供远端 workspace、resource 和协作。两者消费 Framework contracts，但各自持有产品和运行事实。

## AI-first

Stage contract 定义目标、输入、预期产物、权限和 owner；AI 自主决定阶段内的比较、工具使用、反思和修订。系统不把专业工作预编译成细碎 transition table。

确定性代码负责 identity、schema、权限、持久化、链接、资源和不可逆副作用；语义、叙事、方案与质量判断由 AI 和 domain owner完成。

## Artifact-first

进展以可消费 artifact、可回读 evidence、明确 decision 和可恢复 handoff衡量。日志、token、heartbeat、test count 或“正在运行”不替代产物。

artifact 可以带着清楚的质量债进入下一轮，但不能因此被写成 owner accepted 或正式交付。

## Runtime

一次 StageRun 可以有多个 Attempt。provider 保存 durable execution，Framework 投影状态和恢复动作，domain owner读取产物并决定接受、阻塞或返工。

provider healthy和Attempt completed只说明运行链，不说明专业结果。

## Package

Agent 和 capability 通过 installed Package提供。native carrier 持有物理安装，Framework 做动态发现和调用，App呈现可用能力。Package、executor 和 publication 相互独立。

## Authority

- source/data truth -> source/domain owner；
- artifact body 和 quality -> domain owner；
- runtime history -> provider；
- installed truth -> native carrier；
- App/Cloud product truth -> 对应产品 owner；
- refs-only projection -> Framework。

详细静态边界见 [架构](../architecture.md)，工作类型见 [任务版图](./task-map.md)。
