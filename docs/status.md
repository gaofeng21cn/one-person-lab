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

### 长期知识与记忆

- 知识条目以 `scope` 区分产品、用户或团队、主题和项目，以 `content_kind` 独立描述机制、政策、时点状态和决策。正文为 Markdown；产品 catalog、私有来源 registry 与工作区 binding 保存身份、范围和版本。归属规则见[知识来源与记忆政策](./policies/knowledge-source-and-memory-policy.md)。
- 已授权的个人库与工作目录内原文使用同一来源解析，不要求中间全文投影。工作区显式选择来源和 scope，来源 grant 分别授予读取与写回，并核对 domain、工作区与声明的项目限制；项目身份来自 workspace inventory，既有业务目录可通过 `--project-root` 原位登记。
- 邮件领域证据、Persona 语义提案、Framework 共同生命周期与用户唯一正文分别归原 owner； 源码联合 probe 已通过 11 个场景／88 次 CLI 调用，覆盖版本漂移、撤权、Persona 写回和邮件晋升回链；该证据只来自合成 Profile 与 source worktrees，尚不等于 canonical、安装或业务验收。Relay SQLite、Persona 派生状态、执行器记忆与运维状态的职责见[知识政策](./policies/knowledge-source-and-memory-policy.md)。App／Studio 只投影原 owner 数据与动作，不建立个人知识库。
- StageRun 按领域、阶段、action、必要性、来源权限与有效性选择正文；同轮生产、评审和修复共享一份字节绑定快照。来源漂移、过期、撤权和派生依赖缺口参与可用性判断，公开 projection 只带引用与消费回执。
- 直接 Skill 的 `knowledge prepare` / `read-context` 与托管 Stage 共用快照存储。快照读取重新核对来源访问；`knowledge revalidate --for-action` 提供关键知识的行动前复核，领域行动仍需自己的实时状态和授权。
- `knowledge propose`、`review`、`apply` 提供接受写回的通用机械链；`inspect-source` 提供候选正文与哈希，`review-source` 接受与该审阅哈希一致的原处编辑，`verify-dependencies` 核对派生上下文的来源。语义接受由有权维护者提供，不由命令或结构检查产生。具体接口见[知识来源与运行上下文](./specs/knowledge-sources.md)。
- 已安装知识 CLI 已验证内部目录、外部个人库和混合来源的召回、权限与版本边界；实际工作区也已验证 OCC 阶段快照与来源一致、Persona 获授权来源可读及越权访问被拒。标准智能体的实际托管入口已验证知识正文进入角色上下文、项目隔离和运行依赖解析；安装身份与包内字节分别回读。
- 上述证据覆盖知识来源和上下文交付，不包含模型或 provider 执行、金融判断及其他领域资格，也不构成新的 Stable 发布。源码、包内声明、安装状态、实际模型执行和业务结果分别验收。

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
