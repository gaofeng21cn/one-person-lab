# OPL 新机器安装

本文给出新 macOS/Linux 开发机的最短安装与验证路径。release version、Package 列表和 App artifact 必须从 owner current source读取。

## 选择产品

- 需要桌面体验：安装 One Person Lab App；App installer负责其 bundled runtime和shell。
- 需要 headless/CLI：安装 OPL Framework。
- 需要专业 Agent/capability：在 Base 就绪后，通过对应 owner声明的 native carrier安装 Package。

## 安装 Framework

推荐使用 canonical installer：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab/main/install.sh | bash
```

开发 checkout：

```bash
git clone https://github.com/gaofeng21cn/one-person-lab.git
cd one-person-lab
npm install
npm link
```

随后运行：

```bash
opl --help
opl install --json
opl system initialize --json
opl app state --profile fast --json
```

`opl install` 负责 Base/runtime prerequisites，不静默安装全部 Agent Packages。

## 安装 App

App installer 和发布资产归 `one-person-lab-app`：

```bash
curl -fsSL https://raw.githubusercontent.com/gaofeng21cn/one-person-lab-app/main/install.sh | bash
```

安装后从 Applications 启动并完成 App owner定义的 first-run。Framework 命令通过不能替代 App 签名、安装和真实启动验证。

## 安装 Packages

先按 Package owner说明配置唯一 native marketplace/carrier，再执行：

```bash
opl packages status --json
opl packages install <package-id> --json
opl packages status --package-id <package-id> --json
```

不要把本文中的示例变成固定 starter list。App official profile、用户选择和 installed carrier readback决定实际 Package 集合。

## 完成标准

分别验证：

1. `opl --help` 和 `opl system initialize --json`；
2. provider/worker 的真实 readiness；
3. 每个需要的 Package installed、enabled、callable；
4. App installed build 与真实启动；
5. 至少一个目标 Package 的实际 entrypoint/contribution。

`opl app state --profile fast --json` 是聚合读面，不替代上述 owner readback。

## 常见问题

- 找不到 Package：检查 native marketplace/carrier，而不是新增 Framework catalog。
- App 状态 unknown：运行 full/owner-specific readback，不从 Framework source推断。
- provider unavailable：使用 `opl family-runtime ... --help` 找到当前 install/repair/status命令。
- 权限、签名或 credential 缺失：回到对应 App/Package/provider owner，不把本机 token 写入 repo。
