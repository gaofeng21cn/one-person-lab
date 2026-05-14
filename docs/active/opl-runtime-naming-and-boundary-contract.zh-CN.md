[English](./opl-runtime-naming-and-boundary-contract.md) | **中文**

# OPL Runtime 命名与边界合同

> 当前状态说明（`2026-05-11`）：本文是 stage-led、以 Agent executor 为最小执行单位的 OPL framework 活跃 runtime 命名边界。当前默认公开口径是 `Codex-default executor -> explicit OPL activation -> provider-backed stage runtime -> MAS/MAG/RCA domain-agent entry`。MAS monolith closeout 后，`MedDeepScientist` 不再是 MAS 默认 operation、diagnostic、runtime root 或 WebUI 依赖，只通过 MAS 显式声明的可选 backend audit、source provenance、historical fixture、explicit archive import、upstream intake 与 parity oracle reference 出现。

## 目的

这份文档用于冻结 `OPL` 体系下与 runtime 相关的核心命名，避免把下面几层继续混写成一团：

- 顶层 `Codex-default executor`、explicit activation 与 provider-backed stage runtime
- `Unified Harness Engineering Substrate`
- `Shared Runtime Contract`
- `Shared Domain Contract`
- domain-agent entry
- domain-owned authority / runtime controller / delivery system
- `execution plane`
- `deployment shape`

它同时回答三个问题：

1. 四仓当前各自到底处在哪一层。
2. 保留下来的 `host-agent runtime` 部署形态词汇与 provider-backed stage runtime、未来 `managed runtime` 的关系是什么。
3. `MedAutoScience` 这类已经退役外部 companion 的 domain，应如何描述剩余 provenance / audit / parity reference，而不重新制造第二个公开 owner。

## 适用范围

这份合同适用于当前 `OPL` 体系下的统一公开命名与边界表达，覆盖：

- `one-person-lab`
- `med-autoscience`
- `redcube-ai`
- `med-autogrant`

它也约束 `OPL` 对 `MedDeepScientist` 这类已退出默认 domain operation 的旧下层执行 companion 的描述方式。

这份文档冻结的是命名与边界，不宣称当前已经实现：

- 统一共享执行内核
- 平台侧统一托管执行面
- future `Human-in-the-loop` 产品

## 固定控制链

当前推荐长期保持下面这条链：

```text
Human / Agent
  -> OPL stage-led Agent executor framework
      -> Unified Harness Engineering Substrate
          -> Shared Runtime Contract
          -> Shared Domain Contract
              -> Domain-agent entry
                  -> Domain-owned authority / runtime controller / delivery system
                      -> Execution Plane
                          -> Deployment Shape
```

每一层回答不同问题：

- `OPL stage-led Agent executor framework`
  - 默认 session/runtime 语义、stage decomposition、显式 domain-agent activation、admission 语言与边界合同
- `Unified Harness Engineering Substrate`
  - 跨域共享的上位 Harness Engineering 语言
- `Shared Runtime Contract`
  - 跨域共享的长期在线运行合同
- `Shared Domain Contract`
  - 跨域共享的正式行为合同
- `Domain-agent entry`
  - 某个 domain agent 的稳定 app-skill、CLI、MCP 或 product-entry surface
- `Domain-owned authority / runtime controller / delivery system`
  - 某个 domain agent 内部的领域真相、运行控制、治理、审阅与交付系统本体
- `Execution Plane`
  - 真正执行 session、quest、run、worktree、watch、resume 的运行层
- `Deployment Shape`
  - execution plane 运行在哪里、由谁托管、生命周期由谁负责

## 固定术语

| 术语 | 固定定义 | 当前或未来例子 | 明确不是什么 |
| --- | --- | --- | --- |
| `OPL framework runtime + activation` | Codex-default executor、显式 domain-agent activation、provider-backed stage runtime、边界冻结与 admission 语言 | `one-person-lab` | domain-local runtime owner |
| `Unified Harness Engineering Substrate` | 多个 domain 共享的上位 Harness Engineering 语言 | 分层规则、共享原则、合同总名 | 共享执行内核 |
| `Shared Runtime Contract` | 多个 domain 共享的长期在线运行合同 | `runtime profile`、`session substrate`、stage runtime status | domain truth |
| `Shared Domain Contract` | 多个 domain 共享的正式行为合同 | formal-entry matrix、`per-run handle`、durable report、gate semantics | domain object model |
| `Domain Agent Entry` | 某个 domain agent 的稳定 app skill、CLI、MCP 或 product-entry surface | `MedAutoScience`、`MedAutoGrant`、`RedCube AI` | execution engine |
| `Domain-Owned Truth Surface` | 某个 domain agent 的执行、治理、审计与交付真相 | `MedAutoScience`、`MedAutoGrant`、`RedCube AI` | 顶层 OPL runtime |
| `Execution Plane` | 实际驱动 quest、run、session、worktree、watch、resume 的运行层 | MAS monolith closeout 后由 `MedAutoScience` 自己持有的 runtime surface | 顶层公开产品面 |
| `Host-Agent Runtime` | execution plane 的本地宿主部署形态，由本机 host agent 驱动 | 当前 `Codex-default host-agent runtime` | 托管 runtime |
| `Managed Runtime` | execution plane 的平台托管部署形态，生命周期、调度、隔离和恢复由平台负责 | future `managed web runtime` | domain-agent entry |
| `Managed Execution Plane` | 对内架构词，指平台统一托管的 execution plane 本身 | future shared managed execution layer | 当前已经实现的公开主线 |

## 当前四仓定位

| 仓库 | 当前固定定位 | 与 runtime 的关系 |
| --- | --- | --- |
| `one-person-lab` | OPL session/runtime、activation 与 shared indexes 的公开说明面和 contract-first surface | 负责定义语言与边界，不接管 domain truth |
| `med-autoscience` | 独立 medical research domain agent | 拥有医学领域 contract、governance、delivery 与外部 formal entry |
| `redcube-ai` | 独立 visual-deliverable domain agent | 拥有视觉交付领域 contract、governance、delivery 与外部 formal entry |
| `med-autogrant` | 独立 grant-writing domain agent | 拥有基金领域 contract、governance、delivery 与外部 formal entry |

`MedDeepScientist` 不属于 `OPL` 顶层四仓中的一个平级 `domain repo`。
当前更准确的表达是：

- 它不是 MAS 默认 operation、diagnostic、runtime root 或 WebUI 依赖
- 它只作为 MAS 显式声明的 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 与 parity oracle reference 出现
- 它不是 `OPL` 顶层的第五个 domain agent 或 runtime authority
- 它也不是 `MedAutoScience` 的系统本体或公开入口

## `Codex-default host-agent runtime` 与 `managed runtime`

`Host-agent runtime` 是保留下来的 deployment-shape 词汇。当前目标 runtime 口径是 `Codex CLI concrete executor + provider-backed stage runtime`；本节只解释较早的本地部署形态与 future managed 形态，不替代当前目标路径。

### 当前到底是什么

当前 `OPL` 体系下，公开真相是：

- 当前默认本地部署形态是 `Codex-default host-agent runtime`
- 这是一种真实的 runtime
- 但它不是当前意义上的 `managed runtime`

其准确含义是：

- `Codex` 类 agent 作为默认 host 执行者
- execution plane 主要运行在用户机器或受用户控制的本地环境里
- 本地文件系统、工作树、工具、二进制与环境约束仍然是实际运行的一部分
- 长时任务虽然可以被编排、恢复、审计，但生命周期与运维责任还没有被平台完整托管

### 为什么它不等于 `managed runtime`

如果一个 `Codex` 会话在本机上被封装得更稳定、能跑得更久，它仍然首先是 `host-agent runtime`。

要进入这里定义的 `managed runtime`，关键变化不是“模型更强”或“跑得更久”，而是：

- execution plane 由平台统一托管，而不是主要依附用户机器
- session / quest / run 的生命周期由平台负责维持与恢复
- sandbox、工具连接、状态观测、调度与恢复成为正式托管能力
- 用户与 operator 不再需要自己长期照料底层进程、tmux、daemon、机器路径与恢复细节

因此，可以把 `managed runtime` 粗略理解为：

> “平台托管的、可长时间工作的 agent runtime”

但不能把它简化成：

> “只是一个更能长跑的 Codex”

在概念上，真正被托管的是 execution plane，不是某个模型名字。

### 两者的关系

`Host-Agent Runtime` 与 `Managed Runtime` 是同一 execution plane 的两种 deployment shape：

- 当前 shape：`host-agent runtime`
- future shape：`managed runtime`

它们共享的应是同一套：

- domain contract
- formal-entry matrix
- execution handle 语义
- audit / review / delivery contract

变化的只是 execution plane 运行与托管的方式。

## 从当前迁到 future `managed runtime`，到底是从什么迁到什么

当前迁移语义不应理解成“从一个 domain 换到另一个 domain”，也不应理解成“从 Codex 换成别的模型”。

更准确的理解是：

- 从：主要由用户机器承载、由本地 host agent 驱动的 execution plane
- 迁到：主要由平台承载、由平台统一托管生命周期的 execution plane

### 保持不变的部分

迁移到 future `managed runtime` 时，下面这些东西不应被改写：

- `OPL` 顶层 framework 语义
- `Unified Harness Engineering Substrate` 的共享不变量
- `Shared Runtime Contract` 的共享运行对象
- `Shared Domain Contract` 的共享正式行为对象
- public domain-agent entry / domain-owned authority / runtime controller 的边界
- `CLI / MCP / controller` 这类 formal-entry matrix 语义
- `program_id / study_id / quest_id / active_run_id` 这类 execution handle 的语义边界
- domain-owned audit、review、delivery 与 canonical truth 的归属

### 允许变化的部分

真正允许变化的是 execution plane 与 deployment shape：

- 长时进程跑在本机还是平台
- session / quest / run 生命周期由谁负责
- sandbox、工具连接与凭证注入由谁管理
- watch / status / resume / replay 是否成为平台统一能力
- operator 是否还需要盯住本地 daemon、机器路径和手工恢复

如果未来某个 domain 保留上游 `Hermes-Agent` evidence 或显式 `hermes_agent` executor adapter，更准确的描述也应是：

- 它是显式非默认 executor adapter、diagnostic evidence 或 provenance reference
- 它不是 family runtime provider、production substrate 或整个 `UHS`
- 它不替代 `OPL` framework、public domain-agent entry 或 domain-owned authority / runtime controller

### Managed runtime readiness 维度

旧 `managed-runtime-migration-readiness-checklist` 中仍有效的内容已经吸收到这里。后续判断某个 domain 或 family runtime 是否准备进入 managed/runtime-provider 迁移时，使用下面八个维度，而不是继续执行旧清单整文档：

| 维度 | 要回答的问题 | 当前归属 |
| --- | --- | --- |
| `R1 / 命名与 ontology` | legacy federation 词汇、domain、execution plane、deployment shape 是否已经分开 | 本文与核心五件套 |
| `R2 / formal entry` | `CLI`、`MCP`、`controller`、app skill、product entry 是否有层级 | domain onboarding contract 与 domain owner docs |
| `R3 / execution handle` | run、quest、topic、draft、workspace、program 等句柄边界是否稳定 | domain owner docs 与 machine contracts |
| `R4 / durable surface` | audit、review、delivery、status、report 是否有持久 surface | domain owner docs / artifacts / contracts |
| `R5 / hosted-friendly contract extraction` | local/runtime surface 是否能抽成未来 host 必须兼容的 contract bundle | OPL framework + domain repo |
| `R6 / runtime protocol narrowness` | execution plane 是否压到稳定、可审计、可验证的最小协议面 | provider / hosted-integration contracts |
| `R7 / external dependency clearance` | cutover 前依赖的 external runtime、workspace、human gate 是否已清掉 | domain repo owner |
| `R8 / platform-owned lifecycle` | session、watch、resume、replay、sandbox 是否已经由平台/provider 承担 | provider-backed framework / future managed runtime |

当前迁移顺序只保留为内容原则：先冻结 OPL framework 与 provider-backed stage runtime，再做 domain skeleton / handoff / receipt 迁移，随后清 external dependency 和旧面 residue，最后用真实 domain soak 验证。旧清单中的按仓进度判断已经是 dated snapshot，不再作为当前 backlog。

### 迁移后的主要收益

若 future `managed runtime` 成立，收益应主要来自：

- 更低的本机环境耦合
- 更清晰的长时任务生命周期托管
- 更稳定的 status / watch / resume / replay 能力
- 更低的 operator 运维负担
- 更容易承接 future `Human-in-the-loop` sibling 或 upper-layer product

### 迁移不是为了做什么

这类迁移不应被写成：

- 取消 domain-agent entry
- 把 `OPL` 提升成 runtime owner
- 把多个 domain 压成同一个单体 runtime
- 把当前公开真相误写成“已经有统一平台 runtime”

## `MedAutoScience` 与 `MedDeepScientist` 的已替代边界

本节原本描述迁移期 `MedAutoScience` 与外部 `MedDeepScientist` execution plane 的分工。当前 MAS monolith closeout 已经替代这条默认 operation 分工。

当前更准确的结构应写成：

```text
Human / Agent
  -> MedAutoScience
      -> MAS-owned runtime / artifact / quality / progress surfaces
          -> optional source-provenance, historical-fixture, archive-import, backend-audit, upstream-intake, or parity-oracle reference
```

其中：

- `MedAutoScience`
  - 是独立医学研究 domain agent 与 MAS app skill owner
  - 是对外正式入口、领域合同 owner、governance owner、runtime/progress owner 与 delivery owner
  - 持有默认 operation、diagnostic、progress、artifact、quality 与 OPL handoff surface
- `MedDeepScientist`
  - 不是 `MedAutoScience` 之下的默认 execution plane
  - 不是 MAS 默认运行依赖、默认诊断依赖、runtime root 或 WebUI 依赖
  - 只在 MAS 显式声明时作为 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 与 parity oracle reference 出现
  - 不是 `MedAutoScience` 的系统本体
  - 不是 `OPL` 顶层平级 domain

### 五个共享平面的当前分工

| 平面 | `MedAutoScience` 当前职责 | `MedDeepScientist` 剩余角色 |
| --- | --- | --- |
| `资产平面` | 医学 study / workspace / artifact 的领域 contract、canonical asset truth 与 artifact discovery | historical fixture 或 explicit archive import reference |
| `记忆平面` | 可复用医学研究记忆、controller summary、decision history 与 calibration evidence | source provenance 或 upstream intake reference |
| `治理平面` | continue / stop / reframe、publication_eval、controller_decisions、fail-closed gate 与 owner-route truth | 不持有 quality、publication 或 controller authority |
| `交付平面` | manuscript、submission、formal report、delivery contract、package locator 与 rebuild proof | 仅作 historical behavior fixture |
| `执行平面` | 默认 runtime operation、runtime status/progress、controller orchestration、diagnostic 与 OPL handoff | 仅作 parity oracle / backend audit reference |

因此，不应把 `MedDeepScientist` 继续写成 MAS 默认 execution 的当前实现。
更准确的理解是：

- `MedAutoScience` 拥有五个平面的医学领域语义、外部合同和默认 runtime/progress/diagnostic surface
- `MedDeepScientist` 留在默认路径之外，只在 MAS 显式声明时作为 reference 出现

## `MedDeepScientist` monolith absorb 后的固定规则

MAS monolith closeout 已经完成默认依赖退役。仍需固定的规则是：

1. 被吸收的能力不得改变 `MedAutoScience` 的公开身份。
2. MAS 默认 operation 不得要求外部 `MedDeepScientist` checkout、daemon、runtime root 或 WebUI。
3. 可保留行为必须落到 MAS-owned runtime / artifact / quality / progress / diagnostic surface，或者保留为 fixture / provenance / reference 材料。
4. 兼容性回归与 parity proof 可以引用 MDS fixture，但 MDS fixture 永远不能授权 medical quality、publication、controller 或 artifact authority。
5. 未来 upstream intake 必须走 no-history、MAS-authored capability proof，不得把上游 contributor footprint 导入 MAS。

这意味着未来理想结构更接近：

```text
MedAutoScience
  -> controller_charter
  -> runtime
       -> ingested execution engine
  -> eval_hygiene
```

而不是：

```text
MedAutoScience == MedDeepScientist
```

## 边界规则

不要把系统写成：

- `OPL` 是 runtime owner
- `Managed Runtime` 只是“更会长跑的 Codex”
- `MedDeepScientist` 是 `MedAutoScience` 的系统本体
- monorepo ingest 等于 domain-owned authority / runtime controller 与 execution engine 边界消失
- future `managed runtime` 已经是当前 repo-tracked reality

应该把系统写成：

- `OPL` 负责 stage-led framework 语言
- domain repo 负责 domain-owned authority、runtime controller、delivery system 与 artifact truth
- execution engine 负责 execution plane
- `host-agent runtime` 与 `managed runtime` 是 execution plane 的两种 deployment shape
- future migration 只改 execution plane 的托管方式，不改写 domain contract

## 延伸阅读

- [OPL 运行模型](../public/operating-model.zh-CN.md)
- [Unified Harness Engineering Substrate](../public/unified-harness-engineering-substrate.zh-CN.md)
- [OPL Family 开发主参考](./opl-family-development-reference.zh-CN.md)
- [共享运行时合同](./shared-runtime-contract.zh-CN.md)
- [共享领域合同](./shared-domain-contract.zh-CN.md)
- [Codex-default Host-Agent Runtime 合同历史稿](../history/runtime-substrate/host-agent-runtime-contract.md)
- [生态四仓统一状态总表](../references/convergence-governance/ecosystem-status-matrix.md)
