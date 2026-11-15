# Framework Package 与 DSH 插件边界

Framework 持有 Package descriptor、native carrier 聚合、installed/callable projection 和 App UI contribution projection。Package identity、source repo、carrier、executor 和 publication 是独立事实。

`opl-studio` 持有 DSH/Cordis Application Host、Codex transport、client slots 和 MCP Apps host。它消费 Framework 的 typed state/action，不把 Framework Package registry、currentness 或领域状态复制成 Studio 插件 registry。

因此同一个 Package 可以通过 Codex Plugin Manager carrier 安装，同时由 Framework 投影到 OPL App 的 Settings、Workspace 或 Task Detail；这不意味着它已进入 DSH profile。DSH Host plugin 与 Framework Package 使用不同 ABI，只有真实 owner 和生命周期相同才应合并。

动态清单由 App 仓库的 `scripts/plugin-composition-inventory.mjs` 读取当前 profile、Package descriptor 和 source repo。不要在文档或客户端冻结完整 Package 名单；fresh readback 才能证明 installed、enabled 或 callable。
