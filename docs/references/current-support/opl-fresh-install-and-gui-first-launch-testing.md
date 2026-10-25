# Fresh Install 与 GUI 首启验证

本文定义安装/首启验证层级，不冻结具体 App 版本、Package 数量或 UI 页面。

## 验证层级

### 1. Source

- canonical commit/tree 可回读；
- installer、workflow 和 contract来自同一 owner版本；
- repo-native verify通过。

### 2. Clean environment

- 使用新的 HOME/state/cache；
- 不复用开发机已安装 Package 或 credential；
- installer幂等，失败有明确 owner和repair route；
- checkout不产生未预期生成物。

### 3. Base runtime

`install.sh` 在源码物化之前负责 Node bootstrap。复用系统 Node 和安装受管 Node
都必须通过同一 `node_version_is_usable` 准入，实际执行文件须为已修复已知
证书撤销问题的稳定 standalone Node；Electron 的 Node 模式不构成该运行时。
官方来源和 bootstrap 准入引用见
[`dependency-release-sources.json`](../../../contracts/opl-framework/dependency-release-sources.json)。
`OPL_MANAGED_NODE_VERSION` 只选择受管版本，不能绕过安全准入；自定义
`OPL_MANAGED_NODE_URL` 必须同时声明 `OPL_MANAGED_NODE_SHA256`。默认下载按官方
SHASUMS 核对归档，解包后回读实际 Node 版本再切入原受管目录，失败不替换现有运行时。
已有 Framework 的 App consumer 通过同一 frozen installer 的 `--ensure-node`
入口执行这段 bootstrap，再回读实际 Node；该入口在源码下载、npm 和安装身份写入之前退出，
保留现有 Framework 与用户的系统 Node。

- `opl --help`；
- `opl system initialize --json`；
- 配置 provider/service/worker 的真实 status；
- `opl app state --profile fast --json` 可读取。

### 4. Package

- native carrier可列出目标 Package；
- install后 installed/enabled/callable；
- required dependencies存在；
- 至少一个 public entrypoint或Host contribution真实可用。

### 5. App

- 安装资产签名和版本由 App owner回读；
- 首次启动、权限提示、Settings 和主要导航可达；
- App消费 Framework state/action，不使用模拟 ready；
- 退出、重启和恢复同一 workspace/session可用。

### 6. User path

用真实目标 Package完成一条最短路径：

```text
launch App
  -> select/create work
  -> invoke installed Agent/capability
  -> observe progress or blocker
  -> receive artifact/ref
  -> resume or close
```

## CI 分层

- unit/contract：schema、parser、projection；
- integration：clean state、carrier、provider和App bridge；
- packaged smoke：真实 bundle/image启动；
- UI automation：稳定 accessibility surface；
- manual acceptance：credential、外部账号、不可逆操作和视觉体验。

每层只证明自身边界。source tests不能替代 packaged/installed/UI acceptance。

## 失败记录

记录最深断点、owner、可复现命令、实际输出和下一动作。不要用截图、测试总数或“首启成功”掩盖 Package、provider、App和user-path中未验证的层。
