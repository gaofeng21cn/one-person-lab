# OPL Fresh Install 与 GUI 首启测试参考

当前 OPL App 是 CLI-backed GUI。真实安装、初始化、模块管理和 skill 同步由 OPL CLI 持有；GUI 触发命令、展示状态、呈现阻塞项，并暴露稳定 accessibility label 供自动化测试使用。

## 本机 clean-room 层

本机层用于快速验证 CLI truth surface。它使用临时 `HOME`、`OPL_STATE_DIR` 和 `OPL_MODULES_ROOT`，避免污染当前开发机状态。

推荐命令：

```bash
npm run test:fresh-install
npm run fresh-install:smoke
./scripts/verify.sh fresh-install
```

覆盖场景来自 `contracts/opl-gateway/fresh-install-test-matrix.json`：

- clean user + missing Codex
- compatible Codex + missing modules
- outdated Codex
- compatible Codex + git-backed module fixtures
- offline module install blocker

这些场景断言 `opl system initialize` 的 `setup_flow.phase`、`blocking_items`、Codex 版本状态、模块安装计数，以及 GUI 可消费的首启合同字段。

## GUI / VM 层

GUI 层使用干净 macOS VM snapshot 验证真实 Release App 首启。每轮从 snapshot 启动，下载 one-person-lab Release DMG，安装到 `/Applications`，直接打开 `One Person Lab.app`。

已落地的执行面在 `gaofeng21cn/opl-aion-shell`：

```bash
bun run test:opl-first-run-vm -- --dmg <release.dmg> --assert-clean
bun run test:opl-first-run-vm:tart -- --source-vm <clean-tart-vm> --dmg <release.dmg>
```

nightly/self-hosted Mac 入口是 `opl-aion-shell/.github/workflows/opl-first-run-vm.yml`。默认 runner labels 为 `self-hosted`、`macOS`、`opl-gui-vm`；runner 需要可用 Tart，guest VM 需要 SSH、Node.js、已登录桌面会话，以及 `osascript` / System Events 的 Accessibility 权限。

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
- `opl-settings-environment`

## CI 分层

普通 GitHub Actions 跑 CLI clean-room、package smoke、codesign/notarization 和非 GUI 断言。真实 GUI 首启跑在 self-hosted macOS VM runner，由 snapshot 提供干净用户态、Gatekeeper、LaunchServices、Keychain 与 Accessibility 权限环境。

OPL 主仓 `Verify` workflow 已纳入 `npm run test:fresh-install`；GUI 仓 nightly workflow 使用 release DMG 加 Tart clean VM 执行真实首启，并上传 `first-run.jsonl`、`system-initialize.json`、`modules.json`、截图、unified log 与 accessibility tree。
