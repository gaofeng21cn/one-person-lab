# OPL 家族用户面成熟度路线图

更新时间：`2026-04-13`

## 目的

- 这份文档只从用户视角衡量 `OPL / MedAutoScience / MedAutoGrant / RedCube AI` 的成熟度，不用 runtime 集成深度替代“能不能用、好不好用”。
- 它回答四个问题：用户从哪里进入、当前能做哪几步、在哪一层会停住、下一棒应该先补什么。
- 本轮统一基线是：三个业务仓的 machine-readable `product-entry manifest` 不再只暴露 `operator_loop_surface`，还要显式暴露 `operator_loop_actions`；`OPL` 顶层的 `domain-manifests / dashboard / handoff-envelope / web front desk` 要同步消费这层动作面。

## 家族理想形态

- 顶层 `OPL` 是 family-level product entry：用户可以直接用 `opl` 或 web front desk 进入，不需要先借 `Codex` 才能调用家族能力。
- 每个 domain 仓都提供自己的 lightweight direct entry：用户既可以从 `OPL` handoff 进入，也可以直接进入某个 domain。
- 每个 direct entry 都要对外冻结同一组用户面 contract：
  - `formal_entry`
  - `recommended_shell / recommended_command`
  - `operator_loop_surface`
  - `operator_loop_actions`
  - `progress / resume / logs / handoff` 所依赖的 durable return surfaces
- 用户不需要猜“下一步该输什么命令”或“哪个 surface 才是当前正式入口”；系统应直接给出当前回路、下一步动作和续跑方式。
- 托管态与 web 前台只建立在 truthful 的 local/direct loop 之上，不允许拿尚未稳定的 runtime 或假集成前台冒充产品完成态。

## 用户面成熟度梯子

| 阶段 | 名称 | 用户看到什么 | 最低合同要求 |
| --- | --- | --- | --- |
| `S1` | 可发现入口 | 知道正式入口是什么，不再靠口头约定 | `formal_entry`、`recommended_command`、最小 manifest |
| `S2` | 可执行当前回路 | 知道当前主循环是什么、下一步能做什么 | `operator_loop_surface`、`operator_loop_actions` |
| `S3` | 可持续续跑 | 同一任务可以恢复、看进度、看 handoff，不会每次重新猜状态 | durable session/progress surface、resume/handoff contract |
| `S4` | 直接产品前台 | 用户可以直接进入本仓产品壳，尽量不碰底层 controller 命令 | local front desk / mature direct shell / cockpit |
| `S5` | 托管运营态 | 有 hosted/web 前台、会话与工作区管理、可观测与运维面 | hosted runtime、managed session/workspace governance |

## 本轮统一动作

- `MedAutoScience` 的 manifest 新增了 `open_loop / submit_task / continue_study / inspect_progress`。
- `MedAutoGrant` 的 manifest 新增了 `open_loop / inspect_progress / inspect_cockpit / build_direct_entry`。
- `RedCube AI` 的 manifest 新增了 `start_deliverable / continue_session / federated_handoff`。
- `OPL` 顶层现在会把这些 `operator_loop_actions` 继续透传到：
  - `domain-manifests`
  - `dashboard.front_desk.recommended_entry_surfaces`
  - `handoff-envelope`
  - `opl web` 的 front desk project cards

## 四仓当前落点

| 仓库 | 当前落点 | 已经对用户成立的事实 | 还没成立的事实 | 下一棒 |
| --- | --- | --- | --- | --- |
| `OPL` | `S4` 前段 | `opl`、`opl web`、workspace/session/handoff 管理面都已存在，用户已经可以不经 `Codex` 直接进入顶层壳 | managed hosted runtime 还没落地，family frontdesk-domain wiring 还未完全压实 | 继续做 hosted runtime hardening、family frontdesk 到 domain direct entry 的稳定联动 |
| `MedAutoScience` | `S2 -> S3` | 用户已经能看到 `workspace-cockpit` 主回路，并能下任务、启动、续跑、看进度 | 独立医学产品前台还没落地；真实执行仍经受控 `MedDeepScientist` backend | 先继续把真实研究回路在手工测试中压稳，再决定如何把 front desk 从 shell 推到更完整入口 |
| `MedAutoGrant` | `S3` | 用户已经有 `grant-user-loop`、`grant-direct-entry`、`grant-progress`、`grant-cockpit`，也有 direct / `OPL` handoff envelope | 成熟 grant-facing front desk 还没落地；authoring 执行器的产品态 UX 还不够顺手 | 用同一套 `operator_loop_actions` 继续把 direct grant 前台收口，不新造第二套 executor 协议 |
| `RedCube AI` | `S3` | 用户已经能 `invoke`、`session`、`federate`，同一交付的会话连续性也已落地 | 成熟 end-user shell 与 managed web productization 还没落地 | 在现有 manifest / session continuity 之上继续补成熟 product shell 与更直接的前台壳 |

## 当前统一短板

1. 四仓都已经有“入口”，但只有 `OPL` 真正跨过了“直接前台”这一步；三个业务仓仍主要是 lightweight direct shell。
2. 三个业务仓都已能告诉用户“当前 loop 是什么”，但还没有都做到“用户几乎不需要再碰底层命令”。
3. hosted / web 态仍主要集中在 `OPL` 顶层，三个业务仓的 direct front desk 还没有完全成熟。
4. `MedAutoScience` 的用户面成熟度还受真实研究 runtime 与手工测试门控影响，不能靠文档推进替代真实验证。

## 接下来的推进顺序

1. 先维持这轮统一真相：所有 domain manifest 都必须继续带 `operator_loop_actions`，`OPL` 顶层所有 discovery / dashboard / handoff surface 都继续消费它。
2. 再把 `OPL` 继续往 `S5` 推：重点是 hosted runtime hardening 与 family front desk 的 domain wiring。
3. 同时让 `MedAutoGrant` 与 `RedCube AI` 往 `S4` 推：把现有 shell 收成更像产品前台的 direct loop，而不是继续堆 controller 命令。
4. `MedAutoScience` 先以真实研究回路稳定性为先：主线不是继续发明新前台，而是把已有 loop 在真实 study 上压稳，再决定前台壳的提升顺序。

## 这一页不做什么

- 不改写 runtime owner 归属。
- 不把 repo-local helper 写成成熟 hosted runtime。
- 不因为三仓都开始讲前台，就强行把它们改成同一种执行内核。
