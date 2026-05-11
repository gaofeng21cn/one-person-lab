# OPL 项目概览

## 项目是什么

对外公开时，`One Person Lab` (`OPL`) 是面向高价值知识工作的完整智能体运行框架。它以 Codex 优先、阶段推进为核心原则：大型任务按接近人类专家实施的阶段推进，`Codex CLI` 是阶段内默认的最小执行单元，OPL 负责让这些阶段可发现、可恢复、可审计、可投影，并以全自动交付为目标逐步补齐生产级运行能力。
OPL 可以使用外部运行时 provider，但框架边界由本仓持有：`Codex-default session runtime`、显式 `domain-agent activation` 层、provider-backed family runtime control plane，以及可选 GUI/API shells 背后的 shared projection/contract 层。
当前仓库跟踪：

- `opl` / `opl exec` / `opl resume` 这组 CLI / shell 前门
- Codex-default session/runtime 路径
- domain-agent activation / dispatch 规格
- stage descriptor、domain memory locator、handoff envelope、receipt、projection 与 authority boundary 这组 family-level stage control 语言
- `OPL Runtime Manager` 产品控制面：把 family runtime provider 纳入 OPL 产品级 profile、typed family queue、domain dispatch、任务注册、诊断和状态投影；Temporal-backed provider 是当前生产 substrate 候选，Hermes/local provider 是迁移期 legacy/optional provider
- 智能体运行外围能力：stage attempt ledger、typed queue、checkpoint/closeout/receipt、artifact index、file lifecycle、retention、restore proof、migration ledger、workspace lifecycle、human gate / resume token 和 operator projection
- 统一 `domain-agent skeleton`：domain 仓按 `agent/`、`contracts/`、`runtime/`、`docs/` 暴露 stage、prompt、Skill、domain-owned knowledge/memory locator、quality gate、sidecar、receipt schema、projection builder 和 artifact locator contract；真实运行产物必须落在 workspace / runtime artifact root，不落在开发仓源码目录
- 执行引擎与模块注册表
- 工作空间、会话、进度、交付物等接口面
- 跨仓共享的模块、机器可读合同与可发现索引
- OPL-branded AionUI GUI/WebUI 使用的 runtime/release surface

图形界面外壳继续放在独立的界面仓中维护。
各个领域仓继续作为独立 `domain agent` 仓，持有自己的 stage 语义、prompt、skill、领域逻辑、质量 gate、truth reducer、运行规则与交付物真相。

## 当前产品层级

`OPL` 当前对外使用三层结构组织产品认知：

1. 默认运行时层
   `OPL` 以 `Codex-default session runtime` 组织 `system / engines / modules / agents / workspaces / sessions / progress / artifacts` 这组顶层产品资源。
2. 显式激活与在线控制面
   `OPL` 负责 family skill pack 注册与同步、typed family queue、shared dispatch、family-level shared surfaces，以及把调用映射到各个 admitted domain 仓的稳定 capability surface；family runtime provider 提供 24h durable stage-attempt substrate。
3. 可选外壳与投影层
   GUI shell 与其他兼容层继续围绕同一套 runtime/activation truth 做展示与投影，而不是重新定义默认交互合同。

其中 `OPL Runtime Manager` 位于默认运行时层与显式激活层之间。它是产品级管理/投影层，不是新的 domain runtime kernel：默认具体 executor 仍归 `Codex` 或 domain route；Temporal-backed provider 的目标职责是 durable workflow、activity retry/timeout、signal/query、history 与恢复；Hermes-Agent 在迁移期只保留 legacy/optional provider 或 executor/proof lane。`OPL Runtime Manager` 负责把 provider profile、typed family queue、domain task registration、诊断、恢复入口、可选 native helper 与高频状态索引统一投影进 `sessions / progress / artifacts / attention queue`。

## 项目目标

- 把 `OPL` 建成完整的 Codex-first、stage-led 智能体运行框架，支撑高价值知识工作的全自动交付
- 让大型任务按接近人类专家的阶段推进：界定目标、准备材料、执行、审核、修订、交付收口，并把每个阶段变成可恢复、可审计、可追踪的工作单元
- 把 `Codex CLI` 固定为阶段内默认最小执行单元，同时允许 provider 层承担 durable orchestration、retry、human gate、query 和 history
- 给 `opl`、`opl exec`、`opl resume`、直接 `Codex` 使用和外部壳提供稳定一致的 Codex-default session/runtime 合同
- 冻结 `OPL Runtime Manager` 的产品控制面合同，让 OPL 能管理 provider-backed family runtime，而不复制一套 domain scheduler/session/memory kernel
- 把 MAS 已验证的 SQLite / file lifecycle / restore proof / retention / artifact index 经验上收成 OPL framework primitives，并让 MAG/RCA 等 domain agent 可复用
- 推进 MAS/MAG/RCA 按统一 domain-agent skeleton 做 descriptor、sidecar、receipt schema、projection builder、artifact locator contract 和 repo-source 目录结构收敛；业务内部允许保持领域差异
- 让 `opl install` 默认走 Codex + family runtime provider + MAS/MAG/RCA domain modules + 推荐 companion tools；`--no-online-runtime` 只用于开发/离线 degraded diagnostics
- 以 contract-first 方式规划 `OPL native helper` 与高频文件/状态索引：只做系统探测、artifact discovery、状态投影加速，不替代 domain-owned durable truth
- 把 domain app 以可同步的 skill pack 与稳定 contract 接入统一 activation layer
- 统一管理执行引擎、模块、工作空间、会话、进度与交付物
- 维护 family-level shared modules、shared contracts 与 shared indexes
- 让 OPL-branded AionUI GUI/WebUI 作为用户可见外壳，复用同一套 runtime/activation truth
- 明确 `OPL` 与各个独立 `domain agent` 仓的边界
- 保持公开文档、网关合同与已收录领域状态一致

## 作用边界

- `OPL` 负责 Codex-default session/runtime、activation layer、release distribution surface，以及 shared modules / contracts / indexes
- `OPL` 负责把 domain stage 表达成可发现、可恢复、可审计的 family-level work unit；stage 内部的专家拆解、创作、审核、修订和最终质量判断由 domain agent 与 `Codex CLI` 执行
- `OPL` 负责发现和投影 domain-owned memory locator、stage `knowledge_refs` 与 writeback receipt refs；memory 正文、写回接受/拒绝、route 判断、quality verdict 和 artifact authority 继续由 domain agent 持有
- `OPL` 负责智能体运行外围：attempt、queue、checkpoint、receipt、artifact index、file lifecycle、retention、restore proof、workspace lifecycle、human gate 和 operator projection
- `OPL` 负责定义并验证 standard domain-agent skeleton；domain repo 负责把自身 stage、prompt、Skill、knowledge、quality gate、domain truth authority refs 和 artifact locator contract 映射到这个 skeleton
- `OPL Runtime Manager` 负责 family runtime provider provisioning、profile wiring、typed family queue、task registration hydration、diagnostics、status projection、native helper catalog 与 state index catalog
- `OPL Runtime Manager` 不拥有 domain truth、domain quality authority、artifact gate、publication/package gate 或 concrete executor
- Full OPL family readiness 要求已配置的 family runtime provider ready。Temporal-backed provider 是生产目标；Hermes gateway readiness 只在迁移期作为 legacy/optional provider readiness 信号保留
- `OPL` 的默认具体 executor 仍是 `Codex`
- `Hermes-Agent` 不再是新的目标默认 session/wakeup substrate；它保留为 legacy/optional provider 或 route-selected executor/proof lane
- family runtime provider 缺失或未 ready 表示 Full OPL readiness degraded；本地 CLI/status/manifest 可以继续报告诊断，但完整在线能力未通过
- `OPL` 不持有领域运行时所有权
- `OPL` 不替代各个领域仓的智能体逻辑
- 外部界面仓负责 GUI 外壳；当前仓库只跟踪产品运行时与接口真相
- `Med Auto Science`、`Med Auto Grant`、`RedCube AI` 等仓继续是独立 `domain agent`
- 这些 `domain agent` 通过本地 CLI、程序/脚本与 repo-tracked contract 暴露稳定 capability surface；它们既可以通过 `OPL` activation 调用，也可以被 `Codex` 直接调用，工作逻辑保持一致
- `MAS`、`MAG`、`RCA` 可以作为运行在 OPL family framework 上的 domain agents 被托管、唤醒和投影，但不是 OPL 内部模块；direct Codex app skill 调用仍是一等入口
- `gateway / harness` 继续作为各 domain 仓内部的边界层语言存在，但不再是顶层公开主语
- `frontdoor`、gateway-first、federation-first、Hermes-first 和旧 Product API 计划只在 history、compatibility、diagnostic 或 superseded reference 语境中出现；active docs 不把这些路线写成当前产品入口或目标 topology

## 默认入口

建议阅读顺序：

1. `README.md`
2. `docs/README.md`
3. `docs/status.md`
4. `docs/project.md`
5. `docs/architecture.md`
6. `docs/invariants.md`
7. `contracts/README.md`

## 核心公开面

- 顶层叙事：`README*`、`docs/README*` 与 `docs/public/`
- 当前接口与合同入口：`contracts/README.md`、`docs/active/opl-public-surface-index*`、`docs/active/` 与 `docs/specs/` 下仍生效的 runtime / product-boundary 规格
- 旧 gateway-first 语料：人读材料已经进入 `docs/history/compatibility/gateway-federation/`；机器可读兼容合同继续在 `contracts/opl-framework/*`
- 参考与历史：`docs/references/`、`docs/history/` 与 `docs/docs_portfolio_consolidation.md`
