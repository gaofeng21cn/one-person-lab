# 当前支撑参考索引

Status: `support_reference_index`
Owner: `One Person Lab`
Machine boundary: 仅人读索引；操作真相必须使用 CLI/API 行为、contracts、source、release artifact、runtime state 或语义化 `human_doc:*` id。

本目录收纳安装、GUI/WebUI、发布打包、skills、质量细节和测试 lane 治理的当前操作支撑参考。

这些文件对操作者有用，但不拥有 OPL runtime topology。当前 topology 仍以核心五件套和 runtime-substrate owner surfaces 为准。

## 内容

| 文件组 | 角色 | 当前 owner / boundary |
| --- | --- | --- |
| `opl-gui-shell-adapter-boundary.md` | GUI adapter 归属与 upstream-sync 边界 | 当前 `one-person-lab-app/shells/aionui` 持有 upstream-backed GUI adapter。OPL 持有 CLI-backed runtime/contracts/projection surfaces。 |
| `../../active/one-person-lab-app-repo-split-plan.md` | App repo 拆分和 AionUI shell 子目录化迁移计划 | 固定 Framework repo、App repo、active shell 和 AionUI upstream intake owner split。 |
| `opl-docker-webui-deployment*` | Docker 与浏览器部署参考 | WebUI 是 OPL-branded AionUI shell；已退役 headless Product API 端口不是用户入口。 |
| `opl-fresh-install-and-gui-first-launch-testing.md` | Fresh install 与 GUI 首启证据计划 | OPL 主仓持有 CLI clean-room truth；release App VM proof 留在 `one-person-lab-app/shells/aionui`。 |
| `opl-default-skill-ecosystem*` | 默认 skill 与 companion tool 支撑 | Domain skills 仍由 domain 持有；OPL 只同步和检测。MDS internals 留在 MAS 控制下。 |
| `opl-release-packages-modular-distribution.md` | Release/package 分发支撑 | 发布打包必须保持 framework/domain split。 |
| `opl-quality-details.md` | 质量命令参考 | 只作支撑参考；验证真相是命令行为。 |
| `opl-test-lane-governance.md` | 测试 lane 治理参考 | 测试 lane 由 package scripts 和 lane manifests 机器治理，不由 prose wording 决定。 |

## 使用规则

修改操作支撑参考前，先确认底层 owner 是 OPL CLI/source/contracts、`one-person-lab-app/shells/aionui`、release artifact 还是 domain repo。行为变化应先更新 owner surface。
