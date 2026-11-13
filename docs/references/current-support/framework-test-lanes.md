# Framework 测试分组

执行入口由 [`scripts/test-lanes.mjs`](../../../scripts/test-lanes.mjs)、
[`package.json`](../../../package.json) 和 [CI workflow](../../../.github/workflows/ci.yml)
持有；本文解释选择方式，不维护另一份测试清单。

| 层级 | 目的 | 执行方式 |
| --- | --- | --- |
| Source validation | 支持的 Node 版本上的 build、类型、lint 与 smoke | 每次 CI 的 Node 版本矩阵 |
| Fast quality | 活跃测试归属与仓库 hygiene | CI 的 Node 26 source job 执行一次 |
| Fast unit | 通用源码、合同与读写行为；包含少量真实 CLI 入口 | 三个互不重复的源码分片 |
| Fast CLI | 隔离的 Package、命令注册、Release Bundle 场景 | 独立 job，保留逐文件执行约束 |
| Fast Temporal | 真实 Temporal 服务、StageRun 与恢复链 | 独立 job，保留服务启动的隔离约束 |
| Full | 包含 read-model、regression、integration、artifact、fresh-install 的聚合资格 | 本地显式执行或既有完整验证入口 |

普通 CI 同时执行上述 source 与全部 fast 分组，不把失败路径或真实服务覆盖移到仅定时执行。
`npm ci` 的 prepare 为每个 fast job 编译其本地测试 runtime，phase job 不再重复 build。
复用本机依赖目录时须先运行 `npm run build`，不能假定其他工作树的 `dist/` 存在于当前工作树。

本地原有完整入口保持为：

```sh
npm run test:fast
npm run test:full
```

针对单组排查时，先完成依赖与编译，再沿同一入口选择 phase：

```sh
npm ci
npm run test:fast -- --phase quality
npm run test:fast -- --phase unit --shard 1/3
npm run test:fast -- --phase cli
npm run test:fast -- --phase temporal
node scripts/test-lanes.mjs plan fast --phase unit --shard 1/3
```

`--shard` 只接受纯测试 phase；各分片按稳定文件顺序分配，每个文件只出现一次。
未指定 phase 时，`test:fast` 仍按原顺序执行全部检查及 build。不存在的 phase 或空分片直接失败。
每个 batch 输出 `Test lane timing`，记录真实耗时、文件与退出状态，便于定位最慢组。

Full 会消除被聚合入口导入的独立重复入口，同时把被导入测试的更严格 batch/env 约束传给聚合根。
聚合测试仍执行全部原有断言，`assert-coverage` 和 phase 分片测试分别检查文件归属与分片无遗漏。

Temporal controller 的每个测试文件只启动一次服务、编译一次相同 workflow。
每个场景仍建立独立 Worker、队列、Workflow ID 和 activity 闭包；文件结束时关闭服务。
因此“Worker 已停止后查询”等生命周期断言仍针对该场景真实停止的 Worker。
