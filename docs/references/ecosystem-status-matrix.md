# OPL 生态四仓统一状态总表

状态锚点：`2026-04-08`

## 文档目的

这份文档用于给后续开发提供一个统一、可复查的当前状态视图。
它不替代各仓库自己的 `README`、`project-truth`、`CURRENT_PROGRAM` 或主线文档，只负责回答四个问题：

1. 四个仓库现在分别处在什么位置
2. `Unified Harness Engineering Substrate` 当前到底落到了哪一层
3. 四仓是否已经拉平到同一起跑线
4. 现阶段各仓下一步到底应该继续什么

当前中央 program 与阶段定义，以 [`contract-convergence-v1-execution-board.md`](./contract-convergence-v1-execution-board.md) 为准；本表负责给出四仓状态快照与成熟度判断。

## 使用规则

- 这是一份仓库跟踪的内部参考文档，默认中文维护。
- 它属于 `OPL docs` 的参考级配套文档，不进入默认公开主线。
- 它只作为内部参考同步面，不反向抬升为 `OPL` 公开主线真相。
- 这里的判断必须尽量引用四仓已冻结的真相文档，而不是基于印象口述。
- 本文中的“长线总目标”默认指理想形态 / `north star`；“当前阶段”只回答当前做到哪里，不等于长期目标已经缩小成这一阶段。
- 当四仓阶段发生明显变化时，应同步更新本表。

## 快照依据

- `one-person-lab`：`README*`、`contracts/project-truth/AGENTS.md`、`docs/roadmap*`
- `one-person-lab`：`docs/references/contract-convergence-v1-execution-board.md`
- `med-autoscience`：`README*`、`contracts/project-truth/AGENTS.md`、`docs/agent_runtime_interface.md`
- `redcube-ai`：`README*`、`contracts/project-truth/AGENTS.md`、`contracts/runtime-program/current-program.json`
- `med-autogrant`：`README*`、`contracts/project-truth/AGENTS.md`、`docs/specs/2026-04-07-formal-entry-matrix-current-truth.md`

## 零、当前统一 program 锚点

### 结论

当前四仓不再按四套散任务理解，而是共同处在：

- `Contract Convergence v1`
- `Phase C / Object And Report Behavior Convergence`

也就是说，当前已经不再讨论“统一构架是否成立”，而是在统一构架已经成立、`Phase B` 已完成的前提下，继续把对象层、报告层、gate semantics 与 audit-watch 行为面压成同一层级的 repo-verified behavior。

同样需要明确：`MedAutoScience` 的 `monorepo / runtime core ingest / controlled cutover` 仍然存在，但它是 `MedAutoScience` 域内长线，不是当前四仓统一 `Phase C` 的 blocker，也不是当前统一 program 的直接交付项。

## 一、统一框架当前落地层级

### 结论

截至 `2026-04-08`，`Contract Convergence v1` 已经从参考级判断吸收到四仓的 current truth / public docs。
统一框架当前稳定落在：

- `L1 / 命名-边界-分层合同`
- `L2 / formal-entry 与 handle-surface 合同`
- `L3 / object-report-gate behavior convergence（推进中）`

它仍然没有进入 `L4 / 共享执行内核`。

### 已经落地的部分

- 顶层命名与分层已冻结：
  - `OPL` 是顶层 `Gateway / Federation`
  - `Unified Harness Engineering Substrate` 是共享架构基座
  - 三个业务仓是在同一 substrate 上演化的 `Domain Harness OS`
- 当前产品分层语义已统一：
  - 三个业务仓当前都按 `Auto-only` 主线理解
  - 未来 `Human-in-the-loop` 产品应作为 sibling 或 upper-layer product 复用同一 substrate
  - 不再采用“同仓双模”解释
- formal-entry matrix 语义已统一：
  - `default_formal_entry`
  - `supported_protocol_layer`
  - `internal_controller_surface`
- `Phase B` 的中央完成标准已统一：
  - 每个业务仓都必须显式冻结 execution handle contract
  - 每个业务仓都必须显式冻结 durable surface contract
  - `OPL` 必须持有中央执行板、状态总表与任务板
- `Phase C` 的中央完成标准已经启动：
  - `redcube-ai` 要把 canonical audit / watch / review / projection surface 压成同轴行为验证
  - `med-autogrant` 要把 verification / checkpoint surface 压成同轴行为验证
  - `med-autoscience` 主线进入手工测试驱动稳定化，不重开新架构 tranche
- 当前默认本地执行形态口径已统一：
  - 当前默认本地形态是 `Codex-default host-agent runtime`
  - 未来都应兼容同一 substrate 上的 managed web runtime
- 文档治理已统一：
  - 对外双语
  - 内部技术/规划/备忘默认中文
  - `docs/README*` 为 docs 入口
  - `documentation-governance` 负责治理边界

### 尚未落地的部分

- 还没有独立的共享公共代码框架仓库
- 还没有抽成一套共享执行内核
- `Auto-only` 主线已经统一，但行为层仍在集中收口
- future `Human-in-the-loop` 产品还没有开始单独实现
- managed web runtime 仍是后续目标，不是当前现实
- `MedAutoScience` 的 `monorepo / runtime core ingest / controlled cutover` 仍未进入实施阶段；当前被明确后置在更高 gate 之后

### 当前成熟度判断

| 维度 | 当前判断 |
| --- | --- |
| 统一术语与架构层 | 高 |
| formal-entry / layering 合同层 | 高 |
| 顶层 gateway 合同与只读入口 | 中 |
| 跨仓 durable surface 对齐 | 中高 |
| repo-verified behavior convergence | 中 |
| 共享代码框架 / 共享执行内核 | 低 |
| 统一平台 runtime / managed web runtime | 低 |

## 二、formal-entry 矩阵当前快照

### 顶层 OPL

`OPL` 当前 repo-tracked formal entry 仍是本地 `TypeScript CLI + read-only gateway baseline`。
它是顶层 `Gateway` 的 formal entry，不等于 domain runtime owner 入口。
当前顶层 baton 同时继承并保持可追溯的前序锚点：

- `G2 stable public baseline`
- `G3 thin handoff planning freeze`
- `Phase 1 exit + next-stage activation package freeze`
- `Review Ops -> Thesis Ops` candidate-domain closeout order

### 三个业务仓

| 仓库 | `default_formal_entry` | `supported_protocol_layer` | `internal_controller_surface` | 当前实现判断 |
| --- | --- | --- | --- | --- |
| `med-autoscience` | `CLI` | `MCP` | `controller` | formal-entry 已统一；本轮补齐 `program_id / study_id / quest_id / active_run_id` 与 current durable surface 合同 |
| `redcube-ai` | `CLI` | `MCP` | `controller` | `CLI` 与 `MCP` 已是 repo-verified public entry；`controller` 仍只属于内部控制面 |
| `med-autogrant` | `CLI` | `MCP` | `controller` | `CLI` 是当前正式入口；`MCP` 仍是保留的 future protocol layer，尚未 repo-verified |

统一要求不再是把 `CLI / MCP / controller` 并列写成没有层级的一张入口表，而是始终通过这三个字段表达边界。

## 三、四仓当前阶段

| 仓库 | 当前角色 | 当前阶段 | 当前已经成立的真相 | 下一步重点 |
| --- | --- | --- | --- | --- |
| `one-person-lab` | 顶层 `Gateway / Federation` | `Contract Convergence v1 / Phase C` program owner | 顶层 formal entry、candidate-domain blocked truth、`Unified Harness Engineering Substrate`、四仓统一文档治理都已冻结；当前开始统一持有 `Phase C` 的行为收口定义 | 继续把 admitted-domain federation wording、中央参考同步面与顶层 docs/contracts/tests 收紧；不越界成 runtime owner |
| `med-autoscience` | 医学 `Research Ops` `Domain Harness OS` | runtime mainline 已吸收，repo-side 停在 external runtime gate 前 | 主线 runtime contract 已吸收到 `main`，本轮 formal-entry / Auto-only / future HITL layering 口径也已收口；display 资产化线不在这条主线范围内；`monorepo / runtime core ingest / controlled cutover` 仍保留为后置长线 | 围绕已稳定能力做手工测试与问题修正；在 external runtime gate 清除前，不重开新的架构 tranche，也不提前进入 physical migration |
| `redcube-ai` | 视觉交付 `Domain Harness OS` | `Phase C` 行为收口已推进到 `Phase 2 / direct-delivery operator handoff hardening` 并 absorbed | `CLI / MCP / controller` 语义已收口，`Auto-only` 主线与 future layering 口径已统一；`ppt_deck` / guarded `poster_onepager` 已在 hydrated `delivery_contract` 中冻结 machine-readable `operator_handoff`，并由四个 canonical surface 输出同一 handoff summary | 当前没有已冻结的下一候选 tranche；若继续，只能先形成新的 same-mainline truthful freeze，而不是直接扩写 future scope |
| `med-autogrant` | 医学 `Grant Ops` `Domain Harness OS` 方向 | `Phase C` verification/checkpoint 收口已推进到 `P4.A / Verification Gate Surface` 并 absorbed | author-side mainline、formal-entry、durability 与 `Auto-only` 主线语义已进入 current truth；`P4.A` 已把五个 CLI surface 收口为当前 canonical verification gate surface，并把 gate-open `freeze_ready` 与真正 `submission_frozen` machine-readable 分开；`MCP` 仍诚实停留在 future layer | 下一 truthful step 不是直接实现 `P4.B`，而是先冻结 `P4.B / Verification OS And Checkpoint Surface` activation package；不提前误写成成熟 submission-grade runtime |

对 `one-person-lab` 而言，当前 active baton 不是重新发明 `Phase 1`，而是：

- 保持已完成的 `G2 stable public baseline`
- 保持已收口的 `G3 thin handoff planning freeze`
- 把已吸收的 `Phase 1 exit + next-stage activation package freeze` 视为前序门槛
- 在此前提下推进当前 `Minimal admitted-domain federation activation package`
- 继续守住 `Review Ops -> Thesis Ops` 这条已冻结的 candidate-domain closeout 顺序

## 四、现在是否已经拉平到同一起跑线

### 结论

`Phase B` 的合同层已经拉平，行为层已进入集中收口。

### 已经拉平的部分

- `OPL`、`Unified Harness Engineering Substrate`、`Domain Harness OS` 的分层命名
- 当前 `Auto-only` 主线与未来 `Human-in-the-loop` sibling / upper-layer layering 语义
- formal-entry matrix 的三字段表达
- execution handle contract 的表达框架
- durable surface contract 的表达框架
- `Codex-default host-agent runtime` 作为当前默认本地形态
- 对外双语 / 对内中文的文档治理规则
- `Phase C` 由 `OPL` 集中持有，不再按四仓散管理

### 还没有拉平的部分

- 三个业务仓的行为面成熟度不同
- `MCP` 的真实实现状态并不相同
- audit trail、gate surface 与对象层行为验证仍需继续按各仓节奏收紧
- 手工测试推进顺序也不完全相同：
  - `med-autoscience` 与 `redcube-ai` 可以优先围绕稳定功能测试
  - `med-autogrant` 已推进到 `P4.A`，下一步先 freeze `P4.B` activation package，而不是直接开实现
- `MedAutoScience` 还挂着一条 domain-internal 的 `monorepo / runtime core ingest / controlled cutover` 长线；它和四仓统一 `Phase C` 是同一北极星上的前后阶段，不是同层并行交付
- `redcube-ai` 当前没有已冻结的下一候选 tranche；`med-autogrant` 已比另外两个业务仓更靠前地推进到 `P4.A` absorb，因此四仓已在同一平台，但还不在同一精确 baton 位置

## 五、当前统一推进顺序

### 统一判断

现在不再需要继续讨论“统一构架是否成立”。
当前真正需要做的是：沿 `Phase C / Object And Report Behavior Convergence` 继续推进，把对象面、报告面、gate surface 与 audit-watch 收口成 repo-verified behavior。

### 各仓下一步

1. `one-person-lab`
   继续维护中央同步面与 admitted-domain federation wording，把顶层当前真相持续压稳，并持有 `Phase C` 的统一离场条件。
2. `med-autoscience`
   以手工测试稳定化为主；display 资产化独立线不计入这条主线。`monorepo / runtime core ingest / controlled cutover` 仍是后置长线，但要等 external runtime gate、对象边界和报告边界继续稳定后再开。
3. `redcube-ai`
   当前 latest absorbed tranche 已到 `Phase 2 / direct-delivery operator handoff hardening`；若继续，需要先形成新的 same-mainline truthful freeze，再决定是否打开下一棒。
4. `med-autogrant`
   `P4.A / Verification Gate Surface` 已 absorbed；若继续，唯一 truthful 下一棒是先冻结 `P4.B / Verification OS And Checkpoint Surface` activation package。

## 六、后置事项

以下事项已经明确后置，不在本轮直接落地范围内：

- 共享公共代码框架抽取
- 统一平台 runtime
- 统一 Web 前端
- future `Human-in-the-loop` sibling / upper-layer product 的单独实现
- `MedAutoScience` 的 `monorepo / runtime core ingest / controlled cutover` 物理整合长线
