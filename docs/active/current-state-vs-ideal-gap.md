# OPL 当前状态与理想目标差距（家族架构简化与收敛 SSOT）

本文是 OPL 家族经跨仓架构审计与用户决策定锚后的唯一收敛进度 SSOT，只保留尚未完全闭环的收敛断点、明确负责人与可验证完成条件；每项完成后从本表删除对应条目（由 Git 历史追溯）。

## 用户锁定边界（保持不动或单独立项）

1. **`opl-flow` 独立重理设计目标**：不在本轮架构简化中裁剪 `opl-flow` 能力，由用户单开专门对话重新梳理其设计与能力不降级收敛路线。
2. **重型外围分支继续保留**：`opl-codex-model-manager/windows`、`opl-netfleet/desktop` 与 `opl-link-android` 保留各自明确的应用场景，不从仓库中移除。
3. **`one-person-lab-cloud` 独立推进**：按既有活跃重构主线推进向单一控制面模块单体收敛、清退遗留 `services/control-plane` 与进程内去 mTLS，保持 `opl-link/service` 与 `opl-netfleet/cloud` 为独立无状态伴侣数据面。
4. **macOS Full 保留单文件下载体验**：必须继续提供单文件 DMG 下载入口，采用「复用已签名 Standard `.app` + 挂载无编译单一离线资源包（`opl-offline-seed.tar.zst`）」轻量重封架构消除二次编译与数千零散二进制重签。

## 跨仓简化与收敛断点（Wave 1 – Wave 3）

| 波次 | 责任仓 | 当前具体断点 | 可验证完成条件 |
| --- | --- | --- | --- |
| Wave 2B（外部上游阻塞） | `opl-studio` / `one-person-lab-app` | `opl-studio/vendor/{dsh-remote,dsh-superagent}` 为 OPL Link 与 SuperAgent 运行时现用依赖，尚无已发布独立 npm 包；`app-shell-candidates.json` 仍被 11 项 App 发布边界测试与 Studio CI 消费 | 待上游发布独立 npm 包后剥离 `vendor/dsh-*`，并结合 `app-product-profile.json` 迁移 Studio CI 与 App 测试对 `app-shell-candidates.json` 的引用 |
| Wave 3（待确认清单） | `opl-dsh` | `opl-dsh` 保留多款外部 CLI 适配器（`antigravity`/`grok-build`/`opencode`/`minimax-code`/`kimi-code`/`qwen-code`/`pi`/`kilo`/`vibe`），均属每日发布版本现用特性，且部分插件/样式仍依赖静态 Webview 拷贝 | 待用户明确逐个确认保留与退役清单后再统一收敛至 Codex + Claude + 标准 ACP |
| Wave 3（已约定上游源） | `@opl/mcp-app-shared` / 静态 MiniApp 仓 | `dsh-theme.css` 在纯静态 HTML Webview 仓存在字节一致镜像拷贝 | 以 `one-person-lab/packages/mcp-app-shared/assets/dsh-theme.css` 为唯一权威源同步，构建期不再复制两份语义不同样式 |
