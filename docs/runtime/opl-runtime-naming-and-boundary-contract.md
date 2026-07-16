# OPL Runtime 命名与边界合同

Owner: `One Person Lab`
Purpose: `runtime_naming_boundary_support`
State: `active_support`
Machine boundary: 本文是人读 runtime 命名与边界合同。机器 truth 继续归 `contracts/`、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和 semantic `human_doc:*` ids。

> Currentness policy：本文冻结 runtime 命名与 owner boundary，不冻结日期、receipt id、provider proof snapshot、worklist counter、branch/SHA state 或本机 binary 诊断。当前 family 状态从 `docs/active/current-state-vs-ideal-gap.md`、核心五件套、contracts/source/tests、runtime ledger、`opl framework readiness --family-defaults --json`、`opl stages readiness --family-defaults --json`、`opl agents conformance --family-defaults --json`、`opl agents default-callers --family-defaults --json`、`opl family-runtime evidence-worklist --family-defaults --provider temporal --executor-kind codex_cli --detail summary --json` 与 `opl runtime app-operator-drilldown --json` 读取。稳定边界保持为：`Codex CLI` 是第一公民 executor；需要 durable orchestration 时进入 provider-backed stage runtime / stage-attempt request/projection；Temporal-backed provider 是 production online runtime 的必需 substrate；Codex App / App workbench 消费 refs-only projection，只负责启动、观察、介入和展示；MAS/MAG/RCA 持有 domain truth、memory body、artifact body、owner receipt、quality/export verdict 与直接 app skill 路径；`opl-meta-agent` 是 OPL-compatible Foundry Agent / new-agent builder，不持有 MAS/MAG/RCA truth；`MedDeepScientist` 只按 MAS 显式声明保留为 provenance / fixture / archive import / backend audit / upstream intake / parity oracle reference。

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

1. OPL family 当前各 repo 到底处在哪一层。
2. 保留下来的 `host-agent runtime` 部署形态词汇与 provider-backed stage runtime、未来 `managed runtime` 的关系是什么。
3. `MedAutoScience` 这类已经退役外部 companion 的 domain，应如何描述剩余 provenance / audit / parity reference，而不重新制造第二个公开 owner。

## 适用范围

这份合同适用于当前 `OPL` 体系下的统一公开命名与边界表达，覆盖默认维护巡检中的 OPL family repo：

- `one-person-lab`
- `one-person-lab-app`
- `opl-native-workbench`
- `opl-flow`
- `opl-doc`
- `med-autoscience`
- `med-autogrant`
- `redcube-ai`
- `opl-meta-agent`
- `opl-bookforge`
- `mas-scholar-skills`

它也约束 `OPL` 对 `MedDeepScientist` 这类已退出默认 domain operation 的旧下层执行 companion 的描述方式。

这份文档冻结的是命名与边界，不宣称当前已经实现：

- 统一共享执行内核
- future fully platform-managed web execution plane
- future `Human-in-the-loop` 产品
- MAS/MAG/RCA/OMA/OBF domain ready、artifact ready、quality/export verdict 或 family production ready

## Temporal / worker lifecycle 边界

长期口径必须把 durable orchestration、worker service lifecycle、OPL runtime projection 和 domain truth 分开：

- Temporal Server / Cloud 负责 workflow state/history、timer、retry/timeout、task queue、signal/query/update、visibility 和 replay。
- Temporal 不负责让 OPL worker process 永久在线，也不负责 worker binary/source dependency readiness、service restart、扩缩容或 rolling deployment。
- OPL Runway 负责 provider readiness、worker lifecycle/readiness projection、managed process/crash diagnostic、queue/attempt ledger、SLO health、repair action、dead-letter 和 runtime blocker。
- Worker service 的常驻、保活、重启和扩缩容必须由 deployment substrate 承担：本地/小型安装可以是 launchd、systemd 或 Docker Compose；生产形态应是 Kubernetes、ECS 或等价托管服务。
- LaunchAgent / 300 秒 cadence 只能作为 local/small-install fallback 或 diagnostic，不是 production online runtime topology。
- SLO watchdog 只做 health check、bounded repair trigger 和 fail-closed 投影；它不替代 worker supervisor，不替代 Temporal durable orchestration，也不替代 MAS/MAG/RCA 的 domain progress。
- MAS/MAG/RCA 继续持有 domain truth、owner receipt、typed blocker、artifact body、memory body 与 quality/export verdict；worker ready、queue succeeded、provider completed 或 SLO repaired 都不得被写成 domain ready。

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
| `Execution Plane` | 实际驱动 quest、run、session、worktree、watch、resume 的运行层 | OPL/Temporal hosted autonomous stage runtime；Codex CLI 作为默认 executor | 顶层公开产品面 |
| `Host-Agent Runtime` | execution plane 的本地宿主部署形态，由本机 host agent 驱动 | Codex-default interactive ask/exec/resume 与 dev/offline diagnostic baseline | production online substrate 或 fully managed web runtime |
| `Managed Runtime` | execution plane 的平台托管部署形态，生命周期、调度、隔离和恢复由平台负责 | future `managed web runtime` | domain-agent entry |
| `Managed Execution Plane` | 对内架构词，指平台统一托管的 execution plane 本身 | future shared managed execution layer | 当前已经实现的公开主线 |

## 当前 family 定位

| 仓库 | 当前固定定位 | 与 runtime 的关系 |
| --- | --- | --- |
| `one-person-lab` | OPL Framework；session/runtime、provider、FoundryRun、evaluation、evidence、version、activation/rollback 与 shared indexes 的 contract-first surface | 定义并运行 framework runtime / projection / safe action shell；不接管 domain truth |
| `one-person-lab-app` | One Person Lab App / workbench | 消费 framework/provider 状态和 domain-owned projection；不驱动外围长跑任务，不生成 release-ready / production-ready verdict |
| `med-autoscience` | 独立 medical research Foundry Agent | 拥有医学领域 truth、publication quality、artifact authority、owner receipt 与 direct skill path |
| `med-autogrant` | 独立 grant-writing Foundry Agent | 拥有基金领域 truth、fundability/export verdict、artifact authority、owner receipt 与 direct skill path |
| `redcube-ai` | 独立 visual-deliverable Foundry Agent | 拥有视觉交付 truth、visual/export verdict、artifact authority、owner receipt 与 direct skill path |
| `opl-meta-agent` | OMA Agent engineering semantic provider | 消费 `DesignRequest` / `EvidenceBundle`，生成 `AgentBlueprint` / `EvalSpec` 或 `EvolutionProposal`；不持有 FoundryRun state、评测执行、版本/激活或 target-domain truth |

`MedDeepScientist` 不属于 `OPL` 顶层 family 中的一个平级 `domain repo`。
当前更准确的表达是：

- 它不是 MAS 默认 operation、diagnostic、runtime root 或 WebUI 依赖
- 它只作为 MAS 显式声明的 source provenance、historical fixture、explicit archive import、backend audit、upstream intake 与 parity oracle reference 出现
- 它不是 `OPL` 顶层的第五个 domain agent 或 runtime authority
- 它也不是 `MedAutoScience` 的系统本体或公开入口

## `Codex-default host-agent runtime` 与 `managed runtime`

`Host-agent runtime` 是保留下来的 deployment-shape 词汇。当前目标 runtime 口径是 `Codex CLI concrete executor + provider-backed stage runtime`；本节只解释较早的本地部署形态与 future managed 形态，不替代当前目标路径。

### 当前到底是什么

当前 `OPL` 体系下，公开真相是：

- 普通 ask / exec / resume 的具体 executor 仍是 `Codex CLI`
- 标准 OPL Agent 长跑任务默认进入 `opl_temporal_hosted_autonomous`
- Temporal-backed provider 是 production online runtime 的必需 substrate
- Codex App 只承担启动、观察、介入和展示，不承担外围持续驱动任务
- `host-agent runtime` 是保留下来的本地宿主部署形态词汇，不是当前 production online substrate，也不是 future fully managed web runtime

其准确含义是：

- `Codex` 类 agent 作为默认 host 执行者
- execution plane 主要运行在用户机器或受用户控制的本地环境里
- 本地文件系统、工作树、工具、二进制与环境约束仍然是实际运行的一部分
- dev / CI / offline diagnostic 可以使用本地形态；production online 长跑路径必须由 OPL/Temporal provider 承担

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

`Host-Agent Runtime`、OPL/Temporal hosted autonomous runtime 与 future `Managed Runtime` 都是 execution plane 的部署/承载形态词汇：

- 当前 production online shape：`OPL/Temporal hosted autonomous stage runtime`
- 当前 interactive / dev diagnostic shape：`host-agent runtime`
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

- `OPL` 是 domain truth runtime owner，或能写 domain artifact / publication gate / current package
- `Managed Runtime` 只是“更会长跑的 Codex”
- `MedDeepScientist` 是 `MedAutoScience` 的系统本体
- monorepo ingest 等于 domain-owned authority / runtime controller 与 execution engine 边界消失
- future `managed runtime` 已经是当前 repo-tracked reality

应该把系统写成：

- `OPL` 负责 stage-led framework 语言，并持有 generic runtime queue、attempt ledger、liveness、provider wakeup、redrive/retry/dead-letter 等 framework control-plane
- domain repo 负责 domain-owned authority、domain route decision、owner receipt、quality gate、delivery system 与 artifact truth
- execution engine 负责 execution plane
- `host-agent runtime` 与 `managed runtime` 是 execution plane 的两种 deployment shape
- future migration 只改 execution plane 的托管方式，不改写 domain contract

## 延伸阅读

- [OPL 运行模型](../public/operating-model.md)
- [Unified Harness Engineering Substrate](../public/unified-harness-engineering-substrate.md)
- [OPL Family 开发主参考](../active/opl-family-development-reference.md)
- [共享运行时合同](../specs/shared-runtime-contract.md)
- [共享领域合同](../specs/shared-domain-contract.md)
- [Codex-default Host-Agent Runtime 合同历史稿](../history/runtime-substrate/host-agent-runtime-contract.md)
- [Convergence Governance 过程归档](../history/process/convergence-governance/README.md)
