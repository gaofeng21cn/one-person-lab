# OPL 当前状态与理想目标差距

本文只记录已有具体断点、明确负责人和可观察完成条件的 v2 收敛工作。完成后删除对应条目；不在这里记录完成日志、版本快照或迁移历史。

## App/Studio 与 Standard Agents v2 收敛

| owner | 当前具体断点 | 可验证完成条件 |
| --- | --- | --- |
| App、Framework CLI owner | App v1 CLI surface 仍有清理项，部分调用者尚未完全迁移到 `opl runway`、动态 extension CLI 和 v2 Package routes。 | 清理旧 CLI 入口及调用者，保留实际仍支持的 `opl daemon doctor --legacy-runs` 只读检查。App、CLI、SDK 通过公开 v2 RPC 和 dynamic descriptor 进行同一组 smoke/readback 验收。 |
| Studio、Framework Connect owner | Studio 的 `channel_access` 过滤和已退役 UI 清理尚未完成，`opl-link-desktop-connector` 仍是 zombie surface。 | 修正 channel projection/filter，删除退役 UI 与 zombie connector，回读 Studio channel list、action availability 和 companion ownership；不得以隐藏菜单保留旧产品面。 |
| Framework Pack、各 Package owner、发布 owner | 仍有 legacy Catalog Package 未完成 `opl.package.v2`，因此 `.github/workflows/daily-package-channel.yml` 的 `PACKAGE_PUBLISHER_TOOLING_COMMIT`、runtime `migrateV1Package` 与 `TRANSITIONAL_V1_ADAPTER`（`app-contribution-adapter.json` 进程内过渡适配器）尚不能删除。 | 活跃 Catalog Package 全部完成 v2 descriptor、OCI publication、carrier install/update/repair 和 clean readback 后，删除 publisher commit pin、`migrateV1Package` 与 `transitional-adapter.ts`；v2 guard、Package migration and publication tests 证明没有双轨消费者。 |
| Framework、发布平台 owner（`opl-release`） | macOS Sparkle 工具链与跨产品日跑调度/回读控制面已迁入 `gaofeng21cn/opl-release` 并从 `one-person-lab` 移除；仅剩过渡期 Package 发布链（`daily-package-channel*.yml`、`publish-package.yml`、`scripts/package-daily-release.py`、`scripts/package_release/` 等及对 `opl-flow` 的反向调用）暂驻 `one-person-lab`。 | 在 Wave 3 全部活跃包迁完 `opl.package.v2` 并切至 `opl-release/reusable-publish-package-v2.yml@v1` 后，从 `one-person-lab` 删除上述过渡期 Package 发布脚本、工作流与 `PACKAGE_PUBLISHER_TOOLING_COMMIT` 钉子。 |
