# Temporal Service Supervision

Owner: `OPL Runway`
Purpose: `temporal_service_supervision_support`
State: `active_runtime_support`
Machine boundary: 本文是 Temporal 本机服务托管的人读运维说明。机器真相归 family-runtime contracts、supervisor source、CLI/App readback 与 focused tests；本文不证明 provider、domain、artifact、App release 或 production ready。

Temporal Server 是 OPL durable workflow 的必要依赖，不是可隐藏的可选诊断项。Desktop macOS 由 OPL-owned launchd supervisor 托管本机 Temporal CLI；Worker supervisor 与 scheduler cadence 仍是两个独立生命周期。

Worker 安装时显式提供的 `OPL_MODULES_ROOT` 和 `OPL_CODEX_STAGE_SANDBOX_MODE` 会写入
其 launchd 环境。沙箱模式仅接受 `read-only`、`workspace-write`、`danger-full-access`；
未配置或值无效时保持 `workspace-write`。这是宿主显式配置，Stage 调用中已有的
`sandboxMode` 仍优先；配置源码或生成 plist 不代表正在运行的 worker 已切换。

## Desktop macOS

显式维护面如下：

```bash
opl family-runtime service supervisor status --provider temporal
opl family-runtime service supervisor install --provider temporal
opl family-runtime service supervisor trigger --provider temporal
opl family-runtime service supervisor remove --provider temporal
```

普通 `opl family-runtime service start --provider temporal` 在 macOS 后台模式下复用同一 supervisor。`--foreground`、显式 custom command，以及 non-darwin container/external service 路径保留原生命周期，不会误装 launchd job。

App 的 Server 维护动作独立为 `provider_service_start`、`provider_service_restart` 与 `provider_service_stop`；Worker 也保留 status/start/restart/stop 动作。restart 不复用幂等 start：macOS 本机受管实例执行 `opl family-runtime service restart --provider temporal`，内部使用 `launchctl kickstart -k`；non-darwin 的 OPL detached 实例执行有界 stop/start；外部或容器服务返回 typed `not_applicable` 且不产生 mutation。只有 fresh Server 与 supervisor readback 都 ready（或 supervisor 明确不适用），且 macOS 受管实例的 launchd PID 确认已更换时，restart receipt 才会给出 `ready=true`；同 PID 返回 `restart_unready` / `supervisor_pid_not_replaced`。

Supervisor 安装时按现有发现顺序选择 Temporal CLI：显式 `OPL_TEMPORAL_CLI_PATH`、Framework managed entrypoint、`PATH`。plist 保存发现到的绝对入口路径，保留 Homebrew 等原生安装器提供的稳定符号链接，不把它解析并固化成 `Cellar/<version>`。launchd 每次启动通过该入口执行当前目标，不依赖交互式 shell 或 Framework checkout 中的 TypeScript 文件，也不接受 shell command 作为 production supervisor launcher。固定配置包括：

- label `ai.opl.family-runtime.temporal-service`
- `RunAtLoad=true`
- `KeepAlive=true`
- `ThrottleInterval=15`
- `WorkingDirectory=${OPL_STATE_DIR}/family-runtime`
- `--db-filename ${OPL_STATE_DIR}/family-runtime/temporal-server/temporal.sqlite`

持久库父目录在安装前创建；config、plist args 和状态 currentness 必须指向同一个数据库绝对 realpath。readback 会核对 exact plist SHA-256、launcher SHA-256，以及启动入口的当前目标是可执行的普通文件。原生安装器升级时切换稳定链接、删除旧版目录，不再单独造成 `configuration_drift`；目标缺失、断链、循环链接、目录或不可执行文件，以及 plist 字节、启动参数或数据库路径的实际漂移仍会阻断 ready。

已运行的进程保持原生命周期；稳定入口切换在下次启动时生效，服务 ready 不代表运行中的程序已经升级。显式指定可用版本目录时仍保存该路径；这类精确路径不具备稳定链接的跨版本行为，显式配置也应优先选择原生安装器维护的稳定入口。旧配置若已经保存了被删除的版本路径，现有 `provider_service_start` 或 Desktop startup reconciliation 会重新发现入口并按原事务重装配置，之后同类升级不再要求重写 plist。普通 status/App state 读取只报告现状，不重装或重启服务。

## Readiness And Repair

`ready=true` 同时要求：plist/config 已安装、配置 current、launchd job loaded、受管进程正在运行、fresh TCP probe 可达且 `error=null`。fast App state 会执行同一 fresh TCP probe，再将下面的最小 supervisor summary 保留下来：

```text
app_state.provider.temporal.details.worker_readiness.temporal_service_lifecycle.supervisor
  installed
  loaded
  ready
  observed_at
  error
  supported
  applicable
  required
```

repair action 为 `install_temporal_service_supervisor`、`trigger_temporal_service_supervisor` 或 `none`。Server 必须先 ready，之后才可维护 Worker，最后独立检查或安装 scheduler cadence；Server supervisor 不读取或推断 scheduler ready。

Worker 的 Node 启动入口同样保留稳定路径：在安装环境的绝对 `PATH` 目录中寻找指向当前
运行时的入口，只有 realpath 相同才采用，不切换到另一个 Node 安装。找不到等价入口时
保留当前 executable。健康检查验证 plist 中的程序仍为可执行普通文件；旧版本被移除、
链接断开或权限丢失时返回 configuration drift，由现有启动维护重新生成配置。

`supported` 只描述当前平台是否支持 launchd；`applicable`/`required` 只在 macOS OPL-local Temporal CLI 路径为 true。non-darwin、external/container 和显式 custom command 均投影 `status=not_applicable`、`ready=null`、`error=null`，不能因为 launchd 不适用而污染健康状态。

Desktop 启动维护会在 `system_action.details.temporal_runtime_reconcile` 返回 `opl_temporal_runtime_startup_reconcile.v1` 回执，并严格依次 fresh readback Server、Worker、Scheduler。任何前置步骤未 ready，后续步骤都标为 `skipped_dependency_not_ready`，整体 `system_action.status=manual_required`。Worker supervisor 若已经 loaded 但指向另一个 family runtime root，自动维护只报告 blocker，不会 remove/reinstall，也不会制造第二个 Worker。

Shell 只向 Desktop OPL child command 注入私有 `OPL_APP_HOST_KIND=desktop` host hint；Web host 不注入。Full wrapper 若注入打包的本机默认地址，还必须同时传 `OPL_TEMPORAL_ADDRESS=127.0.0.1:7233` 与 `OPL_TEMPORAL_ADDRESS_SOURCE=packaged_local_default`，Framework 才把该环境地址识别为 OPL-managed；缺少来源、远程地址、来源与地址不匹配或显式 custom command 一律保持 `not_applicable` 且不打开 runtime、不产生 mutation。`OPL_APP_PROCESS_INSTANCE_ID` 同时存在于 Desktop 与 Web host，不能单独授权 launchd mutation。host hint 或 address source 本身也不触发动作，只有显式执行 `opl system startup-maintenance` 时 Framework 才消费它；普通 `app state`、status、diagnose 等读取永远不会因此产生 mutation。

## Failure Rollback

plist/config 写入或 bootstrap 失败会恢复原始字节。新 job loaded 但未 ready 时，安装事务会先 bootout 并移除新 supervisor，再尝试恢复原 detached service。bootout 失败时保留当前文件和 job，不伪称 removed，也不会并发启动另一个端口冲突进程。

SDK、CLI 和 Server 的受管目标版本统一由 `contracts/opl-framework/temporal-stable-cohort.json` 指定。SDK 1.25 起会拒绝其他 SDK 生成的 workflow bundle；升级时必须重新生成 bundle，回退时必须恢复匹配的 SDK 和 bundle，并重放相同的历史集合。bundle 文件名按实际字节生成，因此只更新 SDK 也不会覆盖上一版本的 bundle。历史 JSON fixture 的旧空 message 编码仅在测试读取入口修正；原始 fixture 与其哈希保持不变，生产 replay 继续使用官方解析器。

本地 ARM 测试使用 cohort 固定的 CLI release，x64 时间跳跃测试使用 SDK 的专用测试服务。两者都只证明隔离测试运行；更新目标合同不会直接替换已安装的 CLI、升级持久 Server 数据库或重启生产 Worker。

## Boundary

该 launchd 路径仅是 Desktop macOS 的 local deployment substrate。WebUI/Linux 使用 container、external service 或显式 foreground lifecycle。它不授权 domain repo 安装私有 daemon / scheduler；Temporal service/worker/scheduler ready 也不等于任何 domain truth、quality 或 artifact ready。


Windows Desktop 使用 `opl system startup-maintenance --scope runtime_recovery --json`
恢复已配置的服务。此范围复用 Framework 管理的本地服务、worker 和 scheduler
生命周期，不激活、下载或更新 Framework、Codex 和 Package。更新仍由 App 的
managed updater 触发，所以关闭自动更新时后台服务仍可恢复。

gh-stack 的能力检查使用原生 `gh stack --version` 调度，并校验扩展的版本签名。
`gh extension exec` 即使只读取本地版本也会先要求登录；真正的 GitHub 操作在执行时
仍遵循其认证要求。


已安装的 Framework managed runtime 更新后，可以在既有 restart guard 检查通过时
重启使用旧代码的 worker，不要求开启 Developer Mode。开发源码 checkout 仍须显式
授权 developer supervisor；服务可达性、进程归属、活动任务和未决 Temporal 查询
保护继续生效。
