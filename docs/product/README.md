# OPL Product 文档

本目录只描述 Framework 暴露给 App/用户界面的产品边界。页面结构、交互、shell 选择和 release truth 归 `one-person-lab-app`。

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

## 文档

- [公开 surface 索引](./opl-public-surface-index.md)
- [Shell adapter 操作边界](../references/current-support/opl-gui-shell-adapter-boundary.md)

动态页面和用户路径以 App owner contract、installed build 和真实 UI readback 为准。
