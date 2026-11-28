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
| Wave 2B | `opl-studio` / `one-person-lab-app` | `opl-studio/vendor/{dsh-remote,dsh-superagent}` 为 OPL Link 与 SuperAgent 运行时现用依赖，待上游发布独立 npm 包后剥离；`app-shell-candidates.json` 仍被 11 项 App 发布边界测试与 Studio CI 消费 | 待上游 npm 包就绪后再剥离 `vendor/dsh-*`，并结合 `app-product-profile.json` 清理脚本重叠校验（已确认无破坏前提下推进） |
| Wave 2B | `opl-catalog` / `one-person-lab` / `homebrew-one-person-lab` | 正在清理 `opl-catalog` 29 个孤立历史 payload 并补 1:1 校验，解耦 `opld` `pack.migrateV1` RPC、附挂 `publish-framework.yml` 预编译产物并让 `Formula/opl.rb` 支持免编译快装 | `opl-catalog` 仅保留有效 v1/`v2_release` payload 且 `catalog-index.json` 零漂移；`opld` `pack.migrateV1` 退回纯离线 CLI；`Formula/opl.rb` 优先消费验证通过的预编译压缩包 |
| Wave 3 | `one-person-lab` / 领域 Package 仓 | `opld` 常驻核心挂载 `Runway`/`Ledger`（适配器含静态模型表）；`opl-python-sdk` 与 `@opl/mcp-app-shared` 跨多仓手写重复较多 | 将 `Runway` 降级为按需扩展并删静态模型表；收口 `opl-python-sdk`、`@opl/mcp-app-shared` 及校验器共用能力 |
| Wave 3 | `opl-dsh` / `opl-studio` | `opl-dsh` 维护 12 家第三方 CLI 适配器（4.3 万行）并与 `opl-studio` 零包共享（`opl-flow-workbench` 等重复复制） | `opl-dsh` 收敛至 DSH + Codex + Claude + 标准 ACP；共享标准 DSH 插件包 |
| Wave 3 | `opl-link` / `opl-netfleet` | `opl-link/service` 与 `opl-netfleet/cloud` 仍各自直连 `Sub2API` 与自建白名单，未接入 OPL Cloud 统一 Ed25519 `service-grant` | 两个独立伴侣数据面切到校验 OPL Cloud `grant_token`（保持各自轻量独立容器部署） |
