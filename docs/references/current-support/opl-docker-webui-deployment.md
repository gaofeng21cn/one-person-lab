# OPL Docker WebUI 部署

WebUI image、container entrypoint、认证和 release 归 One Person Lab App/shell owner。当前构建实现与 Host 范围见 [仓库地图](../../public/repo-map.md#产品-owners)；Framework 只提供 headless Base、seed/currentness readback和App machine surface。

## 获取当前 image

从 [App owner 发布入口](https://github.com/gaofeng21cn/one-person-lab-app#readme)读取 image ref、digest、port、volume和environment contract。不要从本文猜测版本或复制旧 image coordinates。

## 持久化边界

- App/WebUI data volume：shell/app state；
- `OPL_STATE_DIR`：Framework local state；
- `OPL_PROJECTS_DIR` / Workspace root：用户项目；
- `CODEX_HOME`：Codex配置；
- image filesystem：只读程序和可选seed。

credential使用部署平台secret或显式stdin配置，不写入image、Compose文件或repo。

## Framework 初始化

设置投影中的 `settings_install_docker_webui` 仅初始化当前环境的 Framework，不部署网页服务器或容器。容器/WebUI 部署由 App/Studio owner 的 Docker/OCI 发行与独立安装器持有；桌面端模型密钥存在不能据此推断 WebUI 配置完成。普通状态为 `not_checked`，只有独立部署的运行与认证验收才能证明可访问。

容器包含 OPL CLI 时，可在独立初始化/维护步骤执行：

```bash
opl install --headless --json
opl system initialize --json
opl system startup-maintenance --json
```

有 image seed 时，使用当前 `opl system seed-apply --help` 声明的参数。seed receipt只证明Framework-owned bytes被观察或物化，不证明App release、Package installed、provider ready或domain ready。

## 诊断

```bash
opl system docker-webui doctor --json
opl app state --profile fast --json
opl packages status --json
```

doctor是只读聚合，不启动container、不写credential、不安装Package，也不声明release readiness。

## 最小验证

1. image digest与App owner release一致；
2. container entrypoint和health endpoint可用；
3. data、project和Framework state volume位置明确；
4. 登录/认证按App owner contract工作；
5. Base/provider状态可读；
6. 目标Package由native carrier报告installed/callable；
7. WebUI中完成一条真实user path；
8. container重启后workspace/session按产品合同恢复。

Framework source测试或doctor结果不能替代image、auth和UI验收。
