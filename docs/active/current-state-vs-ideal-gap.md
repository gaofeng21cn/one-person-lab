# OPL 当前状态与理想目标差距

本文只记录已有具体断点、明确负责人和可观察完成条件的 v2 收敛工作。完成后删除对应条目；不在这里记录完成日志、版本快照或迁移历史。

## Framework core 单写入者收敛

| owner | 当前具体断点 | 可验证完成条件 |
| --- | --- | --- |
| Framework daemon、Workspace、Pack | 软件源和 workspace root 仍有 JSON 写入路径。`opl sources` 仍由 Package source store 读写 `software-sources.json`，workspace root 仍读写 `workspace-root.json`；这使 `opl.db` 不是唯一 durable writer。 | 将 software-sources 与 workspace-root 迁入 `opl.db`，通过 `opld` JSON-RPC 和 `pack.sources.*` 暴露读写。提供一次性只读旧 JSON 迁移，迁移后 CLI、Studio、SDK 均从数据库回读；非 macOS 主机不写 `~/Library/Application Support/OPL/state/...`。补充跨平台 writer/readback 测试。 |
| Framework Pack、Catalog 发布 owner | Package resolver 在 v2 GHCR manifest HTTP 404 时仍存在 v1 fallback。`v2_release` 的晋升必须绑定不可变 OCI publication 和 readback；`OPL_FULL_RUNTIME_HOME` seed 还需明确只加速公开匹配字节。 | 删除 PR #499 的 v1 静默降级路径。缺少选定 v2 manifest 时返回可观察错误并保持 fail closed。在线 Full 模式继续合并私有目录和更新，离线 seed 不阻塞 `authorized_only`。用 public/private、404、seed 命中与不匹配场景回读 resolver 结果。 |
| Framework package-release owner | `scripts/sync-private-package-publishers.py` 的 v2 publisher 接线仍需覆盖 `source_root != "."` 的真实 Package。 | 修复发布投影、归档路径和 publisher 同步，使非根 `source_root` 的 Package 能完成 immutable publication、Catalog projection 与私有授权安装。用真实 descriptor、归档内容锁和远端 manifest readback 验证。 |
| Studio、Framework Connect owner | `@opl/connect` 仍包含未挂载的 `RemoteCompanionHost` 实现，companion hosting ownership 尚未收敛到 Studio `opl-host-core`。 | 移除或断开 Framework 内 companion server 的 host 生命周期。Studio 独占 hosting，Framework 仅保留 Gateway companion authorization 与 `opl connect gateway authorize-companion`/RPC；以 connect discovery、authorization 和 Studio host readback 验证不存在第二 host。 |
| Framework guard owner | `scripts/` 尚未完整纳入 `v2:guard` 的 v2 import/legacy hygiene 覆盖。 | `npm run v2:guard` 覆盖 `scripts/`，并对发布工具、源码路径和旧 runtime import 产生稳定失败结果；现有 v2 package 与 guard 测试保持通过。 |

## Software Center 与 App settings parity

| owner | 当前具体断点 | 可验证完成条件 |
| --- | --- | --- |
| Framework Pack、App/Studio Software Center | Full 模式的私有源与在线公共 Catalog 合并、`package_currentness`、`agent_package_update`/`agent_package_repair`/`agent_package_cancel` 以及持久 Catalog cache 尚未形成同一可回读面。 | 在在线和 Full 模式分别回读 public/private entries、授权错误、currentness 与完整 action payload。`updatePlan` 对已缓存且 current 的 Package 产生 zero-download 结果；缓存重启后仍可用，实际安装与更新继续从 native carrier 回读。 |
| Framework daemon、Python SDK owner | `ContributionDispatcher` 的 Python capability 执行仍需把 SDK `PYTHONPATH` 注入到实际 subprocess 环境，并保留调用者的显式环境。 | Python contribution 在干净环境可导入 `sdks/python-client`，显式 caller `PYTHONPATH` 与失败诊断均可回读；不依赖工作树偶然的 import path。 |
| Framework Workspace、App/Studio settings owner | `resource_sources`、`knowledge_source_*` 以及 `connection_test`、`connection_update`、`connection_delete` 还没有完整覆盖设置读面、动作和写后 readback。 | Settings projection、CLI/RPC 和 App actions 共享同一 owner。对来源和连接分别验证 list、test/update/delete、revision、权限拒绝和重开后的持久状态，不返回凭证值。 |
| Framework Runway、App/Studio task workbench owner | task projection 还需完整表达 `awaiting_human` 与 `agent_id=null` 的任务，避免工作台把人工等待或无 Agent 任务当作缺失数据。 | `opld` 创建、恢复和列表回读这两类任务时，projection、action route、状态过滤和 UI model 保持稳定；相关 task-projection 与 restart 测试覆盖人工决定路径。 |

## App/Studio 与 Standard Agents v2 收敛

| owner | 当前具体断点 | 可验证完成条件 |
| --- | --- | --- |
| App、Framework CLI owner | App v1 CLI surface 仍有清理项，部分调用者尚未完全迁移到 `opl runway`、动态 extension CLI 和 v2 Package routes。 | 清理旧 CLI 入口及调用者，保留实际仍支持的 `opl daemon doctor --legacy-runs` 只读检查。App、CLI、SDK 通过公开 v2 RPC 和 dynamic descriptor 进行同一组 smoke/readback 验收。 |
| Studio、Framework Connect owner | Studio 的 `channel_access` 过滤和已退役 UI 清理尚未完成，`opl-link-desktop-connector` 仍是 zombie surface。 | 修正 channel projection/filter，删除退役 UI 与 zombie connector，回读 Studio channel list、action availability 和 companion ownership；不得以隐藏菜单保留旧产品面。 |
| Framework Pack、各 Package owner、发布 owner | 仍有 legacy Catalog Package 未完成 `opl.package.v2`，因此 `.github/workflows/daily-package-channel.yml` 的 `PACKAGE_PUBLISHER_TOOLING_COMMIT` 与 runtime `migrateV1Package` 不能删除。 | 活跃 Catalog Package 全部完成 v2 descriptor、OCI publication、carrier install/update/repair 和 clean readback 后，删除 publisher commit pin 与 `migrateV1Package` 运行时路径；v2 guard、Package migration and publication tests 证明没有双轨消费者。 |
