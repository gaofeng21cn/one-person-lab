# Stage graph 与 AI 路由边界

## 当前结论

Stage graph 只声明可用 stage 与 artifact handoff 范围，不是可执行状态机。Codex CLI 是唯一语义 route owner，可以根据当前 artifact、阴性结果、review finding、质量债与用户目标，启动任意 declared stage，包括前进、跳过、重复、逆向和 route-back。

OPL Framework 只持有 StageRun transport、attempt ledger、queue/provider、currentness identity、artifact refs 与 operator projection。它不执行 transition table、oracle、fixed-point semantic reconcile、exactly-one transition selection 或格式级 admission gate。

## Progress-first

- 任意可读 artifact、部分草稿、失败尝试、阴性结果或 diagnostic 都是下一 stage 的输入。
- retry、review、repair 次数只是质量预算；预算耗尽后保留最佳可读 artifact 并推进。
- 质量债只能关闭 accepted、ready、publication、export 或 promotion 声明，不能关闭 stage transition。
- route-back 是新的 progress 分支，必须携带既有证据与 failed-path lineage，不能把阴性结果丢弃后原地重来。

## 合法硬停

只有以下边界可阻止启动下一 stage：selected executor 不可用；权限、凭据、安全或 authority 边界；wrong-target identity/currentness 不匹配；不可逆外部动作；明确 human/owner decision。零可读输出或 artifact 损坏不可读必须物化为 failure/no-output diagnostic 并继续。

这些硬停保护执行安全与身份一致性，不评价内容质量，也不选择语义路线。

## 当前机器入口

- `contracts/opl-framework/family-runtime-attempt-contract.json`
- `src/modules/runway/standard-agent-action-runtime.ts`
- `src/modules/stagecraft/stage-run-kernel.ts`
- `src/modules/runway/progress-closeout-projection.ts`
- `tests/src/standard-agent-action-runtime.test.ts`
- `tests/src/cli/cases/agents-conformance-stage-run-kernel.test.ts`
