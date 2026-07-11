# Action-to-Stage 路由与 Stage 规模原则

owner: OPL Stagecraft
purpose: 固化 OPL family 的 Stage 规模、Action 必经路由与 Progress-first 边界
state: active
machine boundary: `family-action-catalog.v1.actions[].stage_route`、`family-stage-control-plane.v1`、generated interface `action_stage_routes`、`opl-framework/standard-agent-action-stage-run`

## 结论

Stage 大小按“一个主要开放语义判断”划分，不按文件数、receipt 数或工具调用数划分。同一判断派生的文件物化、schema 校验、readback 和机械 receipt 留在 Stage 内；拥有不同知识、owner、quality gate 或失败路由的独立判断才拆成新的顶层 Stage。

Action 不能再只声明“哪些 Stage 允许它”，还可以声明一条可执行的 `stage_route`：

- `required_stage_refs` 是按顺序必须完成的 Stage attempt，不能跳过；
- `optional_stage_refs` 只表达同一目标内的条件分支或有界修订，不替代 required Stage；
- `terminal_stage_refs` 是该 Action 可以合法结束或交棒的位置；
- `route_policy=ordered_stage_attempts_no_skip` 要求 executor 按已有 StageRun/attempt/closeout primitive 推进。

declarative manifest 可以从 route-free Pack 渐进迁移：没有 mutating Action 声明 route 时维持既有 launch；一旦任一 mutating Action 声明 route，全部 mutating Action 都必须声明。read-only Action 只观察当前 Stage，不伪装成要执行的多 Stage workflow，其可观察范围继续由 Stage `allowed_action_refs` 表达。OPL 会校验 Stage 存在性、action allow-list 双向一致、required 顺序可达性和 optional 分支的 entry-to-terminal 可达性，并把 route 投影到 generated interfaces。

唯一例外是 `stage_route_exempt=domain_handler_target_only`：它只适用于 mutating 的内部 domain handler target，必须没有 `stage_route`、不得被任何 Stage 的 `allowed_action_refs` 引用，并且只能声明 `descriptor_only=true`、`public_runtime=false` 的 MCP target。它保留在 family action catalog 和 product-entry 元数据中，供 OPL-hosted handler 定位；不会进入 Stage admission、`action_stage_routes` 或生成的 CLI、Skill、OpenAI、AI SDK 执行入口。

## Progress-first 边界

route 合同不是第二套 scheduler，也不引入独立 reviewer、人工审批或新的运行时状态机。普通 Stage closeout 满足原有 receipt/typed output 合同后直接进入下一个 required Stage；只有原 Stage 自身已经声明的 human gate、authority mutation 或 quality/export closeout 才能形成合法 gate。

route-controlled Stage launch 必须通过 `family-runtime attempt create --action <action_id>` 显式选择 Action。entry admission 只证明 selected route 适用于当前 entry Stage，并检查当前 Stage 自身的 blocker；它不会把未选择 Action 的互斥未来分支当作 entry blocker，也不证明整条 route 已经 no-skip 完成。selected Action 和 route 进入 attempt identity，并通过现有 `route_impact.selected_action_id` / `selected_stage_route` 回读；后续顺序仍由 StageRun、Stage attempt 与 receipt 序列执行和证明。

domain product manifest 只携带 canonical refs：`family_action_catalog_ref` 指向 repo 内 `contracts/action_catalog.json`，`family_stage_control_plane_ref` 指向由 `agent/stages/manifest.json` 编译的 generated control plane。OPL resolver 和 `opl-framework/standard-agent-action-stage-run` consumer 都从这些 repo-contained source 读取，不接受 body/ref 双写、外部 URL、越界路径或越界 symlink。

因此，防跳流程依赖“route + Stage attempt receipt 顺序”而不是额外控制面：通用 readback evaluator 必须拒绝 required Stage skip、逆序以及未消费直接前序 accepted closeout ref；缺失证据时继续同一 Action 的下一 Stage 或返回 typed continuation。它只评估已有 readback，不调度 Stage、不创建 blocker，也不能用泛化 Stage ref、provider completion、测试通过或单个大 Stage closeout 冒充整条 Action 完成。

## 审计口径

1. 每个顶层 Stage 是否只承担一个主要开放语义判断。
2. 多文件输出是否由同一个 typed packet 派生，而不是要求模型同时自由设计多套正文。
3. Action 的 required Stage 是否按控制面图可达且不能被 optional Stage 替代。
4. 普通进展是否无需新增 review/human gate；typed blocker 是否只出现在真实权限、输入、authority 或不可继续的语义缺口。
5. terminal Stage 是否有精确 closeout receipt；不得用 catalog 存在、单测通过或任意 Stage receipt 声称全流程完成。
