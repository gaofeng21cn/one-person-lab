# One Person Lab Framework

本仓是 OPL Framework 的实现与机器真相归口。当前事实以 `contracts/`、源码、测试和 fresh `opl ... --json` readback 为准，文档用于解释和导航。

- Framework 持有通用 runtime、activation、discovery、projection 和 shared contracts；MAS、MAG、RCA 等领域仓持有各自的 domain truth、quality verdict 与 artifact authority。
- One Person Lab App 持有桌面产品和 GUI truth；AionUI、Hermes 等 shell 仓只承载对应实现。
- 跨仓边界变更以相关 machine-readable contract 和真实 consumer 为依据。

默认验证入口：`scripts/verify.sh`。

<!-- CODEGRAPH_START -->
## CodeGraph

- 本仓库使用本地 `.codegraph/` 索引；该目录不得纳入 Git。
- 定义、调用、影响范围和代码路径等结构检索优先使用 CodeGraph；字面文本检索使用 `rg`。
- 索引缺失或过期时运行 `codegraph init .` 或 `codegraph sync .`。
<!-- CODEGRAPH_END -->
