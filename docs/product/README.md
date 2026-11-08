# OPL Product 文档

本目录只描述 Framework 暴露给 App/用户界面的产品边界。页面结构、交互、shell 选择和 release truth 归 `one-person-lab-app`。

当前 Shell 实现与仓库角色见 [仓库地图](../public/repo-map.md#产品-owners)；Host 范围见 [架构](../architecture.md#host-scope-boundary)。App 入口由 installed descriptor 与 Framework projection 提供，starter profile 只选择安装组合。

## Framework 提供

- `app state` 与 `app action` machine surface；
- `app-full` Cordis Host profile；
- Client contribution allowlist和projection contract；
- Package、runtime、Workspace、evidence 和 Settings 所需 read/action data；
- 明确的 authority、currentness 和 failure semantics。

## App 持有

- product profile、导航与用户流程；
- starter Package 选择；
- renderer 和 shell implementation；
- App carrier、签名、安装、升级与 release；
- 用户可见文案和 acceptance。

App 不建立第二 Package discovery、provider state 或 domain truth。Framework 也不决定页面布局、默认 workflow 或 shell release。

## Package 在 App 中的启用偏好

安装、原生 carrier 启用和 OPL App 展示是独立选择。Framework 在 App 的 Package 目录和
状态条目投影 `app_enabled`，默认值为 `true`。`package_app_set_enabled` 接收
`package_id` 与布尔 `enabled`，将用户选择保存到当前 OPL state 的
`app-package-preferences.json`；这份文件只保存 App 偏好，不保存安装或版本状态。

关闭后，Desktop/WebUI 移除该包的导航、首页入口及各 UI contribution 槽，停止其自动
状态读取，并拒绝来自 App action 的旧 contribution 操作。管理目录保留该包及重新启用
入口。安装、更新和重新发现不覆盖此选择；Codex 原生启用状态、Skill 和会话内 MCP Apps
仍使用原有 owner 路径，不受 App 偏好影响。

## 文档

- [公开 surface 索引](./opl-public-surface-index.md)
- [Shell adapter 操作边界](../references/current-support/opl-gui-shell-adapter-boundary.md)

动态页面和用户路径以 App owner contract、installed build 和真实 UI readback 为准。
