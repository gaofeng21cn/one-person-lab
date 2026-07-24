# One Person Lab Framework

本仓是 OPL Framework 的实现与机器真相归口；以 `contracts/`、源码、测试和 fresh `opl ... --json` readback 为准。

- Framework 持有通用 runtime、Package activation/discovery、projection、installed aggregation 和 shared contracts；领域 truth、quality verdict、artifact authority 仍归 MAS、MAG、RCA 等领域 owner。
- One Person Lab App 持有桌面产品、GUI 和发布产品 truth；AionUI、Hermes 等 Shell 仓只承载对应实现。
- Package 是安装单元，Skill、Tool、Plugin、MCP 和 entrypoint 是 descriptor 可发现能力；Package identity、物理 carrier、executor route 与 publication/currentness 必须分离。
- 新 Package/Agent 通过 installed descriptor 动态发现；不得新增固定 Package、Agent、Plugin 或 Module 清单，也不得让 App starter profile 反向成为 Framework registry。
- Package 依赖只声明 required/optional presence 与可调用入口。稳定 identity 只能兼容扩展；删除旧 identity 前须有 fresh no-active-consumer proof。
- 平台原生 carrier 负责实际生命周期；Framework 只在已证实的平台缺口处提供薄 adapter，不复制 resolver、lock、payload、LKG 或平行 currentness。
- 跨仓边界变更以相关 machine-readable contract 和真实 consumer 为依据。默认验证入口：`scripts/verify.sh`。

<!-- CODEGRAPH_START -->
## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。
<!-- CODEGRAPH_END -->
