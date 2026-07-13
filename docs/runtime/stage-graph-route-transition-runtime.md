# Stage graph 与 AI 路由边界

- Owner：OPL Runway
- Purpose：冻结 decisive Attempt、StageRun durable identity 与跨 Stage 物化的职责分工。
- State：active support
- Machine boundary：`contracts/opl-framework/stage-run-kernel-contract.json`、`contracts/opl-framework/stage-route-transport-contract.json`

## 当前结论

Stage graph 只声明可用 stage 与 artifact handoff 范围，不是可执行状态机。语义 route owner 是当前 StageRun 的 decisive Codex Attempt：primary-only Stage 的 producer，或正式 Review 中真正终局的 reviewer / re_reviewer。Codex CLI 是当前第一公民 executor；它可以根据当前 artifact、阴性结果、review finding、质量债与用户目标，建议任意 declared stage，包括前进、跳过、重复、逆向和 route-back。

OPL Framework 只持有 StageRun transport、attempt ledger、queue/provider、durable invocation/currentness identity、artifact refs 与 operator projection。它不执行 transition table、oracle、fixed-point semantic reconcile、exactly-one transition selection 或格式级 admission gate。

在一个 StageRun 内，decisive Attempt 提交 `route_impact.stage_route_decision`；其他 Attempt 最多提交 recommendation。hard stop 只提交 typed blocker 或 human gate，不能再夹带跨 Stage route。这个 closeout 输出是 Codex 的一次语义判断，但不授予 Attempt 修改 current pointer 或直接操作 provider 的权限。OPL 只校验输出者资格、route ABI、finding closure 与 declared target，再由 `opl_stage_run_controller` 物化 transition。

若终局决定缺失或被拒绝，可消费 artifact 仍保留并形成路由质量债。fallback 先沿当前 action 明确声明的 ordered `required_stage_refs`；action 没有 route 时，只能沿当前 Stage 唯一的 `next_stage_refs`。多个 declared successor 时保持下一 Stage 未选择，manifest 文件排列顺序不能成为隐藏路由器。

## Durable invocation 与物化

`stage_run_id` 只由 `domain_id + stage_id + stage_run_invocation_id` 派生。`stage_run_spec_sha256` 单独绑定不可变的 pack closure、Stage manifest、quality policy、source/checkpoint/input artifact hash、rubric、lineage、executor 与 parent route；`checked_at`、`use_receipt_ref`、checkout path、currentness receipt 等波动观察不参与 Run ID 或 spec hash。

Runway 在启动 Temporal 前，先把 exact StageRun input 写入 `${OPL_STATE_DIR}/family-runtime/queue.sqlite#stage_run_launches`。同 invocation + 同 spec 的 running 或 closed Run 幂等返回；同 invocation + 不同 spec 以 `stage_run_invocation_spec_conflict` 失败，不得覆盖原输入。注册后未启动、Temporal 已启动但本地未记账、以及 readback 已终局三种窗口都由同一 launch interface 恢复。

CLI 默认 invocation 是稳定幂等键；`--new-stage-run` 显式创建新 Run，质量路径暂将旧 `--new-attempt` 作为兼容 alias。Hosted action 用 action `run_id + action_run_ref` 建立 invocation。跨 Stage 路由用 parent StageRun、decisive Attempt ref、route decision digest 与 target Stage 建立 invocation，因此同一 route replay 复用目标 Run，后续新决定或 A → B → A route-back 会创建新 Run。

`complete` 只关闭当前 workflow，不启动目标 Run。其他通过 authority/ABI 校验的决定必须由 controller 实际注册并启动目标 StageRun；controller 不得把“记录了 route”冒充“transition 已物化”。

## Progress-first

- 任意可读 artifact、部分草稿、失败尝试、阴性结果或已成功物化的 diagnostic 都是下一 stage 的输入。
- retry、review、repair 次数只是质量预算；预算耗尽后保留最佳可读 artifact 并推进。
- 质量债只能关闭 accepted、ready、publication、export 或 promotion 声明，不能关闭 stage transition。
- route-back 是新的 progress 分支，必须携带既有证据与 failed-path lineage，不能把阴性结果丢弃后原地重来。

## 合法硬停

只有以下边界可阻止启动下一 stage：selected executor 不可用；权限、凭据、安全或 authority 边界；wrong-target identity/currentness 不匹配；不可逆外部动作；明确 human/owner decision；以及 diagnostic 尝试后仍不存在任何可消费 artifact。原始执行零输出或 artifact 损坏时，controller 应先尝试物化 failure/no-output diagnostic；成功物化的 diagnostic 本身就是可消费 progress，只有连 diagnostic 都无法形成的字面零可消费产物才是 hard gate。

这些硬停保护执行安全与身份一致性，不评价内容质量，也不选择语义路线。

## 当前机器入口

- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `contracts/opl-framework/stage-run-kernel-contract.json`
- `contracts/opl-framework/stage-route-transport-contract.json`
- `src/modules/runway/standard-agent-action-runtime.ts`
- `src/modules/runway/family-runtime-stage-run-identity.ts`
- `src/modules/runway/family-runtime-stage-run-launch-registry.ts`
- `src/modules/runway/family-runtime-stage-run-route-launch.ts`
- `src/modules/stagecraft/stage-run-kernel.ts`
- `src/modules/runway/progress-closeout-projection.ts`
- `tests/src/standard-agent-action-runtime.test.ts`
- `tests/src/family-runtime-stage-run-launch.test.ts`
- `tests/src/cli/cases/agents-conformance-stage-run-kernel.test.ts`
