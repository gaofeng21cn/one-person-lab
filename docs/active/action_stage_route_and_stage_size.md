# Action-to-Stage 路由与 Stage 规模原则

Owner: `OPL Stagecraft`
Purpose: `action_stage_route_and_stage_size`
State: `active_support`
Machine boundary: 本文是人读设计原则。机器真相归 `family-action-catalog.v2.actions[].execution_binding`、`family-action-catalog.v2.actions[].stage_route`、`family-stage-control-plane.v1`、`opl agents run` 及其 contracts、source 和 tests。

## 结论

Stage 大小按“一个主要开放语义判断”划分，不按文件数、receipt 数或工具调用数划分。同一判断派生的文件物化、schema 校验、readback 和机械 receipt 留在 Stage 内；拥有不同知识、owner、quality gate 或失败路由的独立判断才拆成新的顶层 Stage。

Action 不能再只声明“哪些 Stage 允许它”，还可以声明一条可执行的 `stage_route`：

- `required_stage_refs` 是 Action 的推荐质量上下文与常规路线，不是 launch gate；
- `optional_stage_refs` 表达同一目标内的条件分支或有界修订，与 required refs 一样不约束 Codex 的实际 route；
- `terminal_stage_refs` 是该 Action 的推荐结束或交棒位置，不限制 Codex 从其他 declared stage 结束本轮；
- `route_policy=ai_selected_progress_route` 以声明 stage 集合作为拓扑边界；Codex CLI 可按语义判断进入下一 stage 或携带证据 route-back 到任一已声明 stage，重复进入上游 stage 属于正常迭代。

declarative manifest 可以从 route-free Pack 渐进迁移：没有 mutating Action 声明 route 时维持既有 launch；一旦任一 mutating Action 声明 route，全部 mutating Action 都必须声明。read-only Action 只观察当前 Stage，不伪装成要执行的多 Stage workflow，其可观察范围继续由 Stage `allowed_action_refs` 表达。OPL 会校验 Stage ref 存在性、action allow-list 双向一致和 route 声明自洽性，并把 route 作为质量上下文投影到 generated interfaces；这些检查不构成 stage launch admission。

唯一例外是 `stage_route_exempt=domain_handler_target_only`：它只适用于 mutating 的内部 domain handler target，必须没有 `stage_route`、不得被任何 Stage 的 `allowed_action_refs` 引用，并且只能声明 `descriptor_only=true`、`public_runtime=false` 的 MCP target。它保留在 family action catalog 和 product-entry 元数据中，供 OPL-hosted handler 定位；不会进入 Stage admission、`action_stage_routes` 或生成的 CLI、Skill、OpenAI、AI SDK 执行入口。

## Progress-first 边界

route 合同不是第二套 scheduler，也不引入独立 reviewer、人工审批或新的运行时状态机。任何 raw、partial、free-text、negative、failed 或 no-output diagnostic 都可以进入任一 declared stage；receipt/typed output 只提高 lineage 和强 claim 证据质量。只有 executor unavailable、真实安全/权限/authority、wrong-target identity/currentness、不可逆动作或显式 human decision 才能硬停。

`family-runtime attempt create --action <action_id>` 可以显式提供 Action route context，但 action 缺失、未知、没有 route 或当前 stage 不在该 route 中都只生成 advisory finding。只要目标属于 manifest declared stages，Codex CLI 仍可启动它。selected Action 和 route 可以进入 attempt identity 并通过 `route_impact.selected_action_id` / `selected_stage_route` 回读，但只用于 provenance 和质量上下文。

domain product manifest 只携带 canonical refs：`family_action_catalog_ref` 指向 repo 内 `contracts/action_catalog.json`，`family_stage_control_plane_ref` 指向由 `agent/stages/manifest.json` 编译的 generated control plane。OPL hosted action runtime 与 Temporal StageRun controller 都从 package-managed、repo-contained source 读取，不接受 body/ref 双写、外部 URL、越界路径或越界 symlink。

因此不存在按专业语义“防跳”的流程：hosted runtime 与 StageRun controller 不拒绝 ABI 合法的 skip、逆序、repeat、route-back 或缺前序 receipt，但必须拒绝非终局 Attempt 越权、非法 shape、decision/recommendation 并存、legacy field、undeclared target 和无效 finding-closure。被拒绝的只是 route output 协议，不是可消费 artifact；artifact 继续推进并带 route quality debt。fallback 先沿 action 明确声明的 ordered `required_stage_refs`，没有 action route 时只沿当前 Stage 唯一的 `next_stage_refs`；多个 declared successor 时必须等待终局 Codex 判断，manifest 文件顺序不是 route。Framework 不能自行调度专业 Stage、创建 domain blocker，也不能用 provider completion、测试通过或单个 Stage closeout 冒充 quality/delivery/ready claim。

## 审计口径

1. 每个顶层 Stage 是否只承担一个主要开放语义判断。
2. 多文件输出是否由同一个 typed packet 派生，而不是要求模型同时自由设计多套正文。
3. Action 的 route refs 是否都属于 declared stages，且明确只是质量上下文。
4. 普通进展是否无需新增 review/human gate；typed blocker 是否只出现在 executor unavailable、真实权限/安全/authority、identity/currentness、不可逆动作或显式 human decision。
5. terminal Stage 是否有精确 closeout receipt；不得用 catalog 存在、单测通过或任意 Stage receipt 声称全流程完成。
