# 工作台服务接口

`opl-workbench-services` 是 Framework 内置 Cordis 插件，向 Studio 提供用户计划任务、
现有 Codex 记忆与受控数据清理。其实现入口为
`src/host/plugins/workbench-services/index.ts`，公开调用入口为
`./cordis-profiles` 的 `startCordisWorkbenchServicesHost`。这些接口不转移 Package、
领域结果、Codex 会话或发布权威。

插件分别持有三个读面，App state 中以 `workbench_services` 投影，版本为
`opl-workbench-services.v1`。`tasks`、`memory`、`storage` 各自给出状态、读取引用和
操作引用。读取失败局部降级；未读取不能被归为已验证可用。Studio 通过已有 contribution
读接口和 `package_contribution_execute` 消费此内置插件命名空间，不维护业务状态表。

| 引用 | 行为与状态来源 |
| --- | --- |
| `workbench#tasks`、`workbench#history` | Temporal Schedule 定义与 workflow history；按机器及 canonical Codex home 隔离 |
| `workbench#task_create`、`task_update` | 校验工作目录、周期、IANA 时区、权限和超时；保存 Temporal 定义；同一任务的管理 workflow 串行执行，更新校验 revision |
| `workbench#task_pause`、`task_resume`、`task_delete` | 暂停、恢复、停止后续触发并隐藏定义；已运行历史保留，运行中执行不因删除定义而消失 |
| `workbench#task_run` | 提交一次触发，使用 SKIP 防止重叠；完成状态从 history 和 canonical turn 回读 |
| `workbench#memory`、`workbench#memory_read` | 读取当前 `CODEX_HOME/memories` 已有 Markdown，不另建记忆库 |
| `workbench#memory_correct` | 向 `extensions/ad_hoc/notes` 提交用户纠错建议，等待原记忆系统处理 |
| `workbench#memory_update_note`、`memory_delete_note` | 仅操作上述用户建议；主记忆只读；revision 不匹配时拒绝 |
| `workbench#inventory`、`workbench#cleanup` | 只读用量；仅清理 owner 声明且超过 24 小时未修改的日志，排除符号链接、源码、产物、凭据、会话和记忆 |

全部写操作先预览，五分钟内显式确认，并校验请求内容与原预览一致。清理预览额外绑定
文件身份、大小和修改时间，任何变化都需重新预览。预览令牌只在插件生命周期内存在，
执行回执返回 App，不创建第二份持久清理账本。读回的内容、提示词、原始 payload 不进入
诊断摘要。

用户任务使用现有 Temporal 服务与 namespace；插件不会安装服务或创建第二调度器。
任务执行回调由 `opl-codex-native` 的当前 App Server 提供：createThread、startTask、
readTask、interruptTask。启动 activity 不自动重试，防止含副作用的任务重复执行。
权限必须明确为 `:read-only` 或 `:workspace`。任务超时尝试中断并保留 canonical thread
引用；暂停或删除任务定义不会伪称已经取消正在执行的 turn。

App 必须保持运行，最小化可继续；退出后不承诺执行。服务停机补偿窗口一分钟，App
未运行造成启动排队超过五分钟时跳过。日历沿用 Temporal 的当地时钟匹配规则，夏令时
跳时可跳过，回拨可触发两次。只读 inventory 有深度及文件数上限，部分统计必须显示为
partial，不能作为完整磁盘占用。

当前实现采用 Temporal 官方 SDK；DSH 官方 schedule 是 DSH root Agent/session 内提醒，
不满足 canonical Codex 任务管理和历史要求，因而不挂载其执行端。Studio 仍优先复用
官方 Settings 与 UI primitives，并独立检查旧 Framework 缺少此公开导出时的升级提示。

验证采用隔离 Temporal、fake App Server 与临时资源目录；入口为
`tests/src/workbench-resources.test.ts`、`tests/built/workbench-temporal.test.mjs` 和
Studio `scripts/acceptance/workbench-services.mjs`。源码通过不等于已发布的 Framework
包及 Studio 安装包具备此功能；分发时必须绑定两端实际字节并重新验收。

部分 Temporal 服务接受但不执行 Schedule conflict token 校验。因此同一任务的管理操作使用固定 workflow ID，禁止活动执行重复启动；revision 在该执行内复核，不能仅依赖 token 宣称并发安全。
