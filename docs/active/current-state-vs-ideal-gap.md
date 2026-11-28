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
| Wave 2A | `one-person-lab-app` / `opl-studio` | Full DMG 仍保留二次编译与散文件灌入（三仓 Temporal 残留及退役 Studio Preview 工作流已拆除） | 落地「复用已签名 Standard `.app` + 挂载单一 `opl-offline-seed.tar.zst`」轻量单文件 Full DMG 流水线（保留 `studio-webui-*.yml` 满足云工作区 schema） |
| Wave 2B | `one-person-lab-app` / `opl-studio` / `homebrew-one-person-lab` | `app-shell-candidates.json`、`contracts/shell-adapters/opl-studio.json`、`opl-studio/src/candidateContractEvidence.json` 与 `validate-opl-studio-candidate.mjs` 仍与双方 CI 强绑定；`app-product-profile.json` 内联拷贝 5,211 行 `app-settings-control-plane.json`；91 个脚本只做 JSON 互校验；`opl-studio` 存在 29.4 万行 `vendor/`（含暂保留至解耦的 `vendor/dsh-superagent/`）；`Formula/opl.rb` 仍在用户端执行 `npm ci && npm run build` | 在不破坏 Studio CI cohort 查找与 `_build-reusable.yml` 的前提下收口单壳候选脚手架；消除 JSON 整块互抄并收口自检至 `ajv` + 运行时测试；剥离 `vendor/dsh-remote/` 与 `vendor/dsh-superagent/` 及 DSH UI 补丁；`opl` Formula 改为消费预编译归档 |
| Wave 2B | `opl-catalog` / `one-person-lab` | `catalog-index.json`（1.67 MB）有 74% 失效 v1 载荷与 0 引用 `allowlist`，22/22 包顶层版本分裂，每日一包一 PR 产生 90% 噪声提交；1,590 行 `migrate-v1.ts` 编入 `opld` 且 `opl_software_installation.v1` 尚未正式清理 | 切换至纯净 `opl_software_catalog_index.v2`（<50 KB，删除 `allowlists/` 与 v1 payloads），修正 `official-package-catalog.ts` seed commit 读取并改为每日单批 PR；剥离 `migrate-v1.ts` 并退役 `opl_software_installation.v1` |
| Wave 3 | `one-person-lab` / 领域 Package 仓 | `opld` 常驻核心挂载万行零调用 `Runway`/`Ledger`（适配器含静态模型表）；`opl-python-sdk` 未对齐 `response.v1` 导致 14 仓手写 7.2k 行 `app_contribution`、3 仓拷贝 5k 行 `_opl_*helpers`、3 个 MiniApp 复制 1,068 行 `dsh-theme.css` 并提交 MB 级编译产物、8 仓自写校验脚本；`rednote-steward` 保留平行 `install.sh` | 将 `Runway` 降级为按需扩展（`foundry` 模式）并删静态模型表；升级发布 `opl-python-sdk` 与 `@opl/mcp-app-shared` 主题/脚手架，支持声明式只读状态探针；用 `opl pack validate` 替换各仓自研校验与平行下载器 |
| Wave 3 | `opl-dsh` / `opl-studio` | `opl-dsh` 维护 12 家第三方 CLI 适配器（4.3 万行）并与 `opl-studio` 零包共享（`opl-flow-workbench` 等重复复制） | `opl-dsh` 收敛至 DSH + Codex + Claude + 标准 ACP；共享标准 DSH 插件包 |
| Wave 3 | `opl-link` / `opl-netfleet` | `opl-link/service` 与 `opl-netfleet/cloud` 仍各自直连 `Sub2API` 与自建白名单，未接入 OPL Cloud 统一 Ed25519 `service-grant` | 两个独立伴侣数据面切到校验 OPL Cloud `grant_token`（保持各自轻量独立容器部署） |
