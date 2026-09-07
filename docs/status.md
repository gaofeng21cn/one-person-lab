# OPL 当前状态

本文只描述当前实现和证据边界。动态 Package 数量、attempt、receipt、provider health、安装版本和 release 状态必须从 fresh machine readback 获取，不在 Markdown 中冻结。

## 已实现

### Framework source

- 源码按 `authority`、`adapters`、`read-models`、`host`、`entrypoints` 和 `kernel` 六个根目录组织。
- [`source-module-map.json`](../contracts/opl-framework/source-module-map.json) 定义责任 source unit 和依赖方向。
- workspace Package 目前由 `packages/cordis-abi` 和 `packages/package-host` 承担各自独立 ABI。

### Package 与 capability

- Package 是唯一安装单元，installed truth 由配置的 native carrier descriptor/readback 提供。
- Framework 从 installed descriptor 动态发现 Agent 和 capability，不维护固定成员白名单。
- required dependency 只检查 presence 与 callable entrypoint；版本解析、安装锁、payload lock、LKG 和 carrier transaction 不属于 Framework 的普通 Package 生命周期。
- Family capability portfolio 由 `contracts/opl-framework/family-capability-domain-registry.json` 描述，品牌名称只做认知与产品投影。

### Cordis composition

- Framework 使用正式 `@deepseek-ai/cordis` 作为进程内 composition runtime。
- 当前 profile 为 `base-headless`、`app-full` 和 `foundry-dev`。
- Package、Cordis contribution、composition profile、native carrier 和 executor route 是相互独立的身份。
- Cordis 负责进程内 service、event、effect 和 teardown，不持有 durable workflow、安装状态、领域事实或产品事实。

### Runtime 与 operator surface

- Stage/Attempt、Workspace binding、Temporal provider adapter、worker supervision、evidence refs 和 operator read/action projection 已存在。
- durable workflow history 归 provider，Framework projection 归 read model，领域结果归对应 owner。
- `opl app state --profile fast --json` 提供 compact consumer projection；完整诊断使用相应的 `--detail full` 或专用命令。

### 产品边界

- One Person Lab App 是桌面产品和 GUI truth owner；Framework 只提供 Host graph、contract 和 read/action surface。
- Cloud、Package owner repo 和专业 Agent repo 保持独立 authority。
- Framework 源码通过、App 源码通过或 provider healthy 都不能替代 installed、release、domain 或 user-path 验收。

## 动态真相入口

```bash
./bin/opl app state --profile fast --json
./bin/opl packages status --json
./bin/opl framework readiness --family-defaults --json
./bin/opl framework operating-maturity --family-defaults --json
./bin/opl family-runtime attempt list --json
./bin/opl cordis inspect --json
```

命令不存在、字段变化或 readback 失败时，以当前 `opl --help`、contract 和源码为准，修正文档，不保留旧命令别名。

## Production Evidence

Framework 的 provider、attempt 和 evidence projection 只说明通用运行链是否可观察、可恢复。以下结论必须由各自 owner 独立证明：

- App 安装、签名、发布和真实用户路径；
- Package publication、native carrier 安装和有效 contribution；
- domain owner acceptance、quality/export verdict 和 artifact authority；
- provider long-soak、生产凭据与 Cloud resource currentness。

operator payload 中的 `doc_ref` 指向本节，只用于解释证据边界，不构成 readiness。

## 当前差距

唯一 active gap owner 是 [当前状态与理想目标差距](./active/current-state-vs-ideal-gap.md)。已经完成的工作直接从该文档删除；历史通过 Git 追溯。
