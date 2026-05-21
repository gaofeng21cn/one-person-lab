# GitHub CI 自动化巡检政策

Owner: `One Person Lab`
Purpose: `github_ci_automation_policy`
State: `active_policy`
Machine boundary: 本文是人读维护政策。机器真相继续归 GitHub Actions run、release/tag 状态、PR check rollup、workflow 文件、repo-native 验证命令和 automation memory。

## 当前故障口径

每日 GitHub CI 巡检只把仍然影响当前工程面的失败列为当前故障：

- default branch 最新同 workflow run 仍为 failed、cancelled、timed out、action required、queued 或 in progress；
- 当前 release owner 的最新关键 release / warmup / first-install workflow 仍为 failed、queued 或 in progress；
- open PR 的 status check rollup 仍为 failed、queued、pending 或 in progress；
- 长时间 queued / in progress 的当前 scheduled smoke 或 required workflow。

同一分支、同一 workflow 已被后续绿色 run 覆盖的失败，必须标记为 `superseded_historical`。已经删除 release/tag 或已经迁出 owner 的历史 release run，不得继续作为当前 release failure 上报。

## 清理动作边界

无人值守自动化可以执行以下低风险清理：

- 取消未开始执行 step 的 queued scheduled smoke run；
- 在 repo workflow 中加入 concurrency / cancel-in-progress，避免 scheduled smoke backlog 堆积；
- 在当前 release owner repo 中修复 release / warmup / first-install workflow 的可验证失败；
- 更新 automation memory、repo docs 和 workflow 分类口径。

自动化默认不执行以下动作：

- 删除 GitHub Actions run 历史记录；
- 修改 secrets、AWS、付费 runner 或外部 provider 配置；
- rerun 已迁出 owner 的历史 release workflow；
- 为了隐藏红色历史 run 删除审计证据。

如果确实需要删除 workflow run 历史，必须把原因写清为审计/展示治理，而不是 CI 修复；删除前需要确认该 run 对 release、incident、root-cause 或 rollback 没有保留价值。

## App 与 Shell Release Owner

One Person Lab App 的用户 release、Full first-install、updater metadata 和当前 release truth 归 `gaofeng21cn/one-person-lab-app`。`opl-aion-shell` 是 shell implementation / diagnostic / upstream intake surface，不是当前 App release owner。

因此：

- `one-person-lab-app` 的当前 release / warmup 失败可以作为 release workflow 故障处理；
- `opl-aion-shell` 旧 `v26.5.15` release 发布或分发失败只作为 superseded history，除非新的 current owner 决策明确恢复 shell release owner；
- automation 报告旧 shell release run 时必须同时说明 current owner 和 superseded 状态，不得把它列入当前 failures。

## Scheduled VM Smoke

`OPL GUI First-Run VM` 这类 scheduled smoke 用于发现首启环境回归，不是 release truth。当前 policy 是：

- queued 且未执行 step 的 backlog run 可以取消；
- workflow 应使用 concurrency 保持同一分支/同一 workflow 只有最新 run 排队或执行；
- cancelled backlog run 记为 queue cleanup，不记为 failure；
- 真正开始执行并失败的 VM smoke 需要读取 job/step log 后再判断是产品回归、runner/provider 问题还是环境容量问题。

## 巡检报告要求

每次自动化最终报告必须分开列出：

- current failures；
- queued / in-progress current surfaces；
- superseded historical failures；
- manual action；
- 本轮取消、修复、提交、push 和远端验证证据。

没有当前故障时，报告应明确写 `no current confirmed default-branch or release failure`，并把历史失败放入 superseded / provenance 语境。
