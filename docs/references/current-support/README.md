# 当前支撑参考索引

Owner: `One Person Lab`
Purpose: `references_current_support_index`
State: `support_reference_index`
Machine boundary: 仅人读索引；操作真相必须使用 CLI/API 行为、contracts、source、release artifact、runtime state 或语义化 `human_doc:*` id。

本目录收纳安装、GUI/WebUI、发布打包、skills、质量细节和测试 lane 治理的当前操作支撑参考。

这些文件对操作者有用，但不拥有 OPL runtime topology。当前 topology 仍以核心五件套和 runtime-substrate owner surfaces 为准。

Currentness policy：本文只索引当前支撑参考，不冻结 skill 安装状态、tool readiness、plugin registry、Docker/WebUI image manifest、App release evidence、package manifest、test lane membership 或 CI 运行结果。当前事实必须回到对应 support reference、source/contracts/tests、CLI/read-model、App release evidence 或 domain-owned manifests。

## 内容

| 文件组 | 角色 | 当前 owner / boundary |
| --- | --- | --- |
| `opl-gui-shell-adapter-boundary.md` | GUI adapter 归属与 upstream-sync 边界 | 当前 GUI 主线是 App 仓 `shells/aionui` 消费的 OPL-branded AionUI shell，`opl-aion-shell` 持有 upstream-backed adapter 实现；`opl-native-workbench` 是 foreground alternative；Hermes Desktop / `hermes-codex` 是 retained explicit reference candidate；AGUI / `agui-codex` 只作为 archived technical proof / explicit replay provenance。OPL 持有 CLI-backed runtime/contracts/projection surfaces。 |
| `../../history/process/plans/2026-05-15-one-person-lab-app-repo-split-closeout.md` | App repo 拆分和 AionUI shell 独立化 closeout | 历史 closeout；当前边界由 App 仓合同、真实 release artifact 与 GUI shell adapter boundary 承接。 |
| `opl-docker-webui-deployment*` | Docker 与浏览器部署参考 | WebUI 是 OPL-branded AionUI shell；已退役 headless Product API 端口不是用户入口。 |
| `opl-fresh-install-and-gui-first-launch-testing.md` | Fresh install 与 GUI 首启证据计划 | OPL 主仓持有 CLI clean-room truth；release App VM proof 由 `one-person-lab-app` 调用 `opl-aion-shell` 执行。AGUI proof 不进入默认 fresh-install 或首启验证，除非用户明确要求 replay。 |
| `opl-new-machine-codex-bootstrap.md` | 新机器 Codex 全家桶安装入口 | OPL 主仓持有 framework/runtime/agent sync canonical bootstrap；App、OPL Flow、OPL Doc 和 domain repos 作为子 owner 被调用。 |
| `opl-default-skill-ecosystem*` | 默认 skill 与 companion tool 支撑 | Domain skills 仍由 domain 持有；OPL 只同步和检测。MDS / MAS-internal skills 只作为 MAS-declared optional companion / provenance / audit / oracle 语境读取，不升级为 OPL 默认 system skill。 |
| `opl-agent-capability-admission-audit-2026-07-07.md` | 标准 Agent 能力准入与 Skill 暴露审计 | 按能力模块先行、三层实现、按需暴露审计 OPL foundation、MAS、ScholarSkills、MAG、RCA、OMA、OBF 和 App companion skills；只做人读治理，不声明 runtime/domain/release ready。 |
| `opl-release-packages-modular-distribution.md` | Release/package 分发支撑 | 发布打包必须保持 framework/domain split。 |
| `opl-quality-details.md` | 质量命令参考 | 只作支撑参考；验证真相是命令行为。 |
| `opl-test-lane-governance.md` | 测试 lane 治理参考 | 测试 lane 由 package scripts 和 lane manifests 机器治理，不由 prose wording 决定。 |

## 使用规则

修改操作支撑参考前，先确认底层 owner 是 OPL CLI/source/contracts、`opl-aion-shell`、App release artifact 还是 domain repo。GUI 相关工作默认只推进 AionUI 主线或 App candidate registry 声明的 Native Workbench foreground alternative；Hermes Desktop 只做 explicit reference replay；AGUI 相关材料只做归档读取或显式 replay。行为变化应先更新 owner surface。
