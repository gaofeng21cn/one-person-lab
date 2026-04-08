# OPL 生态四仓统一状态总表

状态锚点：`2026-04-08`

## 文档目的

这份文档用于给后续开发提供一个统一、可复查的当前状态视图。
它不替代各仓库自己的 `README`、`project-truth`、`CURRENT_PROGRAM` 或主线文档，只负责回答三个问题：

1. 四个仓库现在分别处在什么位置
2. 统一 `Unified Harness Engineering Substrate` 当前实际落到了哪一层
3. 下一阶段到底应先做“统一对齐”，还是先做“手工测试稳定化”

## 使用规则

- 这是一份仓库跟踪的内部参考文档，默认中文维护。
- 它属于 `OPL docs` 的参考级配套文档，不进入默认公开主线。
- 它只作为内部参考同步面，不反向抬升为 `OPL` 公开主线真相。
- 这里的判断必须尽量引用四仓已冻结的真相文档，而不是基于印象口述。
- 本文中的“长线总目标”默认指理想形态 / `north star`；“当前阶段”只回答当前做到哪里，不等于长期目标已经缩小成这一阶段。
- 当四仓阶段发生明显变化时，应同步更新本表。

## 快照依据

- `one-person-lab`：`README*`、`contracts/project-truth/AGENTS.md`、`docs/roadmap*`、`contracts/opl-gateway/README*`
- `med-autoscience`：`README*`、`contracts/project-truth/AGENTS.md`、`.omx/context/CURRENT_PROGRAM.md`
- `redcube-ai`：`README*`、`contracts/project-truth/AGENTS.md`、`.omx/context/CURRENT_PROGRAM.md`
- `med-autogrant`：`README*`、`contracts/project-truth/AGENTS.md`、`.omx/context/CURRENT_PROGRAM.md`

## 一、统一框架的当前落地层级

### 结论

当前统一框架已经在 `L1` 层落地，在少量 `L2` 入口合同上已有初步实现，但远未到共享公共执行内核或统一平台 runtime 的阶段。

### 已经落地的部分

- 顶层命名与分层已冻结：
  - `OPL` 是顶层 `Gateway / Federation`
  - `Unified Harness Engineering Substrate` 是共享架构基座
  - 三个业务仓是运行在同一 substrate 上的 `Domain Harness OS`
- 默认本地执行形态口径已统一：
  - 当前默认本地形态是 `Codex-default host-agent runtime`
  - 未来都应兼容同一 substrate 上的 managed web runtime
- `OPL` 已有真实的只读 gateway 基线：
  - 可验证 contracts
  - 可枚举 workstreams / domains / surfaces
  - 可做基础路由解释与边界解释
- 四仓文档治理已统一：
  - 对外双语
  - 内部技术/规划/备忘默认中文
  - `docs/README*` 为 docs 入口
  - `../documentation-governance.md` 为治理真相说明

### 尚未落地的部分

- 还没有独立的共享公共代码框架仓库
- 还没有抽成一套共享执行内核
- `Auto / Human-in-the-loop` 仍主要是架构约束，不是三仓都已完整实现的稳定双模 runtime
- managed web runtime 仍是后续目标，不是当前现实
- 跨仓共享目前以统一语言、统一边界和统一合同语义为主，不是共享 runtime 本体

### 当前成熟度判断

| 维度 | 当前判断 |
| --- | --- |
| 统一术语与架构层 | 高 |
| 顶层 gateway 合同与只读入口 | 中 |
| 跨仓共享协议复用 | 中偏低 |
| 共享代码框架 / 共享执行内核 | 低 |
| 统一平台 runtime / managed web runtime | 低 |

## 二、四仓状态矩阵

| 仓库 | 角色 | 当前阶段 | 当前成熟度判断 | 当前重点 |
| --- | --- | --- | --- | --- |
| `one-person-lab` | 顶层 `Gateway / Federation` | `Phase 2 / Minimal admitted-domain federation activation package` | 顶层合同稳定，`G2 stable public baseline` 已完成，`G3 thin handoff planning freeze hardening` 已收口为 planning freeze；`Grant/Review/Thesis` candidate path 继续停留在当前定义层的 blocked truth，而 `MedAutoScience` + `RedCube AI` 两条 admitted domain surface 已稳定到足以支撑最小更强 federation wording，因此主线进入 docs/contracts/tests first 的最小 admitted-domain federation activation | 守住 `G2 stable public baseline`、保持 `G3` 停在 planning freeze、守住 candidate-domain closeout 的 blocked 边界、激活最小 admitted-domain federation package，同时继续不把 `OPL` 写成 runtime owner |
| `med-autoscience` | 医学 `Research Ops` `Domain Harness OS` | `research-foundry-medical-mainline / integration harness activation baseline absorbed` | 业务最成熟；repo-side 已把 `authority -> runtime -> eval -> delivery` 最小 activation baseline absorb 到 `main`，当前正式停车终态是 `EXTERNAL_RUNTIME_DEPENDENCY_BLOCKED_AFTER_ABSORB` | 守住已吸收的 `Phase 6` baseline、不要回退重做 repo-side tranche、把后续推进诚实停在 external runtime / cutover readiness gate 前 |
| `redcube-ai` | 视觉交付 `Domain Harness OS` | `redcube-runtime-program / source intake + shared source truth baseline absorbed` | `ppt_deck` / `xiaohongshu` 主线稳定可用；`CLI / MCP` formal entry 已收紧，`source intake + shared source truth` 已进入当前主线能力面 | 守住当前 formal entry 真相、把 `review / export / gate / audit hardening` 视为同一主线的持续增强，而不是重新退回“等待下一棒显式晋升” |
| `med-autogrant` | 医学 `Grant Ops` `Domain Harness OS` | `med-autogrant-mainline / P3.A mentor verdict contract freeze absorbed` | 已有最小 runtime baseline，且 authoring mainline、formal-entry、durability、`P2.B/P2.C/P3.A` canonical boundary 已进入 current truth；仍处于 `baseline freeze / runtime hardening`，不是 submission-grade runtime | 守住当前 `P3.A` canonical truth，把上游 scaffold / P1 brief 降级为历史 provenance，并继续按 author-side `Grant Ops` 长线主线推进 |

## 三、各仓库的统一判断

### 1. OPL / one-person-lab

#### 当前角色

- 顶层 `Gateway / Federation`
- `Phase 1` 当前 repo-tracked 的 formal entry contract / public system surface 是 `TypeScript CLI + read-only gateway baseline`
- 文档优先、合同优先的公开说明面
- 当前不是 domain runtime owner

#### 当前阶段

- 当前公开主线：`Phase 2 / Minimal admitted-domain federation activation package`；repo-tracked `Phase 1 / G3 thin handoff planning freeze hardening` 已 closeout 并继续停留在 planning freeze；repo-tracked 的 `Review Ops -> Thesis Ops` candidate-domain closeout 也已在当前定义层收口，而 `Phase 1` 冻结下来的 `TypeScript CLI + read-only gateway baseline` 仍然是当前 formal entry contract / public system surface
- 当前 repo 已有可运行的本地 `TypeScript CLI + read-only gateway baseline`
- 当前 top-level formal entry 仍然就是这条本地 `TypeScript CLI + read-only gateway baseline`，而不是 launcher 或 runtime-owner 入口
- 当前 baton：已完成 `G2 stable public baseline` 收口 + 已把 `G3` 关在 thin-handoff planning freeze closeout 边界 + 已把 `Review Ops -> Thesis Ops` candidate-domain closeout 收口成 blocked / under-definition truth + 守住 `Grant Foundry -> Med Auto Grant` 的 signal-only 边界 + 已把 `Phase 1 exit + next-stage activation package freeze` absorb 为前序门槛 + 依据四仓 current truth 激活 `Minimal admitted-domain federation activation package` + 四仓状态回写到顶层参考同步面
- 对应 planning brief：`docs/plans/2026-04-07-g3-thin-handoff-planning-brief.md`
- 对应 planning closeout note：`docs/plans/2026-04-07-g3-thin-handoff-planning-closeout-note.md`
- 对应 release-closeout note：`docs/plans/2026-04-07-g2-release-closeout-note.md`
- 当前对 `Grant Ops` 的硬边界：`Grant Foundry -> Med Auto Grant` 只算 top-level signal / domain-direction evidence，不等于已正式收录的 domain gateway，也不等于 `G2` discovery readiness 或 `G3` routed-action readiness，更不是 handoff-ready surface；任何 future follow-on route 仍只能指向 `domain_gateway`

#### 现在已经有的东西

- contracts 验证
- workstream / domain / surface 枚举
- 基础路由解释与边界解释
- 顶层 docs / control-plane / taxonomy

#### 现在不该做的事

- 提前把 `OPL` 写成统一 runtime owner
- 提前把所有 domain 抽成同一个执行内核

### 2. Med Auto Science

#### 当前角色

- `Research Foundry` 的医学实现
- 对外是医学 `Research Ops` domain gateway
- 对内是医学 `Domain Harness OS`

#### 当前阶段

- 主线：`research-foundry-medical-mainline`
- repo-side 已完成：
  - `authority / outer-loop / delivery plane convergence`
  - `real-study relaunch and verify`
  - `Phase 6 / integration harness activation baseline`
- 当前正式停车终态：`EXTERNAL_RUNTIME_DEPENDENCY_BLOCKED_AFTER_ABSORB`
- 当前 repo 内不应重开：
  - `real-study relaunch`
  - 新的 same-repo cutover tranche

#### 冻结状态

- `L1`：已冻结
- `L2`：未冻结
- `L3`：未冻结

#### 当前最自然的后续顺序

1. 先清理 external runtime / cutover readiness blocker
2. 再回到 repo-side 继续更大的 `end-to-end harness / cutover readiness`
3. 在外部 gate 未放行前，不伪造新的 repo-side tranche

#### 当前最适合做的产品动作

- 围绕已稳定能力做手工测试
- 用手工测试暴露 contract / audit / delivery plane 的薄弱点
- 以测试结果反推 controller、contract、audit、delivery 的进一步收紧

### 3. RedCube AI

#### 当前角色

- 视觉交付 domain gateway
- 视觉交付 `Domain Harness OS`

#### 当前阶段

- `P19 / 创作主导权修复`：已完成
- `P20 / 第三类交付物接入证明`：已完成
- `P21 / 运行评估与运营面`：已有 closeout artifact，可视为已完成范围，但不是当前 active mainline
- 当前 active mainline：`redcube-runtime-program`
- 当前 repo-side 已 absorbed：
  - `P0 review-closeout`
  - `stable deliverable manual-test-driven hardening`
  - `Phase 2 activation package freeze`
  - `source intake + shared source truth baseline`

#### 当前稳定能力

- `ppt_deck`：稳定可用
- `xiaohongshu`：稳定可用
- `poster_onepager`：已接入，但当前只应视为 `knowledge poster`

#### 当前最适合做的产品动作

- 守住 `MCP / CLI` formal entry 真相
- 把 `source intake + shared source truth` 视为已进入当前主线能力面
- 继续推进 `review / export / gate / audit hardening`
- 不把已 absorbed 的 baseline 误写成“下一步必须人工显式晋升”的停车闸门

### 4. Med Auto Grant

#### 当前角色

- 医学 `Grant Ops` 的 `Domain Harness OS` 方向
- 作者侧、proposal-facing 主线

#### 当前阶段

- 当前唯一 active program：`med-autogrant-mainline`
- 当前 current-truth mainline：`P3.A / Mentor Verdict Contract Freeze`
- 已吸收到 `main` 的上游 canonical boundary：
  - `P2.B / Argument-Fit-Outline Mainline`
  - `P2.C / Draft-Critique-Revision Skeleton`
  - `P3.A / Mentor Verdict Contract Freeze`

#### 当前已有能力

- `NSFCWorkspace` schema 校验
- summarize / next-step / critique-summary / stage-route-report
- 基本 route / gate 一致性检查
- `grant_run_id` 已进入 CLI/runtime formal execution handle 合同
- formal-entry / durability / authoring mainline current truth 已 repo-tracked

#### 当前不应误判的点

- 控制面已经可用，不等于产品 runtime 已成熟
- 当前不应进入“效果打磨优先”的产品阶段
- 当前重点仍是 baseline hardening 与 author-side `Grant Ops` mainline 收口
- 在 `OPL` 顶层当前也只能把它写成 Grant Ops 候选方向上的 signal / evidence，而不是已 admitted 的 domain gateway

## 四、对“先继续收紧，还是先开始测试”的统一解释

### 结论

这不是两个互斥选项。

但按当前四仓的最新执行顺序，应该这样理解：

> 先完成本轮最小统一对齐，再启动手工测试；  
> 手工测试随后成为继续收紧 `control chain / contract / audit / delivery` 的主要证据来源。

### 为什么会产生误解

如果只说“继续收紧”，很容易让人理解成继续写架构文档、继续抽象边界、继续做设计。
但按当前四仓实际状态，尤其是 `Med Auto Science` 与 `RedCube AI`，下一步更缺的不是新的顶层名词，而是：

- 已公开承诺稳定的能力，到底是否真稳定
- 哪些问题是效果问题
- 哪些问题本质上是 contract / gate / audit / delivery 收口问题

### 当前推荐的正确执行方式

#### 对 `Med Auto Science` 与 `RedCube AI`

把“手工测试稳定化”视为本轮 `P0` 对齐完成之后的下一步主方法。

也就是说：

1. 先完成当前明确的 `P0` 统一对齐项
2. 再对已经稳定承诺的功能做正式手工测试
3. 把测试中暴露的问题分流：
   - 效果问题
   - contract 问题
   - audit / gate 问题
   - delivery 收口问题
4. 只修这些真实暴露的问题，不继续空转抽象
5. 直到这些稳定功能经过一轮手工验收后，再判断是否有条件进入第 3 步

#### 对 `Med Auto Grant`

当前仍以 `P1.B / runtime baseline hardening` 为主，不和前两仓争抢“效果完善”优先级。

#### 对 `OPL`

继续维持为顶层控制语言、合同与只读入口；守住已完成的 `G2 stable public baseline` 与已收口的 `G3 thin handoff planning freeze`，把 `Minimal admitted-domain federation activation package` 与四仓状态回写同步冻结到顶层参考同步面，同时继续守住 `Grant/Review/Thesis` candidate-domain 的 blocked truth，不扩成 runtime owner。

## 五、进入第 3 步前的建议门槛

只有当下面这些条件至少大体成立时，才建议讨论第 3 步，也就是“是否抽共享公共框架”：

- `Med Auto Science` 至少有 1 到 2 条核心主线经过正式手工验收
- `RedCube AI` 的 `ppt_deck` 与 `xiaohongshu` 至少各完成一轮正式手工验收
- 两个 domain 的对象边界、artifact schema、gate surface 不再频繁改名改义
- 当前暴露出来的问题，主要是质量优化和局部合同补强，而不再是本体定义摇摆

如果这些条件还不成立，那么第 3 步应继续后移。

## 六、当前建议的实际顺序

1. `OPL` 先把 `Minimal admitted-domain federation activation package` 冻结并 absorb 到顶层参考同步面，同时继续守住已完成的 `G2 stable public baseline`、已收口的 `G3 thin handoff planning freeze`，以及 `Review Ops -> Thesis Ops` candidate-domain closeout 的 blocked / under-definition truth
2. 三个业务仓先完成本轮最小统一对齐，优先处理 formal entry、显式执行句柄、durable truth 与 handoff surface 的缺口
3. `Med Auto Science` 与 `RedCube AI` 在 `P0` 对齐完成后进入“手工测试驱动的稳定化收口”
4. `Med Auto Grant` 继续守住 `P1.B / runtime baseline hardening`
5. 等前两仓经过一轮正式手工验收后，再决定是否进入共享公共框架抽取
6. 更强的跨域状态协议、统一平台 runtime、可复用 Harness OS scaffold，继续后置

## 七、后续维护建议

后续每次阶段明显变化时，优先更新：

- 本文档
- `docs/roadmap*`
- `docs/opl-public-surface-index*`
- `contracts/opl-gateway/README*`
- 各仓自己的 `README*`
- 各仓自己的 `contracts/project-truth/AGENTS.md`
- 若存在 active program，则同步 `CURRENT_PROGRAM.md`
