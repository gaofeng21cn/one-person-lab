# OPL 当前状态

## 当前公开角色

- `OPL` 对外公开认知分三层：产品壳、产品家族、当前实现 / 模块。
- `OPL` 是一人课题组的 Codex-native GUI 产品壳与模块管理器。
- `Codex` 是默认交互与执行宿主，也是当前开发宿主；当前活跃执行入口仍是 `Codex-only` 本地会话，未来产品 runtime substrate 方向继续指向先在 domain 仓内证明的上游 `Hermes-Agent` 集成。
- 当前默认入口是 `GUI 产品壳 -> 工作模式选择 -> Codex 对话 / Codex 任务 / 专用 domain agent`。
- GUI 中并列呈现三类工作模式：普通 Codex 对话、通用 Codex 任务、专用智能体模块。
- 产品家族定义长期稳定的工作类型，当前公开家族包括 `Research Foundry`、`Grant Foundry`、`Presentation Ops`、`Thesis Ops`、`Review Ops`。
- 设置面承载模块安装、模块升级、版本 pin、默认模式、模块健康状态、最近验证状态和 online gateway 配置。
- 右侧 workspace 边栏承载人话进度、任务状态与交付文件视图。
- `OPL` 持有 family-level GUI、模块目录、shared helper 与 machine-readable contract；domain runtime ownership 继续留在各自仓库。
- `Hermes-Agent` 是显式备用模式与在线网关，用于远端运行、替代长时会话和 external kernel 验证。
- `MAS`、`MAG`、`RCA` 是当前活跃 domain agent 模块；thesis 与 review 模块保持定义阶段。

## 当前产品入口

- 当前产品入口真相：`OPL` 已经落下本地 direct product-entry shell，默认前门是 `opl`。
- `Hermes Kernel Integration` 的冻结选择是 `external kernel, managed by OPL product packaging`。
- 这条产品入口路径把用户留在 `OPL` 壳里，不要求用户先手工安装并理解 `Hermes-Agent`。
- 家族级入口真相继续分成 `operator entry`、`agent entry`、`product entry` 三层。
- 家族默认执行器继续冻结在 `Codex CLI autonomous`，沿用本地 `Codex` 默认配置。
- `Hermes-native` 继续只作为实验路线存在，目标是完整的 Hermes AIAgent agent loop，不是一条 chat relay，也不是一步一步 chat。
- `opl frontdesk bootstrap --path <workspace>` 准备本地 `OPL Atlas` Desktop 壳，并把当前 workspace 接入 `OPL` 模块与项目 registry。
- `opl web` 是同一产品壳的本地浏览器 companion surface。
- `opl`、`opl "<request...>"`、`opl start --project <project_id> [--mode <mode_id>]`、`opl doctor`、`opl ask`、`opl chat` 与 `opl web` 共同组成当前顶层产品前门。
- `opl frontdesk-librechat-install|status|start|stop|open` 与 `opl frontdesk-librechat-package` 保留为 hidden compatibility surface，默认入口保持 GUI 主路径。
- `opl ask` 默认走 `Codex`；`opl chat`、`opl resume`、显式 executor 配置和 GUI 模式切换可以进入 `Hermes-Agent` 备用在线路径。
- 当前 grouped command matrix 已经固定成：
  - `contract ...`：`validate|workstreams|workstream|domains|domain|surfaces|surface|handoff-envelope`
  - `domain ...`：`manifests|launch|resolve-request|explain-boundary`
  - `status ...`：`workspace|runtime|dashboard`
  - `workspace ...`：`projects|list|bind|activate|archive`
  - `frontdesk ...`：`manifest|entry-guide|readiness|domain-wiring|hosted-bundle|hosted-package|service *|bootstrap`
  - `session ...`：`list|resume|logs|ledger`
  - `runtime repair-gateway`
- GUI 的任务边栏应把 progress 状态和 files 交付区投射到当前 workspace。
- `opl <request...>` 继续作为同一入口之上的 quick ask 路径。
- 本地 web front desk pilot 已经落地；hosted / web 前台真相：`LibreChat-first` pilot 仍未落地为最终托管前台，比较基线包含 `Chatbot UI`、`LibreChat`、`Open WebUI` 与 `LobeChat`。

## GUI 工作模式

| 模式 | 默认执行者 | 主要用途 | 状态 |
| --- | --- | --- | --- |
| 普通 Codex 对话 | Codex | 讨论、解释、阅读、计划、轻量分析 | 默认 GUI 模式 |
| 通用 Codex 任务 | Codex task runner | 本地文件工作、命令执行、验证、多步任务 | 默认执行模式 |
| 专用智能体模块 | `MAS`、`MAG`、`RCA` | 医学科研、基金写作、视觉交付 | 活跃模块家族 |

`Hermes-Agent` 通过显式备用入口进入，作为 online gateway 和 alternate runtime lane。

## 当前产品家族

| 产品家族 | 当前实现 | 当前覆盖范围 | 公开状态 |
| --- | --- | --- | --- |
| `Research Foundry` | `MAS / Med Auto Science` | 医学科研、证据整理、稿件交付 | 活跃 |
| `Grant Foundry` | `MAG / Med Auto Grant` | 医学基金方向判断、申请书写作、作者侧模拟评审 | 活跃仓线，顶层 admission / handoff wording 单独门控 |
| `Presentation Ops` | `RCA / RedCube AI` | 汇报、讲课、幻灯片与视觉交付 | 活跃 |
| `Thesis Ops` | Planned | 学位论文装配与答辩准备 | 定义阶段 |
| `Review Ops` | Planned | 审稿、回复与修回 | 定义阶段 |

## 当前实现与模块

| 模块 | 仓库 | 用户面职责 | 当前状态 |
| --- | --- | --- | --- |
| `MAS` | `Med Auto Science` | 医学科研、证据整理、论文交付 | 活跃 |
| `MAG` | `Med Auto Grant` | 基金申请、申请书写作与作者侧基金工作 | 活跃 |
| `RCA` | `RedCube AI` | 汇报、幻灯片、视觉交付 | 活跃 |
| thesis module | Planned | 学位论文与答辩准备 | 定义阶段 |
| review module | Planned | 审稿、回复和修回 | 定义阶段 |

## 当前技术基线

- AI / 维护者核心工作集：`project / architecture / invariants / decisions / status`。
- 对外公开 docs：`README*`、`docs/README*`、路线图、任务版图、运行模型和 UHS 文档。
- 机器合同：`contracts/` 保留 machine-readable contract surface。
- 参考级材料：`docs/references/` 承接实现记录、基准、推进板和边界说明。
- 历史执行与迁移材料：从 `docs/history/omx/` 进入。
- 公开联邦冻结面继续是 `Minimal admitted-domain federation activation package`，当前只覆盖 `MedAutoScience` 与 `RedCube AI` 两条已 admitted domain surface；formal entry 保持在本地 `TypeScript CLI`-first / gateway contract surface，runtime ownership 继续留在 admitted domain 一侧。
- `Grant Foundry -> Med Auto Grant` 已经是活跃的医学 `Grant Ops` 业务仓路径；在 `OPL` 顶层，它的 federation admission 与 handoff wording 继续单独门控。

## 当前阶段

- 把公开品牌主线稳定为 `产品壳 + 产品家族 + 当前实现 / 模块`。
- 把 GUI 三类工作模式固定为普通 Codex 对话、通用 Codex 任务、专用智能体模块。
- 把 `Research Foundry`、`Grant Foundry`、`Presentation Ops`、`Thesis Ops`、`Review Ops` 固定为用户可理解的产品家族层。
- 把设置面推进成模块安装、升级、版本 pin、健康状态、默认模式和 online gateway 配置的统一入口。
- 把右侧边栏推进成人话 progress + files deliverables 的统一入口。
- 把 `MAS`、`MAG`、`RCA` 的 module readiness、启动入口、最近运行状态和升级状态统一投射到 `OPL`。
- 把 `Hermes-Agent` 明确放在备用模式与在线网关位置。
- 保持各专用智能体的专业能力和仓库事实由各自项目维护。
- 顶层执行主线继续定位成 front desk / hosted runtime hardening，加上条件触发的 central sync follow-on；当前顶层 honest state 是 central sync stop，直到 admitted-domain 仓再次吸收新 delta 或中央 reference surface 再次漂移。

## 下一阶段

1. 统一公开首页、docs 索引、状态页与架构图里的 `产品壳 -> 产品家族 -> 当前实现` 叙事。
2. 继续把 settings surface 做成模块管理、升级提示、版本 pin 和运行观察的主入口。
3. 将 `MAS`、`MAG`、`RCA` 的 readiness 与最近运行入口投射到同一模块目录。
4. 让 Hermes-Agent online gateway 只通过显式配置和显式模式切换出现。
5. 维持 `Codex` 作为普通对话与通用任务的默认执行者。
6. 让参考级与历史迁移文档留在 `docs/references/`、`docs/specs/`、`docs/plans/` 和 `docs/history/`。

## 参考锚点

- `docs/references/family-orchestration-contract-absorb-crewai.md`
- `docs/references/family-lightweight-direct-entry-rollout-board.md`
- `docs/references/opl-frontdesk-delivery-board.md`
- `docs/references/opl-phase-2-central-reference-sync-board.md`

## 长线目标

- 让 `OPL` 成为一人课题组使用 Codex 与多个专用智能体的统一 GUI。
- 让模块安装、模块升级、版本 pin、健康状态、默认模式和 online gateway 配置集中到 settings。
- 让普通对话、通用任务与专用智能体模块在同一产品壳里并列可选。
- 让各专用智能体保持各自专业边界，同时共享 `OPL` 的入口、目录、状态和升级面。
- 让 `Hermes-Agent` 作为在线网关和备用运行路径服务需要远端或替代 runtime 的工作。

## 默认验证

- 默认最小验证：`scripts/verify.sh`
- meta 验证：`scripts/verify.sh meta`
- full 验证：`scripts/verify.sh full`
