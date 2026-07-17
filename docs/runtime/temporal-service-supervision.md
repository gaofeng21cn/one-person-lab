# Temporal Service Supervision

Temporal Server 是 OPL durable workflow 的必要依赖，不是可隐藏的可选诊断项。Desktop macOS 由 OPL-owned launchd supervisor 托管本机 Temporal CLI；Worker supervisor 与 scheduler cadence 仍是两个独立生命周期。

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

Supervisor plist 直接执行 realpath 后的 Temporal CLI，不执行 Framework checkout 中的 TypeScript 文件，也不接受 shell command 作为 production supervisor launcher。固定配置包括：

- label `ai.opl.family-runtime.temporal-service`
- `RunAtLoad=true`
- `KeepAlive=true`
- `ThrottleInterval=15`
- `WorkingDirectory=${OPL_STATE_DIR}/family-runtime`
- `--db-filename ${OPL_STATE_DIR}/family-runtime/temporal-server/temporal.sqlite`

持久库父目录在安装前创建；config、plist args 和状态 currentness 必须指向同一个绝对 realpath。readback 会核对 exact plist SHA-256、launcher SHA-256，以及 executable 仍存在、可执行且 realpath 未漂移。Temporal CLI、plist 字节、启动参数或数据库路径漂移都会成为 `configuration_drift`，不会被当作 ready。

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

`supported` 只描述当前平台是否支持 launchd；`applicable`/`required` 只在 macOS OPL-local Temporal CLI 路径为 true。non-darwin、external/container 和显式 custom command 均投影 `status=not_applicable`、`ready=null`、`error=null`，不能因为 launchd 不适用而污染健康状态。

Desktop 启动维护会在 `system_action.details.temporal_runtime_reconcile` 返回 `opl_temporal_runtime_startup_reconcile.v1` 回执，并严格依次 fresh readback Server、Worker、Scheduler。任何前置步骤未 ready，后续步骤都标为 `skipped_dependency_not_ready`，整体 `system_action.status=manual_required`。Worker supervisor 若已经 loaded 但指向另一个 family runtime root，自动维护只报告 blocker，不会 remove/reinstall，也不会制造第二个 Worker。

Shell 只向 Desktop OPL child command 注入私有 `OPL_APP_HOST_KIND=desktop` host hint；Web host 不注入。Full wrapper 若注入打包的本机默认地址，还必须同时传 `OPL_TEMPORAL_ADDRESS=127.0.0.1:7233` 与 `OPL_TEMPORAL_ADDRESS_SOURCE=packaged_local_default`，Framework 才把该环境地址识别为 OPL-managed；缺少来源、远程地址、来源与地址不匹配或显式 custom command 一律保持 `not_applicable` 且不打开 runtime、不产生 mutation。`OPL_APP_PROCESS_INSTANCE_ID` 同时存在于 Desktop 与 Web host，不能单独授权 launchd mutation。host hint 或 address source 本身也不触发动作，只有显式执行 `opl system startup-maintenance` 时 Framework 才消费它；普通 `app state`、status、diagnose 等读取永远不会因此产生 mutation。

## Migration And Rollback

旧 detached server 若占用同一地址，install 会先有界停止该 PID并确认端口释放，再 bootstrap launchd job。旧 `start-dev` 若未配置数据库文件，其内存 workflow history 无法迁移；operation receipt 只声明 process adoption，并明确 `old_in_memory_history_migration=not_available`。

plist/config 写入或 bootstrap 失败会恢复原始字节。新 job loaded 但未 ready 时，安装事务会先 bootout 并移除新 supervisor，再尝试恢复原 detached service。bootout 失败时保留当前文件和 job，不伪称 removed，也不会并发启动另一个端口冲突进程。

## Boundary

该 launchd 路径仅是 Desktop macOS 的 local deployment substrate。WebUI/Linux 使用 container、external service 或显式 foreground lifecycle。它不授权 domain repo 安装私有 daemon / scheduler；Temporal service/worker/scheduler ready 也不等于任何 domain truth、quality 或 artifact ready。
