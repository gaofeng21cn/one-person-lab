# OPL Fresh Install 与 GUI 首启测试参考

Owner: `One Person Lab`
Purpose: `references_current_support_opl_fresh_install_and_gui_first_launch_testing`
State: `support_reference`
Machine boundary: 本文是人读 reference 支撑材料。机器 truth 继续归核心五件套、contracts、source、CLI/API 行为、runtime ledger、provider receipt、domain-owned manifests 和真实 evidence。

当前 OPL App 是 CLI-backed GUI。真实安装、初始化、模块管理和 skill 同步由 OPL CLI 持有；GUI 触发命令、展示状态、呈现阻塞项，并暴露稳定 accessibility label 供自动化测试使用。

当前性规则：本文只保留 OPL 侧 fresh-install / first-run support boundary。App release profile、VM runner、Tart source VM、release evidence artifact set、assistant route smoke 和 Docker/WebUI release gate 继续从 `one-person-lab-app` 的 contracts、workflow、tests 与 release evidence 读取；动态 release cohort、receipt ref、截图路径和 runner 配置不得从本文派生为机器接口。

长期边界：

- OPL 主仓持有 CLI clean-room fresh-install 合同、`opl system initialize --json` 的 `setup_flow` / `checklist` / `family_runtime_provider` / `first_run_log` / `gui_first_run_automation` 输出，以及 `contracts/opl-framework/fresh-install-test-matrix.json`。
- App 仓持有 App first-run 视图、standard / Full release profile、clean VM workflow、release readiness summary、one-shot App installer gate、Docker/WebUI release gate 和 packaged GUI assistant route smoke。
- App 渲染层只消费 OPL `system_initialize.setup_flow` 等机器字段；它不能把 App-owned release evidence、VM runner 配置、artifact 名称或 workflow job 结果反向写成 OPL 主仓合同。

## 首启 readiness 模型

首启展示需要把三层状态分开：

- core readiness：workspace root、Codex CLI 与 Codex API config 的可用性。
- domain modules readiness：MAS/MAG/RCA 等已准入 domain modules 的可用性。
- family runtime provider readiness：已配置 Temporal provider、profile、bridge / signal transport 与 stage-attempt request/projection 的可用性。生产在线路径的必需 substrate 是 Temporal-backed provider；Hermes provider/Gateway/readiness 只作为历史 provenance、诊断语料或负向 guard 读取，不再作为 provider readiness、provider proof surface 或兼容入口；`hermes_agent` executor adapter 不参与首启 readiness 判定。

首启的 `ready_to_launch` 只由 core launch gate 决定：`workspace_root`、Codex CLI 与 Codex API config。domain modules、family runtime provider、recommended skills、native helpers、repo sync、CLT 和 ecosystem updates 继续决定 Full readiness 或后台维护状态，但不再把用户卡在 `/guid` 前。

`opl install` 默认安装/复用已配置 family runtime provider。Temporal 是 production online runtime 的必需 substrate；Hermes online-management gateway 不再作为 install、repair 或 readiness path。OPL 通过 `opl family-runtime install|repair`、`opl runtime manager action --apply`、provider-specific repair 或 engine install 路径触发安装/启动、检查 readiness、记录日志并向 GUI 报告状态。

`opl install` 默认安装 headless OPL Base；`opl packages install rca` 在同一 Base 上显式加入 RCA。两者都不会下载或打开 App；只有 `--with-app` 才加入 GUI。宿主脚本只可传 `--headless --skip-packages` 表达 base-only reconcile；`--skip-packages` 不保留 alias。Homebrew 的唯一 Base Formula 名是 `opl`，Agent/capability/workflow package 均不拥有 Formula/Cask。

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

这些场景断言 `opl system initialize` 的 `setup_flow.phase`、`ready_to_launch`、core `blocking_items`、`maintenance_items`、Codex 版本状态、模块安装计数、family runtime provider full-readiness 状态，以及 GUI 可消费的首启合同字段。`npm run fresh-install:smoke -- --vm-artifacts-only` 只输出 clean VM release smoke 所需的基础 artifact 清单，不执行 App VM。
首启 blocker 文案只覆盖阻塞 core launch 的事项；domain modules、recommended skills、native helpers 与 family runtime provider 缺失或未 ready 应进入 Full readiness / background maintenance 提示，并保持 Settings 可追踪、可重试。

## GUI / VM 层

GUI 层使用干净 macOS VM snapshot 验证真实 Release App 首启。每轮从 snapshot 启动，下载或传入 `one-person-lab-app` Release DMG，安装到 `/Applications`，直接打开 `One Person Lab.app`。

执行面由 `gaofeng21cn/one-person-lab-app` 持有，并在 CI / 本地检出 `gaofeng21cn/opl-aion-shell` 到 `shells/aionui`。OPL fresh-install 合同保留以下人读命令引用，用来描述 guest smoke / Tart host smoke 的期望边界；真实 workflow invocation、release input、same-run artifact 解析、runner label、guest user / SSH key、graphics mode、retention policy 和 artifact upload 继续以 App 仓 workflow 与合同为准：

```bash
bun run test:opl-first-run-vm -- --dmg <release.dmg> --assert-clean
bun run test:opl-first-run-vm:tart -- --source-vm <clean-tart-vm> --dmg <release.dmg>
```

nightly/self-hosted Mac 入口属于 App repo workflow。App 当前 shared progress model 从 `opl system initialize --json` 读取 `system_initialize.setup_flow`，要求 `phase`、`ready_to_launch`、`progress`、`blocking_items` 和 `maintenance_items` 等字段，并让 Full、standard、source installer 与 Docker/WebUI surface 作为显示或 release-evidence consumer。runner labels、Tart source VM、guest SSH 用户、Node 注入方式、签名/公证模式、release profile、same-run artifact 名称和 artifact 上传策略是 App-owned release/test truth；本页只保留 OPL 侧需要消费的合同字段和基础 evidence 字段。

OPL 侧消费的基础 evidence 字段包括：

- `~/Library/Logs/One Person Lab/first-run.jsonl`
- `~/Library/Application Support/OPL/state`
- `opl system initialize --json`
- `opl connect modules --json`
- 首启窗口截图
- macOS unified log 中 One Person Lab 相关片段

完整 artifact set、文件名、上传路径、release cohort 和 readiness gate 归 App release/testing 合同、workflow 与 release evidence。App-owned assistant-route smoke 当前用于 packaged GUI release evidence：它验证 MAS、MAG、RCA purpose entry、badge、普通 selector 隐藏和 Codex CLI route receipt。该工件属于 App release evidence，不属于 OPL 主仓 CLI clean-room lane；OPL 主仓只消费它作为 App release/user-path 引用，不把它写成 fresh-install CLI gate。

App release workflow 还可以在同一 release readiness summary 下汇总 standard clean VM、Full clean VM、one-shot App installer、Docker/WebUI、remote release verification 和 Full package diagnostic evidence。这些是 App release gate，不是 OPL 主仓 `npm run test:fresh-install` 的扩大版。

本层适合 self-hosted Mac runner、Tart、Apple Virtualization、Anka 或 Parallels。Docker 只适合 Linux/WebUI 依赖测试，不能作为 macOS 桌面首启证明。

## 首启日志与 GUI 自动化合同

`opl install --headless` 会写入结构化 JSONL 首启日志。默认路径：

```text
~/Library/Logs/One Person Lab/first-run.jsonl
```

可用 `OPL_FIRST_RUN_LOG_PATH` 覆盖。每条事件包含 `timestamp`、`event_type`、`schema_version`、`surface_id` 和 `payload`。

`opl system initialize` 同步暴露：

- `first_run_log`
- `gui_first_run_automation`
- `family_runtime_provider`

已退役字段：

- `online_management`
- `online_management_ready`
- `online_management_repair_*`

当前 repair / log event 边界：

- install flow 仍可写 `runtime_manager_repair_*` 事件，用于 OPL runtime manager action 记录。
- family runtime provider 专用事件是 `family_runtime_provider_repair_started`、`family_runtime_provider_repair_completed` 和 `family_runtime_provider_repair_failed`。
- `online_management_*` 字段与事件不再作为首启 readiness、provider proof 或 App automation 输入。

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

OPL 主仓 GitHub Actions 跑 build/typecheck、CLI clean-room fresh-install、package/verification lanes 和非 GUI 断言。codesign/notarization、standard / Full DMG release gates、VM release profiles 与 release evidence 归 App release workflows/contracts。真实 GUI 首启跑在 self-hosted macOS VM runner，由 snapshot 提供干净用户态、Gatekeeper、LaunchServices、Keychain 与 Accessibility 权限环境。

OPL 主仓 `Verify` workflow 把 `npm run test:fresh-install` 作为独立 gate；App 仓的 release / VM workflow 使用 release DMG 加 clean VM 执行真实首启，并上传 `first-run.jsonl`、`system-initialize.json`、`modules.json`、截图、unified log 与 accessibility tree。具体 runner 和 release profile 以 App 仓合同、workflow 与 release evidence 为准，不能从本页派生为固定机器接口。
