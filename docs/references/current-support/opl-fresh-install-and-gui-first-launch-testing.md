# OPL Fresh Install 与 GUI 首启测试参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_fresh_install_and_gui_first_launch_testing`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

当前 OPL App 是 CLI-backed GUI。真实安装、初始化、模块管理和 skill 同步由 OPL CLI 持有；GUI 触发命令、展示状态、呈现阻塞项，并暴露稳定 accessibility label 供自动化测试使用。

## 首启 readiness 模型

首启展示需要把三层状态分开：

- core readiness：Codex CLI、workspace root、推荐 skills 与 GUI shell 的可用性。
- domain modules readiness：MAS/MAG/RCA 等已准入 domain modules 的可用性。
- family runtime provider readiness：已配置 provider、profile、bridge / signal transport 与 family-runtime queue 的可用性。生产在线路径的必需 substrate 是 Temporal-backed provider；Hermes provider/Gateway/readiness 只作为历史 provenance、诊断语料或负向 guard 读取，不再作为 provider readiness、provider proof surface 或兼容入口；`hermes_agent` executor adapter 不参与首启 readiness 判定。

首启的 `ready_to_launch` 只由 core launch gate 决定：`workspace_root`、Codex CLI 与 Codex API config。domain modules、family runtime provider、recommended skills、native helpers、repo sync、CLT 和 ecosystem updates 继续决定 Full readiness 或后台维护状态，但不再把用户卡在 `/guid` 前。

`opl install` 默认安装/复用已配置 family runtime provider。Temporal 是 production online runtime 的必需 substrate；Hermes online-management gateway 不再作为 install、repair 或 readiness path。OPL 通过 `opl family-runtime install|repair`、`opl runtime manager action --apply`、provider-specific repair 或 engine install 路径触发安装/启动、检查 readiness、记录日志并向 GUI 报告状态。

Full OPL readiness 需要 core、domain modules 与 family runtime provider 三层都 ready。provider 缺失、未 ready、桥接能力仍在 starting，或需要稍后复查时，应展示为 Full online runtime degraded；本地 CLI/status/manifest 仍可给出诊断，但不能把 Full readiness 写成完整通过。

## 本机 clean-room 层

本机层用于快速验证 CLI truth surface。它使用临时 `HOME`、`OPL_STATE_DIR` 和 `OPL_MODULES_ROOT`，避免污染当前开发机状态。

推荐命令：

```bash
npm run test:fresh-install
npm run fresh-install:smoke
./scripts/verify.sh fresh-install
```

这条 lane 只覆盖 OPL 主仓 CLI clean-room 与合同矩阵。发布物级 GUI 首启证明归 `one-person-lab-app` 的 App release/VM workflow，并通过 external checkout 调用 `opl-aion-shell`，不把桌面可视化首启塞进主仓 fast 或 integration lane。

覆盖场景来自 `contracts/opl-framework/fresh-install-test-matrix.json`：

- clean user + missing Codex
- compatible Codex + missing modules
- outdated Codex
- compatible Codex + git-backed module fixtures
- offline module install blocker

这些场景断言 `opl system initialize` 的 `setup_flow.phase`、`ready_to_launch`、core `blocking_items`、`maintenance_items`、Codex 版本状态、模块安装计数，以及 GUI 可消费的首启合同字段。
首启 blocker 文案只覆盖阻塞 core launch 的事项；domain modules 与 family runtime provider 缺失或未 ready 应进入 Full readiness / background maintenance 提示，并保持 Settings 可追踪、可重试。

## GUI / VM 层

GUI 层使用干净 macOS VM snapshot 验证真实 Release App 首启。每轮从 snapshot 启动，下载 `one-person-lab-app` Release DMG，安装到 `/Applications`，直接打开 `One Person Lab.app`。

已落地的执行面由 `gaofeng21cn/one-person-lab-app` 持有，并在 CI / 本地检出 `gaofeng21cn/opl-aion-shell` 到 `shells/aionui`：

```bash
bun run test:opl-first-run-vm -- --dmg <release.dmg> --assert-clean
bun run test:opl-first-run-vm:tart -- --source-vm <clean-tart-vm> --dmg <release.dmg>
```

nightly/self-hosted Mac 入口属于 App repo workflow。默认 runner labels 为 `self-hosted`、`macOS`、`opl-gui-vm`；runner 需要可用 Tart，guest VM 需要 SSH、Node.js、已登录桌面会话，以及 `osascript` / System Events 的 Accessibility 权限。

必须采集的工件：

- `~/Library/Logs/One Person Lab/first-run.jsonl`
- `~/Library/Application Support/OPL/state`
- `opl system initialize --json`
- `opl modules --json`
- 首启窗口截图
- macOS unified log 中 One Person Lab 相关片段

本层适合 self-hosted Mac runner、Tart、Apple Virtualization、Anka 或 Parallels。Docker 只适合 Linux/WebUI 依赖测试，不能作为 macOS 桌面首启证明。

## 首启日志与 GUI 自动化合同

`opl install --skip-gui-open` 会写入结构化 JSONL 首启日志。默认路径：

```text
~/Library/Logs/One Person Lab/first-run.jsonl
```

可用 `OPL_FIRST_RUN_LOG_PATH` 覆盖。每条事件包含 `timestamp`、`event_type`、`schema_version`、`surface_id` 和 `payload`。

`opl system initialize` 同步暴露：

- `first_run_log`
- `gui_first_run_automation`

GUI 自动化应优先依赖这些字段，而不是解析人类可读文案。当前稳定 accessibility labels 包括：

- `opl-first-run-window`
- `opl-first-run-progress`
- `opl-first-run-blockers-list`
- `opl-first-run-install-button`
- `opl-first-run-open-environment-button`
- `opl-first-run-open-modules-button`
- `opl-first-run-ready-entry`
- `opl-guid-entry`
- `opl-settings-environment`

## CI 分层

普通 GitHub Actions 跑 CLI clean-room、package smoke、codesign/notarization 和非 GUI 断言。真实 GUI 首启跑在 self-hosted macOS VM runner，由 snapshot 提供干净用户态、Gatekeeper、LaunchServices、Keychain 与 Accessibility 权限环境。

OPL 主仓 `Verify` workflow 已把 `npm run test:fresh-install` 作为独立 gate；GUI 仓 nightly workflow 使用 release DMG 加 Tart clean VM 执行真实首启，并上传 `first-run.jsonl`、`system-initialize.json`、`modules.json`、截图、unified log 与 accessibility tree。
