# OPL 当前状态与理想目标差距

本文只记录已有具体断点、明确负责人和可观察完成条件的 v2 收敛工作。完成后删除对应条目；不在这里记录完成日志、版本快照或迁移历史。

## App/Studio 与 Standard Agents v2 收敛

| owner | 当前具体断点 | 可验证完成条件 |
| --- | --- | --- |
| Framework、发布平台 owner（`opl-release`） | macOS Sparkle 工具链与跨产品日跑调度/回读控制面已迁入 `gaofeng21cn/opl-release` 并从 `one-person-lab` 移除；仅剩过渡期 Package 发布链（`daily-package-channel*.yml`、`publish-package.yml`、`scripts/package-daily-release.py`、`scripts/package_release/` 等及对 `opl-flow` 的反向调用）暂驻 `one-person-lab`。 | 在 Wave 3 全部活跃包迁完 `opl.package.v2` 并切至 `opl-release/reusable-publish-package-v2.yml@v1` 后，从 `one-person-lab` 删除上述过渡期 Package 发布脚本、工作流与 `PACKAGE_PUBLISHER_TOOLING_COMMIT` 钉子。 |
