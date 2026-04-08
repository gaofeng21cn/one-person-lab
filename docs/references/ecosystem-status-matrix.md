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
- `Phase B / Handle And Surface Convergence`

也就是说，当前已经不再讨论“统一构架是否成立”，而是在统一构架已经成立的前提下，继续把 execution handle、durable surface、audit trail 与边界语义压成同一层级的 repo-tracked 合同。

## 一、统一框架当前落地层级

### 结论

截至 `2026-04-08`，`Contract Convergence v1` 已经从参考级判断吸收到四仓的 current truth / public docs。
统一框架当前稳定落在：

- `L1 / 命名-边界-分层合同`
- `L2 / formal-entry 与 handle-surface 合同`

它仍然没有进入 `L3 / 共享执行内核`。

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
- `Auto-only` 主线已经统一，但行为层仍未全部达到同等成熟度
- future `Human-in-the-loop` 产品还没有开始单独实现
- managed web runtime 仍是后续目标，不是当前现实

### 当前成熟度判断

| 维度 | 当前判断 |
| --- | --- |
| 统一术语与架构层 | 高 |
| formal-entry / layering 合同层 | 高 |
| 顶层 gateway 合同与只读入口 | 中 |
| 跨仓 durable surface 对齐 | 中 |
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
| `one-person-lab` | 顶层 `Gateway / Federation` | `Minimal admitted-domain federation activation package` | 顶层 formal entry、candidate-domain blocked truth、`Unified Harness Engineering Substrate`、四仓统一文档治理都已冻结；本轮又把 `Contract Convergence v1` 正式吸收到 current/public truth | 继续把 admitted-domain federation wording、中央参考同步面与顶层 docs/contracts/tests 收紧；不越界成 runtime owner |
| `med-autoscience` | 医学 `Research Ops` `Domain Harness OS` | runtime mainline 已吸收，repo-side 停在 external runtime gate 前 | 主线 runtime contract 已吸收到 `main`，本轮 formal-entry / Auto-only / future HITL layering 口径也已收口；display 资产化线不在这条主线范围内 | 围绕已稳定能力做手工测试与问题修正；在 external runtime gate 清除前，不重开新的架构 tranche |
| `redcube-ai` | 视觉交付 `Domain Harness OS` | `redcube-runtime-program` 持续 hardening | `CLI / MCP / controller` 语义已收口，`Auto-only` 主线与 future layering 口径已统一，review/export/source-readiness 治理链已经进入当前主线 | 继续同一主线上的 review / export / gate / audit hardening，并围绕稳定 family 做手工测试 |
| `med-autogrant` | 医学 `Grant Ops` `Domain Harness OS` 方向 | `baseline freeze / runtime hardening` | author-side mainline、formal-entry、durability 与 `Auto-only` 主线语义已进入 current truth；`MCP` 仍诚实停留在 future layer | 继续 author-side mainline hardening，往 verification surface / checkpoint surface 推进；不提前误写成成熟 submission-grade runtime |

对 `one-person-lab` 而言，当前 active baton 不是重新发明 `Phase 1`，而是：

- 保持已完成的 `G2 stable public baseline`
- 保持已收口的 `G3 thin handoff planning freeze`
- 把已吸收的 `Phase 1 exit + next-stage activation package freeze` 视为前序门槛
- 在此前提下推进当前 `Minimal admitted-domain federation activation package`
- 继续守住 `Review Ops -> Thesis Ops` 这条已冻结的 candidate-domain closeout 顺序

## 四、现在是否已经拉平到同一起跑线

### 结论

`Phase B` 的合同层已经拉平，行为层还没有拉平。

### 已经拉平的部分

- `OPL`、`Unified Harness Engineering Substrate`、`Domain Harness OS` 的分层命名
- 当前 `Auto-only` 主线与未来 `Human-in-the-loop` sibling / upper-layer layering 语义
- formal-entry matrix 的三字段表达
- execution handle contract 的表达框架
- durable surface contract 的表达框架
- `Codex-default host-agent runtime` 作为当前默认本地形态
- 对外双语 / 对内中文的文档治理规则

### 还没有拉平的部分

- 三个业务仓的行为面成熟度不同
- `MCP` 的真实实现状态并不相同
- audit trail、gate surface 与对象层行为验证仍需继续按各仓节奏收紧
- 手工测试推进顺序也不完全相同：
  - `med-autoscience` 与 `redcube-ai` 可以优先围绕稳定功能测试
  - `med-autogrant` 仍应先继续 baseline hardening

## 五、当前统一推进顺序

### 统一判断

现在不再需要继续讨论“统一构架是否成立”。
当前真正需要做的是：先完成 `Phase B / Handle And Surface Convergence`，再进入对象面、报告面与行为验证面的更深收敛。

### 各仓下一步

1. `one-person-lab`
   继续维护中央同步面与 admitted-domain federation wording，把顶层当前真相持续压稳。
2. `med-autoscience`
   以手工测试稳定化为主；display 资产化独立线不计入这条主线。
3. `redcube-ai`
   在当前主线上继续 hardening，再围绕已稳定 family 做手工测试。
4. `med-autogrant`
   继续 author-side baseline hardening，向 verification surface 与更强 checkpoint surface 推进。

## 六、后置事项

以下事项已经明确后置，不在本轮直接落地范围内：

- 共享公共代码框架抽取
- 统一平台 runtime
- 统一 Web 前端
- future `Human-in-the-loop` sibling / upper-layer product 的单独实现
